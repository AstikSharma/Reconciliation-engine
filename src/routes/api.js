import { Router } from 'express';
import multer from 'multer';
import { ReconciliationController } from '../controllers/reconciliationController.js';

const router = Router();

const upload = multer({ dest: 'uploads/' });

router.post(
  '/reconcile', 
  upload.fields([
    { name: 'user_file', maxCount: 1 },
    { name: 'exchange_file', maxCount: 1 }
  ]),
  ReconciliationController.runReconciliation
);

router.get('/report/:runId', ReconciliationController.getFullReport);
router.get('/report/:runId/summary', ReconciliationController.getReportSummary);
router.get('/report/:runId/unmatched', ReconciliationController.getUnmatchedReport);
router.get('/export/:jobId', ReconciliationController.exportReport);

export default router;