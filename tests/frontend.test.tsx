import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Components
import { StatusBadge } from '../client/src/components/StatusBadge.js';
import { ConsensusBadge } from '../client/src/components/ConsensusBadge.js';
import { BuilderStatusBadge } from '../client/src/components/BuilderStatusBadge.js';
import { LedgerStatusBadge } from '../client/src/components/LedgerStatusBadge.js';
import { LoadingState } from '../client/src/components/LoadingState.js';
import { ErrorState } from '../client/src/components/ErrorState.js';
import { HashConsensusBar } from '../client/src/components/HashConsensusBar.js';
import { BuilderMatrix } from '../client/src/components/BuilderMatrix.js';
import { SecurityTimeline } from '../client/src/components/SecurityTimeline.js';
import { LedgerTamperAlert } from '../client/src/components/LedgerTamperAlert.js';
import { Navbar } from '../client/src/components/Navbar.js';
import { VerifyRepositoryModal } from '../client/src/components/VerifyRepositoryModal.js';

// Pages
import { DashboardPage } from '../client/src/pages/DashboardPage.js';
import { ReleasesPage } from '../client/src/pages/ReleasesPage.js';
import { ReleaseDetailPage } from '../client/src/pages/ReleaseDetailPage.js';
import { BuildersPage } from '../client/src/pages/BuildersPage.js';
import { AuditLedgerPage } from '../client/src/pages/AuditLedgerPage.js';

// Types
import {
  ReleaseDto,
  BuilderDto,
  VerificationResultDto,
  QuorumResultDto,
  LedgerEntryDto,
  LedgerVerifyDto,
} from '../client/src/types/api.types.js';

// Mock fixtures
const mockBuilders: BuilderDto[] = [
  {
    id: 'bld_node_alpha_us',
    name: 'Builder Alpha (US-East)',
    publicKey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...ALPHA\n-----END PUBLIC KEY-----\n',
    keyType: 'ed25519',
    operatorIdentity: 'Independent Operator US',
    status: 'ACTIVE',
    registeredAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'bld_node_beta_eu',
    name: 'Builder Beta (EU-West)',
    publicKey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...BETA\n-----END PUBLIC KEY-----\n',
    keyType: 'ed25519',
    operatorIdentity: 'Independent Operator EU',
    status: 'ACTIVE',
    registeredAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'bld_node_gamma_apac',
    name: 'Builder Gamma (APAC)',
    publicKey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...GAMMA\n-----END PUBLIC KEY-----\n',
    keyType: 'ed25519',
    operatorIdentity: 'Independent Operator APAC',
    status: 'ACTIVE',
    registeredAt: '2026-10-01T00:00:00.000Z',
  },
];

const mockReleases: ReleaseDto[] = [
  {
    releaseId: 'rel_clean_demo',
    project: 'quorum-demo',
    version: '1.0.0',
    repoUrl: 'https://github.com/quorum/demo',
    commitSha: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
    expectedArtifactName: 'app.bin',
    status: 'VERIFIED',
    createdAt: '2026-10-02T10:00:00.000Z',
  },
  {
    releaseId: 'rel_conflict_demo',
    project: 'quorum-demo',
    version: '1.0.1',
    repoUrl: 'https://github.com/quorum/demo',
    commitSha: 'e970460b4b4aece5915caf5c68d12f560a9fe3e4',
    expectedArtifactName: 'app.bin',
    status: 'FLAGGED',
    createdAt: '2026-10-02T11:00:00.000Z',
  },
];

const mockLedgerVerifyValid: LedgerVerifyDto = {
  valid: true,
  totalEntries: 18,
  verifiedEntries: 18,
  firstInvalidSequence: null,
  error: null,
  verifiedAt: '2026-10-03T12:00:00.000Z',
};

const mockLedgerVerifyBroken: LedgerVerifyDto = {
  valid: false,
  totalEntries: 18,
  verifiedEntries: 4,
  firstInvalidSequence: 5,
  error: 'Payload hash mismatch at sequence 5',
  verifiedAt: '2026-10-03T12:00:00.000Z',
};

