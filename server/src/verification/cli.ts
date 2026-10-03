import { initDatabase } from '../db/database.js';
import { ReleasesRepository } from '../db/repositories/releases.repository.js';
import { BuildersRepository } from '../db/repositories/builders.repository.js';
import { VerificationEngine } from './verification-engine.js';

function parseReleaseArg(): string | null {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--release=')) {
      return arg.split('=')[1]?.trim() ?? null;
    }
    if (!arg.startsWith('--')) {
      return arg.trim();
    }
  }
  return null;
}

export async function main(): Promise<void> {
  const db = initDatabase();
  const releasesRepo = new ReleasesRepository(db);
  const buildersRepo = new BuildersRepository(db);
  const engine = new VerificationEngine(db);

  let releaseId = parseReleaseArg();

  // If no release specified, find the most recently created release in the database
  if (!releaseId) {
    const allReleases = releasesRepo.getAllReleases();
    if (allReleases.length === 0) {
      console.error('\n[Error] No releases found in database. Run "npm run demo:builders" first.');
      process.exit(1);
    }
    releaseId = allReleases[0]!.id;
  }

  const release = releasesRepo.getReleaseById(releaseId);
  if (!release) {
    console.error(`\n[Error] Release "${releaseId}" not found in database.`);
    process.exit(1);
  }

  console.log('\n--------------------------------------------------');
  console.log('QUORUM ATTESTATION VERIFICATION');
  console.log('--------------------------------------------------');
  console.log('Release:');
  console.log(`  ID:      ${release.id}`);
  console.log(`  Project: ${release.project_name} v${release.version}`);
  console.log(`  Commit:  ${release.commit_sha}`);
  console.log('--------------------------------------------------\n');

  const results = await engine.verifyReleaseAttestations(release.id);

  if (results.length === 0) {
    console.log('No attestations found for this release.\n');
    return;
  }

  for (const res of results) {
    const builder = buildersRepo.getBuilderById(res.builderId);
    const builderName = builder?.name ?? res.builderId;

    console.log(`Builder: ${builderName}`);
    console.log(`  ID:        ${res.builderId}`);
    console.log(`  Signature: ${res.signatureValid ? 'VALID' : 'INVALID'}`);
    console.log(`  Commit:    ${res.commitMatch ? 'MATCH' : 'MISMATCH'}`);
    console.log(`  Builder:   ${res.builderActive ? 'ACTIVE' : 'INACTIVE / REVOKED'}`);
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
  console.log(`Total Attestations Verified: ${results.length}`);
  const validCount = results.filter((r) => r.status === 'VALID').length;
  const invalidCount = results.filter((r) => r.status === 'INVALID').length;
  console.log(`  Valid Attestations:   ${validCount}`);
  console.log(`  Invalid Attestations: ${invalidCount}`);
  console.log('--------------------------------------------------\n');
}

main().catch((err) => {
  console.error('Verification CLI failed:', err);
  process.exit(1);
});
