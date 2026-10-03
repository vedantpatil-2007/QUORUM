import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Server root directory (2 levels up from src/db or dist/db)
const serverRoot = path.resolve(__dirname, '..', '..');

export function resolveDatabasePath(customPath?: string): string {
  if (customPath) return customPath;
  if (process.env.DATABASE_PATH) return path.resolve(process.env.DATABASE_PATH);

  if (path.basename(process.cwd()) === 'server') {
    return path.resolve(process.cwd(), 'data', 'quorum.db');
  }

  if (fs.existsSync(path.resolve(process.cwd(), 'server'))) {
    return path.resolve(process.cwd(), 'server', 'data', 'quorum.db');
  }

  return path.resolve(serverRoot, 'data', 'quorum.db');
}

export const DEFAULT_DB_PATH = resolveDatabasePath();

export class DatabaseInitializationError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(`Database initialization failed: ${message}`);
    this.name = 'DatabaseInitializationError';
  }
}

export interface DatabaseOptions {
  dbPath?: string;
  enableWal?: boolean;
}

export const REQUIRED_TABLES = [
  'schema_migrations',
  'builders',
  'releases',
  'artifacts',
  'attestations',
  'verification_results',
  'quorum_results',
  'audit_ledger',
] as const;

/**
 * Initializes the SQLite database connection, enforces foreign keys,
 * configures WAL mode, runs migrations, and validates table existence.
 */
export function initDatabase(options: DatabaseOptions = {}): Database.Database {
  const dbPath = options.dbPath ?? resolveDatabasePath();
  const isInMemory = dbPath === ':memory:';

  try {
    // 1. Ensure directory exists for file-backed databases
    if (!isInMemory) {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // 2. Open SQLite connection
    const db = new Database(dbPath);

    // 3. Enable foreign key enforcement strictly
    db.pragma('foreign_keys = ON');

    // 4. Verify foreign keys are actually enabled
    const fkCheck = db.pragma('foreign_keys', { simple: true });
    if (fkCheck !== 1) {
      throw new DatabaseInitializationError(
        `Failed to enable SQLite foreign keys. PRAGMA foreign_keys returned ${fkCheck}`
      );
    }

    // 5. Configure WAL mode for file databases (improves concurrency and durability)
    if (!isInMemory && options.enableWal !== false) {
      db.pragma('journal_mode = WAL');
    }

    // 6. Run migrations to initialize / upgrade schema
    runMigrations(db);

    // 7. Verify all required tables exist
    const existingTableRows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const existingTables = new Set(existingTableRows.map((r) => r.name));

    for (const table of REQUIRED_TABLES) {
      if (!existingTables.has(table)) {
        throw new DatabaseInitializationError(
          `Required table "${table}" was not found after running schema migrations.`
        );
      }
    }

    return db;
  } catch (err) {
    if (err instanceof DatabaseInitializationError) {
      throw err;
    }
    throw new DatabaseInitializationError(
      err instanceof Error ? err.message : String(err),
      err
    );
  }
}

/**
 * Transaction helper that executes a callback function inside an atomic SQLite transaction.
 * If the callback throws an error, all changes within the transaction are rolled back.
 */
export function runTransaction<T>(db: Database.Database, fn: () => T): T {
  const tx = db.transaction(fn);
  return tx();
}
