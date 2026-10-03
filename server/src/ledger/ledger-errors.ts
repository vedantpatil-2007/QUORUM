/**
 * Base class for all audit ledger errors.
 */
export class LedgerError extends Error {
  constructor(message: string, public readonly code: string = 'LEDGER_ERROR') {
    super(`[Ledger Error] ${message}`);
    this.name = 'LedgerError';
  }
}

/**
 * Thrown when an append operation fails.
 */
export class LedgerAppendError extends LedgerError {
  constructor(message: string, public readonly cause?: unknown) {
    super(`Append failed: ${message}`, 'LEDGER_APPEND_FAILED');
    this.name = 'LedgerAppendError';
  }
}

/**
 * Thrown when ledger verification discovers data tampering or chain breaks.
 */
export class LedgerTamperError extends LedgerError {
  constructor(
    message: string,
    public readonly sequence: number,
    public readonly details?: unknown
  ) {
    super(`Tamper detected at sequence ${sequence}: ${message}`, 'LEDGER_TAMPER_DETECTED');
    this.name = 'LedgerTamperError';
  }
}

/**
 * Thrown when a sequence ordering violation occurs.
 */
export class LedgerSequenceError extends LedgerError {
  constructor(message: string, public readonly sequence: number) {
    super(`Sequence violation at sequence ${sequence}: ${message}`, 'LEDGER_SEQUENCE_VIOLATION');
    this.name = 'LedgerSequenceError';
  }
}

/**
 * Thrown when a cryptographic hash mismatch is detected.
 */
export class LedgerHashMismatchError extends LedgerError {
  constructor(
    message: string,
    public readonly sequence: number,
    public readonly expectedHash: string,
    public readonly actualHash: string
  ) {
    super(
      `Hash mismatch at sequence ${sequence}: expected ${expectedHash}, got ${actualHash} (${message})`,
      'LEDGER_HASH_MISMATCH'
    );
    this.name = 'LedgerHashMismatchError';
  }
}
