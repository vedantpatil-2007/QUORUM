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
import { VerificationEngine } from '../server/src/verification/verification-engine.js';
import { runBuilderScenario } from '../server/src/builders/demo-scenarios.js';
import { generateEd25519KeyPair } from '../server/src/crypto/keys.js';
import { canonicalize } from '../server/src/crypto/canonicalize.js';

describe('Quorum Verification Engine (Phase 5)', () => {
  let db: Database.Database;
  let tempArtifactsDir: string;
  let engine: VerificationEngine;
  let buildersRepo: BuildersRepository;
  let releasesRepo: ReleasesRepository;
  let attestationsRepo: AttestationsRepository;
  let verificationRepo: VerificationRepository;

  beforeEach(() => {
    db = initDatabase({ dbPath: ':memory:' });
    tempArtifactsDir = path.join(
      os.tmpdir(),
      `quorum-verification-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(tempArtifactsDir, { recursive: true });

    engine = new VerificationEngine(db, tempArtifactsDir);
    buildersRepo = new BuildersRepository(db);
    releasesRepo = new ReleasesRepository(db);
    attestationsRepo = new AttestationsRepository(db);
    verificationRepo = new VerificationRepository(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(tempArtifactsDir)) {
      fs.rmSync(tempArtifactsDir, { recursive: true, force: true });
    }
  });

  // TEST 1: Clean attestation verifies successfully
  it('TEST 1: Clean attestation verifies successfully', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const attestations = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId);
    expect(attestations.length).toBe(3);

    const firstAtt = attestations[0]!;
    const result = await engine.verifyAttestation(firstAtt.id);

    expect(result.status).toBe('VALID');
    expect(result.signatureValid).toBe(true);
    expect(result.commitMatch).toBe(true);
    expect(result.builderActive).toBe(true);
    expect(result.artifactExists).toBe(true);
    expect(result.artifactHashMatches).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // TEST 2: Compromised builder's legitimately signed divergent artifact attestation remains individually VALID
  it('TEST 2: Compromised builder legitimately signed divergent artifact attestation remains individually VALID if internally consistent', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'conflict',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const attestations = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId);
    const gammaAtt = attestations.find((a) => a.builder_id === 'bld_node_gamma_apac')!;
    expect(gammaAtt).toBeDefined();

    // Verify Gamma's attestation
    const gammaResult = await engine.verifyAttestation(gammaAtt.id);

    // CRITICAL ARCHITECTURAL DISTINCTION:
    // Gamma legitimately built its own divergent artifact, hashed it, and signed it.
    // Individually, the attestation is authentic and structurally valid!
    expect(gammaResult.status).toBe('VALID');
    expect(gammaResult.signatureValid).toBe(true);
    expect(gammaResult.commitMatch).toBe(true);
    expect(gammaResult.builderActive).toBe(true);
    expect(gammaResult.artifactExists).toBe(true);
    expect(gammaResult.artifactHashMatches).toBe(true);
    expect(gammaResult.errors).toHaveLength(0);
  });

  // TEST 3: Tampered signature becomes INVALID
  it('TEST 3: Tampered signature becomes INVALID', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const attestations = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId);
    const targetAtt = attestations[0]!;

    // Corrupt signature in database
    const rawSig = Buffer.from(targetAtt.signature, 'base64');
    rawSig[0] = rawSig[0]! ^ 0xff; // Invert first byte
    const tamperedSig = rawSig.toString('base64');

    db.prepare('UPDATE attestations SET signature = ? WHERE id = ?').run(tamperedSig, targetAtt.id);

    const result = await engine.verifyAttestation(targetAtt.id);
    expect(result.status).toBe('INVALID');
    expect(result.signatureValid).toBe(false);
    expect(result.errors.some((e) => e.includes('Cryptographic Signature'))).toBe(true);
  });

  // TEST 4: Tampered statement becomes INVALID
  it('TEST 4: Tampered statement becomes INVALID (signature mismatch)', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const targetAtt = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId)[0]!;

    // Alter statement JSON without re-signing
    const statement = JSON.parse(targetAtt.statement_json);
    statement.artifact.sha256 = '1111111111111111111111111111111111111111111111111111111111111111';

    db.prepare('UPDATE attestations SET statement_json = ? WHERE id = ?').run(
      canonicalize(statement),
      targetAtt.id
    );

    const result = await engine.verifyAttestation(targetAtt.id);
    expect(result.status).toBe('INVALID');
    expect(result.signatureValid).toBe(false);
  });

  // TEST 5: Wrong public key becomes INVALID
  it('TEST 5: Wrong public key becomes INVALID', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const targetAtt = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId)[0]!;

    // Substitute builder's public key with a new random key
    const differentKeyPair = generateEd25519KeyPair('rogue');
    db.prepare('UPDATE builders SET public_key = ? WHERE id = ?').run(
      differentKeyPair.publicKeyPem,
      targetAtt.builder_id
    );

    const result = await engine.verifyAttestation(targetAtt.id);
    expect(result.status).toBe('INVALID');
    expect(result.signatureValid).toBe(false);
  });

  // TEST 6: Unknown builder becomes INVALID
  it('TEST 6: Unknown builder becomes INVALID', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const targetAtt = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId)[0]!;

    // Remove foreign keys temporarily to simulate an unregistered builder in row
    db.pragma('foreign_keys = OFF');
    db.prepare('UPDATE attestations SET builder_id = ? WHERE id = ?').run('bld_ghost', targetAtt.id);
    db.pragma('foreign_keys = ON');

    const result = await engine.verifyAttestation(targetAtt.id);
    expect(result.status).toBe('INVALID');
    expect(result.builderActive).toBe(false);
    expect(result.errors.some((e) => e.includes('Builder Lookup'))).toBe(true);
  });

  // TEST 7: Suspended builder becomes INVALID
  it('TEST 7: Suspended builder becomes INVALID', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const targetAtt = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId)[0]!;
    buildersRepo.updateBuilderStatus(targetAtt.builder_id, 'SUSPENDED');

    const result = await engine.verifyAttestation(targetAtt.id);
    expect(result.status).toBe('INVALID');
    expect(result.builderActive).toBe(false);
    expect(result.errors.some((e) => e.includes('Builder Status'))).toBe(true);
  });

  // TEST 8: Revoked builder becomes INVALID
  it('TEST 8: Revoked builder becomes INVALID', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const targetAtt = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId)[0]!;
    buildersRepo.updateBuilderStatus(targetAtt.builder_id, 'REVOKED');

    const result = await engine.verifyAttestation(targetAtt.id);
    expect(result.status).toBe('INVALID');
    expect(result.builderActive).toBe(false);
    expect(result.errors.some((e) => e.includes('Builder Status'))).toBe(true);
  });

  // TEST 9: Wrong source commit becomes INVALID
  it('TEST 9: Wrong source commit becomes INVALID', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const targetAtt = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId)[0]!;
    db.prepare('UPDATE attestations SET source_commit = ? WHERE id = ?').run(
      '0000000000000000000000000000000000000000',
      targetAtt.id
    );

    const result = await engine.verifyAttestation(targetAtt.id);
    expect(result.status).toBe('INVALID');
    expect(result.commitMatch).toBe(false);
    expect(result.errors.some((e) => e.includes('Source Commit'))).toBe(true);
  });

  // TEST 10: Wrong artifact name becomes INVALID
  it('TEST 10: Wrong artifact name becomes INVALID', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const targetAtt = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId)[0]!;
    db.prepare('UPDATE attestations SET artifact_name = ? WHERE id = ?').run(
      'unexpected-rogue-name.bin',
      targetAtt.id
    );

    const result = await engine.verifyAttestation(targetAtt.id);
    expect(result.status).toBe('INVALID');
    expect(result.errors.some((e) => e.includes('Artifact Name'))).toBe(true);
  });

  // TEST 11: Missing artifact becomes INVALID
  it('TEST 11: Missing artifact becomes INVALID', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const targetAtt = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId)[0]!;

    // Delete the artifact file from disk
    const targetFile = path.join(
      tempArtifactsDir,
      `${targetAtt.builder_id}-${targetAtt.artifact_name}`
    );
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
    }

    const result = await engine.verifyAttestation(targetAtt.id);
    expect(result.status).toBe('INVALID');
    expect(result.artifactExists).toBe(false);
    expect(result.errors.some((e) => e.includes('Artifact On-Disk Check'))).toBe(true);
  });

  // TEST 12: Artifact modified after attestation causes SHA-256 mismatch and INVALID result
  it('TEST 12: Artifact modified on disk after attestation causes SHA-256 mismatch and INVALID result', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const targetAtt = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId)[0]!;

    // Modify a single byte of the binary file on disk
    const targetFile = path.join(
      tempArtifactsDir,
      `${targetAtt.builder_id}-${targetAtt.artifact_name}`
    );
    const originalBytes = fs.readFileSync(targetFile);
    originalBytes[10] = originalBytes[10]! ^ 0xff; // Invert byte 10
    fs.writeFileSync(targetFile, originalBytes);

    const result = await engine.verifyAttestation(targetAtt.id);
    expect(result.status).toBe('INVALID');
    expect(result.artifactHashMatches).toBe(false);
    expect(result.errors.some((e) => e.includes('Artifact SHA-256 Digest Match'))).toBe(true);
  });

  // TEST 13: Valid artifact with valid signature remains VALID
  it('TEST 13: Valid artifact with valid signature remains VALID', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const attestations = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId);
    for (const att of attestations) {
      const res = await engine.verifyAttestation(att.id);
      expect(res.status).toBe('VALID');
      expect(res.signatureValid).toBe(true);
      expect(res.artifactHashMatches).toBe(true);
    }
  });

  // TEST 14: Verification results are persisted in SQLite
  it('TEST 14: Verification results are persisted in SQLite verification_results table', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const attestations = attestationsRepo.getAttestationsByReleaseId(scenario.releaseId);
    expect(verificationRepo.getVerificationResultsByReleaseId(scenario.releaseId).length).toBe(0);

    // Run verification
    await engine.verifyAttestation(attestations[0]!.id);

    const storedResults = verificationRepo.getVerificationResultsByReleaseId(scenario.releaseId);
    expect(storedResults.length).toBe(1);
    expect(storedResults[0]?.attestation_id).toBe(attestations[0]!.id);
    expect(storedResults[0]?.status).toBe('VALID');
    expect(storedResults[0]?.signature_valid).toBe(1);
  });

  // TEST 15: All three clean attestations can be verified in one release verification
  it('TEST 15: All three clean attestations can be verified in one release verification call', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const results = await engine.verifyReleaseAttestations(scenario.releaseId);
    expect(results.length).toBe(3);

    for (const r of results) {
      expect(r.status).toBe('VALID');
    }

    const storedResults = verificationRepo.getVerificationResultsByReleaseId(scenario.releaseId);
    expect(storedResults.length).toBe(3);
  });

  // TEST 16: Conflict scenario produces valid individual attestations even though hashes differ
  it('TEST 16: Conflict scenario produces valid individual attestations even though hashes differ', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'conflict',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const results = await engine.verifyReleaseAttestations(scenario.releaseId);
    expect(results.length).toBe(3);

    // All three attestations must be individually VALID!
    for (const r of results) {
      expect(r.status).toBe('VALID');
      expect(r.signatureValid).toBe(true);
      expect(r.artifactHashMatches).toBe(true);
    }

    // But verify that the hashes indeed differed across builders
    const alphaAtt = attestationsRepo.getAttestationByBuilderAndRelease(
      'bld_node_alpha_us',
      scenario.releaseId
    )!;
    const gammaAtt = attestationsRepo.getAttestationByBuilderAndRelease(
      'bld_node_gamma_apac',
      scenario.releaseId
    )!;

    expect(alphaAtt.artifact_sha256).not.toBe(gammaAtt.artifact_sha256);
  });
});
