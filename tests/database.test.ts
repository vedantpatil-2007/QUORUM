import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import {
  initDatabase,
  runTransaction,
  REQUIRED_TABLES,
  DatabaseInitializationError,
} from '../server/src/db/database.js';
import {
  BuildersRepository,
  ReleasesRepository,
  ArtifactsRepository,
  AttestationsRepository,
  VerificationRepository,
  QuorumRepository,
} from '../server/src/db/repositories/index.js';
import { generateEd25519KeyPair } from '../server/src/crypto/keys.js';
import { sha256 } from '../server/src/crypto/hash.js';

describe('Quorum Database & Persistence Layer (Phase 3)', () => {
  let db: Database.Database;
  let buildersRepo: BuildersRepository;
  let releasesRepo: ReleasesRepository;
  let artifactsRepo: ArtifactsRepository;
  let attestationsRepo: AttestationsRepository;
  let verificationRepo: VerificationRepository;
  let quorumRepo: QuorumRepository;

  beforeEach(() => {
    // Use fresh in-memory database for each test to ensure isolation
    db = initDatabase({ dbPath: ':memory:' });
    buildersRepo = new BuildersRepository(db);
    releasesRepo = new ReleasesRepository(db);
    artifactsRepo = new ArtifactsRepository(db);
    attestationsRepo = new AttestationsRepository(db);
    verificationRepo = new VerificationRepository(db);
    quorumRepo = new QuorumRepository(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  // TEST 1: Database initializes successfully
  it('TEST 1: Database initializes successfully with foreign keys enforced', () => {
    expect(db.open).toBe(true);

    const fkEnabled = db.pragma('foreign_keys', { simple: true });
    expect(fkEnabled).toBe(1);
  });

  // TEST 2: All required tables exist
  it('TEST 2: All required tables and migration records exist', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const tableNames = new Set(rows.map((r) => r.name));

    for (const table of REQUIRED_TABLES) {
      expect(tableNames.has(table)).toBe(true);
    }

    // Verify migration tracking
    const migrations = db.prepare('SELECT * FROM schema_migrations').all();
    expect(migrations.length).toBeGreaterThanOrEqual(1);
  });

  // TEST 3: Builder can be inserted and retrieved
  it('TEST 3: Builder can be inserted and retrieved with public key only', () => {
    const keyPair = generateEd25519KeyPair('node_alpha');

    const created = buildersRepo.createBuilder({
      id: 'bld_node_alpha',
      name: 'Builder Node Alpha',
      publicKey: keyPair.publicKeyPem,
      operatorIdentity: 'Security Team A',
      status: 'ACTIVE',
    });

    expect(created.id).toBe('bld_node_alpha');
    expect(created.status).toBe('ACTIVE');

    const fetched = buildersRepo.getBuilderById('bld_node_alpha');
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('Builder Node Alpha');
    expect(fetched?.public_key).toBe(keyPair.publicKeyPem);
    expect(fetched?.key_type).toBe('Ed25519');

    // Update status
    const updated = buildersRepo.updateBuilderStatus('bld_node_alpha', 'SUSPENDED');
    expect(updated).toBe(true);
    expect(buildersRepo.getBuilderById('bld_node_alpha')?.status).toBe('SUSPENDED');
  });

  // TEST 4: Release can be inserted and retrieved
  it('TEST 4: Release can be inserted and retrieved', () => {
    const release = releasesRepo.createRelease({
      id: 'rel_test_001',
      projectName: 'core-crypto',
      version: '1.0.0',
      repoUrl: 'https://github.com/org/core-crypto',
      commitSha: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
      buildSpecJson: JSON.stringify({ command: 'make release' }),
      expectedArtifactName: 'core-crypto.tar.gz',
      expectedHash: sha256('sample-expected-binary'),
      status: 'PENDING',
    });

    expect(release.id).toBe('rel_test_001');

    const fetched = releasesRepo.getReleaseById('rel_test_001');
    expect(fetched).not.toBeNull();
    expect(fetched?.project_name).toBe('core-crypto');
    expect(fetched?.status).toBe('PENDING');

    // Update release status
    releasesRepo.updateReleaseStatus('rel_test_001', 'VERIFIED');
    expect(releasesRepo.getReleaseById('rel_test_001')?.status).toBe('VERIFIED');
  });

  // TEST 5: Artifact can be associated with a release
  it('TEST 5: Artifact can be associated with a release', () => {
    releasesRepo.createRelease({
      id: 'rel_test_002',
      projectName: 'net-lib',
      version: '2.0.0',
      repoUrl: 'https://github.com/org/net-lib',
      commitSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      buildSpecJson: '{}',
      expectedArtifactName: 'net-lib.bin',
    });

    const artifact = artifactsRepo.createArtifact({
      id: 'art_001',
      releaseId: 'rel_test_002',
      filename: 'net-lib.bin',
      expectedSha256: sha256('net-lib-bytes'),
      sizeBytes: 1048576,
    });

    expect(artifact.id).toBe('art_001');

    const list = artifactsRepo.getArtifactsByReleaseId('rel_test_002');
    expect(list.length).toBe(1);
    expect(list[0]?.filename).toBe('net-lib.bin');
  });

  // TEST 6: Attestation can be associated with a release and builder
  it('TEST 6: Attestation can be associated with a release and builder', () => {
    const keyPair = generateEd25519KeyPair('bld_01');
    buildersRepo.createBuilder({
      id: 'bld_01',
      name: 'Builder 01',
      publicKey: keyPair.publicKeyPem,
      operatorIdentity: 'Org 1',
    });

    releasesRepo.createRelease({
      id: 'rel_test_003',
      projectName: 'parser',
      version: '0.1.0',
      repoUrl: 'https://github.com/org/parser',
      commitSha: '1111222233334444555566667777888899990000',
      buildSpecJson: '{}',
      expectedArtifactName: 'parser.tar.gz',
    });

    const attestation = attestationsRepo.createAttestation({
      id: 'att_001',
      releaseId: 'rel_test_003',
      builderId: 'bld_01',
      sourceCommit: '1111222233334444555566667777888899990000',
      artifactName: 'parser.tar.gz',
      artifactSha256: sha256('parser-output'),
      buildEnvJson: JSON.stringify({ os: 'linux', compiler: 'gcc' }),
      buildTimestamp: new Date().toISOString(),
      buildDurationMs: 12000,
      buildLogSha256: sha256('build-log'),
      statementJson: JSON.stringify({ claim: 'verified' }),
      signature: 'dummySignatureBase64==',
      publicKeyId: keyPair.keyId,
      isValid: true,
    });

    expect(attestation.id).toBe('att_001');

    const byRelease = attestationsRepo.getAttestationsByReleaseId('rel_test_003');
    expect(byRelease.length).toBe(1);
    expect(byRelease[0]?.builder_id).toBe('bld_01');

    const single = attestationsRepo.getAttestationByBuilderAndRelease('bld_01', 'rel_test_003');
    expect(single).not.toBeNull();
    expect(single?.id).toBe('att_001');
  });

  // TEST 7: Duplicate (release_id, builder_id) attestation is rejected
  it('TEST 7: Duplicate (release_id, builder_id) attestation is rejected by UNIQUE constraint', () => {
    const keyPair = generateEd25519KeyPair('bld_02');
    buildersRepo.createBuilder({
      id: 'bld_02',
      name: 'Builder 02',
      publicKey: keyPair.publicKeyPem,
      operatorIdentity: 'Org 2',
    });

    releasesRepo.createRelease({
      id: 'rel_test_004',
      projectName: 'validator',
      version: '1.0.0',
      repoUrl: 'https://github.com/org/validator',
      commitSha: '2222333344445555666677778888999900001111',
      buildSpecJson: '{}',
      expectedArtifactName: 'validator.bin',
    });

    // First submission succeeds
    attestationsRepo.createAttestation({
      id: 'att_vote_1',
      releaseId: 'rel_test_004',
      builderId: 'bld_02',
      sourceCommit: '2222333344445555666677778888999900001111',
      artifactName: 'validator.bin',
      artifactSha256: sha256('artifact-v1'),
      buildEnvJson: '{}',
      buildTimestamp: new Date().toISOString(),
      buildDurationMs: 5000,
      buildLogSha256: sha256('log'),
      statementJson: '{}',
      signature: 'sig1',
      publicKeyId: keyPair.keyId,
    });

    // Second submission by SAME builder for SAME release must fail
    expect(() => {
      attestationsRepo.createAttestation({
        id: 'att_vote_2',
        releaseId: 'rel_test_004',
        builderId: 'bld_02',
        sourceCommit: '2222333344445555666677778888999900001111',
        artifactName: 'validator.bin',
        artifactSha256: sha256('artifact-v2-tampered'),
        buildEnvJson: '{}',
        buildTimestamp: new Date().toISOString(),
        buildDurationMs: 5000,
        buildLogSha256: sha256('log'),
        statementJson: '{}',
        signature: 'sig2',
        publicKeyId: keyPair.keyId,
      });
    }).toThrow(/UNIQUE constraint failed: attestations\.release_id, attestations\.builder_id/);
  });

  // TEST 8: Foreign key violation is rejected
  it('TEST 8: Foreign key violations are rejected by SQLite', () => {
    // 1. Artifact pointing to non-existent release
    expect(() => {
      artifactsRepo.createArtifact({
        id: 'art_orphan',
        releaseId: 'non_existent_release',
        filename: 'test.bin',
      });
    }).toThrow(/FOREIGN KEY constraint failed/);

    // 2. Attestation pointing to non-existent release
    const keyPair = generateEd25519KeyPair('bld_03');
    buildersRepo.createBuilder({
      id: 'bld_03',
      name: 'Builder 03',
      publicKey: keyPair.publicKeyPem,
      operatorIdentity: 'Org 3',
    });

    expect(() => {
      attestationsRepo.createAttestation({
        id: 'att_bad_rel',
        releaseId: 'missing_release',
        builderId: 'bld_03',
        sourceCommit: 'commit',
        artifactName: 'file.bin',
        artifactSha256: sha256('hash'),
        buildEnvJson: '{}',
        buildTimestamp: new Date().toISOString(),
        buildDurationMs: 100,
        buildLogSha256: sha256('log'),
        statementJson: '{}',
        signature: 'sig',
        publicKeyId: keyPair.keyId,
      });
    }).toThrow(/FOREIGN KEY constraint failed/);

    // 3. Attestation pointing to non-existent builder
    releasesRepo.createRelease({
      id: 'rel_test_005',
      projectName: 'test',
      version: '1.0.0',
      repoUrl: 'https://example.com',
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
      buildSpecJson: '{}',
      expectedArtifactName: 'test.bin',
    });

    expect(() => {
      attestationsRepo.createAttestation({
        id: 'att_bad_bld',
        releaseId: 'rel_test_005',
        builderId: 'non_existent_builder',
        sourceCommit: 'commit',
        artifactName: 'file.bin',
        artifactSha256: sha256('hash'),
        buildEnvJson: '{}',
        buildTimestamp: new Date().toISOString(),
        buildDurationMs: 100,
        buildLogSha256: sha256('log'),
        statementJson: '{}',
        signature: 'sig',
        publicKeyId: 'bad_key',
      });
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  // TEST 9: Invalid builder status is rejected
  it('TEST 9: Invalid builder status is rejected by CHECK constraint', () => {
    const keyPair = generateEd25519KeyPair('bld_bad');

    expect(() => {
      // @ts-expect-error intentionally testing invalid status
      buildersRepo.createBuilder({
        id: 'bld_bad',
        name: 'Bad Builder',
        publicKey: keyPair.publicKeyPem,
        operatorIdentity: 'Rogue Operator',
        status: 'UNAUTHORIZED_STATUS',
      });
    }).toThrow(/CHECK constraint failed/);
  });

  // TEST 10: Release status constraint works
  it('TEST 10: Release status constraint enforces allowed lifecycle values', () => {
    // 1. Invalid status throws
    expect(() => {
      // @ts-expect-error intentionally testing invalid status
      releasesRepo.createRelease({
        id: 'rel_bad_status',
        projectName: 'bad',
        version: '0.0.1',
        repoUrl: 'https://example.com',
        commitSha: '1234567890123456789012345678901234567890',
        buildSpecJson: '{}',
        expectedArtifactName: 'bad.bin',
        status: 'INVALID_STATUS',
      });
    }).toThrow(/CHECK constraint failed/);

    // 2. All valid statuses succeed
    const validStatuses = ['PENDING', 'INSUFFICIENT_EVIDENCE', 'VERIFIED', 'FLAGGED', 'REJECTED'] as const;
    for (const status of validStatuses) {
      const rel = releasesRepo.createRelease({
        id: `rel_status_${status}`,
        projectName: 'status-test',
        version: '1.0.0',
        repoUrl: 'https://example.com',
        commitSha: '1234567890123456789012345678901234567890',
        buildSpecJson: '{}',
        expectedArtifactName: 'test.bin',
        status,
      });
      expect(rel.status).toBe(status);
    }
  });

  // TEST 11: Transaction rollback works
  it('TEST 11: Transaction rollback works on atomic multi-table operations', () => {
    const releaseId = 'rel_tx_test';
    const artifactId = 'art_tx_test';

    // Attempt atomic release + artifact creation that deliberately throws an error
    expect(() => {
      runTransaction(db, () => {
        releasesRepo.createRelease({
          id: releaseId,
          projectName: 'atomic-proj',
          version: '1.0.0',
          repoUrl: 'https://example.com',
          commitSha: '3333444455556666777788889999000011112222',
          buildSpecJson: '{}',
          expectedArtifactName: 'atomic.bin',
        });

        artifactsRepo.createArtifact({
          id: artifactId,
          releaseId,
          filename: 'atomic.bin',
        });

        // Trigger rollback error midway
        throw new Error('Simulated atomic failure after artifact insert');
      });
    }).toThrow('Simulated atomic failure after artifact insert');

    // Confirm that BOTH release and artifact were rolled back
    expect(releasesRepo.getReleaseById(releaseId)).toBeNull();
    expect(artifactsRepo.getArtifactsByReleaseId(releaseId).length).toBe(0);
  });

  // TEST 12: Database can be reopened without losing existing records
  it('TEST 12: Database can be reopened on disk without losing existing records', () => {
    const tmpDir = os.tmpdir();
    const testDbPath = path.join(tmpDir, `quorum-persistence-test-${Date.now()}.db`);

    try {
      // 1. First session: open DB and write data
      const db1 = initDatabase({ dbPath: testDbPath });
      const bRepo1 = new BuildersRepository(db1);
      const rRepo1 = new ReleasesRepository(db1);

      const keyPair = generateEd25519KeyPair('bld_persist');
      bRepo1.createBuilder({
        id: 'bld_persist',
        name: 'Persistent Builder',
        publicKey: keyPair.publicKeyPem,
        operatorIdentity: 'Persistent Org',
        status: 'ACTIVE',
      });

      rRepo1.createRelease({
        id: 'rel_persist',
        projectName: 'persist-lib',
        version: '1.0.0',
        repoUrl: 'https://example.com',
        commitSha: '4444555566667777888899990000111122223333',
        buildSpecJson: '{}',
        expectedArtifactName: 'persist.bin',
      });

      db1.close();

      // 2. Second session: re-open existing DB file
      const db2 = initDatabase({ dbPath: testDbPath });
      const bRepo2 = new BuildersRepository(db2);
      const rRepo2 = new ReleasesRepository(db2);

      const builder = bRepo2.getBuilderById('bld_persist');
      expect(builder).not.toBeNull();
      expect(builder?.name).toBe('Persistent Builder');

      const release = rRepo2.getReleaseById('rel_persist');
      expect(release).not.toBeNull();
      expect(release?.project_name).toBe('persist-lib');

      db2.close();
    } finally {
      // Cleanup temp files
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      const walFile = `${testDbPath}-wal`;
      if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
      const shmFile = `${testDbPath}-shm`;
      if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
    }
  });

  // Verification & Quorum Repository Tests
  it('Persists and updates Quorum results cleanly', () => {
    releasesRepo.createRelease({
      id: 'rel_quorum_test',
      projectName: 'quorum-proj',
      version: '1.0.0',
      repoUrl: 'https://example.com',
      commitSha: '5555666677778888999900001111222233334444',
      buildSpecJson: '{}',
      expectedArtifactName: 'quorum.bin',
    });

    // 1. Initial quorum evaluation: INSUFFICIENT_EVIDENCE
    const initial = quorumRepo.createOrReplaceQuorumResult({
      id: 'qrm_001',
      releaseId: 'rel_quorum_test',
      totalBuilders: 1,
      agreeingCount: 1,
      disagreeingCount: 0,
      consensusPercentage: 100.0,
      canonicalHash: sha256('hash-1'),
      quorumStatus: 'INSUFFICIENT_EVIDENCE',
      breakdownJson: JSON.stringify({ builders: ['bld_1'] }),
    });

    expect(initial.quorum_status).toBe('INSUFFICIENT_EVIDENCE');

    // 2. Re-evaluated quorum: FLAGGED (upsert on conflict)
    const updated = quorumRepo.createOrReplaceQuorumResult({
      id: 'qrm_001',
      releaseId: 'rel_quorum_test',
      totalBuilders: 3,
      agreeingCount: 2,
      disagreeingCount: 1,
      consensusPercentage: 66.67,
      canonicalHash: sha256('hash-1'),
      quorumStatus: 'FLAGGED',
      breakdownJson: JSON.stringify({ dominant: ['bld_1', 'bld_2'], dissenting: ['bld_3'] }),
    });

    expect(updated.quorum_status).toBe('FLAGGED');
    expect(updated.disagreeing_count).toBe(1);

    const fetched = quorumRepo.getQuorumResultByReleaseId('rel_quorum_test');
    expect(fetched?.quorum_status).toBe('FLAGGED');
    expect(fetched?.total_builders).toBe(3);
  });
});
