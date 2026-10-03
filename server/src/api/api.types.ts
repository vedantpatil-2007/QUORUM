import { QuorumStatus, VerificationStatus, BuilderStatus, ReleaseStatus } from '../models/db.types.js';
import { HashGroup } from '../quorum/quorum.types.js';
import { AuditLedgerRecord, LedgerVerificationResult } from '../ledger/ledger.types.js';

/**
 * Standard API response envelope.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorPayload;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
}

export interface BuilderDto {
  id: string;
  name: string;
  publicKey: string;
  keyType: string;
  operatorIdentity: string;
  status: BuilderStatus;
  registeredAt: string;
}

export interface ReleaseDto {
  releaseId: string;
  project: string;
  version: string;
  repoUrl: string;
  commitSha: string;
  expectedArtifactName: string;
  expectedHash: string | null;
  status: ReleaseStatus;
  createdAt: string;
  ownerAvatarUrl?: string | null;
  visibility?: string;
}

export interface VerificationResultDto {
  id: string;
  attestationId: string;
  builderId: string;
  signatureValid: boolean;
  commitMatch: boolean;
  builderActive: boolean;
  status: VerificationStatus;
  notes: unknown;
  verifiedAt: string;
}

export interface QuorumResultDto {
  releaseId: string;
  status: QuorumStatus;
  validAttestations: number;
  invalidAttestations: number;
  dominantHash: string | null;
  dominantBuilderCount: number;
  consensusPercentage: number;
  threshold: number;
  sufficientEvidence: boolean;
  disagreementDetected: boolean;
  hashGroups: HashGroup[];
  evaluatedAt: string;
  explanation?: string;
}

export interface ReleaseEvaluationResponse {
  releaseId: string;
  status: QuorumStatus;
  verification: {
    total: number;
    valid: number;
    invalid: number;
  };
  quorum: {
    consensusPercentage: number;
    dominantHash: string | null;
    disagreementDetected: boolean;
  };
}

export interface LedgerVerifyDto extends LedgerVerificationResult {}

export interface LedgerEntryDto extends AuditLedgerRecord {}

export interface UploadReleaseResponse {
  releaseId: string;
  projectName: string;
  version: string;
  repoUrl: string;
  commitSha: string;
  expectedArtifactName: string;
  artifactSha256: string;
  sizeBytes: number;
  status: ReleaseStatus;
  createdAt: string;
}

export interface SourceResolutionDto {
  repositoryUrl: string;
  provider: 'github';
  owner: string;
  repository: string;
  ref: string;
  commitSha: string;
  resolvedAt: string;
  isDirectCommitSha?: boolean;
  ownerAvatarUrl?: string | null;
  visibility?: 'public';
}

export interface ResolveSourceRequest {
  repositoryUrl: string;
  ref?: string;
}

export interface CreateReleaseFromSourceRequest {
  repositoryUrl: string;
  ref?: string;
  scenario?: 'clean' | 'conflict' | 'no-consensus' | 'insufficient';
}

export interface CreateReleaseFromSourceResponse {
  releaseId: string;
  status: QuorumStatus;
  source: SourceResolutionDto;
  verification: {
    total: number;
    valid: number;
    invalid: number;
  };
  quorum: {
    consensusPercentage: number;
    dominantHash: string | null;
    disagreementDetected: boolean;
  };
  simulationNote: string;
}
