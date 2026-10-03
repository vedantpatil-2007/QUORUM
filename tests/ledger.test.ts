import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase } from '../server/src/db/database.js';
import {
  AuditLedgerRepository,
  LedgerService,
  verifyLedger,
  calculatePayloadHash,
  calculateCurrentHash,
  LedgerVerificationResult,
} from '../server/src/ledger/index.js';
import { ReleasesRepository } from '../server/src/db/repositories/releases.repository.js';
import { QuorumEngine } from '../server/src/quorum/quorum-engine.js';
import { VerificationRepository } from '../server/src/db/repositories/verification.repository.js';
import { AttestationsRepository } from '../server/src/db/repositories/attestations.repository.js';
import { BuildersRepository } from '../server/src/db/repositories/builders.repository.js';
import { generateEd25519KeyPair } from '../server/src/crypto/keys.js';
import { sha256 } from '../server/src/crypto/hash.js';
import { canonicalize } from '../server/src/crypto/canonicalize.js';

describe('Tamper-Evident Audit Ledger (Phase 7)', () => {
  let db: Database.Database;
  let repo: AuditLedgerRepository;
  let ledgerService: LedgerService;

  beforeEach(() => {
    db = initDatabase({ dbPath: ':memory:' });
    repo = new AuditLedgerRepository(db);
    ledgerService = new LedgerService(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  // TEST 1: Genesis entry is created correctly
  it('TEST 1: Genesis entry is created correctly with sequence = 1 and valid metadata', () => {
    const entry = ledgerService.appendEvent({
      eventType: 'RELEASE_CREATED',
      releaseId: 'rel_test_001',
      payload: { project: 'quorum-demo', version: '1.0.0' },
    });

    expect(entry.sequence).toBe(1);
    expect(entry.id).toMatch(/^led_[a-f0-9]{16}$/);
    expect(entry.event_type).toBe('RELEASE_CREATED');
    expect(entry.release_id).toBe('rel_test_001');
    expect(entry.current_hash).toHaveLength(64);
    expect(entry.payload_hash).toHaveLength(64);
    expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
  });

  // TEST 2: First entry has previousHash = null
  it('TEST 2: First entry has previousHash = null (Genesis condition)', () => {
    const genesis = ledgerService.appendEvent({
      eventType: 'RELEASE_CREATED',
      releaseId: 'rel_test_001',
      payload: { claim: 'genesis' },
    });

    expect(genesis.sequence).toBe(1);
    expect(genesis.previous_hash).toBeNull();
  });

  // TEST 3: Second entry references first currentHash
  it('TEST 3: Second entry references first currentHash', () => {
    const genesis = ledgerService.appendEvent({
      eventType: 'RELEASE_CREATED',
      releaseId: 'rel_test_001',
      payload: { claim: 'genesis' },
    });

    const second = ledgerService.appendEvent({
      eventType: 'ATTESTATION_VERIFIED',
      releaseId: 'rel_test_001',
      payload: { builder: 'node_alpha', status: 'VALID' },
    });

    expect(second.sequence).toBe(2);
    expect(second.previous_hash).toBe(genesis.current_hash);
  });

  // TEST 4: Third entry references second currentHash
  it('TEST 4: Third entry references second currentHash', () => {
    const first = ledgerService.appendEvent({
      eventType: 'RELEASE_CREATED',
      payload: { step: 1 },
    });
    const second = ledgerService.appendEvent({
      eventType: 'ATTESTATION_VERIFIED',
      payload: { step: 2 },
    });
    const third = ledgerService.appendEvent({
      eventType: 'QUORUM_EVALUATED',
      payload: { step: 3 },
    });

    expect(third.sequence).toBe(3);
    expect(third.previous_hash).toBe(second.current_hash);
    expect(third.previous_hash).not.toBe(first.current_hash);
  });

  // TEST 5: Current hashes are deterministic for identical inputs
  it('TEST 5: Current hashes are deterministic for identical inputs', () => {
    const input = {
      sequence: 1,
      timestamp: '2026-10-03T12:00:00.000Z',
      eventType: 'RELEASE_CREATED',
      releaseId: 'rel_001',
      payloadHash: sha256('dummy-payload'),
      previousHash: null,
    };

    const hash1 = calculateCurrentHash(input);
    const hash2 = calculateCurrentHash(input);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  // TEST 6: Payload hash is calculated using canonicalized payload
  it('TEST 6: Payload hash is calculated using canonicalized payload (key-order independent)', () => {
    const payloadA = { b: 2, a: 1, nested: { y: 'test', x: 42 } };
    const payloadB = { a: 1, nested: { x: 42, y: 'test' }, b: 2 };

    const hashA = calculatePayloadHash(payloadA);
    const hashB = calculatePayloadHash(payloadB);

    expect(hashA).toBe(hashB);
    expect(hashA).toBe(sha256(canonicalize(payloadA)));
  });

  // TEST 7: Ledger entries are ordered by sequence
  it('TEST 7: Ledger entries are ordered by sequence', () => {
    ledgerService.appendEvent({ eventType: 'RELEASE_CREATED', payload: { i: 1 } });
    ledgerService.appendEvent({ eventType: 'ATTESTATION_VERIFIED', payload: { i: 2 } });
    ledgerService.appendEvent({ eventType: 'QUORUM_EVALUATED', payload: { i: 3 } });

    const all = repo.getAllEntries();
    expect(all).toHaveLength(3);
    expect(all[0]!.sequence).toBe(1);
    expect(all[1]!.sequence).toBe(2);
    expect(all[2]!.sequence).toBe(3);
  });

  // TEST 8: getLatestEntry returns the final entry
  it('TEST 8: getLatestEntry returns the final entry', () => {
    expect(repo.getLatestEntry()).toBeNull();

    ledgerService.appendEvent({ eventType: 'EVENT_A', payload: { val: 'a' } });
    const e2 = ledgerService.appendEvent({ eventType: 'EVENT_B', payload: { val: 'b' } });

    const latest = repo.getLatestEntry();
    expect(latest).not.toBeNull();
    expect(latest?.id).toBe(e2.id);
    expect(latest?.sequence).toBe(2);
  });

  // TEST 9: getEntriesByReleaseId filters correctly
  it('TEST 9: getEntriesByReleaseId filters correctly', () => {
    ledgerService.appendEvent({ releaseId: 'rel_A', eventType: 'E1', payload: {} });
    ledgerService.appendEvent({ releaseId: 'rel_B', eventType: 'E2', payload: {} });
    ledgerService.appendEvent({ releaseId: 'rel_A', eventType: 'E3', payload: {} });

    const relAEntries = repo.getEntriesByReleaseId('rel_A');
    const relBEntries = repo.getEntriesByReleaseId('rel_B');
    const relCEntries = repo.getEntriesByReleaseId('rel_C');

    expect(relAEntries).toHaveLength(2);
    expect(relAEntries[0]!.event_type).toBe('E1');
    expect(relAEntries[1]!.event_type).toBe('E3');

    expect(relBEntries).toHaveLength(1);
    expect(relBEntries[0]!.event_type).toBe('E2');

    expect(relCEntries).toHaveLength(0);
  });

  // TEST 10: verifyLedger returns valid for an untouched chain
  it('TEST 10: verifyLedger returns valid for an untouched chain', () => {
    ledgerService.appendEvent({ eventType: 'RELEASE_CREATED', payload: { test: 1 } });
    ledgerService.appendEvent({ eventType: 'ATTESTATION_VERIFIED', payload: { test: 2 } });
    ledgerService.appendEvent({ eventType: 'QUORUM_EVALUATED', payload: { test: 3 } });

    const result: LedgerVerificationResult = verifyLedger(repo);

    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(3);
    expect(result.verifiedEntries).toBe(3);
    expect(result.firstInvalidSequence).toBeNull();
    expect(result.error).toBeNull();
  });

  // TEST 11: Changing currentHash causes verification failure
  it('TEST 11: Changing currentHash causes verification failure', () => {
    ledgerService.appendEvent({ eventType: 'E1', payload: { a: 1 } });
    ledgerService.appendEvent({ eventType: 'E2', payload: { a: 2 } });
    ledgerService.appendEvent({ eventType: 'E3', payload: { a: 3 } });

    // Tamper with current_hash of sequence 2
    db.prepare(`
      UPDATE audit_ledger
      SET current_hash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      WHERE sequence = 2
    `).run();

    const result = verifyLedger(repo);

    expect(result.valid).toBe(false);
    expect(result.firstInvalidSequence).toBe(2);
    expect(result.error).toContain('Ledger hash mismatch at sequence 2');
    expect(result.verifiedEntries).toBe(1);
  });

  // TEST 12: Changing previousHash causes verification failure
  it('TEST 12: Changing previousHash causes verification failure', () => {
    ledgerService.appendEvent({ eventType: 'E1', payload: { a: 1 } });
    ledgerService.appendEvent({ eventType: 'E2', payload: { a: 2 } });

    // Tamper with previous_hash of sequence 2
    db.prepare(`
      UPDATE audit_ledger
      SET previous_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      WHERE sequence = 2
    `).run();

    const result = verifyLedger(repo);

    expect(result.valid).toBe(false);
    expect(result.firstInvalidSequence).toBe(2);
    expect(result.error).toContain('Broken chain link at sequence 2');
  });

  // TEST 13: Changing sequence causes verification failure
  it('TEST 13: Changing sequence causes verification failure', () => {
    ledgerService.appendEvent({ eventType: 'E1', payload: { a: 1 } });
    ledgerService.appendEvent({ eventType: 'E2', payload: { a: 2 } });

    // Change sequence 2 to 999
    db.prepare('UPDATE audit_ledger SET sequence = 999 WHERE sequence = 2').run();

    const result = verifyLedger(repo);

    expect(result.valid).toBe(false);
    expect(result.firstInvalidSequence).toBe(999);
    expect(result.error).toContain('Sequence mismatch');
  });

  // TEST 14: Changing payloadHash causes verification failure
  it('TEST 14: Changing payloadHash causes verification failure', () => {
    ledgerService.appendEvent({ eventType: 'E1', payload: { note: 'orig' } });

    // Alter payload_hash
    db.prepare(`
      UPDATE audit_ledger
      SET payload_hash = '1111111111111111111111111111111111111111111111111111111111111111'
      WHERE sequence = 1
    `).run();

    const result = verifyLedger(repo);

    expect(result.valid).toBe(false);
    expect(result.firstInvalidSequence).toBe(1);
    expect(result.error).toContain('Payload hash mismatch');
  });

  // TEST 15: Broken chain link is detected
  it('TEST 15: Broken chain link is detected when an intermediate entry is deleted', () => {
    ledgerService.appendEvent({ eventType: 'E1', payload: { a: 1 } });
    ledgerService.appendEvent({ eventType: 'E2', payload: { a: 2 } });
    ledgerService.appendEvent({ eventType: 'E3', payload: { a: 3 } });

    // Delete sequence 2 directly
    db.prepare('DELETE FROM audit_ledger WHERE sequence = 2').run();

    const result = verifyLedger(repo);

    expect(result.valid).toBe(false);
    // Position 1 (the 2nd element in list) now has sequence 3 instead of expected sequence 2
    expect(result.firstInvalidSequence).toBe(3);
    expect(result.error).toContain('Sequence mismatch at index 1');
  });

  // TEST 16: Duplicate sequence cannot be inserted
  it('TEST 16: Duplicate sequence cannot be inserted (UNIQUE constraint enforced)', () => {
    ledgerService.appendEvent({ eventType: 'E1', payload: { a: 1 } });

    expect(() => {
      db.prepare(`
        INSERT INTO audit_ledger (
          id, sequence, timestamp, event_type, release_id,
          payload_hash, previous_hash, current_hash, payload_json, created_at
        ) VALUES ('led_duplicate', 1, datetime('now'), 'E1', null, 'hash1', null, 'cur_unique_hash', null, datetime('now'))
      `).run();
    }).toThrow(/UNIQUE constraint failed: audit_ledger\.sequence/);
  });

  // TEST 17: Duplicate currentHash cannot be inserted
  it('TEST 17: Duplicate currentHash cannot be inserted (UNIQUE constraint enforced)', () => {
    const e1 = ledgerService.appendEvent({ eventType: 'E1', payload: { a: 1 } });

    expect(() => {
      db.prepare(`
        INSERT INTO audit_ledger (
          id, sequence, timestamp, event_type, release_id,
          payload_hash, previous_hash, current_hash, payload_json, created_at
        ) VALUES ('led_duplicate_hash', 2, datetime('now'), 'E2', null, 'hash2', '${e1.current_hash}', '${e1.current_hash}', null, datetime('now'))
      `).run();
    }).toThrow(/UNIQUE constraint failed: audit_ledger\.current_hash/);
  });

  // TEST 18: Repository does not expose update/delete mutation APIs
  it('TEST 18: Repository does not expose update/delete mutation APIs', () => {
    const untypedRepo = repo as unknown as Record<string, unknown>;

    expect(untypedRepo['update']).toBeUndefined();
    expect(untypedRepo['updateEntry']).toBeUndefined();
    expect(untypedRepo['delete']).toBeUndefined();
    expect(untypedRepo['deleteEntry']).toBeUndefined();
    expect(untypedRepo['remove']).toBeUndefined();
  });

  // TEST 19: Concurrent/transactional append behavior does not create duplicate sequences
  it('TEST 19: Concurrent/transactional append behavior does not create duplicate sequences', () => {
    // Append 25 rapid sequential events
    for (let i = 0; i < 25; i++) {
      ledgerService.appendEvent({
        eventType: 'BURST_EVENT',
        payload: { iteration: i },
      });
    }

    const all = repo.getAllEntries();
    expect(all).toHaveLength(25);

    const sequences = all.map((e) => e.sequence);
    const uniqueSequences = new Set(sequences);

    expect(uniqueSequences.size).toBe(25);
    expect(sequences).toEqual(Array.from({ length: 25 }, (_, idx) => idx + 1));

    // Entire chain must be mathematically valid
    const verification = verifyLedger(repo);
    expect(verification.valid).toBe(true);
    expect(verification.verifiedEntries).toBe(25);
  });

  // TEST 20: QUORUM_EVALUATED event can be appended
  it('TEST 20: QUORUM_EVALUATED event can be appended with structured consensus details', () => {
    const entry = ledgerService.recordQuorumEvaluated({
      releaseId: 'rel_quorum_test',
      status: 'FLAGGED',
      validAttestations: 3,
      invalidAttestations: 0,
      dominantHash: 'c96ddc07a28d1a579beb1135eb8fefec2fde2b184d24301d772ab4553aec47f6',
      dominantBuilderCount: 2,
      consensusPercentage: 66.67,
      disagreementDetected: true,
    });

    expect(entry.event_type).toBe('QUORUM_EVALUATED');
    expect(entry.release_id).toBe('rel_quorum_test');

    const stored = repo.getEntryById(entry.id);
    expect(stored).not.toBeNull();
    expect(stored?.payload_json).toContain('"status":"FLAGGED"');
    expect(stored?.payload_json).toContain('"consensusPercentage":66.67');

    const verification = verifyLedger(repo);
    expect(verification.valid).toBe(true);
  });

  // TEST 21: RELEASE_STATUS_CHANGED event can be appended
  it('TEST 21: RELEASE_STATUS_CHANGED event can be appended', () => {
    const entry = ledgerService.recordReleaseStatusChanged({
      releaseId: 'rel_status_test',
      previousStatus: 'PENDING',
      newStatus: 'VERIFIED',
    });

    expect(entry.event_type).toBe('RELEASE_STATUS_CHANGED');
    expect(entry.release_id).toBe('rel_status_test');

    const stored = repo.getEntryById(entry.id);
    expect(stored?.payload_json).toContain('"previousStatus":"PENDING"');
    expect(stored?.payload_json).toContain('"newStatus":"VERIFIED"');

    const verification = verifyLedger(repo);
    expect(verification.valid).toBe(true);
  });

  // TEST 22: Ledger remains valid after multiple event types
  it('TEST 22: Ledger remains valid after multiple mixed event types', () => {
    const relId = 'rel_lifecycle_demo';

    ledgerService.recordReleaseCreated({
      releaseId: relId,
      projectName: 'demo-app',
      version: '1.0.0',
      commitSha: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
      repoUrl: 'https://example.com/repo',
      expectedArtifactName: 'demo.bin',
    });

    ledgerService.recordAttestationVerified({
      releaseId: relId,
      attestationId: 'att_1',
      builderId: 'bld_1',
      status: 'VALID',
      signatureValid: true,
      commitMatch: true,
      builderActive: true,
    });

    ledgerService.recordReleaseStatusChanged({
      releaseId: relId,
      previousStatus: 'PENDING',
      newStatus: 'VERIFIED',
    });

    ledgerService.recordQuorumEvaluated({
      releaseId: relId,
      status: 'VERIFIED',
      validAttestations: 3,
      invalidAttestations: 0,
      dominantHash: 'hash123',
      dominantBuilderCount: 3,
      consensusPercentage: 100.0,
      disagreementDetected: false,
    });

    const verification = verifyLedger(repo);
    expect(verification.valid).toBe(true);
    expect(verification.totalEntries).toBe(4);
    expect(verification.verifiedEntries).toBe(4);
  });

  // TEST 23: Tamper demo detects modified ledger data
  it('TEST 23: Tamper demo scenario detects modified ledger data and isolates violation sequence', () => {
    // 1. Create untouched chain of 4 events
    for (let i = 1; i <= 4; i++) {
      ledgerService.appendEvent({ eventType: `EVENT_${i}`, payload: { i } });
    }

    expect(verifyLedger(repo).valid).toBe(true);

    // 2. Tamper with sequence 3
    db.prepare(`
      UPDATE audit_ledger
      SET payload_hash = '9999999999999999999999999999999999999999999999999999999999999999'
      WHERE sequence = 3
    `).run();

    const verifyTampered = verifyLedger(repo);
    expect(verifyTampered.valid).toBe(false);
    expect(verifyTampered.firstInvalidSequence).toBe(3);
    expect(verifyTampered.verifiedEntries).toBe(2);
  });

  // TEST 24-28 (Regression & End-to-End Quorum Integration):
  it('TEST 24-28: QuorumEngine persists quorum evaluation and records audit ledger events', async () => {
    const releasesRepo = new ReleasesRepository(db);
    const verificationRepo = new VerificationRepository(db);
    const attestationsRepo = new AttestationsRepository(db);
    const buildersRepo = new BuildersRepository(db);
    const quorumEngine = new QuorumEngine(db);

    const relId = 'rel_ledger_integration_test';
    const commitSha = 'd670460b4b4aece5915caf5c68d12f560a9fe3e4';
    const artifactSha = sha256('shared_binary');

    releasesRepo.createRelease({
      id: relId,
      projectName: 'quorum-integration',
      version: '1.0.0',
      repoUrl: 'https://example.com',
      commitSha,
      buildSpecJson: '{}',
      expectedArtifactName: 'app.bin',
      status: 'PENDING',
    });

    for (let i = 1; i <= 3; i++) {
      const bId = `bld_${i}`;
      const kp = generateEd25519KeyPair(bId, `seed_${bId}`);
      buildersRepo.createBuilder({
        id: bId,
        name: `Builder ${i}`,
        publicKey: kp.publicKeyPem,
        operatorIdentity: `Op ${i}`,
        status: 'ACTIVE',
      });

      const attId = `att_${relId}_${bId}`;
      attestationsRepo.createAttestation({
        id: attId,
        releaseId: relId,
        builderId: bId,
        sourceCommit: commitSha,
        artifactName: 'app.bin',
        artifactSha256: artifactSha,
        buildEnvJson: '{}',
        buildTimestamp: new Date().toISOString(),
        buildDurationMs: 1000,
        buildLogSha256: sha256('log'),
        statementJson: JSON.stringify({}),
        signature: 'sig==',
        publicKeyId: kp.keyId,
        isValid: 1,
      });

      verificationRepo.createVerificationResult({
        id: `vr_${attId}`,
        releaseId: relId,
        attestationId: attId,
        signatureValid: 1,
        commitMatch: 1,
        builderActive: 1,
        status: 'VALID',
      });
    }

    // Evaluate quorum (Phase 6)
    const result = await quorumEngine.evaluateReleaseQuorum(relId);
    expect(result.status).toBe('VERIFIED');

    // Verify that Phase 7 audit ledger recorded the release status change and quorum evaluation
    const ledgerEntries = repo.getEntriesByReleaseId(relId);
    expect(ledgerEntries.length).toBeGreaterThanOrEqual(2);

    const statusChangeEntry = ledgerEntries.find((e) => e.event_type === 'RELEASE_STATUS_CHANGED');
    const quorumEntry = ledgerEntries.find((e) => e.event_type === 'QUORUM_EVALUATED');

    expect(statusChangeEntry).toBeDefined();
    expect(statusChangeEntry?.payload_json).toContain('"previousStatus":"PENDING"');
    expect(statusChangeEntry?.payload_json).toContain('"newStatus":"VERIFIED"');

    expect(quorumEntry).toBeDefined();
    expect(quorumEntry?.payload_json).toContain('"status":"VERIFIED"');
    expect(quorumEntry?.payload_json).toContain('"consensusPercentage":100');

    // The audit chain must be 100% valid
    const chainVerification = verifyLedger(repo);
    expect(chainVerification.valid).toBe(true);
  });
});
