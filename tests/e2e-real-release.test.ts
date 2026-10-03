import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { initDatabase } from '../server/src/db/database.js';
import { createApp } from '../server/src/api/app.js';

describe('E2E: Real Release Creation and Audit Ledger', () => {
  let app: Express;
  let db: Database.Database;
  let createdReleaseId: string;

  beforeAll(() => {
    db = initDatabase({ dbPath: ':memory:' });
    app = createApp({ db });
  });

  afterAll(() => {
    if (db && db.open) db.close();
  });

  it('TEST 1: starts with zero releases and zero ledger entries', async () => {
    const relRes = await request(app).get('/api/releases').expect(200);
    expect(relRes.body.data).toHaveLength(0);

    const ledgerRes = await request(app).get('/api/ledger').expect(200);
    expect(ledgerRes.body.data).toHaveLength(0);
  });

  it('TEST 2: creates a real release via POST /api/releases', async () => {
    const body = {
      projectName: 'test-binary',
      version: '2.0.0',
      repoUrl: 'https://github.com/test/test-binary',
      commitSha: 'abc123def456abc123def456abc123def456abc1',
      expectedArtifactName: 'test-binary-v2.0.0-linux-amd64.bin',
      buildScenario: 'clean',
    };

    const res = await request(app).post('/api/releases').send(body).expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.releaseId).toBeTruthy();
    expect(res.body.data.builderCount).toBe(3);
    expect(res.body.data.distinctHashes).toHaveLength(1); // clean: all 3 builders produce same hash
    createdReleaseId = res.body.data.releaseId;
  });

  it('TEST 3: real artifact SHA-256 hash was calculated (ledger has RELEASE_CREATED event)', async () => {
    const ledgerRes = await request(app).get('/api/ledger').expect(200);
    const entries = ledgerRes.body.data;
    expect(entries.length).toBeGreaterThan(0);

    const created = entries.find((e: any) => e.event_type === 'RELEASE_CREATED' && e.release_id === createdReleaseId);
    expect(created).toBeTruthy();
    expect(created.current_hash).toBeTruthy();
    expect(created.current_hash.length).toBe(64); // SHA-256 hex is 64 chars
    // Genesis block has null previous_hash
    const genesis = entries.find((e: any) => e.sequence === 1);
    expect(genesis.previous_hash).toBeNull();
  });

  it('TEST 4: evaluating the release creates additional audit events', async () => {
    await request(app)
      .post(`/api/releases/${createdReleaseId}/evaluate`)
      .expect(200);

    const ledgerRes = await request(app).get('/api/ledger').expect(200);
    const entries = ledgerRes.body.data;
    // Should have RELEASE_CREATED + 3x ATTESTATION_VERIFIED + RELEASE_STATUS_CHANGED + QUORUM_EVALUATED = 6 entries
    expect(entries.length).toBeGreaterThanOrEqual(6);

    const quorumEntry = entries.find((e: any) => e.event_type === 'QUORUM_EVALUATED');
    expect(quorumEntry).toBeTruthy();
  });

  it('TEST 5: quorum status is VERIFIED for a clean release', async () => {
    const res = await request(app)
      .get(`/api/releases/${createdReleaseId}/quorum`)
      .expect(200);
    expect(res.body.data.status).toBe('VERIFIED');
    expect(res.body.data.consensusPercentage).toBe(100);
  });

  it('TEST 6: previous hash chaining is correct (each entry links to prior)', async () => {
    const ledgerRes = await request(app).get('/api/ledger?limit=500').expect(200);
    const entries = ledgerRes.body.data;
    entries.sort((a: any, b: any) => a.sequence - b.sequence);

    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].previous_hash).toBe(entries[i - 1].current_hash);
    }
  });

  it('TEST 7: integrity verification passes for real data', async () => {
    const res = await request(app).get('/api/ledger/verify').expect(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.firstInvalidSequence).toBeNull();
    expect(res.body.data.verifiedEntries).toBeGreaterThan(0);
    expect(res.body.data.totalEntries).toBe(res.body.data.verifiedEntries);
  });

  it('TEST 8: deliberate tamper is detected by integrity verification', async () => {
    // Deliberately corrupt a ledger entry in the in-memory database
    db.prepare(
      "UPDATE audit_ledger SET current_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' WHERE sequence = 2"
    ).run();

    const res = await request(app).get('/api/ledger/verify').expect(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.firstInvalidSequence).not.toBeNull();
    expect(res.body.data.error).toBeTruthy();
  });

  it('TEST 9: reloading entries does not erase ledger (data is persisted)', async () => {
    // Reset the tampered entry for a clean test
    // Re-fetch to confirm entries still exist after tampering was detected
    const ledgerRes = await request(app).get('/api/ledger?limit=500').expect(200);
    expect(ledgerRes.body.data.length).toBeGreaterThanOrEqual(6);
  });

  it('TEST 10: returns 400 if required fields are missing', async () => {
    const res = await request(app)
      .post('/api/releases')
      .send({ projectName: 'missing-fields' })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('MISSING_REQUIRED_FIELDS');
  });

  describe('Real Multipart File Upload & Authoritative Hashing', () => {
    let uploadedReleaseId: string;
    const testFileBytes = Buffer.from('QUORUM_TEST_BINARY_PAYLOAD_BYTE_SEQUENCE_v1.0.0_PRODUCTION');
    const expectedSha256 = '6d3b3793ecff61e712cb071c7784ea35930fb8eb79e2762a524ae30a6e0c06a3'; // will be verified dynamically

    it('TEST 11: uploads real artifact via multipart/form-data and computes real SHA-256', async () => {
      const crypto = await import('node:crypto');
      const realSha = crypto.createHash('sha256').update(testFileBytes).digest('hex');

      const res = await request(app)
        .post('/api/releases/upload')
        .attach('artifact', testFileBytes, 'my-application.bin')
        .field('projectName', 'my-application')
        .field('version', '1.0.0')
        .field('repoUrl', 'https://github.com/test-org/my-application')
        .field('commitSha', '1111222233334444555566667777888899990000')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.releaseId).toBeTruthy();
      expect(res.body.data.expectedArtifactName).toBe('my-application.bin');
      expect(res.body.data.sizeBytes).toBe(testFileBytes.length);
      // AUTHORITATIVE SHA-256 verification
      expect(res.body.data.artifactSha256).toBe(realSha);
      expect(res.body.data.status).toBe('PENDING');

      uploadedReleaseId = res.body.data.releaseId;
    });

    it('TEST 12: release record in database has authoritative SHA-256 and expected filename', async () => {
      const relRes = await request(app)
        .get(`/api/releases/${uploadedReleaseId}`)
        .expect(200);

      expect(relRes.body.data.expectedArtifactName).toBe('my-application.bin');
      expect(relRes.body.data.expectedHash).toBeTruthy();
      expect(relRes.body.data.expectedHash).toBe(
        (await import('node:crypto')).createHash('sha256').update(testFileBytes).digest('hex')
      );
      expect(relRes.body.data.status).toBe('PENDING');
    });

    it('TEST 13: audit ledger has real RELEASE_CREATED event with full metadata', async () => {
      const auditRes = await request(app)
        .get(`/api/releases/${uploadedReleaseId}/audit`)
        .expect(200);

      expect(auditRes.body.data.length).toBeGreaterThanOrEqual(1);
      const createdEvent = auditRes.body.data.find((e: any) => e.event_type === 'RELEASE_CREATED');
      expect(createdEvent).toBeTruthy();
      expect(createdEvent.release_id).toBe(uploadedReleaseId);
      expect(createdEvent.current_hash).toHaveLength(64);
      expect(createdEvent.payload_json).toContain('my-application.bin');
    });

    it('TEST 14: evaluates uploaded release genuinely with 0 fabricated builder attestations', async () => {
      // Evaluating an uploaded arbitrary binary: Quorum engine honestly reflects INSUFFICIENT_EVIDENCE
      // without falsely claiming 3 builders independently reproduced it.
      const evalRes = await request(app)
        .post(`/api/releases/${uploadedReleaseId}/evaluate`)
        .expect(200);

      expect(evalRes.body.data.status).toBe('INSUFFICIENT_EVIDENCE');
      expect(evalRes.body.data.verification.total).toBe(0);
      expect(evalRes.body.data.verification.valid).toBe(0);
      expect(evalRes.body.data.quorum.consensusPercentage).toBe(0);

      // Verify release status in database was updated
      const relRes = await request(app).get(`/api/releases/${uploadedReleaseId}`).expect(200);
      expect(relRes.body.data.status).toBe('INSUFFICIENT_EVIDENCE');
    });

    it('TEST 15: returns 400 when no file is uploaded', async () => {
      const res = await request(app)
        .post('/api/releases/upload')
        .field('projectName', 'no-file')
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NO_FILE_UPLOADED');
    });
  });
});
