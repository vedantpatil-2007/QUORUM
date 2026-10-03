export enum VerificationCheckCode {
  SCHEMA_VALIDATION = 'SCHEMA_VALIDATION',
  BUILDER_LOOKUP = 'BUILDER_LOOKUP',
  BUILDER_STATUS = 'BUILDER_STATUS',
  PUBLIC_KEY_MATCH = 'PUBLIC_KEY_MATCH',
  COMMIT_MATCH = 'COMMIT_MATCH',
  ARTIFACT_IDENTITY = 'ARTIFACT_IDENTITY',
  ARTIFACT_EXISTS = 'ARTIFACT_EXISTS',
  ARTIFACT_HASH_MATCH = 'ARTIFACT_HASH_MATCH',
  BUILD_LOG_HASH = 'BUILD_LOG_HASH',
  SIGNATURE_VERIFICATION = 'SIGNATURE_VERIFICATION',
}

export class VerificationEngineError extends Error {
  constructor(message: string, public code?: VerificationCheckCode) {
    super(`[VerificationEngine] ${message}`);
    this.name = 'VerificationEngineError';
  }
}
