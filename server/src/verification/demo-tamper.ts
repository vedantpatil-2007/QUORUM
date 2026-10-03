import { initDatabase } from '../db/database.js';
import { runBuilderScenario } from '../builders/demo-scenarios.js';
import { AttestationsRepository } from '../db/repositories/attestations.repository.js';
import { VerificationEngine } from './verification-engine.js';
import { BuildersRepository } from '../db/repositories/builders.repository.js';

export async function runTamperedSignatureDemo(): Promise<void> {
  const db = initDatabase();
  const attestationsRepo = new AttestationsRepository(db);
  const buildersRepo = new BuildersRepository(db);
  const engine = new VerificationEngine(db);

  console.log('\n--------------------------------------------------');
  console.log('DEMO: TAMPERED ATTESTATION SIGNATURE DETECTION');
  console.log('--------------------------------------------------');

  // 1. Generate clean release with 3 honest builder attestations
  const scenario = await runBuilderScenario({
    scenario: 'clean',
    db,
    releaseIdPrefix: 'rel_demo_tamper_sig',
  });

  console.log(`Created baseline clean release: ${scenario.releaseId}`);

  // 2. Locate Gamma's attestation and tamper with its signature in the database
  const gammaAtt = attestationsRepo.getAttestationByBuilderAndRelease(
    'bld_node_gamma_apac',
    scenario.releaseId
  );

  if (!gammaAtt) {
    throw new Error('Failed to locate Builder Gamma attestation.');
  }

  const rawSig = Buffer.from(gammaAtt.signature, 'base64');
  rawSig[0] = rawSig[0]! ^ 0xff; // Invert first byte
  const corruptedSig = rawSig.toString('base64');

  db.prepare('UPDATE attestations SET signature = ? WHERE id = ?').run(
    corruptedSig,
    gammaAtt.id
  );

  console.log(`[ATTACK SIMULATION] Inverted signature bytes for Builder Gamma (${gammaAtt.id})`);
  console.log('Running Verification Engine on release attestations...\n');

  // 3. Run Verification Engine
  const results = await engine.verifyReleaseAttestations(scenario.releaseId);

  for (const res of results) {
    const builder = buildersRepo.getBuilderById(res.builderId);
    const builderName = builder?.name ?? res.builderId;

    console.log(`Builder: ${builderName}`);
    console.log(`  Signature: ${res.signatureValid ? 'VALID' : 'INVALID'}`);
    console.log(`  Commit:    ${res.commitMatch ? 'MATCH' : 'MISMATCH'}`);
    console.log(`  Builder:   ${res.builderActive ? 'ACTIVE' : 'INACTIVE'}`);
    console.log(`  Artifact:  ${res.artifactExists ? 'EXISTS' : 'MISSING'}`);
    console.log(`  SHA-256:   ${res.artifactHashMatches ? 'MATCH' : 'MISMATCH'}`);
    console.log(`  Result:    ATTESTATION ${res.status}`);

    if (res.errors.length > 0) {
      console.log('  Errors:');
      for (const err of res.errors) {
        console.log(`    - ${err}`);
      }
    }
    console.log('');
  }

  console.log('--------------------------------------------------');
  const validCount = results.filter((r) => r.status === 'VALID').length;
  const invalidCount = results.filter((r) => r.status === 'INVALID').length;
  console.log(`Total Attestations:   ${results.length}`);
  console.log(`  Valid Attestations:   ${validCount}`);
  console.log(`  Invalid Attestations: ${invalidCount}`);
  console.log('--------------------------------------------------\n');
}

runTamperedSignatureDemo().catch((err) => {
  console.error('Tampered signature demo failed:', err);
  process.exit(1);
});
