import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { initDatabase } from '../server/src/db/database.js';
import { createApp } from '../server/src/api/app.js';
import {
  parseAndValidateGitHubUrl,
  validateRef,
  isValidCommitSha,
} from '../server/src/source/source-validator.js';
import {
  GitHubSourceService,
  SourceResolutionError,
} from '../server/src/source/index.js';

describe('Source Repository Resolution & Verification Workflow (Phase 9 Enhancement)', () => {
  let app: Express;
  let db: Database.Database;

  beforeAll(() => {
    db = initDatabase({ dbPath: ':memory:' });
    app = createApp({ db });
  });

  afterAll(() => {
    if (db && db.open) db.close();
  });

  // TEST 1: Valid GitHub URL
  it('TEST 1: parses valid HTTPS GitHub URL correctly', () => {
    const parsed = parseAndValidateGitHubUrl('https://github.com/octocat/Hello-World');
    expect(parsed.provider).toBe('github');
    expect(parsed.owner).toBe('octocat');
    expect(parsed.repository).toBe('Hello-World');
    expect(parsed.normalizedUrl).toBe('https://github.com/octocat/Hello-World');
  });

  // TEST 2: Trailing slash normalization
  it('TEST 2: normalizes trailing slash in GitHub URL', () => {
    const parsed = parseAndValidateGitHubUrl('https://github.com/torvalds/linux/');
    expect(parsed.owner).toBe('torvalds');
    expect(parsed.repository).toBe('linux');
    expect(parsed.normalizedUrl).toBe('https://github.com/torvalds/linux');
  });

  // TEST 3: .git suffix normalization
  it('TEST 3: removes .git suffix from GitHub URL', () => {
    const parsed = parseAndValidateGitHubUrl('https://github.com/facebook/react.git');
    expect(parsed.owner).toBe('facebook');
    expect(parsed.repository).toBe('react');
    expect(parsed.normalizedUrl).toBe('https://github.com/facebook/react');
  });

  // TEST 4: Rejects non-GitHub domains
  it('TEST 4: rejects non-GitHub domains with appropriate error', () => {
    expect(() => parseAndValidateGitHubUrl('https://gitlab.com/owner/repo')).toThrow(
      SourceResolutionError
    );
    expect(() => parseAndValidateGitHubUrl('https://bitbucket.org/owner/repo')).toThrow(
      'Only "github.com" repositories are supported'
    );
  });

  // TEST 5: Rejects non-HTTPS protocols
  it('TEST 5: rejects insecure HTTP protocol', () => {
    expect(() => parseAndValidateGitHubUrl('http://github.com/owner/repo')).toThrow(
      'Only secure "https:" GitHub repository URLs are allowed'
    );
  });

  // TEST 6: Rejects malformed or incomplete URLs
  it('TEST 6: rejects malformed or incomplete repository URLs', () => {
    expect(() => parseAndValidateGitHubUrl('not-a-url')).toThrow(SourceResolutionError);
    expect(() => parseAndValidateGitHubUrl('https://github.com')).toThrow(SourceResolutionError);
    expect(() => parseAndValidateGitHubUrl('https://github.com/only-owner')).toThrow(
      SourceResolutionError
    );
  });

  // TEST 7: Validates git reference syntax
  it('TEST 7: rejects invalid Git branch or reference syntax', () => {
    expect(() => validateRef('bad branch with spaces')).toThrow(SourceResolutionError);
    expect(() => validateRef('bad..branch')).toThrow(SourceResolutionError);
    expect(() => validateRef('branch~1')).toThrow(SourceResolutionError);
    expect(() => validateRef('branch^2')).toThrow(SourceResolutionError);
    expect(() => validateRef('')).toThrow(SourceResolutionError);
  });

  // TEST 8: Valid commit SHA validation
  it('TEST 8: correctly identifies valid and invalid 40-character commit SHAs', () => {
    const validSha = 'd670460b4b4aece5915caf5c68d12f560a9fe3e4';
    const shortSha = 'd670460';
    const nonHexSha = 'z670460b4b4aece5915caf5c68d12f560a9fe3e4';

    expect(isValidCommitSha(validSha)).toBe(true);
    expect(isValidCommitSha(shortSha)).toBe(false);
    expect(isValidCommitSha(nonHexSha)).toBe(false);
  });

  // TEST 9: Direct commit SHA resolution requires no API calls
  it('TEST 9: resolves directly when ref is a 40-character commit SHA', async () => {
    const directSha = '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d';
    const service = new GitHubSourceService({
      fetcher: () => {
        throw new Error('Should not make network call for direct SHA');
      },
    });

    const resolution = await service.resolveSource({
      repositoryUrl: 'https://github.com/owner/project',
      ref: directSha,
    });

    expect(resolution.provider).toBe('github');
    expect(resolution.owner).toBe('owner');
    expect(resolution.repository).toBe('project');
    expect(resolution.commitSha).toBe(directSha);
    expect(resolution.isDirectCommitSha).toBe(true);
    expect(resolution.resolvedAt).toBeTruthy();
  });

  // TEST 10: Mocked GitHub API resolution for branch reference
  it('TEST 10: resolves branch reference to authoritative commit SHA via GitHub API', async () => {
    const expectedSha = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b';
    const mockFetcher = async () =>
      new Response(JSON.stringify({ sha: expectedSha }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const service = new GitHubSourceService({ fetcher: mockFetcher as any });
    const resolution = await service.resolveSource({
      repositoryUrl: 'https://github.com/octocat/Hello-World',
      ref: 'master',
    });

    expect(resolution.commitSha).toBe(expectedSha);
    expect(resolution.ref).toBe('master');
    expect(resolution.owner).toBe('octocat');
    expect(resolution.repository).toBe('Hello-World');
    expect(resolution.isDirectCommitSha).toBe(false);
  });

  // TEST 11: Handles GitHub 404 repository not found
  it('TEST 11: returns friendly 404 error when repository is not found', async () => {
    const mockFetcher = async () =>
      new Response('Not Found', { status: 404 });

    const service = new GitHubSourceService({ fetcher: mockFetcher as any });
    await expect(
      service.resolveSource({
        repositoryUrl: 'https://github.com/nonexistent/repo',
        ref: 'main',
      })
    ).rejects.toThrow('was not found on GitHub');
  });

  // TEST 12: Handles GitHub rate limiting
  it('TEST 12: returns rate limit error when GitHub headers indicate limit reached', async () => {
    const mockFetcher = async () =>
      new Response('rate limit', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      });

    const service = new GitHubSourceService({ fetcher: mockFetcher as any });
    await expect(
      service.resolveSource({
        repositoryUrl: 'https://github.com/owner/repo',
        ref: 'main',
      })
    ).rejects.toThrow('rate limit exceeded');
  });

  // TEST 13: POST /api/source/resolve endpoint
  it('TEST 13: POST /api/source/resolve resolves valid direct commit SHA reference', async () => {
    const directSha = 'aabbccddeeff00112233445566778899aabbccdd';
    const res = await request(app)
      .post('/api/source/resolve')
      .send({
        repositoryUrl: 'https://github.com/quorum-network/demo',
        ref: directSha,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.owner).toBe('quorum-network');
    expect(res.body.data.repository).toBe('demo');
    expect(res.body.data.commitSha).toBe(directSha);
    expect(res.body.data.provider).toBe('github');
  });

  // TEST 14: POST /api/releases/from-source runs full pipeline (Phase 4 -> 5 -> 6 -> 7)
  it('TEST 14: POST /api/releases/from-source creates release and evaluates consensus (Clean -> VERIFIED)', async () => {
    const directSha = '0123456789abcdef0123456789abcdef01234567';
    const res = await request(app)
      .post('/api/releases/from-source')
      .send({
        repositoryUrl: 'https://github.com/quorum-test/verified-app',
        ref: directSha,
        scenario: 'clean',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.releaseId).toBeTruthy();
    expect(res.body.data.status).toBe('VERIFIED');
    expect(res.body.data.source.owner).toBe('quorum-test');
    expect(res.body.data.source.repository).toBe('verified-app');
    expect(res.body.data.source.commitSha).toBe(directSha);
    expect(res.body.data.verification.valid).toBe(3);
    expect(res.body.data.quorum.consensusPercentage).toBe(100);
    expect(res.body.data.simulationNote).toContain("deterministic builder simulation");

    // Verify release was persisted in SQLite database
    const releaseRow = db
      .prepare('SELECT * FROM releases WHERE id = ?')
      .get(res.body.data.releaseId) as any;
    expect(releaseRow).toBeTruthy();
    expect(releaseRow.project_name).toBe('quorum-test/verified-app');
    expect(releaseRow.commit_sha).toBe(directSha);
    expect(releaseRow.status).toBe('VERIFIED');

    // Verify audit ledger recorded events for this release
    const ledgerRows = db
      .prepare('SELECT * FROM audit_ledger WHERE release_id = ?')
      .all(res.body.data.releaseId) as any[];
    expect(ledgerRows.length).toBeGreaterThanOrEqual(5);
    const eventTypes = ledgerRows.map((r) => r.event_type);
    expect(eventTypes).toContain('RELEASE_CREATED');
    expect(eventTypes).toContain('ATTESTATION_VERIFIED');
    expect(eventTypes).toContain('QUORUM_EVALUATED');
  });

  // TEST 15: Conflict scenario yields FLAGGED status dynamically from QuorumEngine
  it('TEST 15: POST /api/releases/from-source computes FLAGGED status dynamically for conflict scenario', async () => {
    const directSha = 'fedcba9876543210fedcba9876543210fedcba98';
    const res = await request(app)
      .post('/api/releases/from-source')
      .send({
        repositoryUrl: 'https://github.com/quorum-test/flagged-app',
        ref: directSha,
        scenario: 'conflict',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('FLAGGED');
    expect(res.body.data.quorum.disagreementDetected).toBe(true);
    expect(res.body.data.quorum.consensusPercentage).toBeCloseTo(66.67, 1);

    // Verify release status in database
    const releaseRow = db
      .prepare('SELECT * FROM releases WHERE id = ?')
      .get(res.body.data.releaseId) as any;
    expect(releaseRow.status).toBe('FLAGGED');
  });

  // TEST 16: Verification deduplication by builderId when release is evaluated multiple times
  it('TEST 16: deduplicates verification results by builderId returning exactly 3 builder rows', async () => {
    const directSha = '3333333333333333333333333333333333333333';
    const createRes = await request(app)
      .post('/api/releases/from-source')
      .send({
        repositoryUrl: 'https://github.com/quorum-test/dedup-app',
        ref: directSha,
        scenario: 'clean',
      })
      .expect(201);

    const releaseId = createRes.body.data.releaseId;

    // Trigger re-evaluation twice
    await request(app).post(`/api/releases/${releaseId}/evaluate`).expect(200);
    await request(app).post(`/api/releases/${releaseId}/evaluate`).expect(200);

    // Standard GET /api/releases/:id/verification should return exactly 3 unique builders
    const verifRes = await request(app).get(`/api/releases/${releaseId}/verification`).expect(200);
    expect(verifRes.body.success).toBe(true);
    expect(verifRes.body.data).toHaveLength(3);

    const builderIds = verifRes.body.data.map((v: any) => v.builderId);
    expect(new Set(builderIds).size).toBe(3);
    expect(builderIds).toContain('bld_node_alpha_us');
    expect(builderIds).toContain('bld_node_beta_eu');
    expect(builderIds).toContain('bld_node_gamma_apac');

    // With ?all=true, returns full historical verification evaluations
    const allVerifRes = await request(app).get(`/api/releases/${releaseId}/verification?all=true`).expect(200);
    expect(allVerifRes.body.data.length).toBeGreaterThan(3);
  });

  // TEST 17: Source resolution includes avatar URL and public visibility
  it('TEST 17: preserves ownerAvatarUrl and visibility in release data', async () => {
    const directSha = '4444444444444444444444444444444444444444';
    const createRes = await request(app)
      .post('/api/releases/from-source')
      .send({
        repositoryUrl: 'https://github.com/yashnanavare6/Food-Express-Website',
        ref: directSha,
        scenario: 'clean',
      })
      .expect(201);

    const releaseId = createRes.body.data.releaseId;
    expect(createRes.body.data.source.ownerAvatarUrl).toBeTruthy();
    expect(createRes.body.data.source.visibility).toBe('public');

    const getRes = await request(app).get(`/api/releases/${releaseId}`).expect(200);
    expect(getRes.body.data.ownerAvatarUrl).toBeTruthy();
    expect(getRes.body.data.visibility).toBe('public');
  });

  // TEST 18: In conflict scenario, Gamma attestation is cryptographically VALID despite artifact hash disagreement
  it('TEST 18: Gamma attestation verification status is VALID while artifact hash differs', async () => {
    const directSha = '5555555555555555555555555555555555555555';
    const createRes = await request(app)
      .post('/api/releases/from-source')
      .send({
        repositoryUrl: 'https://github.com/quorum-test/gamma-conflict',
        ref: directSha,
        scenario: 'conflict',
      })
      .expect(201);

    const releaseId = createRes.body.data.releaseId;
    const verifRes = await request(app).get(`/api/releases/${releaseId}/verification`).expect(200);
    const gammaVerif = verifRes.body.data.find((v: any) => v.builderId === 'bld_node_gamma_apac');

    expect(gammaVerif).toBeTruthy();
    expect(gammaVerif.status).toBe('VALID');
    expect(gammaVerif.signatureValid).toBe(true);
    expect(gammaVerif.commitMatch).toBe(true);

    // Quorum result shows 66.67% consensus with disagreement detected
    const quorumRes = await request(app).get(`/api/releases/${releaseId}/quorum`).expect(200);
    expect(quorumRes.body.data.status).toBe('FLAGGED');
    expect(quorumRes.body.data.disagreementDetected).toBe(true);
    expect(quorumRes.body.data.validAttestations).toBe(3);
    expect(quorumRes.body.data.dominantBuilderCount).toBe(2);
  });
});
