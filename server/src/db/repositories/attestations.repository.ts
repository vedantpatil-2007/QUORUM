import type Database from 'better-sqlite3';
import { AttestationRecord } from '../../models/db.types.js';

export interface CreateAttestationInput {
  id: string;
  releaseId: string;
  builderId: string;
  sourceCommit: string;
  artifactName: string;
  artifactSha256: string;
  buildEnvJson: string;
  buildTimestamp: string;
  buildDurationMs: number;
  buildLogSha256: string;
  statementJson: string;
  signature: string;
  publicKeyId: string;
  isValid?: boolean | number;
  validationError?: string | null;
  createdAt?: string;
}

export class AttestationsRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Persists a builder attestation.
   * Enforces UNIQUE(release_id, builder_id) to prevent multi-voting.
   */
  createAttestation(input: CreateAttestationInput): AttestationRecord {
    const isValid = input.isValid ? 1 : 0;
    const validationError = input.validationError ?? null;
    const createdAt = input.createdAt ?? new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO attestations (
        id, release_id, builder_id, source_commit, artifact_name,
        artifact_sha256, build_env_json, build_timestamp, build_duration_ms,
        build_log_sha256, statement_json, signature, public_key_id,
        is_valid, validation_error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.id,
      input.releaseId,
      input.builderId,
      input.sourceCommit,
      input.artifactName,
      input.artifactSha256,
      input.buildEnvJson,
      input.buildTimestamp,
      input.buildDurationMs,
      input.buildLogSha256,
      input.statementJson,
      input.signature,
      input.publicKeyId,
      isValid,
      validationError,
      createdAt
    );

    return {
      id: input.id,
      release_id: input.releaseId,
      builder_id: input.builderId,
      source_commit: input.sourceCommit,
      artifact_name: input.artifactName,
      artifact_sha256: input.artifactSha256,
      build_env_json: input.buildEnvJson,
      build_timestamp: input.buildTimestamp,
      build_duration_ms: input.buildDurationMs,
      build_log_sha256: input.buildLogSha256,
      statement_json: input.statementJson,
      signature: input.signature,
      public_key_id: input.publicKeyId,
      is_valid: isValid,
      validation_error: validationError,
      created_at: createdAt,
    };
  }

  /**
   * Retrieves an attestation by unique ID.
   */
  getAttestationById(id: string): AttestationRecord | null {
    const stmt = this.db.prepare('SELECT * FROM attestations WHERE id = ?');
    const row = stmt.get(id) as AttestationRecord | undefined;
    return row ?? null;
  }

  /**
   * Retrieves all attestations for a given release.
   */
  getAttestationsByReleaseId(releaseId: string): AttestationRecord[] {
    const stmt = this.db.prepare('SELECT * FROM attestations WHERE release_id = ? ORDER BY created_at ASC');
    return stmt.all(releaseId) as AttestationRecord[];
  }

  /**
   * Retrieves an attestation for a specific builder and release.
   */
  getAttestationByBuilderAndRelease(builderId: string, releaseId: string): AttestationRecord | null {
    const stmt = this.db.prepare(
      'SELECT * FROM attestations WHERE builder_id = ? AND release_id = ?'
    );
    const row = stmt.get(builderId, releaseId) as AttestationRecord | undefined;
    return row ?? null;
  }
}
