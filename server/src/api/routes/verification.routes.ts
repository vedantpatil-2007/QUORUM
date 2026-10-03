import { Router } from 'express';
import type Database from 'better-sqlite3';
import { VerificationController } from '../controllers/verification.controller.js';
import { validateReleaseId } from '../middleware/request-validation.js';

export function createVerificationRouter(db: Database.Database): Router {
  const router = Router();
  const controller = new VerificationController(db);

  router.get('/releases/:releaseId/verification', validateReleaseId, controller.getVerificationResults);

  return router;
}
