import type Database from 'better-sqlite3';
import { ReleasesRepository } from '../db/repositories/releases.repository.js';
import { ArtifactsRepository } from '../db/repositories/artifacts.repository.js';
import { verifyStatementSignature } from '../crypto/verifier.js';
import { createDefaultBuilders } from './builder-factory.js';
import { BuildRequest, BuildResult } from './builder.types.js';
import { SignedAttestation } from '../models/attestation.types.js';
import { LedgerService } from '../ledger/ledger-service.js';

export type ScenarioType = 'clean' | 'conflict' | 'no-consensus' | 'insufficient';

export interface ScenarioBuilderOutput {
  builderId: string;
  builderName: string;
  environment: string;
  artifactName: string;
  artifactSha256: string;
  artifactSizeBytes: number;
  signature: string;
  publicKeyId: string;
  signatureValid: boolean;
  compromised: boolean;
}

export interface ScenarioResult {
  scenario: ScenarioType;
  releaseId: string;
  projectName: string;
  version: string;
  commitSha: string;
  expectedArtifactName: string;
  builderOutputs: ScenarioBuilderOutput[];
  distinctHashes: string[];
}

export interface RunScenarioOptions {
  scenario: ScenarioType;
  db?: Database.Database;
  artifactsDir?: string;
  releaseIdPrefix?: string;
  overrideMetadata?: {
    projectName?: string;
    version?: string;
    repoUrl?: string;
    commitSha?: string;
    expectedArtifactName?: string;
    buildSpecExtras?: Record<string, unknown>;
  };
}

/**
 * Executes a simulated multi-builder build workflow.
 * 
 * SCENARIOS:
 * - 'clean' (Scenario A): All 3 builders honest -> 3 identical hashes, 3 valid signatures.
 * - 'conflict' (Scenario B): Gamma compromised -> 2 identical hashes, 1 conflicting hash, 3 VALID signatures!
 * - 'no-consensus' (Scenario C): 3 different hashes -> 3 distinct hashes, 3 valid signatures.
 * - 'insufficient' (Scenario D): Only 2 builders produce attestations -> insufficient evidence for quorum (< 3).
 */
export async function runBuilderScenario(
  options: RunScenarioOptions
): Promise<ScenarioResult> {
  const scenario = options.scenario;
  const releaseId = `${options.releaseIdPrefix ?? 'rel_demo'}_${scenario}_${Date.now()}`;
  const projectName = options.overrideMetadata?.projectName ?? 'quorum-demo';
  const version = options.overrideMetadata?.version ?? '1.0.0';
  const repoUrl = options.overrideMetadata?.repoUrl ?? 'https://github.com/quorum-network/quorum-demo';
  const commitSha = options.overrideMetadata?.commitSha ?? 'd670460b4b4aece5915caf5c68d12f560a9fe3e4';
  const expectedArtifactName = options.overrideMetadata?.expectedArtifactName ?? 'quorum-demo-v1.0.0-linux-amd64.bin';
  const buildSpec = {
    compiler: 'deterministic-simulator',
    sourceDateEpoch: 1700000000,
    target: 'demo',
    ...(options.overrideMetadata?.buildSpecExtras ?? {}),
  };

  // 1. Record release and declared artifact in database if DB connection provided
  if (options.db) {
    const releasesRepo = new ReleasesRepository(options.db);
    const artifactsRepo = new ArtifactsRepository(options.db);

    releasesRepo.createRelease({
      id: releaseId,
      projectName,
      version,
      repoUrl,
      commitSha,
      buildSpecJson: JSON.stringify(buildSpec),
      expectedArtifactName,
      status: 'PENDING',
    });

    artifactsRepo.createArtifact({
      id: `art_${releaseId}`,
      releaseId,
      filename: expectedArtifactName,
    });

    const ledger = new LedgerService(options.db);
    ledger.recordReleaseCreated({
      releaseId,
      projectName,
      version,
      commitSha,
      repoUrl,
      expectedArtifactName,
    });
  }

  // 2. Initialize the 3 independent builders
  const builders = createDefaultBuilders({
    db: options.db,
    artifactsDir: options.artifactsDir,
  });

  const builderOutputs: ScenarioBuilderOutput[] = [];
  const hashSet = new Set<string>();

  // In insufficient scenario, only 2 builders run (< MIN_BUILDERS of 3)
  const activeBuilders = scenario === 'insufficient' ? builders.slice(0, 2) : builders;

  // 3. Execute builds for each builder according to scenario rules
  for (const builder of activeBuilders) {
    let isCompromised = false;
    let divergenceVariant: string | undefined = undefined;

    if (scenario === 'conflict' && builder.identity.id === 'bld_node_gamma_apac') {
      // Gamma is compromised in conflict scenario
      isCompromised = true;
    } else if (scenario === 'no-consensus') {
      if (builder.identity.id === 'bld_node_beta_eu') {
        divergenceVariant = 'beta-compiler-variance';
      } else if (builder.identity.id === 'bld_node_gamma_apac') {
        divergenceVariant = 'gamma-compiler-variance';
      }
    }

    const request: BuildRequest = {
      releaseId,
      projectName,
      version,
      repoUrl,
      commitSha,
      expectedArtifactName,
      buildSpec,
      compromised: isCompromised,
      divergenceVariant,
    };

    // Independently execute build
    const buildResult: BuildResult = await builder.build(request);

    // Independently sign attestation
    const signedAttestation: SignedAttestation = await builder.createAttestation(
      buildResult,
      {
        repoUrl,
        sourceCommit: commitSha,
        db: options.db,
      }
    );

    // Cryptographically verify signature using builder's registered public key
    const verification = verifyStatementSignature(
      signedAttestation.statement,
      signedAttestation.envelope.signature,
      builder.identity.keyPair.publicKeyPem,
      builder.identity.keyPair.keyId
    );

    hashSet.add(buildResult.artifactSha256);

    builderOutputs.push({
      builderId: builder.identity.id,
      builderName: builder.identity.name,
      environment: builder.identity.environment.os,
      artifactName: buildResult.artifactName,
      artifactSha256: buildResult.artifactSha256,
      artifactSizeBytes: buildResult.artifactSizeBytes,
      signature: signedAttestation.envelope.signature,
      publicKeyId: builder.identity.keyPair.keyId,
      signatureValid: verification.isValid,
      compromised: isCompromised,
    });
  }

  return {
    scenario,
    releaseId,
    projectName,
    version,
    commitSha,
    expectedArtifactName,
    builderOutputs,
    distinctHashes: Array.from(hashSet),
  };
}
