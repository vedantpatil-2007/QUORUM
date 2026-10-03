import type Database from 'better-sqlite3';

export interface Migration {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
}

export const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS builders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    public_key TEXT NOT NULL,
    key_type TEXT NOT NULL DEFAULT 'Ed25519',
    operator_identity TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
    registered_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_builders_status ON builders(status);

CREATE TABLE IF NOT EXISTS releases (
    id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    version TEXT NOT NULL,
    repo_url TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    build_spec_json TEXT NOT NULL,
    expected_artifact_name TEXT NOT NULL,
    expected_hash TEXT,
    status TEXT NOT NULL CHECK(status IN ('PENDING', 'INSUFFICIENT_EVIDENCE', 'VERIFIED', 'FLAGGED', 'REJECTED')),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_releases_project_version ON releases(project_name, version);
CREATE INDEX IF NOT EXISTS idx_releases_commit ON releases(commit_sha);
CREATE INDEX IF NOT EXISTS idx_releases_status ON releases(status);

CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    expected_sha256 TEXT,
    size_bytes INTEGER
);

CREATE INDEX IF NOT EXISTS idx_artifacts_release ON artifacts(release_id);

CREATE TABLE IF NOT EXISTS attestations (
    id TEXT PRIMARY KEY,
    release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    builder_id TEXT NOT NULL REFERENCES builders(id) ON DELETE RESTRICT,
    source_commit TEXT NOT NULL,
    artifact_name TEXT NOT NULL,
    artifact_sha256 TEXT NOT NULL,
    build_env_json TEXT NOT NULL,
    build_timestamp TEXT NOT NULL,
    build_duration_ms INTEGER NOT NULL,
    build_log_sha256 TEXT NOT NULL,
    statement_json TEXT NOT NULL,
    signature TEXT NOT NULL,
    public_key_id TEXT NOT NULL,
    is_valid INTEGER NOT NULL DEFAULT 0 CHECK(is_valid IN (0, 1)),
    validation_error TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(release_id, builder_id)
);

CREATE INDEX IF NOT EXISTS idx_attestations_release ON attestations(release_id);
CREATE INDEX IF NOT EXISTS idx_attestations_builder ON attestations(builder_id);
CREATE INDEX IF NOT EXISTS idx_attestations_hash ON attestations(artifact_sha256);

CREATE TABLE IF NOT EXISTS verification_results (
    id TEXT PRIMARY KEY,
    release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    attestation_id TEXT NOT NULL REFERENCES attestations(id) ON DELETE CASCADE,
    signature_valid INTEGER NOT NULL CHECK(signature_valid IN (0, 1)),
    commit_match INTEGER NOT NULL CHECK(commit_match IN (0, 1)),
    builder_active INTEGER NOT NULL CHECK(builder_active IN (0, 1)),
    status TEXT NOT NULL CHECK(status IN ('VALID', 'INVALID')),
    notes TEXT,
    verified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_release ON verification_results(release_id);
CREATE INDEX IF NOT EXISTS idx_verification_attestation ON verification_results(attestation_id);

CREATE TABLE IF NOT EXISTS quorum_results (
    id TEXT PRIMARY KEY,
    release_id TEXT NOT NULL UNIQUE REFERENCES releases(id) ON DELETE CASCADE,
    total_builders INTEGER NOT NULL,
    agreeing_count INTEGER NOT NULL,
    disagreeing_count INTEGER NOT NULL,
    consensus_percentage REAL NOT NULL,
    canonical_hash TEXT,
    quorum_status TEXT NOT NULL CHECK(quorum_status IN ('INSUFFICIENT_EVIDENCE', 'VERIFIED', 'FLAGGED', 'REJECTED')),
    breakdown_json TEXT NOT NULL,
    decided_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quorum_release ON quorum_results(release_id);

CREATE TABLE IF NOT EXISTS audit_ledger (
    id TEXT PRIMARY KEY,
    sequence INTEGER NOT NULL UNIQUE,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    release_id TEXT,
    payload_hash TEXT NOT NULL,
    previous_hash TEXT,
    current_hash TEXT NOT NULL UNIQUE,
    payload_json TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_ledger_sequence ON audit_ledger(sequence);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_release ON audit_ledger(release_id);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_current_hash ON audit_ledger(current_hash);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_event_type ON audit_ledger(event_type);
`;

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: '001_initial_schema',
    up: (db: Database.Database) => {
      db.exec(INITIAL_SCHEMA_SQL);
    },
  },
  {
    id: 2,
    name: '002_audit_ledger',
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_ledger (
            id TEXT PRIMARY KEY,
            sequence INTEGER NOT NULL UNIQUE,
            timestamp TEXT NOT NULL,
            event_type TEXT NOT NULL,
            release_id TEXT,
            payload_hash TEXT NOT NULL,
            previous_hash TEXT,
            current_hash TEXT NOT NULL UNIQUE,
            payload_json TEXT,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_audit_ledger_sequence ON audit_ledger(sequence);
        CREATE INDEX IF NOT EXISTS idx_audit_ledger_release ON audit_ledger(release_id);
        CREATE INDEX IF NOT EXISTS idx_audit_ledger_current_hash ON audit_ledger(current_hash);
        CREATE INDEX IF NOT EXISTS idx_audit_ledger_event_type ON audit_ledger(event_type);
      `);
    },
  },
];

/**
 * Runs all pending migrations in sequential order.
 * Ensures idempotent schema creation and preserves all existing database records.
 */
export function runMigrations(db: Database.Database): number {
  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedRows = db
    .prepare('SELECT id, name FROM schema_migrations ORDER BY id ASC')
    .all() as { id: number; name: string }[];

  const appliedIds = new Set(appliedRows.map((r) => r.id));
  let newlyApplied = 0;

  for (const migration of MIGRATIONS) {
    if (!appliedIds.has(migration.id)) {
      const applyMigration = db.transaction(() => {
        migration.up(db);
        db.prepare(
          'INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, datetime(\'now\'))'
        ).run(migration.id, migration.name);
      });

      applyMigration();
      newlyApplied++;
    }
  }

  return newlyApplied;
}
