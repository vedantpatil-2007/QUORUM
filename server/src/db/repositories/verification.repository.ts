import type Database from 'better-sqlite3';
import { VerificationResultRecord, VerificationStatus } from '../../models/db.types.js';

export interface CreateVerificationResultInput {
  id: string;
  releaseId: string;
  attestationId: string;
  signatureValid: boolean | number;
  commitMatch: boolean | number;
  builderActive: boolean | number;
  status: VerificationStatus;
  notes?: string | null;
  verifiedAt?: string;
}

export class VerificationRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Records a cryptographic verification outcome for an attestation.
   */
  createVerificationResult(input: CreateVerificationResultInput): VerificationResultRecord {
    const signatureValid = input.signatureValid ? 1 : 0;
    const commitMatch = input.commitMatch ? 1 : 0;
    const builderActive = input.builderActive ? 1 : 0;
    const notes = input.notes ?? null;
    const verifiedAt = input.verifiedAt ?? new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO verification_results (
        id, release_id, attestation_id, signature_valid,
        commit_match, builder_active, status, notes, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.id,
      input.releaseId,
      input.attestationId,
      signatureValid,
      commitMatch,
      builderActive,
      input.status,
      notes,
      verifiedAt
    );

    return {
      id: input.id,
      release_id: input.releaseId,
      attestation_id: input.attestationId,
      signature_valid: signatureValid,
      commit_match: commitMatch,
      builder_active: builderActive,
      status: input.status,
      notes,
      verified_at: verifiedAt,
    };
  }

  /**
   * Retrieves all verification results for a release.
   */
  getVerificationResultsByReleaseId(releaseId: string): VerificationResultRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM verification_results WHERE release_id = ? ORDER BY verified_at ASC'
    );
    return stmt.all(releaseId) as VerificationResultRecord[];
  }
}
