import { IngestionService } from '../services/ingestionService.js';
import { MatchingEngine } from '../services/matchingEngine.js';
import { ReconciliationJob, ReconciliationResult } from '../models/Reconciliation.js';
import { config } from '../config/tolerances.js';

export const ReconciliationController = {

  async runReconciliation(req, res) {
    if (!req.files || !req.files['user_file'] || !req.files['exchange_file']) {
      return res.status(400).json({ error: 'Both user_file and exchange_file are required.' });
    }

    const timestampToleranceSeconds = req.body.timestampToleranceSeconds 
      ? parseInt(req.body.timestampToleranceSeconds, 10) 
      : config.matching.timestampToleranceSeconds;

    const quantityTolerancePct = req.body.quantityTolerancePct 
      ? parseFloat(req.body.quantityTolerancePct) 
      : config.matching.quantityTolerancePct;

    const job = await ReconciliationJob.create({
      status: 'processing',
      tolerancesUsed: { timestampToleranceSeconds, quantityTolerancePct }
    });

    try {
      const userFile = req.files['user_file'][0];
      const exchangeFile = req.files['exchange_file'][0];

      const [userMetrics, exchangeMetrics] = await Promise.all([
        IngestionService.ingestTransactionCSV(userFile.path, 'user', job._id.toString()),
        IngestionService.ingestTransactionCSV(exchangeFile.path, 'exchange', job._id.toString())
      ]);

      const engineBreakdown = await MatchingEngine.runMatchingEngine(job._id.toString(), {
        timestampToleranceSeconds,
        quantityTolerancePct
      });

      job.status = 'completed';
      job.summary = {
        totalUserRows: userMetrics.totalRows,
        malformedUserRows: userMetrics.malformedRows,
        totalExchangeRows: exchangeMetrics.totalRows,
        malformedExchangeRows: exchangeMetrics.malformedRows,
        ...engineBreakdown
      };
      await job.save();

      return res.status(201).json({
        message: 'Reconciliation process completed successfully.',
        jobId: job._id,
        summary: job.summary
      });

    } catch (error) {
      console.error('[Controller Anomaly]:', error);
      job.status = 'failed';
      job.errorMessage = error.message;
      await job.save();

      return res.status(500).json({ error: 'Reconciliation operation failed.', details: error.message });
    }
  },

  async exportReport(req, res) {
    const { jobId } = req.params;

    try {
      const job = await ReconciliationJob.findById(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Target reconciliation job not found.' });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=reconciliation_report_${jobId}.csv`);

      res.write('Category,Reason,User_TxID,User_Timestamp,User_Asset,User_Type,User_Quantity,Exchange_TxID,Exchange_Timestamp,Exchange_Asset,Exchange_Type,Exchange_Quantity\n');

      const cursor = ReconciliationResult.find({ jobId })
        .populate('userTxId')
        .populate('exchangeTxId')
        .cursor();

      for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        const u = doc.userTxId || {};
        const e = doc.exchangeTxId || {};

        const row = [
          doc.category,
          `"${doc.reason.replace(/"/g, '""')}"`,
          u.externalId || '',
          u.timestamp ? u.timestamp.toISOString() : '',
          u.asset ? u.asset.toUpperCase() : '',
          u.type || '',
          u.quantity || '',
          e.externalId || '',
          e.timestamp ? e.timestamp.toISOString() : '',
          e.asset ? e.asset.toUpperCase() : '',
          e.type || '',
          e.quantity || ''
        ].join(',');

        res.write(row + '\n');
      }
      res.end();

    } catch (error) {
      console.error('[Export Stream Failure]:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to stream reconciliation export file.' });
      }
    }
  }
};