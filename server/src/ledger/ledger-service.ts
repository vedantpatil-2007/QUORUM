import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { canonicalize } from '../crypto/canonicalize.js';
import { sha256 } from '../crypto/hash.js';
import { AuditLedgerRepository } from './ledger.repository.js';
import {
  AppendEventInput,
  AuditLedgerRecord,
  LedgerHashInput,
  QuorumEvaluatedPayload,
  ReleaseStatusChangedPayload,
  ReleaseCreatedPayload,
  AttestationVerifiedPayload,
} from './ledger.types.js';
import { LedgerAppendError } from './ledger-errors.js';

/**
 * Calculates RFC 8785 canonical SHA-256 hash of an arbitrary event payload.
 */
export function calculatePayloadHash(payload: unknown): string {
  const canonical = canonicalize(payload);
  return sha256(canonical);
}

/**
 * Calculates RFC 8785 canonical currentHash of a ledger entry:
 * currentHash = SHA-256(canonicalize({ sequence, timestamp, eventType, releaseId, payloadHash, previousHash }))
 */
export function calculateCurrentHash(input: LedgerHashInput): string {
  const canonicalInput = {
    sequence: input.sequence,
    timestamp: input.timestamp,
    eventType: input.eventType,
    releaseId: input.releaseId ?? null,
    payloadHash: input.payloadHash,
    previousHash: input.previousHash ?? null,
  };

  const canonicalString = canonicalize(canonicalInput);
  return sha256(canonicalString);
}

export class LedgerService {
  private readonly repository: AuditLedgerRepository;

  constructor(private readonly db: Database.Database) {
    this.repository = new AuditLedgerRepository(db);
  }

  /**
   * Appends an event to the ledger within an atomic SQLite transaction.
   * Ensures sequence monotonicity, correct previousHash linkage, and tamper-evident chaining.
   */
  appendEvent<T = unknown>(input: AppendEventInput<T>): AuditLedgerRecord {
    try {
      const appendTx = this.db.transaction(() => {
        const latest = this.repository.getLatestEntry();

        // 1. Determine next sequence and previous hash
        const sequence = latest ? latest.sequence + 1 : 1;
        const previousHash = latest ? latest.current_hash : null;

        // 2. Deterministic timestamp
        const timestamp = input.timestamp ?? new Date().toISOString();

        // 3. Calculate payload hash using Phase 2 canonicalization & SHA-256
        const payloadHash = calculatePayloadHash(input.payload);
        const payloadJson =
          typeof input.payload === 'string'
            ? input.payload
            : JSON.stringify(input.payload);

        const releaseId = input.releaseId ?? null;

        // 4. Calculate currentHash over canonical hash input
        const currentHash = calculateCurrentHash({
          sequence,
          timestamp,
          eventType: input.eventType,
          releaseId,
          payloadHash,
          previousHash,
        });

        // 5. Unique ledger entry ID
        const id = `led_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

        // 6. Persist to SQLite
        return this.repository.appendEntry({
          id,
          sequence,
          timestamp,
          eventType: input.eventType,
          releaseId,
          payloadHash,
          previousHash,
          currentHash,
          payloadJson,
          createdAt: timestamp,
        });
      });

      return appendTx();
    } catch (err) {
      throw new LedgerAppendError(
        err instanceof Error ? err.message : String(err),
        err
      );
    }
  }

  /**
   * Records a QUORUM_EVALUATED event.
   */
  recordQuorumEvaluated(payload: QuorumEvaluatedPayload): AuditLedgerRecord {
    return this.appendEvent({
      eventType: 'QUORUM_EVALUATED',
      releaseId: payload.releaseId,
      payload,
    });
  }

  /**
   * Records a RELEASE_STATUS_CHANGED event.
   */
  recordReleaseStatusChanged(payload: ReleaseStatusChangedPayload): AuditLedgerRecord {
    return this.appendEvent({
      eventType: 'RELEASE_STATUS_CHANGED',
      releaseId: payload.releaseId,
      payload,
    });
  }

  /**
   * Records a RELEASE_CREATED event.
   */
  recordReleaseCreated(payload: ReleaseCreatedPayload): AuditLedgerRecord {
    return this.appendEvent({
      eventType: 'RELEASE_CREATED',
      releaseId: payload.releaseId,
      payload,
    });
  }

  /**
   * Records an ATTESTATION_VERIFIED event.
   */
  recordAttestationVerified(payload: AttestationVerifiedPayload): AuditLedgerRecord {
    return this.appendEvent({
      eventType: 'ATTESTATION_VERIFIED',
      releaseId: payload.releaseId,
      payload,
    });
  }

  /**
   * Returns the ledger repository.
   */
  getRepository(): AuditLedgerRepository {
    return this.repository;
  }
}
