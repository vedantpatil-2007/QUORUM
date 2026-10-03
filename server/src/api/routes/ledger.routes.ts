import { Router } from 'express';
import type Database from 'better-sqlite3';
import { LedgerController } from '../controllers/ledger.controller.js';
import { validateReleaseId, validateSequence } from '../middleware/request-validation.js';

export function createLedgerRouter(db: Database.Database): Router {
  const router = Router();
  const controller = new LedgerController(db);

  // Specific routes before parameterized routes
  router.get('/ledger/verify', controller.verifyLedgerChain);
  router.get('/ledger', controller.getLedgerEntries);
  router.get('/ledger/:sequence', validateSequence, controller.getLedgerEntryBySequence);
  router.get('/releases/:releaseId/audit', validateReleaseId, controller.getReleaseAudit);

  return router;
}
