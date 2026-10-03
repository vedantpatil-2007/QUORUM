import type Database from 'better-sqlite3';
import { QuorumResultRecord, QuorumStatus } from '../../models/db.types.js';

export interface CreateQuorumResultInput {
  id: string;
  releaseId: string;
  totalBuilders: number;
  agreeingCount: number;
  disagreeingCount: number;
  consensusPercentage: number;
  canonicalHash?: string | null;
  quorumStatus: QuorumStatus;
  breakdownJson: string;
  decidedAt?: string;
}

export class QuorumRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Persists or updates the quorum evaluation result for a release.
   */
  createOrReplaceQuorumResult(input: CreateQuorumResultInput): QuorumResultRecord {
    const canonicalHash = input.canonicalHash ?? null;
    const decidedAt = input.decidedAt ?? new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO quorum_results (
        id, release_id, total_builders, agreeing_count, disagreeing_count,
        consensus_percentage, canonical_hash, quorum_status, breakdown_json, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(release_id) DO UPDATE SET
        total_builders = excluded.total_builders,
        agreeing_count = excluded.agreeing_count,
        disagreeing_count = excluded.disagreeing_count,
        consensus_percentage = excluded.consensus_percentage,
        canonical_hash = excluded.canonical_hash,
        quorum_status = excluded.quorum_status,
        breakdown_json = excluded.breakdown_json,
        decided_at = excluded.decided_at
    `);

    stmt.run(
      input.id,
      input.releaseId,
      input.totalBuilders,
      input.agreeingCount,
      input.disagreeingCount,
      input.consensusPercentage,
      canonicalHash,
      input.quorumStatus,
      input.breakdownJson,
      decidedAt
    );

    return {
      id: input.id,
      release_id: input.releaseId,
      total_builders: input.totalBuilders,
      agreeing_count: input.agreeingCount,
      disagreeing_count: input.disagreeingCount,
      consensus_percentage: input.consensusPercentage,
      canonical_hash: canonicalHash,
      quorum_status: input.quorumStatus,
      breakdown_json: input.breakdownJson,
      decided_at: decidedAt,
    };
  }

  /**
   * Retrieves the quorum evaluation result for a release.
   */
  getQuorumResultByReleaseId(releaseId: string): QuorumResultRecord | null {
    const stmt = this.db.prepare('SELECT * FROM quorum_results WHERE release_id = ?');
    const row = stmt.get(releaseId) as QuorumResultRecord | undefined;
    return row ?? null;
  }
}
