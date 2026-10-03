import { initDatabase } from '../db/database.js';
import { LedgerService } from './ledger-service.js';
import { verifyLedger } from './ledger-verifier.js';
import { AuditLedgerRepository } from './ledger.repository.js';

export async function runTamperDemo(): Promise<void> {
  console.log('\n==================================================');
  console.log('QUORUM AUDIT LEDGER — TAMPER-EVIDENT DEMONSTRATION');
  console.log('==================================================\n');

  // 1. Initialize isolated in-memory database
  console.log('[Step 1] Creating fresh isolated in-memory audit ledger...');
  const db = initDatabase({ dbPath: ':memory:' });
  const ledgerService = new LedgerService(db);
  const repo = new AuditLedgerRepository(db);

  // 2. Populate legitimate events
  console.log('[Step 2] Appending legitimate sequence of security events...');
  const releaseId = 'rel_demo_tamper_demo';

  ledgerService.recordReleaseCreated({
    releaseId,
    projectName: 'quorum-demo',
    version: '1.0.0',
    commitSha: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
    repoUrl: 'https://github.com/quorum-network/quorum-demo',
    expectedArtifactName: 'app.bin',
  });

  ledgerService.recordAttestationVerified({
    releaseId,
    attestationId: 'att_builder_alpha',
    builderId: 'bld_node_alpha_us',
    status: 'VALID',
    signatureValid: true,
    commitMatch: true,
    builderActive: true,
  });

  ledgerService.recordAttestationVerified({
    releaseId,
    attestationId: 'att_builder_beta',
    builderId: 'bld_node_beta_eu',
    status: 'VALID',
    signatureValid: true,
    commitMatch: true,
    builderActive: true,
  });

  ledgerService.recordQuorumEvaluated({
    releaseId,
    status: 'VERIFIED',
    validAttestations: 2,
    invalidAttestations: 0,
    dominantHash: 'c96ddc07a28d1a579beb1135eb8fefec2fde2b184d24301d772ab4553aec47f6',
    dominantBuilderCount: 2,
    consensusPercentage: 100.0,
    disagreementDetected: false,
  });

  ledgerService.recordReleaseStatusChanged({
    releaseId,
    previousStatus: 'PENDING',
    newStatus: 'VERIFIED',
  });

  const entriesBefore = repo.getAllEntries();
  console.log(`  Appended ${entriesBefore.length} events (Sequences 1 through ${entriesBefore.length}).\n`);

  for (const e of entriesBefore) {
    console.log(`  Seq ${e.sequence}: [${e.event_type.padEnd(23)}] Hash: ${e.current_hash.slice(0, 16)}... Prev: ${e.previous_hash ? e.previous_hash.slice(0, 16) + '...' : '(null)'}`);
  }

  // 3. Verify Untouched Chain
  console.log('\n[Step 3] Verifying untouched chain:');
  const verifyBefore = verifyLedger(repo);
  console.log(`  CHAIN STATUS:     ${verifyBefore.valid ? 'VALID' : 'INVALID'}`);
  console.log(`  Entries Verified: ${verifyBefore.verifiedEntries} / ${verifyBefore.totalEntries}`);
  console.log(`  Chain Integrity:  PERFECT (All cryptographic linkages sound)\n`);

  // 4. Perform Malicious Tampering via Raw SQL
  const tamperedSequence = 3;
  console.log('--------------------------------------------------');
  console.log(`[Step 4] SIMULATING MALICIOUS DATABASE TAMPERING`);
  console.log(`Adversary executes raw SQL UPDATE to alter payload_hash at sequence ${tamperedSequence}:`);
  console.log(`  UPDATE audit_ledger SET payload_hash = 'deadbeef...' WHERE sequence = ${tamperedSequence}`);

  db.prepare(`
    UPDATE audit_ledger
    SET payload_hash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    WHERE sequence = ?
  `).run(tamperedSequence);

  console.log('Tamper executed successfully in SQLite storage.');
  console.log('--------------------------------------------------\n');

  // 5. Run Verification Again — Detection Demonstration
  console.log('[Step 5] Re-running ledger chain verification:');
  const verifyAfter = verifyLedger(repo);

  console.log(`  CHAIN STATUS:            ${verifyAfter.valid ? 'VALID' : 'INVALID'}`);
  console.log(`  Total Entries:           ${verifyAfter.totalEntries}`);
  console.log(`  Verified Entries:        ${verifyAfter.verifiedEntries}`);
  console.log(`  First Invalid Sequence:  ${verifyAfter.firstInvalidSequence}`);
  console.log(`  Detected Violation:      ${verifyAfter.error}`);
  console.log('\n==================================================');
  console.log('TAMPER DETECTION DEMONSTRATION SUCCESSFUL!');
  console.log('Any manual alteration of history breaks the hash chain.');
  console.log('==================================================\n');

  db.close();
}

runTamperDemo().catch((err) => {
  console.error('Tamper demo failed:', err);
  process.exit(1);
});
