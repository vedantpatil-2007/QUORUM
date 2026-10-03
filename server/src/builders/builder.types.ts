import { BuildEnvironment, AttestationStatement, SignedAttestation } from '../models/attestation.types.js';
import { Ed25519KeyPair } from '../models/crypto.types.js';

export interface BuildRequest {
  releaseId: string;
  projectName: string;
  version: string;
  repoUrl: string;
  commitSha: string;
  expectedArtifactName: string;
  buildSpec: Record<string, unknown>;
  /**
   * If true, builder intentionally injects a backdoored modification
   * into artifact bytes before hashing, while still legitimately signing with its key.
   */
  compromised?: boolean;
  /**
   * Optional custom divergence modifier to simulate non-deterministic compiler variance
   */
  divergenceVariant?: string;
}

export interface BuildResult {
  builderId: string;
  releaseId: string;
  artifactName: string;
  artifactPath: string;
  artifactBytes: Buffer;
  artifactSha256: string;
  artifactSizeBytes: number;
  buildLog: string;
  buildLogSha256: string;
  buildDurationMs: number;
  buildTimestamp: string;
  buildEnvironment: BuildEnvironment;
}

export interface BuilderIdentity {
  id: string;
  name: string;
  operatorIdentity: string;
  environment: BuildEnvironment;
  /**
   * Stored in runtime memory ONLY. NEVER written to database.
   */
  keyPair: Ed25519KeyPair;
}

export interface AttestationBuildResult {
  buildResult: BuildResult;
  signedAttestation: SignedAttestation;
}

import type Database from 'better-sqlite3';

export interface CreateAttestationOptions {
  repoUrl: string;
  sourceCommit: string;
  db?: Database.Database;
}

export interface IBuilder {
  readonly identity: BuilderIdentity;
  build(request: BuildRequest): Promise<BuildResult>;
  createAttestation(result: BuildResult, options: CreateAttestationOptions): Promise<SignedAttestation>;
}
