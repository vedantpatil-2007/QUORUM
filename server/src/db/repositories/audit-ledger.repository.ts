import type Database from 'better-sqlite3';
import { AuditLedgerRecord } from '../../models/db.types.js';

export interface CreateAuditLedgerEntryInput {
  id: string;
  sequence: number;
  timestamp: string;
  eventType: string;
  releaseId?: string | null;
  payloadHash: string;
  previousHash?: string | null;
  currentHash: string;
  payloadJson?: string | null;
  createdAt?: string;
}

export class AuditLedgerRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Appends an immutable audit entry to the hash chain.
   * Parameterized query with strict constraints.
   */
  appendEntry(input: CreateAuditLedgerEntryInput): AuditLedgerRecord {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const releaseId = input.releaseId ?? null;
    const previousHash = input.previousHash ?? null;
    const payloadJson = input.payloadJson ?? null;

    const stmt = this.db.prepare(`
      INSERT INTO audit_ledger (
        id, sequence, timestamp, event_type, release_id,
        payload_hash, previous_hash, current_hash, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.id,
      input.sequence,
      input.timestamp,
      input.eventType,
      releaseId,
      input.payloadHash,
      previousHash,
      input.currentHash,
      payloadJson,
      createdAt
    );

    return {
      id: input.id,
      sequence: input.sequence,
      timestamp: input.timestamp,
      event_type: input.eventType,
      release_id: releaseId,
      payload_hash: input.payloadHash,
      previous_hash: previousHash,
      current_hash: input.currentHash,
      payload_json: payloadJson,
      created_at: createdAt,
    };
  }

  /**
   * Retrieves an entry by its sequence number.
   */
  getEntryBySequence(sequence: number): AuditLedgerRecord | null {
    const row = this.db
      .prepare('SELECT * FROM audit_ledger WHERE sequence = ?')
      .get(sequence) as AuditLedgerRecord | undefined;
    return row ?? null;
  }

  /**
   * Retrieves the most recently appended entry (highest sequence number).
   */
  getLatestEntry(): AuditLedgerRecord | null {
    const row = this.db
      .prepare('SELECT * FROM audit_ledger ORDER BY sequence DESC LIMIT 1')
      .get() as AuditLedgerRecord | undefined;
    return row ?? null;
  }

  /**
   * Retrieves all entries in strict sequence order (1..N).
   */
  getAllEntries(): AuditLedgerRecord[] {
    return this.db
      .prepare('SELECT * FROM audit_ledger ORDER BY sequence ASC')
      .all() as AuditLedgerRecord[];
  }

  /**
   * Retrieves all entries associated with a specific release in sequence order.
   */
  getEntriesByReleaseId(releaseId: string): AuditLedgerRecord[] {
    return this.db
      .prepare('SELECT * FROM audit_ledger WHERE release_id = ? ORDER BY sequence ASC')
      .all(releaseId) as AuditLedgerRecord[];
  }

  /**
   * Returns total count of ledger entries.
   */
  getEntryCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM audit_ledger')
      .get() as { count: number };
    return row.count;
  }

  /**
   * Retrieves an entry by its unique UUID ID.
   */
  getEntryById(id: string): AuditLedgerRecord | null {
    const row = this.db
      .prepare('SELECT * FROM audit_ledger WHERE id = ?')
      .get(id) as AuditLedgerRecord | undefined;
    return row ?? null;
  }
}
