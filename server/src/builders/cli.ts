import { initDatabase } from '../db/database.js';
import { runBuilderScenario, ScenarioType } from './demo-scenarios.js';

function parseScenarioArg(): ScenarioType {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--scenario=')) {
      const val = arg.split('=')[1]?.toLowerCase().trim();
      if (val === 'clean' || val === 'conflict' || val === 'no-consensus' || val === 'insufficient') {
        return val;
      }
    }
    const cleanArg = arg.replace(/^--?/, '').toLowerCase().trim();
    if (cleanArg === 'clean' || cleanArg === 'conflict' || cleanArg === 'no-consensus' || cleanArg === 'insufficient') {
      return cleanArg;
    }
  }
  return 'clean'; // Default
}

export async function main(): Promise<void> {
  const scenario = parseScenarioArg();

  console.log('\n--------------------------------------------------');
  console.log('QUORUM BUILDER SIMULATION');
  console.log(`Scenario Mode: ${scenario.toUpperCase()}`);
  console.log('--------------------------------------------------');

  const db = initDatabase();

  const result = await runBuilderScenario({
    scenario,
    db,
  });

  console.log('Release:');
  console.log(`  Project: ${result.projectName}`);
  console.log(`  Version: ${result.version}`);
  console.log(`  Commit:  ${result.commitSha}`);
  console.log(`  Release ID: ${result.releaseId}`);
  console.log('');

  for (const b of result.builderOutputs) {
    console.log(`Builder: ${b.builderName}`);
    console.log(`  ID:          ${b.builderId}`);
    console.log(`  Environment: ${b.environment}`);
    console.log(`  Artifact:    ${b.artifactName} (${b.artifactSizeBytes} bytes)`);
    console.log(`  SHA-256:     ${b.artifactSha256}`);
    console.log(
      `  Signature:   ${b.signatureValid ? 'VALIDLY GENERATED' : 'INVALID'}`
    );
    if (b.compromised) {
      console.log(`  [NOTE]       *INTENTIONALLY COMPROMISED NODE (Backdoor Injected)*`);
    }
    console.log('');
  }

  console.log('--------------------------------------------------');
  console.log(`Distinct Artifact Hashes Produced: ${result.distinctHashes.length}`);
  for (let i = 0; i < result.distinctHashes.length; i++) {
    const hash = result.distinctHashes[i];
    const buildersWithHash = result.builderOutputs
      .filter((b) => b.artifactSha256 === hash)
      .map((b) => b.builderName)
      .join(', ');
    console.log(`  [Hash ${i + 1}] ${hash}`);
    console.log(`          Builders: ${buildersWithHash}`);
  }
  console.log('--------------------------------------------------\n');
}

main().catch((err) => {
  console.error('Builder simulation failed:', err);
  process.exit(1);
});
