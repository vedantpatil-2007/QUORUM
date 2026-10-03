import { initDatabase } from './database.js';
import { runBuilderScenario } from '../builders/demo-scenarios.js';
import { VerificationEngine } from '../verification/verification-engine.js';
import { QuorumEngine } from '../quorum/quorum-engine.js';
import { DEFAULT_ARTIFACTS_DIR } from '../builders/artifact-builder.js';

export async function seedDemoDatabase(): Promise<void> {
  console.log('\n==================================================');
  console.log('SEEDING QUORUM DEMO SCENARIOS');
  console.log('==================================================\n');

  const db = initDatabase();
  const vEngine = new VerificationEngine(db, DEFAULT_ARTIFACTS_DIR);
  const qEngine = new QuorumEngine(db, DEFAULT_ARTIFACTS_DIR);

  // 1. Clean Scenario -> VERIFIED
  console.log('1. Executing Clean Scenario (3 honest builders, identical hashes)...');
  const clean = await runBuilderScenario({
    scenario: 'clean',
    db,
    artifactsDir: DEFAULT_ARTIFACTS_DIR,
    releaseIdPrefix: 'rel_clean',
  });
  await vEngine.verifyReleaseAttestations(clean.releaseId);
  const qClean = await qEngine.evaluateReleaseQuorum(clean.releaseId);
  console.log(`   -> Release ${clean.releaseId}: Status = ${qClean.status}, Consensus = ${qClean.consensusPercentage}%\n`);

  // 2. Conflict Scenario -> FLAGGED
  console.log('2. Executing Conflicted Scenario (2-of-3 honest, Gamma divergent)...');
  const conflict = await runBuilderScenario({
    scenario: 'conflict',
    db,
    artifactsDir: DEFAULT_ARTIFACTS_DIR,
    releaseIdPrefix: 'rel_conflict',
  });
  await vEngine.verifyReleaseAttestations(conflict.releaseId);
  const qConflict = await qEngine.evaluateReleaseQuorum(conflict.releaseId);
  console.log(`   -> Release ${conflict.releaseId}: Status = ${qConflict.status}, Consensus = ${qConflict.consensusPercentage}%\n`);

  // 3. No-Consensus Scenario -> REJECTED
  console.log('3. Executing No-Consensus Scenario (3 divergent hashes)...');
  const noConsensus = await runBuilderScenario({
    scenario: 'no-consensus',
    db,
    artifactsDir: DEFAULT_ARTIFACTS_DIR,
    releaseIdPrefix: 'rel_no_consensus',
  });
  await vEngine.verifyReleaseAttestations(noConsensus.releaseId);
  const qNoConsensus = await qEngine.evaluateReleaseQuorum(noConsensus.releaseId);
  console.log(`   -> Release ${noConsensus.releaseId}: Status = ${qNoConsensus.status}, Consensus = ${qNoConsensus.consensusPercentage}%\n`);

  // 4. Insufficient Evidence Scenario -> INSUFFICIENT_EVIDENCE
  console.log('4. Executing Insufficient Evidence Scenario (< 3 builders)...');
  const insufficient = await runBuilderScenario({
    scenario: 'insufficient',
    db,
    artifactsDir: DEFAULT_ARTIFACTS_DIR,
    releaseIdPrefix: 'rel_insufficient',
  });
  await vEngine.verifyReleaseAttestations(insufficient.releaseId);
  const qInsufficient = await qEngine.evaluateReleaseQuorum(insufficient.releaseId);
  console.log(`   -> Release ${insufficient.releaseId}: Status = ${qInsufficient.status}, Consensus = ${qInsufficient.consensusPercentage}%\n`);

  console.log('==================================================');
  console.log('DEMO SEEDING COMPLETED SUCCESSFULLY');
  console.log('==================================================\n');
}

seedDemoDatabase().catch((err) => {
  console.error('Demo seeding failed:', err);
  process.exit(1);
});
