import {
  IBuilder,
  BuilderIdentity,
  BuildRequest,
  BuildResult,
  CreateAttestationOptions,
} from './builder.types.js';
import { generateDeterministicArtifact, DEFAULT_ARTIFACTS_DIR } from './artifact-builder.js';
import { createAndSignAttestation } from './attestation-builder.js';
import { SignedAttestation } from '../models/attestation.types.js';

/**
 * DeterministicSimulatorBuilder implements the IBuilder interface.
 * 
 * Simulates an independent build node running in an isolated environment.
 * Generates real deterministic binary artifacts, dynamic SHA-256 digests,
 * and valid Ed25519 signed attestations.
 */
export class DeterministicSimulatorBuilder implements IBuilder {
  constructor(
    public readonly identity: BuilderIdentity,
    private readonly artifactsDir: string = DEFAULT_ARTIFACTS_DIR
  ) {}

  /**
   * Executes deterministic build pipeline.
   */
  async build(request: BuildRequest): Promise<BuildResult> {
    const startTime = Date.now();
    const buildTimestamp = new Date(startTime).toISOString();

    const generated = generateDeterministicArtifact(
      request,
      this.identity.id,
      this.artifactsDir
    );

    const buildDurationMs = Math.max(1, Date.now() - startTime);

    return {
      builderId: this.identity.id,
      releaseId: request.releaseId,
      artifactName: request.expectedArtifactName,
      artifactPath: generated.artifactPath,
      artifactBytes: generated.artifactBytes,
      artifactSha256: generated.artifactSha256,
      artifactSizeBytes: generated.artifactSizeBytes,
      buildLog: generated.buildLog,
      buildLogSha256: generated.buildLogSha256,
      buildDurationMs,
      buildTimestamp,
      buildEnvironment: this.identity.environment,
    };
  }

  /**
   * Cryptographically signs the build result into an attestation.
   */
  async createAttestation(
    result: BuildResult,
    options: CreateAttestationOptions
  ): Promise<SignedAttestation> {
    return createAndSignAttestation(this.identity, result, options);
  }
}
