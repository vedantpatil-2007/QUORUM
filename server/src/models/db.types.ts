export type BuilderStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export type ReleaseStatus =
  | 'PENDING'
  | 'INSUFFICIENT_EVIDENCE'
  | 'VERIFIED'
  | 'FLAGGED'
  | 'REJECTED';

export type VerificationStatus = 'VALID' | 'INVALID';

export type QuorumStatus =
  | 'INSUFFICIENT_EVIDENCE'
  | 'VERIFIED'
  | 'FLAGGED'
  | 'REJECTED';

export interface BuilderRecord {
  id: string;
  name: string;
  public_key: string;
  key_type: string;
  operator_identity: string;
  status: BuilderStatus;
  registered_at: string;
}

export interface ReleaseRecord {
  id: string;
  project_name: string;
  version: string;
  repo_url: string;
  commit_sha: string;
  build_spec_json: string;
  expected_artifact_name: string;
  expected_hash: string | null;
  status: ReleaseStatus;
  created_at: string;
}

export interface ArtifactRecord {
  id: string;
  release_id: string;
  filename: string;
  expected_sha256: string | null;
  size_bytes: number | null;
}

export interface AttestationRecord {
  id: string;
  release_id: string;
  builder_id: string;
  source_commit: string;
  artifact_name: string;
  artifact_sha256: string;
  build_env_json: string;
  build_timestamp: string;
  build_duration_ms: number;
  build_log_sha256: string;
  statement_json: string;
  signature: string;
  public_key_id: string;
  is_valid: number; // 0 or 1 (SQLite boolean)
  validation_error: string | null;
  created_at: string;
}

export interface VerificationResultRecord {
  id: string;
  release_id: string;
  attestation_id: string;
  signature_valid: number; // 0 or 1
  commit_match: number; // 0 or 1
  builder_active: number; // 0 or 1
  status: VerificationStatus;
  notes: string | null;
  verified_at: string;
}

export interface QuorumResultRecord {
  id: string;
  release_id: string;
  total_builders: number;
  agreeing_count: number;
  disagreeing_count: number;
  consensus_percentage: number;
  canonical_hash: string | null;
  quorum_status: QuorumStatus;
  breakdown_json: string;
  decided_at: string;
}

export interface SchemaMigrationRecord {
  id: number;
  name: string;
  applied_at: string;
}

export type AuditEventType =
  | 'RELEASE_CREATED'
  | 'ATTESTATION_VERIFIED'
  | 'QUORUM_EVALUATED'
  | 'RELEASE_STATUS_CHANGED'
  | 'BUILDER_REGISTERED'
  | 'BUILDER_STATUS_CHANGED'
  | 'ARTIFACT_CREATED';

export interface AuditLedgerRecord {
  id: string;
  sequence: number;
  timestamp: string;
  event_type: AuditEventType | string;
  release_id: string | null;
  payload_hash: string;
  previous_hash: string | null;
  current_hash: string;
  payload_json: string | null;
  created_at: string;
}
