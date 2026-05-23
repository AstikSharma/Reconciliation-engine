# Transaction Reconciliation Engine

## 1. Core Structural Pipeline Architecture

### Architectural Overview

The Transaction Reconciliation Engine uses a decoupled, streaming architectural blueprint explicitly structured to scale horizontally when dealing with heavy multi-megabyte user CSV input feeds.

```text
[User CSV Input File]
            |
            v
 (Streaming CSV Parser)
            |
            v
[Validation & Normalization Utility]
            |
            v
[Matching Core Engine Logic]
            |
            +----------------------------+
            |                            |
            v                            v
[MongoDB Results Audit Log]     (Streaming Exporter)
```

---

# 2. Ingestion Resilience Strategy (The Messy-Data Paradigm)

Instead of executing standard database drop rules for schema mismatches, the ingestion tier acts as a non-destructive audit engine.

## Memory Preservation

Node.js file system readable streams (`fs.createReadStream`) pipe directly into instances of `csv-parse`.

This preserves system bounds by ensuring a flat, linear memory consumption curve of:

$$
O(1)
$$

regardless of dataset file footprint size.

---

## Bulk Database Buffering

Transactions are grouped into memory-managed batches of 500 documents and pushed concurrently using MongoDB unordered bulk writes:

```js
insertMany(..., { ordered: false })
```

This maintains database connection utilization while filtering out row insertion errors on dirty datasets.

---

## Fault Isolation

If a transaction line contains:
- corrupted dates,
- empty tokens,
- malformed numeric values,

the row is still persisted with:

```json
{
  "status": "malformed"
}
```

The exact parsing failures are preserved inside:

```json
{
  "validationErrors": []
}
```

This ensures that every row remains available for debugging and auditability.

---

# 3. Database Collection Map Layer

## Collection: `rawtransactions`

```json
{
  "source": "String ('user' | 'exchange') - Indexed",
  "status": "String ('valid' | 'malformed') - Indexed",
  "validationErrors": "Array [String]",
  "externalId": "String",
  "timestamp": "Date",
  "type": "String",
  "asset": "String - Normalized (e.g., 'btc')",
  "quantity": "Number",
  "rawData": "Mixed (Original Unmutated Object Key-Values)",
  "jobId": "String - Batch Identifier Lookup"
}
```

### Performance Index Strategy

```js
rawtransactions.index({
  source: 1,
  status: 1,
  asset: 1,
  timestamp: 1
});
```

---

## Collection: `reconciliationresults`

```json
{
  "jobId": "ObjectId (Ref: ReconciliationJob)",
  "category": "String ('Matched' | 'Conflicting' | 'Unmatched_User' | 'Unmatched_Exchange')",
  "reason": "String",
  "userTxId": "ObjectId (Ref: RawTransaction)",
  "exchangeTxId": "ObjectId (Ref: RawTransaction)"
}
```

---

# 4. Matching Algorithm Deep-Dive Logic

The reconciliation algorithm processes entries by targeting chronological execution points.

For every valid user transaction, the engine computes:

## Time Scope Bounds

$$
[T_{\text{user}} - \Delta t,\ T_{\text{user}} + \Delta t]
$$

---

## Quantity Deviation Variance

$$
\left(
\frac{
|Q_{\text{user}} - Q_{\text{exchange}}|
}{
Q_{\text{user}}
}
\right) \times 100
$$

---

## Chronological Proximity Sorting

Candidate exchange transactions are:
- filtered by asset type,
- constrained inside the configured time scope bounds,
- and sorted using minimal chronological divergence:

$$
|T_{\text{user}} - T_{\text{exchange}}|
$$

This prioritizes the closest chronological event pairs first.

---

## Perspective Inversion Remapping

The engine automatically normalizes directional counter-party mappings such as:

| User Perspective | Exchange Perspective |
|---|---|
| `TRANSFER_OUT` | `TRANSFER_IN` |
| `WITHDRAWAL` | `DEPOSIT` |

