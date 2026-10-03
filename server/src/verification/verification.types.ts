import { VerificationCheckCode } from './verification-errors.js';

export type CheckStatus = 'PASSED' | 'FAILED' | 'SKIPPED' | 'UNAVAILABLE';

export interface VerificationCheckDetail {
  code: VerificationCheckCode;
  name: string;
  status: CheckStatus;
  details?: string;
}

export interface AttestationVerificationResult {
  attestationId: string;
  releaseId: string;
  builderId: string;

  // Key booleans for quick programmatic inspection & DB storage
  signatureValid: boolean;
  commitMatch: boolean;
  builderActive: boolean;
  artifactExists: boolean;
  artifactHashMatches: boolean;

  // Final individual verdict: VALID or INVALID
  status: 'VALID' | 'INVALID';

  // Comprehensive check status map
  checks: Record<string, CheckStatus>;
  checkDetails: VerificationCheckDetail[];

  errors: string[];
  warnings: string[];
  notes?: string;
  verifiedAt: string;
}

export interface VerificationOptions {
  artifactsDir?: string;
  skipPersistence?: boolean;
}
