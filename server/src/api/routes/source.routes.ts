import { Router } from 'express';
import { SourceController } from '../controllers/source.controller.js';
import { GitHubSourceService } from '../../source/index.js';

export function createSourceRouter(githubSourceService?: GitHubSourceService): Router {
  const router = Router();
  const controller = new SourceController(githubSourceService);

  router.post('/source/resolve', controller.resolveSource);

  return router;
}