const mockLedgerEntries: LedgerEntryDto[] = [
  {
    id: 'led_1',
    sequence: 1,
    timestamp: '2026-10-02T10:00:00.000Z',
    event_type: 'RELEASE_CREATED',
    release_id: 'rel_clean_demo',
    payload_hash: '1111111111111111111111111111111111111111111111111111111111111111',
    previous_hash: null, // Genesis entry has null previous_hash
    current_hash: '2222222222222222222222222222222222222222222222222222222222222222',
    payload_json: JSON.stringify({ projectName: 'quorum-demo', version: '1.0.0' }),
    created_at: '2026-10-02T10:00:00.000Z',
  },
  {
    id: 'led_2',
    sequence: 2,
    timestamp: '2026-10-02T10:05:00.000Z',
    event_type: 'ATTESTATION_VERIFIED',
    release_id: 'rel_clean_demo',
    payload_hash: '3333333333333333333333333333333333333333333333333333333333333333',
    previous_hash: '2222222222222222222222222222222222222222222222222222222222222222',
    current_hash: '4444444444444444444444444444444444444444444444444444444444444444',
    payload_json: JSON.stringify({ builderId: 'bld_node_alpha_us', status: 'VALID' }),
    created_at: '2026-10-02T10:05:00.000Z',
  },
];

