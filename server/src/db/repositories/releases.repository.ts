import type Database from 'better-sqlite3';
import { ReleaseRecord, ReleaseStatus } from '../../models/db.types.js';

export interface CreateReleaseInput {
  id: string;
  projectName: string;
  version: string;
  repoUrl: string;
  commitSha: string;
  buildSpecJson: string;
  expectedArtifactName: string;
  expectedHash?: string | null;
  status?: ReleaseStatus;
  createdAt?: string;
}

export class ReleasesRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Registers a new release intent.
   */
  createRelease(input: CreateReleaseInput): ReleaseRecord {
    const status = input.status ?? 'PENDING';
    const createdAt = input.createdAt ?? new Date().toISOString();
    const expectedHash = input.expectedHash ?? null;

    const stmt = this.db.prepare(`
      INSERT INTO releases (
        id, project_name, version, repo_url, commit_sha,
        build_spec_json, expected_artifact_name, expected_hash, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.id,
      input.projectName,
      input.version,
      input.repoUrl,
      input.commitSha,
      input.buildSpecJson,
      input.expectedArtifactName,
      expectedHash,
      status,
      createdAt
    );

    return {
      id: input.id,
      project_name: input.projectName,
      version: input.version,
      repo_url: input.repoUrl,
      commit_sha: input.commitSha,
      build_spec_json: input.buildSpecJson,
      expected_artifact_name: input.expectedArtifactName,
      expected_hash: expectedHash,
      status,
      created_at: createdAt,
    };
  }

  /**
   * Retrieves a release by unique ID.
   */
  getReleaseById(id: string): ReleaseRecord | null {
    const stmt = this.db.prepare('SELECT * FROM releases WHERE id = ?');
    const row = stmt.get(id) as ReleaseRecord | undefined;
    return row ?? null;
  }

  /**
   * Retrieves all releases ordered by creation time descending.
   */
  getAllReleases(): ReleaseRecord[] {
    const stmt = this.db.prepare('SELECT * FROM releases ORDER BY created_at DESC');
    return stmt.all() as ReleaseRecord[];
  }

  /**
   * Updates release status ('PENDING', 'INSUFFICIENT_EVIDENCE', 'VERIFIED', 'FLAGGED', 'REJECTED').
   */
  updateReleaseStatus(id: string, status: ReleaseStatus): boolean {
    const stmt = this.db.prepare('UPDATE releases SET status = ? WHERE id = ?');
    const result = stmt.run(status, id);
    return result.changes > 0;
  }
}