This prevents semantic mismatches during reconciliation.

---

## Classification Partitioning

If:

$$
\text{Quantity Variance} \le \text{QUANTITY\_TOLERANCE\_PCT}
$$

the transaction pair is classified as:

```text
Matched
```

Otherwise:

```text
Conflicting
```

Remaining orphaned rows are categorized as:

- `Unmatched_User`
- `Unmatched_Exchange`

---

# 5. Memory-Safe Streaming Report Generation

The export subsystem bypasses large in-memory allocations entirely using MongoDB cursor streams:

```js
ReconciliationResult.find().cursor()
```

As rows are processed sequentially:
1. a flattened CSV/string row is generated,
2. the row is streamed directly into the HTTP response channel using:

```js
res.write()
```

This guarantees:
- flat RAM overhead,
- non-blocking exports,
- and stable API responsiveness during high-concurrency download workloads.

---

# Engineering Principles

- Streaming-first architecture
- Non-destructive ingestion pipelines
- Fault-tolerant reconciliation workflows
- Auditability over silent failure
- Memory-safe exports
- Deterministic transaction matching
- Horizontally scalable ingestion patterns

---

# Technology Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- csv-parse
- Streams API

---

# 6. Setup & Execution Guide

## Prerequisites

- Node.js (v18+ recommended)
- MongoDB (Local instance or MongoDB Atlas cluster connection string)

---

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/tx-reconciliation-engine.git

cd tx-reconciliation-engine

# Install production and development dependencies
npm install
```

---

## Environment Configuration

Create a `.env` file in the root directory:

```env
PORT=3000
MONGODB_URI=mongodb+url_here

# Matching Engine Defaults
TIMESTAMP_TOLERANCE_SECONDS=300
QUANTITY_TOLERANCE_PCT=0.01
```

---

## Running the Application

```bash
# Start development server with hot-reloading
npm run dev

# Run automated end-to-end integration test flight
npm test
```

---

# 7. API Reference Contract

All endpoints are prefixed with `/api`.

---

## 1. Trigger Reconciliation

### URL
```text
/reconcile
```

### Method
```http
POST
```

### Content-Type
```text
multipart/form-data
```

### Payload

| Field | Type | Description |
|---|---|---|
| `user_file` | File | CSV export uploaded by the user |
| `exchange_file` | File | CSV export uploaded from exchange |
| `timestampToleranceSeconds` | Integer | Optional tolerance override |
| `quantityTolerancePct` | Float | Optional quantity variance override |

---

## 2. Fetch Report Summary

### URL
```text
/report/:runId/summary
```

### Method
```http
GET
```

### Success Response (`200 OK`)

```json
{
  "runId": "6a114d02979bd3ec11baf13e",
  "status": "completed",
  "summary": {
    "totalUserRows": 26,
    "totalExchangeRows": 25,
    "matchedCount": 24,
    "conflictingCount": 1,
    "unmatchedUserCount": 1,
    "unmatchedExchangeCount": 0
  }
}
```

---

## 3. Fetch Unmatched Anomalies

### URL
```text
/report/:runId/unmatched
```

### Method
```http
GET
```

### Description

Extracts only the problematic reconciliation items that failed matching loops, alongside their precise operational reason strings.

---

## 4. Stream Detailed CSV Audit Report

### URL
```text
/export/:runId
```

### Method
```http
GET
```

### Description

Dynamically streams a high-speed flattened tabular layout directly into a downloadable spreadsheet response using memory-safe cursor streaming.

---

# Final Checkpoint 🏁

This documentation now fully explains:

- **Why** the architecture exists
- **What** the system stores and processes
- **How** the reconciliation engine operates operationally

The project demonstrates:
- streaming ingestion pipelines,
- reconciliation logic,
- fault-tolerant processing,
- auditability,
- and memory-safe export strategies.

---