describe('Quorum Security Dashboard UI (Phase 9)', () => {
  // TEST 1: Dashboard renders
  it('TEST 1: Dashboard renders core structure and security principle', () => {
    const html = renderToString(
      <DashboardPage
        releases={mockReleases}
        builders={mockBuilders}
        ledgerVerify={mockLedgerVerifyValid}
        ledgerEntries={mockLedgerEntries}
        onNavigate={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(html).toContain('Quorum Security Dashboard');
    expect(html).toContain(
      'Quorum does not trust a binary because one builder signed it. It compares independently produced artifacts.'
    );
    expect(html).toContain('Security Overview');
    expect(html).toContain('Tracked Software Releases');
  });

  // TEST 2: API loading state renders
  it('TEST 2: API loading state renders with spinner and message', () => {
    const html = renderToString(<LoadingState message="Fetching consensus..." />);
    expect(html).toContain('Fetching consensus...');
    expect(html).toContain('role="status"');
  });

  // TEST 3: API error state renders
  it('TEST 3: API error state renders with alert role and message', () => {
    const html = renderToString(
      <ErrorState
        title="Quorum API Unavailable"
        message="Unable to connect to Quorum API"
        onRetry={vi.fn()}
      />
    );
    expect(html).toContain('Quorum API Unavailable');
    expect(html).toContain('Unable to connect to Quorum API');
    expect(html).toContain('role="alert"');
  });

  // TEST 4: VERIFIED badge renders correctly
  it('TEST 4: VERIFIED badge renders correctly with label and accessible text', () => {
    const html = renderToString(<StatusBadge status="VERIFIED" />);
    expect(html).toContain('VERIFIED');
    expect(html).toContain('text-emerald-400');
  });

  // TEST 5: FLAGGED badge renders correctly
  it('TEST 5: FLAGGED badge renders correctly with label and accessible text', () => {
    const html = renderToString(<StatusBadge status="FLAGGED" />);
    expect(html).toContain('FLAGGED');
    expect(html).toContain('text-amber-400');
  });

  // TEST 6: REJECTED badge renders correctly
  it('TEST 6: REJECTED badge renders correctly with label and accessible text', () => {
    const html = renderToString(<StatusBadge status="REJECTED" />);
    expect(html).toContain('REJECTED');
    expect(html).toContain('text-rose-400');
  });

  // TEST 7: INSUFFICIENT_EVIDENCE badge renders correctly
  it('TEST 7: INSUFFICIENT_EVIDENCE badge renders correctly with label and text', () => {
    const html = renderToString(<StatusBadge status="INSUFFICIENT_EVIDENCE" />);
    expect(html).toContain('INSUFFICIENT EVIDENCE');
  });

  // TEST 8: Release details display builder verification
  it('TEST 8: Release details display builder verification matrix table', () => {
    const mockVerifications: VerificationResultDto[] = [
      {
        id: 'vr_1',
        attestationId: 'att_1',
        builderId: 'bld_node_alpha_us',
        signatureValid: true,
        commitMatch: true,
        builderActive: true,
        status: 'VALID',
        notes: null,
        verifiedAt: new Date().toISOString(),
      },
    ];

    const html = renderToString(
      <BuilderMatrix
        verifications={mockVerifications}
        builders={mockBuilders}
        dominantHash="hash_1"
        releaseStatus="VERIFIED"
      />
    );

    expect(html).toContain('Builder Alpha (US-East)');
    expect(html).toContain('VALID (Ed25519)');
    expect(html).toContain('MATCH');
  });

  // TEST 9: Conflict release displays dissenting builder and critical distinction
  it('TEST 9: Conflict release displays dissenting builder and security distinction', () => {
    const mockVerificationsConflict: VerificationResultDto[] = [
      {
        id: 'vr_gamma',
        attestationId: 'att_gamma',
        builderId: 'bld_node_gamma_apac',
        signatureValid: true,
        commitMatch: true,
        builderActive: true,
        status: 'VALID',
        notes: null,
        verifiedAt: new Date().toISOString(),
      },
    ];

    const html = renderToString(
      <BuilderMatrix
        verifications={mockVerificationsConflict}
        builders={mockBuilders}
        dominantHash="hash_majority"
        releaseStatus="FLAGGED"
      />
    );

    // Shows Gamma produced valid attestation, but different hash
    expect(html).toContain('DIFFERENT HASH');
    expect(html).toContain('CRITICAL DISTINCTION: Cryptographic Validity ≠ Release Consensus');
    expect(html).toContain('validly signed Ed25519 attestation');
  });

  // TEST 10: Hash groups display percentages
  it('TEST 10: Hash groups display percentages and dominant/dissenting tags', () => {
    const mockGroups = [
      {
        artifactSha256: 'c96ddc07a28d1a579beb1135eb8fefec2fde2b184d24301d772ab4553aec47f6',
        builderIds: ['bld_node_alpha_us', 'bld_node_beta_eu'],
        count: 2,
        percentage: 66.67,
      },
      {
        artifactSha256: '0bc4ebf22bb02dfe94b987ae5148014dc9db3e63bc4c19b0a1e39a087c552bfb',
        builderIds: ['bld_node_gamma_apac'],
        count: 1,
        percentage: 33.33,
      },
    ];

    const html = renderToString(
      <HashConsensusBar
        hashGroups={mockGroups}
        dominantHash="c96ddc07a28d1a579beb1135eb8fefec2fde2b184d24301d772ab4553aec47f6"
        threshold={66.67}
      />
    );

    expect(html).toContain('DOMINANT HASH');
    expect(html).toContain('DISSENTING HASH');
    expect(html).toContain('66.67%');
    expect(html).toContain('33.33%');
  });

  // TEST 11: Audit ledger displays valid state
  it('TEST 11: Audit ledger displays valid intact state and chain entries', () => {
    const html = renderToString(
      <AuditLedgerPage
        entries={mockLedgerEntries}
        ledgerVerify={mockLedgerVerifyValid}
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    expect(html).toContain('Tamper-Evident Audit Ledger');
    expect(html).toContain('CHAIN INTACT');
    expect(html).toContain('#1');
    expect(html).toContain('RELEASE_CREATED');
    expect(html).toContain('GENESIS (null)');
    expect(html).toContain('#2');
    expect(html).toContain('ATTESTATION_VERIFIED');
  });

  // TEST 12: Ledger integrity failure displays warning
  it('TEST 12: Ledger integrity failure displays prominent alert with broken sequence', () => {
    const html = renderToString(<LedgerTamperAlert verification={mockLedgerVerifyBroken} />);
    expect(html).toContain('LEDGER INTEGRITY FAILURE');
    expect(html).toContain('#5');
    expect(html).toContain('Payload hash mismatch at sequence 5');
  });

  // TEST 13: Builder list renders
  it('TEST 13: Builder list renders registered nodes and public key fingerprints', () => {
    const html = renderToString(<BuildersPage builders={mockBuilders} />);
    expect(html).toContain('Registered Builder Nodes');
    expect(html).toContain('Builder Alpha (US-East)');
    expect(html).toContain('Builder Beta (EU-West)');
    expect(html).toContain('Builder Gamma (APAC)');
  });

  // TEST 14: Release list renders
  it('TEST 14: Release list renders tracked releases with versions and commits', () => {
    const html = renderToString(<ReleasesPage releases={mockReleases} onNavigate={vi.fn()} />);
    expect(html).toContain('Tracked Releases');
    expect(html).toContain('rel_clean_demo');
    expect(html).toContain('rel_conflict_demo');
    expect(html).toContain('1.0.0');
    expect(html).toContain('1.0.1');
  });

  // TEST 15: Refresh action triggers and Navbar renders system status
  it('TEST 15: Navbar renders system status indicators and refresh button', () => {
    const onRefreshMock = vi.fn();
    const html = renderToString(
      <Navbar
        currentPath="/dashboard"
        onNavigate={vi.fn()}
        onRefresh={onRefreshMock}
        isRefreshing={false}
        health={{ status: 'ok', service: 'quorum-api', version: '1.0.0', timestamp: '' }}
        ledgerStatus={mockLedgerVerifyValid}
      />
    );

    expect(html).toContain('QUORUM');
    expect(html).toContain('API: ONLINE');
    expect(html).toContain('LEDGER: VALID');
  });

  // TEST 16: ConsensusBadge renders percentage
  it('TEST 16: ConsensusBadge formats percentage accurately', () => {
    const html100 = renderToString(<ConsensusBadge percentage={100} />);
    expect(html100).toContain('100%');

    const html66 = renderToString(<ConsensusBadge percentage={66.6666} />);
    expect(html66).toContain('66.67%');
  });

  // TEST 17: SecurityTimeline renders chronological audit sequence
  it('TEST 17: SecurityTimeline renders chronological audit sequence', () => {
    const html = renderToString(<SecurityTimeline entries={mockLedgerEntries} />);
    expect(html).toContain('RELEASE_CREATED');
    expect(html).toContain('Seq #1');
  });

  // TEST 18: Builders page displays Ed25519 signing key terminology
  it('TEST 18: Builders page displays Ed25519 signing key terminology', () => {
    const html = renderToString(<BuildersPage builders={mockBuilders} />);
    expect(html).toContain('ED25519');
    expect(html).not.toContain('Curve25519');
  });

  // TEST 19 (Prompt TEST 16): Audit Ledger renders when previousHash is null (Genesis block)
  it('TEST 19: Audit Ledger renders cleanly when previous_hash is null (Genesis block)', () => {
    const genesisEntry: LedgerEntryDto = {
      id: 'led_1',
      sequence: 1,
      timestamp: '2026-10-01T00:00:00.000Z',
      event_type: 'RELEASE_CREATED',
      release_id: 'rel_test',
      payload_hash: '1111111111111111111111111111111111111111111111111111111111111111',
      previous_hash: null,
      current_hash: '2222222222222222222222222222222222222222222222222222222222222222',
      payload_json: '{"releaseId":"rel_test"}',
      created_at: '2026-10-01T00:00:00.000Z',
    };
    const html = renderToString(
      <AuditLedgerPage
        entries={[genesisEntry]}
        ledgerVerify={mockLedgerVerifyValid}
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
      />
    );
    expect(html).toContain('GENESIS (null)');
    expect(html).toContain('#1');
    expect(html).toContain('RELEASE_CREATED');
  });

  // TEST 20 (Prompt TEST 17): Audit Ledger renders when release_id is null
  it('TEST 20: Audit Ledger renders safely when release_id is null', () => {
    const nullReleaseEntry: LedgerEntryDto = {
      id: 'led_system_event',
      sequence: 2,
      timestamp: '2026-10-01T01:00:00.000Z',
      event_type: 'SYSTEM_CONFIG_UPDATED',
      release_id: null,
      payload_hash: '3333333333333333333333333333333333333333333333333333333333333333',
      previous_hash: '2222222222222222222222222222222222222222222222222222222222222222',
      current_hash: '4444444444444444444444444444444444444444444444444444444444444444',
      payload_json: null,
      created_at: '2026-10-01T01:00:00.000Z',
    };
    const html = renderToString(
      <AuditLedgerPage
        entries={[nullReleaseEntry]}
        ledgerVerify={mockLedgerVerifyValid}
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
      />
    );
    expect(html).toContain('SYSTEM_CONFIG_UPDATED');
    expect(html).toContain('—'); // safely renders em-dash for null release_id
  });

  // TEST 21 (Prompt TEST 18): Audit Ledger renders when optional fields are null or undefined
  it('TEST 21: Audit Ledger renders safely when optional fields are null or undefined', () => {
    const sparseEntry = {
      id: 'led_sparse',
      sequence: 3,
      timestamp: '2026-10-01T02:00:00.000Z',
      event_type: 'ATTESTATION_VERIFIED',
      release_id: null,
      payload_hash: '5555555555555555555555555555555555555555555555555555555555555555',
      previous_hash: null,
      current_hash: null as unknown as string,
      payload_json: null,
      created_at: '2026-10-01T02:00:00.000Z',
    } as unknown as LedgerEntryDto;

    expect(() => {
      renderToString(
        <AuditLedgerPage
          entries={[sparseEntry]}
          ledgerVerify={null}
          onRefresh={vi.fn()}
          onNavigate={vi.fn()}
        />
      );
    }).not.toThrow();
  });

  // TEST 22 (Prompt TEST 19): Audit Ledger never calls .slice() on null
  it('TEST 22: Audit Ledger never calls .slice() on null or empty hash fields', () => {
    const corruptedEntry = {
      sequence: 4,
      event_type: 'TAMPER_TEST',
      release_id: undefined,
      previous_hash: null,
      current_hash: null,
      timestamp: '2026-10-01T03:00:00.000Z',
    } as unknown as LedgerEntryDto;

    const html = renderToString(
      <AuditLedgerPage
        entries={[corruptedEntry]}
        ledgerVerify={null}
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
      />
    );
    expect(html).toContain('GENESIS (null)');
    expect(html).toContain('—');
  });

  // TEST 23 (Prompt TEST 20): Audit Ledger valid state displays correctly
  it('TEST 23: Audit Ledger valid state displays intact indicators and verified counts', () => {
    const html = renderToString(
      <AuditLedgerPage
        entries={mockLedgerEntries}
        ledgerVerify={mockLedgerVerifyValid}
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
      />
    );
    expect(html).toContain('Chain intact');
    expect(html).toContain('Genesis to tip unbroken');
    expect(html).toContain('18');
  });

  // TEST 24 (Prompt TEST 21): Audit Ledger invalid state displays warning
  it('TEST 24: Audit Ledger invalid state displays tamper warning banner', () => {
    const html = renderToString(
      <AuditLedgerPage
        entries={mockLedgerEntries}
        ledgerVerify={mockLedgerVerifyBroken}
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
      />
    );
    expect(html).toContain('TAMPERED');
    expect(html).toContain('First Invalid Sequence');
    expect(html).toContain('#5');
  });

  // TEST 25: VerifyRepositoryModal displays disclosure notice and input controls
  it('TEST 25: VerifyRepositoryModal displays deterministic builder simulation disclosure notice', () => {
    const html = renderToString(
      <VerifyRepositoryModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(html).toContain('VERIFY A REPOSITORY');
    expect(html).toContain('Source repository resolved. Builder verification uses');
    expect(html).toContain('deterministic builder simulation for this MVP.');
    expect(html).toContain('Source Repository URL');
    expect(html).toContain('Branch, Tag, or Commit SHA');
    expect(html).toContain('START VERIFICATION');
  });

  // TEST 26: DashboardPage renders VERIFY A REPOSITORY action card
  it('TEST 26: DashboardPage renders VERIFY A REPOSITORY card and START VERIFICATION button', () => {
    const html = renderToString(
      <DashboardPage
        releases={mockReleases}
        builders={mockBuilders}
        ledgerVerify={mockLedgerVerifyValid}
        ledgerEntries={mockLedgerEntries}
        onNavigate={vi.fn()}
        onRefresh={vi.fn()}
      />
    );
    expect(html).toContain('VERIFY A REPOSITORY');
    expect(html).toContain(
      'Verify a source repository against independently produced builder attestations.'
    );
    expect(html).toContain('START VERIFICATION');
  });

  // TEST 27: ReleasesPage renders Verify a Repository button and no upload ZIP button
  it('TEST 27: ReleasesPage renders Verify a Repository button', () => {
    const html = renderToString(
      <ReleasesPage
        releases={mockReleases}
        onNavigate={vi.fn()}
        onRefresh={vi.fn()}
      />
    );
    expect(html).toContain('Verify a Repository');
    expect(html).not.toContain('Upload Real Artifact');
  });

  // TEST 28: BuilderMatrix renders exactly 3 distinct builder nodes for Alpha, Beta, Gamma
  it('TEST 28: BuilderMatrix renders exactly 3 builder rows with operator identities and Ed25519 signatures', () => {
    const mockThreeVerifications: VerificationResultDto[] = [
      {
        id: 'vr_alpha',
        attestationId: 'att_alpha',
        builderId: 'bld_node_alpha_us',
        signatureValid: true,
        commitMatch: true,
        builderActive: true,
        status: 'VALID',
        notes: null,
        verifiedAt: new Date().toISOString(),
      },
      {
        id: 'vr_beta',
        attestationId: 'att_beta',
        builderId: 'bld_node_beta_eu',
        signatureValid: true,
        commitMatch: true,
        builderActive: true,
        status: 'VALID',
        notes: null,
        verifiedAt: new Date().toISOString(),
      },
      {
        id: 'vr_gamma',
        attestationId: 'att_gamma',
        builderId: 'bld_node_gamma_apac',
        signatureValid: true,
        commitMatch: true,
        builderActive: true,
        status: 'VALID',
        notes: null,
        verifiedAt: new Date().toISOString(),
      },
    ];

    const html = renderToString(
      <BuilderMatrix
        verifications={mockThreeVerifications}
        builders={mockBuilders}
        dominantHash="hash_majority"
        releaseStatus="VERIFIED"
      />
    );

    expect(html).toContain('Builder Alpha (US-East)');
    expect(html).toContain('Builder Beta (EU-West)');
    expect(html).toContain('Builder Gamma (APAC)');
    expect(html).toContain('Independent Operator US');
    expect(html).toContain('Independent Operator EU');
    expect(html).toContain('Independent Operator APAC');
  });

  // TEST 29: VerifyRepositoryModal includes preset for Food-Express-Website master
  it('TEST 29: VerifyRepositoryModal includes preset for Food-Express-Website and master branch', () => {
    const html = renderToString(
      <VerifyRepositoryModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(html).toContain('yashnanavare6/Food-Express-Website (master)');
    expect(html).toContain('octocat/Hello-World (master)');
    expect(html).toContain('deterministic builder simulation for this MVP.');
  });

  // TEST 30: AuditLedgerPage renders prominent LEDGER INTEGRITY VERIFIED banner
  it('TEST 30: AuditLedgerPage renders prominent LEDGER INTEGRITY VERIFIED banner when chain is intact', () => {
    const html = renderToString(
      <AuditLedgerPage
        entries={mockLedgerEntries}
        ledgerVerify={mockLedgerVerifyValid}
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
      />
    );
    expect(html).toContain('LEDGER INTEGRITY VERIFIED');
    expect(html).toContain('Chain intact');
    expect(html).toContain('All entries cryptographically verified');
    expect(html).toContain('Entries:');
    expect(html).toContain('18');
    expect(html).toContain('First invalid sequence:');
    expect(html).toContain('None');
    expect(html).toContain('Verify Ledger Integrity');
  });

  // TEST 31: AuditLedgerPage renders prominent LEDGER INTEGRITY FAILURE banner
  it('TEST 31: AuditLedgerPage renders prominent LEDGER INTEGRITY FAILURE banner when chain is tampered', () => {
    const html = renderToString(
      <AuditLedgerPage
        entries={mockLedgerEntries}
        ledgerVerify={mockLedgerVerifyBroken}
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
      />
    );
    expect(html).toContain('LEDGER INTEGRITY FAILURE');
    expect(html).toContain('Chain integrity violation detected');
    expect(html).toContain('First invalid sequence:');
    expect(html).toContain('#5');
  });
});
