import mongoose from 'mongoose';

const reconciliationJobSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
    },
    tolerancesUsed: {
      timestampToleranceSeconds: Number,
      quantityTolerancePct: Number,
    },
    summary: {
      totalUserRows: { type: Number, default: 0 },
      totalExchangeRows: { type: Number, default: 0 },
      malformedUserRows: { type: Number, default: 0 },
      malformedExchangeRows: { type: Number, default: 0 },
      matchedCount: { type: Number, default: 0 },
      conflictingCount: { type: Number, default: 0 },
      unmatchedUserCount: { type: Number, default: 0 },
      unmatchedExchangeCount: { type: Number, default: 0 },
    },
    errorMessage: String,
  },
  { timestamps: true }
);

const reconciliationResultSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReconciliationJob',
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['Matched', 'Conflicting', 'Unmatched_User', 'Unmatched_Exchange'],
      index: true,
    },
    reason: {
      type: String,
      required: true,
    },
    userTxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RawTransaction',
      required: false,
    },
    exchangeTxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RawTransaction',
      required: false,
    },
  },
  { timestamps: true }
);

export const ReconciliationJob = mongoose.model('ReconciliationJob', reconciliationJobSchema);
export const ReconciliationResult = mongoose.model('ReconciliationResult', reconciliationResultSchema);