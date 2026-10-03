import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { initDatabase } from '../server/src/db/database.js';
import { BuildersRepository } from '../server/src/db/repositories/builders.repository.js';
import { ReleasesRepository } from '../server/src/db/repositories/releases.repository.js';
import { AttestationsRepository } from '../server/src/db/repositories/attestations.repository.js';
import { VerificationRepository } from '../server/src/db/repositories/verification.repository.js';
import { QuorumRepository } from '../server/src/db/repositories/quorum.repository.js';
import { QuorumEngine } from '../server/src/quorum/quorum-engine.js';
import { VerificationEngine } from '../server/src/verification/verification-engine.js';
import {
  meetsQuorumThreshold,
  calculateConsensusPercentage,
  MIN_BUILDERS,
  QUORUM_THRESHOLD_PERCENT,
} from '../server/src/quorum/quorum-rules.js';
import { runBuilderScenario } from '../server/src/builders/demo-scenarios.js';
import { generateEd25519KeyPair } from '../server/src/crypto/keys.js';
import { sha256 } from '../server/src/crypto/hash.js';

describe('Quorum Consensus Engine (Phase 6)', () => {
  let db: Database.Database;
  let tempArtifactsDir: string;
  let quorumEngine: QuorumEngine;
  let verificationEngine: VerificationEngine;
  let buildersRepo: BuildersRepository;
  let releasesRepo: ReleasesRepository;
  let attestationsRepo: AttestationsRepository;
  let verificationRepo: VerificationRepository;
  let quorumRepo: QuorumRepository;

  beforeEach(() => {
    db = initDatabase({ dbPath: ':memory:' });
    tempArtifactsDir = path.join(
      os.tmpdir(),
      `quorum-engine-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(tempArtifactsDir, { recursive: true });

    quorumEngine = new QuorumEngine(db);
    verificationEngine = new VerificationEngine(db, tempArtifactsDir);
    buildersRepo = new BuildersRepository(db);
    releasesRepo = new ReleasesRepository(db);
    attestationsRepo = new AttestationsRepository(db);
    verificationRepo = new VerificationRepository(db);
    quorumRepo = new QuorumRepository(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(tempArtifactsDir)) {
      fs.rmSync(tempArtifactsDir, { recursive: true, force: true });
    }
  });

  // Helper to create synthetic builders, attestations, and verification results
  function setupSyntheticRelease(
    releaseId: string,
    builderConfigs: Array<{
      builderId: string;
      artifactSha256: string;
      verificationStatus: 'VALID' | 'INVALID';
    }>
  ) {
    releasesRepo.createRelease({
      id: releaseId,
      projectName: 'test-project',
      version: '1.0.0',
      repoUrl: 'https://example.com/repo',
      commitSha: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
      buildSpecJson: '{}',
      expectedArtifactName: 'app.bin',
      status: 'PENDING',
    });

    for (let i = 0; i < builderConfigs.length; i++) {
      const cfg = builderConfigs[i]!;
      const keyPair = generateEd25519KeyPair(cfg.builderId, `seed_${cfg.builderId}`);

      buildersRepo.createBuilder({
        id: cfg.builderId,
        name: `Builder ${cfg.builderId}`,
        publicKey: keyPair.publicKeyPem,
        operatorIdentity: `Operator ${cfg.builderId}`,
        status: 'ACTIVE',
      });

      const attId = `att_${releaseId}_${cfg.builderId}`;
      attestationsRepo.createAttestation({
        id: attId,
        releaseId,
        builderId: cfg.builderId,
        sourceCommit: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
        artifactName: 'app.bin',
        artifactSha256: cfg.artifactSha256,
        buildEnvJson: '{}',
        buildTimestamp: new Date().toISOString(),
        buildDurationMs: 1000,
        buildLogSha256: sha256('log'),
        statementJson: JSON.stringify({ claim: 'test' }),
        signature: 'dummySig==',
        publicKeyId: keyPair.keyId,
        isValid: cfg.verificationStatus === 'VALID' ? 1 : 0,
      });

      verificationRepo.createVerificationResult({
        id: `vr_${attId}`,
        releaseId,
        attestationId: attId,
        signatureValid: cfg.verificationStatus === 'VALID' ? 1 : 0,
        commitMatch: 1,
        builderActive: 1,
        status: cfg.verificationStatus,
        notes: JSON.stringify({ checks: {} }),
      });
    }
  }

  // TEST 1: 3 valid builders, same hash -> VERIFIED
  it('TEST 1: 3 valid builders, same hash -> VERIFIED', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    // Phase 5: Verification Engine evaluates attestations into verification_results
    await verificationEngine.verifyReleaseAttestations(scenario.releaseId, {
      artifactsDir: tempArtifactsDir,
    });

    // Phase 6: Quorum Engine strictly consumes verification_results
    const result = await quorumEngine.evaluateReleaseQuorum(scenario.releaseId);

    expect(result.status).toBe('VERIFIED');
    expect(result.consensusPercentage).toBe(100.0);
    expect(result.validAttestations).toBe(3);
    expect(result.disagreementDetected).toBe(false);
    expect(result.hashGroups).toHaveLength(1);
    expect(result.dominantBuilderCount).toBe(3);
    expect(result.dominantHash).toBe(result.hashGroups[0]?.artifactSha256);
  });

  // TEST 2: 2 valid builders same hash + 1 valid divergent hash -> FLAGGED
  it('TEST 2: 2 valid builders same hash + 1 valid divergent hash -> FLAGGED', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'conflict',
      db,
      artifactsDir: tempArtifactsDir,
    });

    // Phase 5: Verification Engine evaluates attestations into verification_results
    await verificationEngine.verifyReleaseAttestations(scenario.releaseId, {
      artifactsDir: tempArtifactsDir,
    });

    // Phase 6: Quorum Engine strictly consumes verification_results
    const result = await quorumEngine.evaluateReleaseQuorum(scenario.releaseId);

    expect(result.status).toBe('FLAGGED');
    expect(result.consensusPercentage).toBe(66.67);
    expect(result.validAttestations).toBe(3);
    expect(result.disagreementDetected).toBe(true);
    expect(result.hashGroups).toHaveLength(2);
    expect(result.dominantBuilderCount).toBe(2);
    expect(result.threshold).toBe(66.67);
  });

  // TEST 3: 3 valid builders, all different -> REJECTED
  it('TEST 3: 3 valid builders, all different -> REJECTED', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'no-consensus',
      db,
      artifactsDir: tempArtifactsDir,
    });

    // Phase 5: Verification Engine evaluates attestations into verification_results
    await verificationEngine.verifyReleaseAttestations(scenario.releaseId, {
      artifactsDir: tempArtifactsDir,
    });

    // Phase 6: Quorum Engine strictly consumes verification_results
    const result = await quorumEngine.evaluateReleaseQuorum(scenario.releaseId);

    expect(result.status).toBe('REJECTED');
    expect(result.consensusPercentage).toBe(33.33);
    expect(result.validAttestations).toBe(3);
    expect(result.disagreementDetected).toBe(true);
    expect(result.hashGroups).toHaveLength(3);
  });

  // TEST 4: Fewer than 3 valid builders -> INSUFFICIENT_EVIDENCE
  it('TEST 4: Fewer than 3 valid builders (e.g. 1 builder) -> INSUFFICIENT_EVIDENCE', async () => {
    const relId = 'rel_single_builder';
    setupSyntheticRelease(relId, [
      { builderId: 'bld_1', artifactSha256: sha256('hash_a'), verificationStatus: 'VALID' },
    ]);

    const result = await quorumEngine.evaluateReleaseQuorum(relId);
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.sufficientEvidence).toBe(false);
    expect(result.validAttestations).toBe(1);
  });

  // TEST 5: 2 valid agreeing + 1 invalid -> INSUFFICIENT_EVIDENCE
  it('TEST 5: 2 valid agreeing + 1 invalid -> INSUFFICIENT_EVIDENCE (validBuilders = 2 < 3)', async () => {
    const relId = 'rel_two_valid_one_invalid';
    const hashA = sha256('hash_a');
    const hashB = sha256('hash_b');

    setupSyntheticRelease(relId, [
      { builderId: 'bld_1', artifactSha256: hashA, verificationStatus: 'VALID' },
      { builderId: 'bld_2', artifactSha256: hashA, verificationStatus: 'VALID' },
      { builderId: 'bld_3', artifactSha256: hashB, verificationStatus: 'INVALID' },
    ]);

    const result = await quorumEngine.evaluateReleaseQuorum(relId);

    // CRITICAL SECURITY RULE:
    // Even though the 2 valid builders agree 100%, validBuilders = 2 < MIN_BUILDERS (3).
    // Result MUST be INSUFFICIENT_EVIDENCE, never VERIFIED!
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.validAttestations).toBe(2);
    expect(result.invalidAttestations).toBe(1);
    expect(result.sufficientEvidence).toBe(false);
  });

  // TEST 6: Invalid attestations do not influence hash voting
  it('TEST 6: Invalid attestations do not influence hash voting or appear in hash groups', async () => {
    const relId = 'rel_invalid_not_voted';
    const hashA = sha256('hash_a');
    const hashMalicious = sha256('hash_malicious');

    setupSyntheticRelease(relId, [
      { builderId: 'bld_1', artifactSha256: hashA, verificationStatus: 'VALID' },
      { builderId: 'bld_2', artifactSha256: hashA, verificationStatus: 'VALID' },
      { builderId: 'bld_3', artifactSha256: hashA, verificationStatus: 'VALID' },
      { builderId: 'bld_rogue', artifactSha256: hashMalicious, verificationStatus: 'INVALID' },
    ]);

    const result = await quorumEngine.evaluateReleaseQuorum(relId);

    // The rogue invalid attestation must be completely ignored
    expect(result.status).toBe('VERIFIED');
    expect(result.validAttestations).toBe(3);
    expect(result.invalidAttestations).toBe(1);
    expect(result.hashGroups).toHaveLength(1);
    expect(result.hashGroups[0]?.artifactSha256).toBe(hashA);
    expect(result.hashGroups.some((g) => g.artifactSha256 === hashMalicious)).toBe(false);
  });

  // TEST 7: Builder cannot contribute multiple votes
  it('TEST 7: Builder cannot contribute multiple votes (defensive deduplication)', async () => {
    const relId = 'rel_double_vote';
    const hashA = sha256('hash_a');
    const hashB = sha256('hash_b');

    setupSyntheticRelease(relId, [
      { builderId: 'bld_1', artifactSha256: hashA, verificationStatus: 'VALID' },
      { builderId: 'bld_2', artifactSha256: hashA, verificationStatus: 'VALID' },
    ]);

    // Add a duplicate verification result pointing to bld_1's attestation
    verificationRepo.createVerificationResult({
      id: 'vr_duplicate_bld_1',
      releaseId: relId,
      attestationId: `att_${relId}_bld_1`,
      signatureValid: 1,
      commitMatch: 1,
      builderActive: 1,
      status: 'VALID',
    });

    const result = await quorumEngine.evaluateReleaseQuorum(relId);

    // Engine must detect only 2 distinct builders: bld_1 and bld_2 -> INSUFFICIENT_EVIDENCE
    expect(result.eligibleBuilders).toHaveLength(2);
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
  });

  // TEST 8: Four builders: 3 vs 1 -> FLAGGED
  it('TEST 8: Four builders: 3 vs 1 (75.00% >= 66.67%) -> FLAGGED', async () => {
    const relId = 'rel_four_builders_3v1';
    const hashMajority = sha256('majority_hash');
    const hashDissent = sha256('dissent_hash');

    setupSyntheticRelease(relId, [
      { builderId: 'bld_1', artifactSha256: hashMajority, verificationStatus: 'VALID' },
      { builderId: 'bld_2', artifactSha256: hashMajority, verificationStatus: 'VALID' },
      { builderId: 'bld_3', artifactSha256: hashMajority, verificationStatus: 'VALID' },
      { builderId: 'bld_4', artifactSha256: hashDissent, verificationStatus: 'VALID' },
    ]);

    const result = await quorumEngine.evaluateReleaseQuorum(relId);
    expect(result.status).toBe('FLAGGED');
    expect(result.validAttestations).toBe(4);
    expect(result.consensusPercentage).toBe(75.0);
    expect(result.disagreementDetected).toBe(true);
    expect(result.dominantBuilderCount).toBe(3);
  });

  // TEST 9: Four builders: 2 vs 2 -> REJECTED
  it('TEST 9: Four builders: 2 vs 2 (50.00% < 66.67%) -> REJECTED', async () => {
    const relId = 'rel_four_builders_2v2';
    const hashA = sha256('hash_a');
    const hashB = sha256('hash_b');

    setupSyntheticRelease(relId, [
      { builderId: 'bld_1', artifactSha256: hashA, verificationStatus: 'VALID' },
      { builderId: 'bld_2', artifactSha256: hashA, verificationStatus: 'VALID' },
      { builderId: 'bld_3', artifactSha256: hashB, verificationStatus: 'VALID' },
      { builderId: 'bld_4', artifactSha256: hashB, verificationStatus: 'VALID' },
    ]);

    const result = await quorumEngine.evaluateReleaseQuorum(relId);
    expect(result.status).toBe('REJECTED');
    expect(result.validAttestations).toBe(4);
    expect(result.consensusPercentage).toBe(50.0);
    expect(result.disagreementDetected).toBe(true);
  });

  // TEST 10: 100% agreement produces VERIFIED
  it('TEST 10: 100% agreement produces VERIFIED', () => {
    expect(calculateConsensusPercentage(3, 3)).toBe(100.0);
    expect(meetsQuorumThreshold(3, 3)).toBe(true);
  });

  // TEST 11: 66.67% produces FLAGGED, not REJECTED
  it('TEST 11: 66.67% meets quorum threshold (FLAGGED, not REJECTED)', () => {
    const pct = calculateConsensusPercentage(2, 3);
    expect(pct).toBe(66.67);
    expect(meetsQuorumThreshold(2, 3)).toBe(true);
  });

  // TEST 12: 33.33% produces REJECTED
  it('TEST 12: 33.33% fails quorum threshold (REJECTED)', () => {
    const pct = calculateConsensusPercentage(1, 3);
    expect(pct).toBe(33.33);
    expect(meetsQuorumThreshold(1, 3)).toBe(false);
  });

  // TEST 13: Hash groups preserve all dissenting builders
  it('TEST 13: Hash groups preserve all dissenting builders and their respective hashes', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'conflict',
      db,
      artifactsDir: tempArtifactsDir,
    });

    await verificationEngine.verifyReleaseAttestations(scenario.releaseId, {
      artifactsDir: tempArtifactsDir,
    });

    const result = await quorumEngine.evaluateReleaseQuorum(scenario.releaseId);

    expect(result.hashGroups).toHaveLength(2);

    const majorityGroup = result.hashGroups.find((g) => g.count === 2)!;
    const dissentingGroup = result.hashGroups.find((g) => g.count === 1)!;

    expect(majorityGroup).toBeDefined();
    expect(dissentingGroup).toBeDefined();

    expect(majorityGroup.builderIds).toContain('bld_node_alpha_us');
    expect(majorityGroup.builderIds).toContain('bld_node_beta_eu');
    expect(dissentingGroup.builderIds).toContain('bld_node_gamma_apac');
  });

  // TEST 14: Quorum result persists to SQLite
  it('TEST 14: Quorum result persists to SQLite quorum_results table and updates release status', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    await verificationEngine.verifyReleaseAttestations(scenario.releaseId, {
      artifactsDir: tempArtifactsDir,
    });

    expect(quorumRepo.getQuorumResultByReleaseId(scenario.releaseId)).toBeNull();

    await quorumEngine.evaluateReleaseQuorum(scenario.releaseId);

    const storedQuorum = quorumRepo.getQuorumResultByReleaseId(scenario.releaseId);
    expect(storedQuorum).not.toBeNull();
    expect(storedQuorum?.quorum_status).toBe('VERIFIED');
    expect(storedQuorum?.total_builders).toBe(3);
    expect(storedQuorum?.agreeing_count).toBe(3);

    // Release table status must be updated
    const release = releasesRepo.getReleaseById(scenario.releaseId);
    expect(release?.status).toBe('VERIFIED');
  });

  // TEST 15: Re-running quorum evaluation is deterministic/idempotent
  it('TEST 15: Re-running quorum evaluation is deterministic and idempotent', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'conflict',
      db,
      artifactsDir: tempArtifactsDir,
    });

    await verificationEngine.verifyReleaseAttestations(scenario.releaseId, {
      artifactsDir: tempArtifactsDir,
    });

    const run1 = await quorumEngine.evaluateReleaseQuorum(scenario.releaseId);
    const run2 = await quorumEngine.evaluateReleaseQuorum(scenario.releaseId);

    expect(run1.status).toBe(run2.status);
    expect(run1.consensusPercentage).toBe(run2.consensusPercentage);
    expect(run1.dominantHash).toBe(run2.dominantHash);
    expect(run1.hashGroups).toEqual(run2.hashGroups);
  });

  // TEST 16: Strict phase boundary — release with no verification results yields INSUFFICIENT_EVIDENCE without invoking Phase 5
  it('TEST 16: Strict phase boundary — release without verification results yields INSUFFICIENT_EVIDENCE without invoking Phase 5', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    // VerificationEngine is deliberately NOT invoked
    expect(verificationRepo.getVerificationResultsByReleaseId(scenario.releaseId)).toHaveLength(0);

    const result = await quorumEngine.evaluateReleaseQuorum(scenario.releaseId);

    // Must return INSUFFICIENT_EVIDENCE because 0 verification results exist
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.validAttestations).toBe(0);
    expect(result.totalAttestations).toBe(0);
    expect(result.sufficientEvidence).toBe(false);

    // Verification results table must remain untouched (Phase 5 was NOT invoked)
    expect(verificationRepo.getVerificationResultsByReleaseId(scenario.releaseId)).toHaveLength(0);
  });
});
