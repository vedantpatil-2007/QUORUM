import { initDatabase } from '../db/database.js';
import { AuditLedgerRepository } from './ledger.repository.js';
import { verifyLedger } from './ledger-verifier.js';

export async function main(): Promise<void> {
  const db = initDatabase();
  const repo = new AuditLedgerRepository(db);
  const entries = repo.getAllEntries();

  console.log('\n--------------------------------------------------');
  console.log('QUORUM AUDIT LEDGER');
  console.log('--------------------------------------------------\n');

  console.log(`Entries: ${entries.length}\n`);

  for (const entry of entries) {
    console.log(`Sequence ${entry.sequence}`);
    console.log(`  Event:   ${entry.event_type}`);
    console.log(`  Release: ${entry.release_id ?? '(none)'}`);
    console.log(`  Hash:    ${entry.current_hash}`);
    console.log(`  Prev:    ${entry.previous_hash ?? '(genesis null)'}`);
    console.log(`  Time:    ${entry.timestamp}`);
    console.log('');
  }

  console.log('--------------------------------------------------');
  console.log('CHAIN VERIFICATION\n');

  const verification = verifyLedger(repo);

  console.log(`Status:           ${verification.valid ? 'VALID' : 'INVALID'}`);
  console.log(`Entries Verified: ${verification.verifiedEntries} / ${verification.totalEntries}`);

  if (!verification.valid) {
    console.log(`First Violation:  Sequence ${verification.firstInvalidSequence}`);
    console.log(`Error:            ${verification.error}`);
  }

  console.log('--------------------------------------------------\n');

  if (!verification.valid) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Ledger CLI failed:', err);
  process.exit(1);
});
