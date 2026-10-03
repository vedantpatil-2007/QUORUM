import { Router } from 'express';
import type Database from 'better-sqlite3';
import { ReleasesController } from '../controllers/releases.controller.js';
import { validateReleaseId } from '../middleware/request-validation.js';

import { GitHubSourceService } from '../../source/index.js';

export function createReleasesRouter(
  db: Database.Database,
  artifactsDir?: string,
  githubSourceService?: GitHubSourceService
): Router {
  const router = Router();
  const controller = new ReleasesController(db, artifactsDir, githubSourceService);

  router.post('/releases/upload', controller.uploadReleaseArtifact);
  router.post('/releases/from-source', controller.createReleaseFromSource);
  router.post('/releases', controller.createRelease);
  router.get('/releases', controller.getReleases);
  router.get('/releases/:releaseId', validateReleaseId, controller.getReleaseById);
  router.post('/releases/:releaseId/evaluate', validateReleaseId, controller.evaluateRelease);

  return router;
}
