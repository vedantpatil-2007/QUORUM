export type ReleaseStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'FLAGGED'
  | 'REJECTED'
  | 'INSUFFICIENT_EVIDENCE';

export type BuilderStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export type VerificationStatus = 'VALID' | 'INVALID';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface BuilderDto {
  id: string;
  name: string;
  publicKey: string;
  keyType: string;
  operatorIdentity: string;
  status: string;
  registeredAt: string;
}

export interface ReleaseDto {
  releaseId: string;
  project: string;
  version: string;
  repoUrl: string;
  commitSha: string;
  expectedArtifactName: string;
  expectedHash?: string | null;
  status: ReleaseStatus | string;
  createdAt: string;
  ownerAvatarUrl?: string | null;
  visibility?: string;
}

export interface VerificationCheckDetails {
  checks?: Record<string, string>;
  errors?: string[];
  warnings?: string[];
  [key: string]: unknown;
}

export interface VerificationResultDto {
  id: string;
  attestationId: string;
  builderId: string;
  signatureValid: boolean;
  commitMatch: boolean;
  builderActive: boolean;
  status: 'VALID' | 'INVALID';
  notes: VerificationCheckDetails | string | null;
  verifiedAt: string;
}

export interface HashGroupDto {
  artifactSha256: string;
  builderIds: string[];
  count: number;
  percentage: number;
}

export interface QuorumResultDto {
  releaseId: string;
  status: ReleaseStatus | string;
  validAttestations: number;
  invalidAttestations: number;
  dominantHash: string | null;
  dominantBuilderCount: number;
  consensusPercentage: number;
  threshold: number;
  sufficientEvidence: boolean;
  disagreementDetected: boolean;
  hashGroups: HashGroupDto[];
  evaluatedAt: string;
  explanation?: string;
}

export interface LedgerEntryDto {
  id: string;
  sequence: number;
  timestamp: string;
  event_type: string;
  release_id: string | null;
  payload_hash: string;
  previous_hash: string | null;
  current_hash: string;
  payload_json: string | null;
  created_at: string;
}

export interface LedgerVerifyDto {
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  firstInvalidSequence: number | null;
  error: string | null;
  verifiedAt: string;
}

export interface HealthDto {
  status: string;
  service: string;
  version: string;
  timestamp: string;
}

export interface ReleaseEvaluationResponse {
  releaseId: string;
  status: ReleaseStatus | string;
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

export interface UploadReleaseResponse {
  releaseId: string;
  projectName: string;
  version: string;
  repoUrl: string;
  commitSha: string;
  expectedArtifactName: string;
  artifactSha256: string;
  sizeBytes: number;
  status: ReleaseStatus | string;
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
  status: ReleaseStatus | string;
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
