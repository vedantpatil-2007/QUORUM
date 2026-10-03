import type Database from 'better-sqlite3';
import { ArtifactRecord } from '../../models/db.types.js';

export interface CreateArtifactInput {
  id: string;
  releaseId: string;
  filename: string;
  expectedSha256?: string | null;
  sizeBytes?: number | null;
}

export class ArtifactsRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Associates an artifact declaration with a release.
   */
  createArtifact(input: CreateArtifactInput): ArtifactRecord {
    const expectedSha256 = input.expectedSha256 ?? null;
    const sizeBytes = input.sizeBytes ?? null;

    const stmt = this.db.prepare(`
      INSERT INTO artifacts (
        id, release_id, filename, expected_sha256, size_bytes
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.id,
      input.releaseId,
      input.filename,
      expectedSha256,
      sizeBytes
    );

    return {
      id: input.id,
      release_id: input.releaseId,
      filename: input.filename,
      expected_sha256: expectedSha256,
      size_bytes: sizeBytes,
    };
  }

  /**
   * Retrieves all artifacts declared for a release.
   */
  getArtifactsByReleaseId(releaseId: string): ArtifactRecord[] {
    const stmt = this.db.prepare('SELECT * FROM artifacts WHERE release_id = ?');
    return stmt.all(releaseId) as ArtifactRecord[];
  }
}
