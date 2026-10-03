import type Database from 'better-sqlite3';
import { AuditLedgerRepository } from './ledger.repository.js';
import { calculateCurrentHash, calculatePayloadHash } from './ledger-service.js';
import { LedgerVerificationResult } from './ledger.types.js';

export interface VerifyLedgerOptions {
  verifyPayloads?: boolean;
}

/**
 * Independently walks and cryptographically validates the entire audit ledger chain.
 * Detects any modifications, deletions, reorderings, or breaks in hash linkage.
 */
export function verifyLedger(
  dbOrRepo: Database.Database | AuditLedgerRepository,
  options: VerifyLedgerOptions = { verifyPayloads: true }
): LedgerVerificationResult {
  const repository =
    dbOrRepo instanceof AuditLedgerRepository
      ? dbOrRepo
      : new AuditLedgerRepository(dbOrRepo);

  const entries = repository.getAllEntries();
  const verifiedAt = new Date().toISOString();

  if (entries.length === 0) {
    return {
      valid: true,
      totalEntries: 0,
      verifiedEntries: 0,
      firstInvalidSequence: null,
      error: null,
      verifiedAt,
    };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const expectedSequence = i + 1;

    // 1. Verify sequence monotonicity and continuity
    if (entry.sequence !== expectedSequence) {
      return {
        valid: false,
        totalEntries: entries.length,
        verifiedEntries: i,
        firstInvalidSequence: entry.sequence,
        error: `Sequence mismatch at index ${i}: expected sequence ${expectedSequence}, found ${entry.sequence}`,
        verifiedAt,
      };
    }

    // 2. Verify previousHash linkage
    if (i === 0) {
      // Genesis entry must have previousHash === null
      if (entry.previous_hash !== null) {
        return {
          valid: false,
          totalEntries: entries.length,
          verifiedEntries: 0,
          firstInvalidSequence: entry.sequence,
          error: `Genesis entry at sequence 1 must have null previousHash, found "${entry.previous_hash}"`,
          verifiedAt,
        };
      }
    } else {
      // Subsequent entries must point to preceding entry's currentHash
      const prevEntry = entries[i - 1]!;
      if (entry.previous_hash !== prevEntry.current_hash) {
        return {
          valid: false,
          totalEntries: entries.length,
          verifiedEntries: i,
          firstInvalidSequence: entry.sequence,
          error: `Broken chain link at sequence ${entry.sequence}: previousHash does not match currentHash of sequence ${prevEntry.sequence}`,
          verifiedAt,
        };
      }
    }

    // 3. Recompute payload hash where payload information is available
    if (options.verifyPayloads !== false && entry.payload_json !== null) {
      try {
        const parsedPayload = JSON.parse(entry.payload_json);
        const recalculatedPayloadHash = calculatePayloadHash(parsedPayload);
        if (recalculatedPayloadHash !== entry.payload_hash) {
          return {
            valid: false,
            totalEntries: entries.length,
            verifiedEntries: i,
            firstInvalidSequence: entry.sequence,
            error: `Payload hash mismatch at sequence ${entry.sequence}: calculated ${recalculatedPayloadHash}, stored ${entry.payload_hash}`,
            verifiedAt,
          };
        }
      } catch (jsonErr) {
        return {
          valid: false,
          totalEntries: entries.length,
          verifiedEntries: i,
          firstInvalidSequence: entry.sequence,
          error: `Malformed payload JSON at sequence ${entry.sequence}: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
          verifiedAt,
        };
      }
    }

    // 4. Recompute currentHash over canonical hash input
    const calculatedCurrentHash = calculateCurrentHash({
      sequence: entry.sequence,
      timestamp: entry.timestamp,
      eventType: entry.event_type,
      releaseId: entry.release_id,
      payloadHash: entry.payload_hash,
      previousHash: entry.previous_hash,
    });

    if (calculatedCurrentHash !== entry.current_hash) {
      return {
        valid: false,
        totalEntries: entries.length,
        verifiedEntries: i,
        firstInvalidSequence: entry.sequence,
        error: `Ledger hash mismatch at sequence ${entry.sequence}`,
        verifiedAt,
      };
    }
  }

  return {
    valid: true,
    totalEntries: entries.length,
    verifiedEntries: entries.length,
    firstInvalidSequence: null,
    error: null,
    verifiedAt,
  };
}
