import { Router } from 'express';
import type Database from 'better-sqlite3';
import { BuildersController } from '../controllers/builders.controller.js';
import { validateBuilderId } from '../middleware/request-validation.js';

export function createBuildersRouter(db: Database.Database): Router {
  const router = Router();
  const controller = new BuildersController(db);

  router.get('/builders', controller.getBuilders);
  router.get('/builders/:builderId', validateBuilderId, controller.getBuilderById);

  return router;
}
