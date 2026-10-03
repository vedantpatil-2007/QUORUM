import { initDatabase, REQUIRED_TABLES } from './database.js';

/**
 * Development database inspection utility.
 * Inspects connection, pragmas, table structures, and row counts.
 */
export function inspectDatabase(): void {
  console.log('=== Quorum SQLite Database Inspector ===');
  const db = initDatabase();

  const fkPragma = db.pragma('foreign_keys', { simple: true });
  const journalPragma = db.pragma('journal_mode', { simple: true });

  console.log(`Connection: OK`);
  console.log(`PRAGMA foreign_keys: ${fkPragma === 1 ? 'ENABLED (1)' : 'DISABLED (0)'}`);
  console.log(`PRAGMA journal_mode: ${journalPragma}`);
  console.log('\n--- Tables & Row Counts ---');

  for (const table of REQUIRED_TABLES) {
    try {
      const countRow = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      console.log(`  • ${table.padEnd(25)} : ${countRow.count} rows`);
    } catch (err) {
      console.log(`  • ${table.padEnd(25)} : ERROR (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  console.log('\n--- Recent Quorum Evaluations ---');
  try {
    const quorumRows = db.prepare(
      `SELECT release_id, quorum_status, consensus_percentage, total_builders, agreeing_count, disagreeing_count, canonical_hash, decided_at 
       FROM quorum_results ORDER BY decided_at DESC LIMIT 5`
    ).all() as Array<{
      release_id: string;
      quorum_status: string;
      consensus_percentage: number;
      total_builders: number;
      agreeing_count: number;
      disagreeing_count: number;
      canonical_hash: string | null;
      decided_at: string;
    }>;

    if (quorumRows.length === 0) {
      console.log('  (No quorum evaluations yet)');
    } else {
      for (const row of quorumRows) {
        console.log(`  • [${row.quorum_status.padEnd(21)}] ${row.release_id}`);
        console.log(`    Consensus: ${row.consensus_percentage.toFixed(2)}% (${row.agreeing_count}/${row.total_builders} builders) | Dissenting: ${row.disagreeing_count}`);
        if (row.canonical_hash) {
          console.log(`    Canonical SHA-256: ${row.canonical_hash.slice(0, 24)}...`);
        }
      }
    }
  } catch (err) {
    console.log(`  Error querying quorum_results: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log('\n--- Recent Audit Ledger Events ---');
  try {
    const ledgerRows = db.prepare(
      `SELECT sequence, event_type, release_id, current_hash, timestamp 
       FROM audit_ledger ORDER BY sequence DESC LIMIT 5`
    ).all() as Array<{
      sequence: number;
      event_type: string;
      release_id: string | null;
      current_hash: string;
      timestamp: string;
    }>;

    if (ledgerRows.length === 0) {
      console.log('  (No audit ledger entries yet)');
    } else {
      for (const row of ledgerRows) {
        console.log(`  • Seq ${String(row.sequence).padStart(3)}: [${row.event_type.padEnd(23)}] Hash: ${row.current_hash.slice(0, 16)}... | Release: ${row.release_id ?? '(none)'}`);
      }
    }
  } catch (err) {
    console.log(`  Error querying audit_ledger: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log('========================================');
}

// Execute inspection
inspectDatabase();
