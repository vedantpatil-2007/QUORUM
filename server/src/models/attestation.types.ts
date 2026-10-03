import { SignatureEnvelope } from './crypto.types.js';

export interface BuildEnvironment {
  os: string;
  arch: string;
  kernel?: string;
  compiler: string;
  reproducibleFlags?: Record<string, string | number>;
}

export interface ArtifactReference {
  name: string;
  sha256: string;
  sizeBytes: number;
}

export interface SourceReference {
  repoUrl: string;
  commitSha: string;
}

export interface AttestationStatement {
  statementVersion: string;
  attestationId: string;
  releaseId: string;
  builderId: string;
  publicKeyId: string;
  source: SourceReference;
  artifact: ArtifactReference;
  buildEnvironment: BuildEnvironment;
  buildMetadata: {
    buildTimestamp: string;
    buildDurationMs: number;
    buildLogSha256?: string;
  };
}

export interface SignedAttestation {
  statement: AttestationStatement;
  envelope: SignatureEnvelope;
}
