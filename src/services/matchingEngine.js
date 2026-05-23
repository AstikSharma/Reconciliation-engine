import { RawTransaction } from '../models/RawTransaction.js';
import { ReconciliationResult } from '../models/Reconciliation.js';
import { areTypesCompatible, calculateQuantityVariance } from '../utils/engineHelpers.js';

/**
 * @param {string} jobId
 * @param {Object} tolerances 
 */
export const runMatchingEngine = async (jobId, tolerances) => {
  const { timestampToleranceSeconds, quantityTolerancePct } = tolerances;

  const userTransactions = await RawTransaction.find({ jobId, source: 'user', status: 'valid' });
  const exchangeTransactions = await RawTransaction.find({ jobId, source: 'exchange', status: 'valid' });

  const matchedExchangeIds = new Set();
  const resultsToInsert = [];

  for (const userTx of userTransactions) {
    const userTime = userTx.timestamp.getTime();
    const startTimeWindow = new Date(userTime - timestampToleranceSeconds * 1000);
    const endTimeWindow = new Date(userTime + timestampToleranceSeconds * 1000);
    const prospectiveCandidates = exchangeTransactions.filter(exTx => 
      exTx.asset === userTx.asset &&
      exTx.timestamp >= startTimeWindow &&
      exTx.timestamp <= endTimeWindow &&
      !matchedExchangeIds.has(exTx._id.toString())
    );

    if (prospectiveCandidates.length === 0) {
      resultsToInsert.push({
        jobId,
        category: 'Unmatched_User',
        reason: `No corresponding record found for asset ${userTx.asset.toUpperCase()} within the ±${timestampToleranceSeconds}s window.`,
        userTxId: userTx._id
      });
      continue;
    }

    prospectiveCandidates.sort((a, b) => 
      Math.abs(a.timestamp.getTime() - userTime) - Math.abs(b.timestamp.getTime() - userTime)
    );

    let matchFound = false;

    for (const candidate of prospectiveCandidates) {
      if (!areTypesCompatible(userTx.type, candidate.type)) {
        continue;
      }

      const qtyVariance = calculateQuantityVariance(userTx.quantity, candidate.quantity);
      
      if (qtyVariance <= quantityTolerancePct) {
        resultsToInsert.push({
          jobId,
          category: 'Matched',
          reason: `Paired perfectly. Quantity variance (${qtyVariance.toFixed(4)}%) is within the allowed ${quantityTolerancePct}% limit.`,
          userTxId: userTx._id,
          exchangeTxId: candidate._id
        });
        
        matchedExchangeIds.add(candidate._id.toString());
        matchFound = true;
        break;
      } else {
        resultsToInsert.push({
          jobId,
          category: 'Conflicting',
          reason: `Proximity match found, but quantity variance (${qtyVariance.toFixed(2)}%) exceeds the specified ${quantityTolerancePct}% threshold limit.`,
          userTxId: userTx._id,
          exchangeTxId: candidate._id
        });

        matchedExchangeIds.add(candidate._id.toString());
        matchFound = true;
        break; 
      }
    }

    if (!matchFound) {
      resultsToInsert.push({
        jobId,
        category: 'Unmatched_User',
        reason: `Found transactions in chronological range, but operations could not be paired cleanly with user side type "${userTx.type}".`,
        userTxId: userTx._id
      });
    }
  }

  for (const exTx of exchangeTransactions) {
    if (!matchedExchangeIds.has(exTx._id.toString())) {
      resultsToInsert.push({
        jobId,
        category: 'Unmatched_Exchange',
        reason: 'Transaction documented inside exchange exports, missing relative user tracking records.',
        exchangeTxId: exTx._id
      });
    }
  }

  if (resultsToInsert.length > 0) {
    await ReconciliationResult.insertMany(resultsToInsert);
  }

  return {
    matchedCount: resultsToInsert.filter(r => r.category === 'Matched').length,
    conflictingCount: resultsToInsert.filter(r => r.category === 'Conflicting').length,
    unmatchedUserCount: resultsToInsert.filter(r => r.category === 'Unmatched_User').length,
    unmatchedExchangeCount: resultsToInsert.filter(r => r.category === 'Unmatched_Exchange').length
  };
};