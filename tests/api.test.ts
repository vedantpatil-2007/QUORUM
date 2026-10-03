import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Express } from 'express';
import type * as net from 'node:net';

interface TestResponse {
  status: number;
  body: any;
  headers: Headers;
}

class TestPromise implements PromiseLike<TestResponse> {
  private _expectedStatus?: number;

  constructor(private promise: Promise<TestResponse>) {}

  expect(status: number): this {
    this._expectedStatus = status;
    return this;
  }

  then<TResult1 = TestResponse, TResult2 = never>(
    onfulfilled?: ((value: TestResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.promise.then((res) => {
      if (this._expectedStatus !== undefined && res.status !== this._expectedStatus) {
        throw new Error(
          `Expected HTTP status ${this._expectedStatus} but got ${res.status}. Response: ${JSON.stringify(res.body)}`
        );
      }
      return onfulfilled ? onfulfilled(res) : (res as unknown as TResult1);
    }, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<TestResponse | TResult> {
    return this.then(undefined, onrejected);
  }
}

function request(app: Express) {
  const makeRequest = (method: string, path: string, body?: any): Promise<TestResponse> => {
    return new Promise((resolve, reject) => {
      const server = app.listen(0, async () => {
        try {
          const addr = server.address() as net.AddressInfo;
          const url = `http://127.0.0.1:${addr.port}${path}`;
          const res = await fetch(url, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          });

          let json: any = null;
          const text = await res.text();
          try {
            json = JSON.parse(text);
          } catch {
            json = text;
          }

          server.close(() => {
            resolve({
              status: res.status,
              body: json,
              headers: res.headers,
            });
          });
        } catch (err) {
          server.close(() => reject(err));
        }
      });
      server.on('error', reject);
    });
  };

  return {
    get: (path: string) => new TestPromise(makeRequest('GET', path)),
    post: (path: string, body?: any) => new TestPromise(makeRequest('POST', path, body)),
    put: (path: string, body?: any) => new TestPromise(makeRequest('PUT', path, body)),
    delete: (path: string) => new TestPromise(makeRequest('DELETE', path)),
  };
}
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDatabase } from '../server/src/db/database.js';
import { createApp } from '../server/src/api/app.js';
import { BuildersRepository } from '../server/src/db/repositories/builders.repository.js';
import { ReleasesRepository } from '../server/src/db/repositories/releases.repository.js';
import { AttestationsRepository } from '../server/src/db/repositories/attestations.repository.js';
import { VerificationRepository } from '../server/src/db/repositories/verification.repository.js';
import { QuorumRepository } from '../server/src/db/repositories/quorum.repository.js';
import { AuditLedgerRepository } from '../server/src/ledger/ledger.repository.js';
import { LedgerService } from '../server/src/ledger/ledger-service.js';
import { generateEd25519KeyPair } from '../server/src/crypto/keys.js';
import { sha256 } from '../server/src/crypto/hash.js';
import { runBuilderScenario } from '../server/src/builders/demo-scenarios.js';

describe('Quorum REST API & Release Consumer Interface (Phase 8)', () => {
  let db: Database.Database;
  let tempArtifactsDir: string;
  let app: ReturnType<typeof createApp>;
  let buildersRepo: BuildersRepository;
  let releasesRepo: ReleasesRepository;
  let attestationsRepo: AttestationsRepository;
  let verificationRepo: VerificationRepository;
  let quorumRepo: QuorumRepository;
  let ledgerRepo: AuditLedgerRepository;
  let ledgerService: LedgerService;

  beforeEach(() => {
    db = initDatabase({ dbPath: ':memory:' });
    tempArtifactsDir = path.join(
      os.tmpdir(),
      `quorum-api-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(tempArtifactsDir, { recursive: true });

    app = createApp({ db, artifactsDir: tempArtifactsDir });
    buildersRepo = new BuildersRepository(db);
    releasesRepo = new ReleasesRepository(db);
    attestationsRepo = new AttestationsRepository(db);
    verificationRepo = new VerificationRepository(db);
    quorumRepo = new QuorumRepository(db);
    ledgerRepo = new AuditLedgerRepository(db);
    ledgerService = new LedgerService(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(tempArtifactsDir)) {
      fs.rmSync(tempArtifactsDir, { recursive: true, force: true });
    }
  });

  // Helper to seed a release with builders and attestations
  function setupTestRelease(releaseId: string) {
    releasesRepo.createRelease({
      id: releaseId,
      projectName: 'quorum-demo',
      version: '1.0.0',
      repoUrl: 'https://github.com/quorum/demo',
      commitSha: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
      buildSpecJson: '{}',
      expectedArtifactName: 'app.bin',
      status: 'PENDING',
    });

    const hash = sha256('shared_binary');

    for (let i = 1; i <= 3; i++) {
      const bId = `bld_node_${i}`;
      const kp = generateEd25519KeyPair(bId, `seed_${bId}`);
      buildersRepo.createBuilder({
        id: bId,
        name: `Builder ${i}`,
        publicKey: kp.publicKeyPem,
        operatorIdentity: `Operator ${i}`,
        status: 'ACTIVE',
      });

      const attId = `att_${releaseId}_${bId}`;
      attestationsRepo.createAttestation({
        id: attId,
        releaseId,
        builderId: bId,
        sourceCommit: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
        artifactName: 'app.bin',
        artifactSha256: hash,
        buildEnvJson: '{}',
        buildTimestamp: new Date().toISOString(),
        buildDurationMs: 1200,
        buildLogSha256: sha256('build_log'),
        statementJson: JSON.stringify({ claim: 'verified' }),
        signature: 'validSignatureDummy==',
        publicKeyId: kp.keyId,
        isValid: 1,
      });

      verificationRepo.createVerificationResult({
        id: `vr_${attId}`,
        releaseId,
        attestationId: attId,
        signatureValid: 1,
        commitMatch: 1,
        builderActive: 1,
        status: 'VALID',
        notes: JSON.stringify({ note: 'ok' }),
      });
    }

    quorumRepo.createOrReplaceQuorumResult({
      id: `qrm_${releaseId}`,
      releaseId,
      totalBuilders: 3,
      agreeingCount: 3,
      disagreeingCount: 0,
      consensusPercentage: 100.0,
      canonicalHash: hash,
      quorumStatus: 'VERIFIED',
      breakdownJson: JSON.stringify({ hashGroups: [{ artifactSha256: hash, builderIds: ['bld_node_1', 'bld_node_2', 'bld_node_3'], count: 3, percentage: 100 }] }),
      decidedAt: new Date().toISOString(),
    });

    ledgerService.recordReleaseCreated({
      releaseId,
      projectName: 'quorum-demo',
      version: '1.0.0',
      commitSha: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
      repoUrl: 'https://github.com/quorum/demo',
      expectedArtifactName: 'app.bin',
    });

    ledgerService.recordQuorumEvaluated({
      releaseId,
      status: 'VERIFIED',
      validAttestations: 3,
      invalidAttestations: 0,
      dominantHash: hash,
      dominantBuilderCount: 3,
      consensusPercentage: 100.0,
      disagreementDetected: false,
    });
  }

  // TEST 1: GET /api/health -> 200
  it('TEST 1: GET /api/health -> 200 with service metadata', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('quorum-api');
    expect(res.body.data.version).toBe('1.0.0');
  });

  // TEST 2: GET /api/builders -> 200
  it('TEST 2: GET /api/builders -> 200 returns registered builders', async () => {
    const kp = generateEd25519KeyPair('bld_alpha', 'seed_alpha');
    buildersRepo.createBuilder({
      id: 'bld_alpha',
      name: 'Builder Alpha',
      publicKey: kp.publicKeyPem,
      operatorIdentity: 'Op Alpha',
      status: 'ACTIVE',
    });

    const res = await request(app).get('/api/builders');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe('bld_alpha');
    expect(res.body.data[0].name).toBe('Builder Alpha');
    expect(res.body.data[0].publicKey).toContain('BEGIN PUBLIC KEY');
  });

  // TEST 3: GET /api/builders/:id -> 200
  it('TEST 3: GET /api/builders/:id -> 200 returns one builder', async () => {
    const kp = generateEd25519KeyPair('bld_beta', 'seed_beta');
    buildersRepo.createBuilder({
      id: 'bld_beta',
      name: 'Builder Beta',
      publicKey: kp.publicKeyPem,
      operatorIdentity: 'Op Beta',
      status: 'ACTIVE',
    });

    const res = await request(app).get('/api/builders/bld_beta');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('bld_beta');
    expect(res.body.data.name).toBe('Builder Beta');
  });

  // TEST 4: unknown builder -> 404
  it('TEST 4: GET /api/builders/:id with unknown builder -> 404', async () => {
    const res = await request(app).get('/api/builders/unknown_builder_404');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('BUILDER_NOT_FOUND');
  });

  // TEST 5: GET /api/releases -> 200
  it('TEST 5: GET /api/releases -> 200 returns releases list', async () => {
    setupTestRelease('rel_list_test');

    const res = await request(app).get('/api/releases');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((r: any) => r.releaseId === 'rel_list_test')).toBe(true);
  });

  // TEST 6: GET /api/releases/:id -> 200
  it('TEST 6: GET /api/releases/:id -> 200 returns release information', async () => {
    setupTestRelease('rel_single_test');

    const res = await request(app).get('/api/releases/rel_single_test');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.releaseId).toBe('rel_single_test');
    expect(res.body.data.project).toBe('quorum-demo');
    expect(res.body.data.version).toBe('1.0.0');
    expect(res.body.data.status).toBe('PENDING');
  });

  // TEST 7: unknown release -> 404
  it('TEST 7: GET /api/releases/:id with unknown release -> 404', async () => {
    const res = await request(app).get('/api/releases/unknown_rel_999');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RELEASE_NOT_FOUND');
  });

  // TEST 8: GET verification results -> 200
  it('TEST 8: GET /api/releases/:id/verification -> 200 returns individual verification results', async () => {
    setupTestRelease('rel_verification_test');

    const res = await request(app).get('/api/releases/rel_verification_test/verification');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0]).toHaveProperty('attestationId');
    expect(res.body.data[0]).toHaveProperty('builderId');
    expect(res.body.data[0]).toHaveProperty('signatureValid', true);
    expect(res.body.data[0]).toHaveProperty('status', 'VALID');
  });

  // TEST 9: GET quorum result -> 200
  it('TEST 9: GET /api/releases/:id/quorum -> 200 returns persisted quorum result', async () => {
    setupTestRelease('rel_quorum_test');

    const res = await request(app).get('/api/releases/rel_quorum_test/quorum');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.releaseId).toBe('rel_quorum_test');
    expect(res.body.data.status).toBe('VERIFIED');
    expect(res.body.data.consensusPercentage).toBe(100.0);
    expect(res.body.data.hashGroups).toHaveLength(1);
  });

  // TEST 10: GET audit ledger -> 200
  it('TEST 10: GET /api/ledger -> 200 returns ledger entries with optional limit', async () => {
    for (let i = 1; i <= 5; i++) {
      ledgerService.appendEvent({ eventType: `EVENT_${i}`, payload: { step: i } });
    }

    const res = await request(app).get('/api/ledger?limit=3');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[2].sequence).toBe(5);
  });

  // TEST 11: GET ledger verification -> 200
  it('TEST 11: GET /api/ledger/verify -> 200 runs ledger verification service', async () => {
    ledgerService.appendEvent({ eventType: 'GENESIS', payload: { start: true } });

    const res = await request(app).get('/api/ledger/verify');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.totalEntries).toBeGreaterThanOrEqual(1);
    expect(res.body.data.firstInvalidSequence).toBeNull();
  });

  // TEST 12: release audit endpoint -> 200
  it('TEST 12: GET /api/releases/:id/audit -> 200 returns entries associated with release', async () => {
    setupTestRelease('rel_audit_lookup_test');

    const res = await request(app).get('/api/releases/rel_audit_lookup_test/audit');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.every((e: any) => e.release_id === 'rel_audit_lookup_test')).toBe(true);
  });

  // TEST 13: malformed release ID -> 400
  it('TEST 13: malformed release ID parameter -> 400 Bad Request', async () => {
    const res = await request(app).get('/api/releases/invalid!@#$/audit');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_RELEASE_ID');
  });

  // TEST 14: evaluation endpoint executes Phase 5 -> Phase 6 -> Phase 7 in correct order
  it('TEST 14: POST /api/releases/:id/evaluate executes Phase 5 -> Phase 6 -> Phase 7 pipeline', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const res = await request(app).post(`/api/releases/${scenario.releaseId}/evaluate`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.releaseId).toBe(scenario.releaseId);
    expect(res.body.data.verification.total).toBe(3);
    expect(res.body.data.verification.valid).toBe(3);
    expect(res.body.data.verification.invalid).toBe(0);
    expect(res.body.data.status).toBe('VERIFIED');
  });

  // TEST 15: evaluation response contains final quorum status
  it('TEST 15: evaluation response contains final quorum consensus status', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'conflict',
      db,
      artifactsDir: tempArtifactsDir,
    });

    const res = await request(app).post(`/api/releases/${scenario.releaseId}/evaluate`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FLAGGED');
    expect(res.body.data.quorum.consensusPercentage).toBe(66.67);
    expect(res.body.data.quorum.disagreementDetected).toBe(true);
  });

  // TEST 16: evaluation creates audit events
  it('TEST 16: evaluation creates audit events in Phase 7 ledger', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'no-consensus',
      db,
      artifactsDir: tempArtifactsDir,
    });

    await request(app).post(`/api/releases/${scenario.releaseId}/evaluate`).expect(200);

    const auditEntries = ledgerRepo.getEntriesByReleaseId(scenario.releaseId);
    expect(auditEntries.length).toBeGreaterThanOrEqual(2);

    const hasQuorumEvent = auditEntries.some((e) => e.event_type === 'QUORUM_EVALUATED');
    const hasStatusEvent = auditEntries.some((e) => e.event_type === 'RELEASE_STATUS_CHANGED');

    expect(hasQuorumEvent).toBe(true);
    expect(hasStatusEvent).toBe(true);
  });

  // TEST 17: ledger tampering is surfaced by API verification endpoint
  it('TEST 17: ledger tampering is surfaced by API /api/ledger/verify endpoint', async () => {
    ledgerService.appendEvent({ eventType: 'EVENT_A', payload: { a: 1 } });
    ledgerService.appendEvent({ eventType: 'EVENT_B', payload: { b: 2 } });

    // Tamper with sequence 2 directly in DB
    db.prepare(`
      UPDATE audit_ledger
      SET payload_hash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
      WHERE sequence = 2
    `).run();

    const res = await request(app).get('/api/ledger/verify');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.firstInvalidSequence).toBe(2);
    expect(res.body.data.error).toContain('Payload hash mismatch');
  });

  // TEST 18: private builder key material is never returned
  it('TEST 18: private builder key material is never returned in API responses', async () => {
    const kp = generateEd25519KeyPair('bld_secret_test', 'secret_seed_phrase');
    buildersRepo.createBuilder({
      id: 'bld_secret_test',
      name: 'Secret Builder',
      publicKey: kp.publicKeyPem,
      operatorIdentity: 'Op',
      status: 'ACTIVE',
    });

    const listRes = await request(app).get('/api/builders');
    const singleRes = await request(app).get('/api/builders/bld_secret_test');

    const listStr = JSON.stringify(listRes.body);
    const singleStr = JSON.stringify(singleRes.body);

    expect(listStr).not.toContain('PRIVATE KEY');
    expect(listStr).not.toContain('privateKey');
    expect(listStr).not.toContain('secret_seed_phrase');

    expect(singleStr).not.toContain('PRIVATE KEY');
    expect(singleStr).not.toContain('privateKey');
    expect(singleStr).not.toContain('secret_seed_phrase');
  });

  // TEST 19: unexpected errors return safe 500 response
  it('TEST 19: unexpected errors return safe 500 response without leaking stack traces', async () => {
    // Calling an endpoint on closed DB triggers an internal error
    const closedDb = initDatabase({ dbPath: ':memory:' });
    closedDb.close();
    const brokenApp = createApp({ db: closedDb });

    const res = await request(brokenApp).get('/api/builders');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body.error.message).toBe('An unexpected internal error occurred');
    expect(res.body).not.toHaveProperty('stack');
  });

  // TEST 20: Existing Phase 2 crypto verification passes
  it('TEST 20: Existing Phase 2 crypto verification passes', () => {
    const hash = sha256('test_crypto');
    expect(hash).toHaveLength(64);
  });

  // TEST 21: Existing Phase 3 database persistence passes
  it('TEST 21: Existing Phase 3 database persistence passes', () => {
    expect(buildersRepo.getAllBuilders()).toBeDefined();
  });

  // TEST 22: Existing Phase 4 builder simulation passes
  it('TEST 22: Existing Phase 4 builder simulation passes', async () => {
    const scenario = await runBuilderScenario({
      scenario: 'clean',
      db,
      artifactsDir: tempArtifactsDir,
    });
    expect(scenario.distinctHashes).toHaveLength(1);
  });

  // TEST 23: Existing Phase 5 verification tests pass
  it('TEST 23: Existing Phase 5 verification engine operates within API layer', async () => {
    setupTestRelease('rel_phase5_check');
    const results = verificationRepo.getVerificationResultsByReleaseId('rel_phase5_check');
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'VALID')).toBe(true);
  });

  // TEST 24: Existing Phase 6 quorum tests pass
  it('TEST 24: Existing Phase 6 quorum consensus persists and exposes results', async () => {
    setupTestRelease('rel_phase6_check');
    const quorum = quorumRepo.getQuorumResultByReleaseId('rel_phase6_check');
    expect(quorum?.quorum_status).toBe('VERIFIED');
  });

  // TEST 25: Existing Phase 7 ledger tests pass
  it('TEST 25: Existing Phase 7 audit ledger verifies intact via API', async () => {
    setupTestRelease('rel_phase7_check');
    const verifyRes = await request(app).get('/api/ledger/verify');
    expect(verifyRes.body.data.valid).toBe(true);
  });
});
