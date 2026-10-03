import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { initDatabase } from '../server/src/db/database.js';
import { BuildersRepository } from '../server/src/db/repositories/builders.repository.js';
import { AttestationsRepository } from '../server/src/db/repositories/attestations.repository.js';
import { ReleasesRepository } from '../server/src/db/repositories/releases.repository.js';
import { createDefaultBuilders } from '../server/src/builders/builder-factory.js';
import { generateDeterministicArtifact } from '../server/src/builders/artifact-builder.js';
import { runBuilderScenario } from '../server/src/builders/demo-scenarios.js';
import { verifyStatementSignature } from '../server/src/crypto/verifier.js';
import { sha256 } from '../server/src/crypto/hash.js';
import { BuildRequest } from '../server/src/builders/builder.types.js';

describe('Quorum Builder Simulation & Attestation Generation (Phase 4)', () => {
  let db: Database.Database;
  let tempArtifactsDir: string;

  beforeEach(() => {
    // Isolated in-memory database for test isolation
    db = initDatabase({ dbPath: ':memory:' });
    tempArtifactsDir = path.join(os.tmpdir(), `quorum-test-artifacts-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempArtifactsDir, { recursive: true });
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(tempArtifactsDir)) {
      fs.rmSync(tempArtifactsDir, { recursive: true, force: true });
    }
  });

  const sampleBuildRequest: BuildRequest = {
    releaseId: 'rel_test_001',
    projectName: 'quorum-demo',
    version: '1.0.0',
    repoUrl: 'https://github.com/quorum/demo',
    commitSha: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
    expectedArtifactName: 'app.bin',
    buildSpec: {
      compiler: 'deterministic-simulator',
      sourceDateEpoch: 1700000000,
      target: 'demo',
    },
  };

  // TEST 1: Three honest builders generate the same artifact SHA-256
  it('TEST 1: Three honest builders generate the same artifact bytes and SHA-256', async () => {
    const builders = createDefaultBuilders({ artifactsDir: tempArtifactsDir });
    expect(builders.length).toBe(3);

    const [alpha, beta, gamma] = builders;
    const resAlpha = await alpha!.build(sampleBuildRequest);
    const resBeta = await beta!.build(sampleBuildRequest);
    const resGamma = await gamma!.build(sampleBuildRequest);

    // Artifact bytes must be strictly identical
    expect(resAlpha.artifactBytes.equals(resBeta.artifactBytes)).toBe(true);
    expect(resBeta.artifactBytes.equals(resGamma.artifactBytes)).toBe(true);

    // SHA-256 must be identical across all three honest builders
    expect(resAlpha.artifactSha256).toBe(resBeta.artifactSha256);
    expect(resBeta.artifactSha256).toBe(resGamma.artifactSha256);
    expect(resAlpha.artifactSha256).toHaveLength(64);
  });

  // TEST 2: Each builder generates a distinct valid Ed25519 signature
  it('TEST 2: Each builder generates a distinct valid Ed25519 signature', async () => {
    const builders = createDefaultBuilders({ artifactsDir: tempArtifactsDir });
    const [alpha, beta, gamma] = builders;

    const buildAlpha = await alpha!.build(sampleBuildRequest);
    const buildBeta = await beta!.build(sampleBuildRequest);
    const buildGamma = await gamma!.build(sampleBuildRequest);

    const attAlpha = await alpha!.createAttestation(buildAlpha, {
      repoUrl: sampleBuildRequest.repoUrl,
      sourceCommit: sampleBuildRequest.commitSha,
    });
    const attBeta = await beta!.createAttestation(buildBeta, {
      repoUrl: sampleBuildRequest.repoUrl,
      sourceCommit: sampleBuildRequest.commitSha,
    });
    const attGamma = await gamma!.createAttestation(buildGamma, {
      repoUrl: sampleBuildRequest.repoUrl,
      sourceCommit: sampleBuildRequest.commitSha,
    });

    // Signatures must be distinct (different private keys and different builder identities)
    expect(attAlpha.envelope.signature).not.toBe(attBeta.envelope.signature);
    expect(attBeta.envelope.signature).not.toBe(attGamma.envelope.signature);
    expect(attAlpha.envelope.signature).not.toBe(attGamma.envelope.signature);

    // Each signature must be cryptographically valid when verified against that builder's public key
    const vAlpha = verifyStatementSignature(
      attAlpha.statement,
      attAlpha.envelope.signature,
      alpha!.identity.keyPair.publicKeyPem
    );
    const vBeta = verifyStatementSignature(
      attBeta.statement,
      attBeta.envelope.signature,
      beta!.identity.keyPair.publicKeyPem
    );
    const vGamma = verifyStatementSignature(
      attGamma.statement,
      attGamma.envelope.signature,
      gamma!.identity.keyPair.publicKeyPem
    );

    expect(vAlpha.isValid).toBe(true);
    expect(vBeta.isValid).toBe(true);
    expect(vGamma.isValid).toBe(true);
  });

  // TEST 3: Each builder has a different public key
  it('TEST 3: Each builder has a different public key and fingerprint', () => {
    const builders = createDefaultBuilders();
    const [alpha, beta, gamma] = builders;

    expect(alpha!.identity.keyPair.publicKeyPem).not.toBe(beta!.identity.keyPair.publicKeyPem);
    expect(beta!.identity.keyPair.publicKeyPem).not.toBe(gamma!.identity.keyPair.publicKeyPem);
    expect(alpha!.identity.keyPair.publicKeyFingerprint).not.toBe(
      beta!.identity.keyPair.publicKeyFingerprint
    );
  });

  // TEST 4: All honest attestations can be cryptographically verified using Phase 2 verifier
  it('TEST 4: All honest attestations can be cryptographically verified using the existing Phase 2 verifier', async () => {
    const scenarioResult = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    expect(scenarioResult.builderOutputs.length).toBe(3);
    for (const b of scenarioResult.builderOutputs) {
      expect(b.signatureValid).toBe(true);
    }
  });

  // TEST 5: Changing the source commit changes the deterministic artifact/hash
  it('TEST 5: Changing the source commit changes the deterministic artifact/hash', () => {
    const original = generateDeterministicArtifact(sampleBuildRequest, 'bld_1', tempArtifactsDir);

    const changedCommitRequest: BuildRequest = {
      ...sampleBuildRequest,
      commitSha: 'ffffffffffffffffffffffffffffffffffffffff',
    };
    const modified = generateDeterministicArtifact(changedCommitRequest, 'bld_1', tempArtifactsDir);

    expect(original.artifactBytes.equals(modified.artifactBytes)).toBe(false);
    expect(original.artifactSha256).not.toBe(modified.artifactSha256);
  });

  // TEST 6: Changing the build specification changes the artifact/hash
  it('TEST 6: Changing the build specification changes the artifact/hash', () => {
    const original = generateDeterministicArtifact(sampleBuildRequest, 'bld_1', tempArtifactsDir);

    const changedSpecRequest: BuildRequest = {
      ...sampleBuildRequest,
      buildSpec: {
        compiler: 'deterministic-simulator',
        sourceDateEpoch: 1700000000,
        target: 'production-hardened', // changed build flag
      },
    };
    const modified = generateDeterministicArtifact(changedSpecRequest, 'bld_1', tempArtifactsDir);

    expect(original.artifactBytes.equals(modified.artifactBytes)).toBe(false);
    expect(original.artifactSha256).not.toBe(modified.artifactSha256);
  });

  // TEST 7: Changing one artifact byte changes its SHA-256
  it('TEST 7: Changing one artifact byte changes its SHA-256', () => {
    const generated = generateDeterministicArtifact(sampleBuildRequest, 'bld_1', tempArtifactsDir);
    const originalBytes = generated.artifactBytes;
    const tamperedBytes = Buffer.from(originalBytes);
    tamperedBytes[0] = tamperedBytes[0]! ^ 0xff; // Invert first byte

    const originalHash = sha256(originalBytes);
    const tamperedHash = sha256(tamperedBytes);

    expect(originalHash).toBe(generated.artifactSha256);
    expect(originalHash).not.toBe(tamperedHash);
  });

  // TEST 8: Compromised builder produces a different artifact hash
  it('TEST 8: Compromised builder produces a different artifact hash', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'conflict',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const [alpha, beta, gamma] = scenario.builderOutputs;

    // Alpha and Beta (honest) must agree
    expect(alpha!.artifactSha256).toBe(beta!.artifactSha256);

    // Gamma (compromised) must produce a conflicting hash
    expect(gamma!.artifactSha256).not.toBe(alpha!.artifactSha256);
    expect(gamma!.compromised).toBe(true);

    // Exactly 2 distinct hashes
    expect(scenario.distinctHashes.length).toBe(2);
  });

  // TEST 9: Compromised builder's signature is still valid (VALID SIGNATURE != VALID RELEASE)
  it('TEST 9: Compromised builder signature is STILL VALID because it legitimately signed its own attestation', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'conflict',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const gamma = scenario.builderOutputs.find((b) => b.builderId === 'bld_node_gamma_apac')!;
    expect(gamma.compromised).toBe(true);

    // CRUCIAL SECURITY PROPERTY:
    // The signature must be VALID even though the artifact contains an injected backdoor!
    expect(gamma.signatureValid).toBe(true);
  });

  // TEST 10: Private keys are never written to SQLite
  it('TEST 10: Private keys are NEVER written to SQLite', () => {
    // Run scenario which creates builders, releases, and attestations
    const builders = createDefaultBuilders({ db });

    // Inspect database rows in builders and attestations tables
    const buildersRows = db.prepare('SELECT * FROM builders').all() as Record<string, unknown>[];
    expect(buildersRows.length).toBe(3);

    for (const row of buildersRows) {
      // Check column names: no private key column exists
      expect(Object.keys(row)).not.toContain('private_key');
      expect(Object.keys(row)).not.toContain('privateKey');

      // Check values: public_key must be SPKI PEM, never contains 'PRIVATE KEY'
      const pubKey = String(row['public_key']);
      expect(pubKey).toContain('PUBLIC KEY');
      expect(pubKey).not.toContain('PRIVATE KEY');
    }

    // Inspect attestations rows
    const attestationRows = db.prepare('SELECT * FROM attestations').all() as Record<string, unknown>[];
    for (const row of attestationRows) {
      for (const val of Object.values(row)) {
        if (typeof val === 'string') {
          expect(val).not.toContain('PRIVATE KEY');
        }
      }
    }
  });

  // TEST 11: Three attestations are persisted and can be retrieved from the database
  it('TEST 11: Three attestations are persisted and can be retrieved from the database', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const attestationsRepo = new AttestationsRepository(db);
    const stored = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId);

    expect(stored.length).toBe(3);
    const storedBuilderIds = stored.map((a) => a.builder_id).sort();
    expect(storedBuilderIds).toEqual([
      'bld_node_alpha_us',
      'bld_node_beta_eu',
      'bld_node_gamma_apac',
    ]);

    for (const att of stored) {
      expect(att.artifact_sha256).toHaveLength(64);
      expect(att.signature.length).toBeGreaterThan(0);
      expect(att.is_valid).toBe(1);
    }
  });

  // TEST 12: Running the same clean build twice produces identical artifact bytes and hashes
  it('TEST 12: Running the same clean build twice with identical inputs produces identical artifact bytes and hashes', async () => {
    const builders = createDefaultBuilders({ artifactsDir: tempArtifactsDir });
    const alpha = builders[0]!;

    const run1 = await alpha.build(sampleBuildRequest);
    const run2 = await alpha.build(sampleBuildRequest);

    expect(run1.artifactBytes.equals(run2.artifactBytes)).toBe(true);
    expect(run1.artifactSha256).toBe(run2.artifactSha256);
  });

  // Scenario C Test (No Consensus)
  it('Scenario C (no-consensus): produces 3 distinct hashes with all 3 signatures valid', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'no-consensus',
      db,
      artifactsDir: tempArtifactsDir,
    });

    expect(scenario.distinctHashes.length).toBe(3);
    for (const b of scenario.builderOutputs) {
      expect(b.signatureValid).toBe(true);
    }
  });
});
