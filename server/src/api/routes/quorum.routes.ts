import { Router } from 'express';
import type Database from 'better-sqlite3';
import { QuorumController } from '../controllers/quorum.controller.js';
import { validateReleaseId } from '../middleware/request-validation.js';

export function createQuorumRouter(db: Database.Database): Router {
  const router = Router();
  const controller = new QuorumController(db);

  router.get('/releases/:releaseId/quorum', validateReleaseId, controller.getQuorumResult);

  return router;
}
