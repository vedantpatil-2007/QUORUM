import { AuditEventType, AuditLedgerRecord } from '../models/db.types.js';

export { AuditEventType, AuditLedgerRecord };

/**
 * Deterministic input structure for calculating currentHash:
 * currentHash = SHA-256(canonicalize(LedgerHashInput))
 */
export interface LedgerHashInput {
  sequence: number;
  timestamp: string;
  eventType: string;
  releaseId: string | null;
  payloadHash: string;
  previousHash: string | null;
}

/**
 * Input parameters for appending an audit event.
 */
export interface AppendEventInput<T = unknown> {
  eventType: AuditEventType | string;
  releaseId?: string | null;
  payload: T;
  timestamp?: string;
}

/**
 * Comprehensive verification result for the audit chain.
 */
export interface LedgerVerificationResult {
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  firstInvalidSequence: number | null;
  error: string | null;
  verifiedAt: string;
}

/**
 * Deterministic payload for QUORUM_EVALUATED events.
 */
export interface QuorumEvaluatedPayload {
  releaseId: string;
  status: string;
  validAttestations: number;
  invalidAttestations: number;
  dominantHash: string | null;
  dominantBuilderCount: number;
  consensusPercentage: number;
  disagreementDetected: boolean;
}

/**
 * Deterministic payload for RELEASE_STATUS_CHANGED events.
 */
export interface ReleaseStatusChangedPayload {
  releaseId: string;
  previousStatus: string;
  newStatus: string;
}

/**
 * Deterministic payload for RELEASE_CREATED events.
 */
export interface ReleaseCreatedPayload {
  releaseId: string;
  projectName: string;
  version: string;
  commitSha: string;
  repoUrl: string;
  expectedArtifactName: string;
}

/**
 * Deterministic payload for ATTESTATION_VERIFIED events.
 */
export interface AttestationVerifiedPayload {
  releaseId: string;
  attestationId: string;
  builderId: string;
  status: string;
  signatureValid: boolean;
  commitMatch: boolean;
  builderActive: boolean;
}
