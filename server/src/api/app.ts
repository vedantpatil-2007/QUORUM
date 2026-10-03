import express, { Express } from 'express';
import type Database from 'better-sqlite3';
import { initDatabase } from '../db/database.js';
import { securityMiddleware } from './middleware/security.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createBuildersRouter } from './routes/builders.routes.js';
import { createReleasesRouter } from './routes/releases.routes.js';
import { createVerificationRouter } from './routes/verification.routes.js';
import { createQuorumRouter } from './routes/quorum.routes.js';
import { createLedgerRouter } from './routes/ledger.routes.js';
import { createSourceRouter } from './routes/source.routes.js';
import { GitHubSourceService } from '../source/index.js';

export interface AppOptions {
  db?: Database.Database;
  artifactsDir?: string;
  githubSourceService?: GitHubSourceService;
}

/**
 * Creates and configures the Express application.
 * Accepts optional in-memory or custom database connection for test isolation.
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const db = options.db ?? initDatabase();

  // Core middleware
  app.use(express.json());
  app.use(securityMiddleware);

  // Mount API routers
  const apiRouter = express.Router();
  apiRouter.use(createHealthRouter());
  apiRouter.use(createBuildersRouter(db));
  apiRouter.use(createReleasesRouter(db, options.artifactsDir, options.githubSourceService));
  apiRouter.use(createVerificationRouter(db));
  apiRouter.use(createQuorumRouter(db));
  apiRouter.use(createLedgerRouter(db));
  apiRouter.use(createSourceRouter(options.githubSourceService));

  app.use('/api', apiRouter);

  // 404 and Error handling middleware
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
