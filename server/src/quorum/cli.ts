import { initDatabase } from '../db/database.js';
import { ReleasesRepository } from '../db/repositories/releases.repository.js';
import { BuildersRepository } from '../db/repositories/builders.repository.js';
import { QuorumEngine } from './quorum-engine.js';

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
  const quorumEngine = new QuorumEngine(db);

  let releaseId = parseReleaseArg();

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
  console.log('QUORUM CONSENSUS EVALUATION');
  console.log('--------------------------------------------------');
  console.log(`Release: ${release.id}`);
  console.log(`Project: ${release.project_name} v${release.version}`);
  console.log(`Commit:  ${release.commit_sha}`);
  console.log('--------------------------------------------------\n');

  const result = await quorumEngine.evaluateReleaseQuorum(release.id);

  console.log(`Valid Builders:       ${result.validAttestations}`);
  console.log(`Invalid Attestations: ${result.invalidAttestations}`);
  console.log('');
  console.log('Artifact Consensus:');
  console.log('');

  if (result.hashGroups.length === 0) {
    console.log('  No valid artifact hashes recorded.\n');
  } else {
    for (const group of result.hashGroups) {
      console.log(`  Hash: ${group.artifactSha256}`);
      for (const bId of group.builderIds) {
        const b = buildersRepo.getBuilderById(bId);
        const name = b?.name ?? bId;
        console.log(`    - ${name} (${bId})`);
      }
      console.log(`    Votes:      ${group.count}`);
      console.log(`    Percentage: ${group.percentage.toFixed(2)}%`);
      console.log('');
    }
  }

  console.log('--------------------------------------------------');
  console.log(`Consensus:    ${result.consensusPercentage.toFixed(2)}%`);
  console.log(`Threshold:    ${result.threshold.toFixed(2)}%`);
  console.log(`Disagreement: ${result.disagreementDetected ? 'YES' : 'NO'}`);
  console.log(`Evidence:     ${result.sufficientEvidence ? 'SUFFICIENT' : 'INSUFFICIENT'}`);
  console.log('');
  console.log(`FINAL STATUS: ${result.status}`);
  console.log(`Explanation:  ${result.explanation}`);
  console.log('--------------------------------------------------\n');
}

main().catch((err) => {
  console.error('Quorum CLI failed:', err);
  process.exit(1);
});
