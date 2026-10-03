import type * as net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from '../db/database.js';
import { createApp } from './app.js';
import { runBuilderScenario } from '../builders/demo-scenarios.js';

async function runDemo(): Promise<void> {
  console.log('\n======================================================================');
  console.log('QUORUM REST API — LIVE DEMONSTRATION');
  console.log('======================================================================');

  // Use a dedicated local database and artifacts directory for demonstration
  const dbDir = path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.resolve(dbDir, 'quorum_api_demo.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const artifactsDir = path.resolve(process.cwd(), 'artifacts', 'api_demo');
  if (fs.existsSync(artifactsDir)) {
    fs.rmSync(artifactsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(artifactsDir, { recursive: true });

  const db = initDatabase({ dbPath });
  const app = createApp({ db, artifactsDir });

  // Start server on ephemeral port (port 0)
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const addr = server.address() as net.AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(`Ephemeral API Server listening at: ${baseUrl}\n`);

  // Helper for requests
  async function callApi(
    method: 'GET' | 'POST',
    apiPath: string,
    body?: unknown
  ): Promise<{ status: number; data: any }> {
    console.log(`--> ${method} ${apiPath}`);
    const res = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    console.log(`<-- Status: ${res.status}`);
    console.log(JSON.stringify(json, null, 2));
    console.log('----------------------------------------------------------------------');
    return { status: res.status, data: json };
  }

  try {
    // 1. Health check
    console.log('\n[1/10] Verifying System Health:');
    await callApi('GET', '/api/health');

    // 2. Builders list
    console.log('\n[2/10] Listing Registered Independent Builders (Initial Empty State):');
    await callApi('GET', '/api/builders');

    // 3. Scenario A: Clean Release
    console.log('\n[3/10] SCENARIO A: Generating Clean Release (3 Honest Builders, Bit-for-Bit Identical Artifacts)...');
    const cleanScenario = await runBuilderScenario({ scenario: 'clean', db, artifactsDir });
    console.log(`Generated Clean Release: ${cleanScenario.releaseId}`);

    console.log('\nListing Registered Builders (Public Keys Only — Zero Private Key Leakage):');
    await callApi('GET', '/api/builders');

    console.log(`\nListing Releases (Shows Initial PENDING Status):`);
    await callApi('GET', '/api/releases');

    console.log(`\n[4/10] Evaluating Clean Release Pipeline: POST /api/releases/${cleanScenario.releaseId}/evaluate:`);
    await callApi('POST', `/api/releases/${cleanScenario.releaseId}/evaluate`);

    console.log(`\n[5/10] Inspecting Clean Release Details Post-Evaluation:`);
    await callApi('GET', `/api/releases/${cleanScenario.releaseId}`);

    console.log(`\n[6/10] Inspecting Individual Builder Attestation Verifications (Phase 5):`);
    await callApi('GET', `/api/releases/${cleanScenario.releaseId}/verification`);

    console.log(`\n[7/10] Inspecting Quorum Consensus Decision (Phase 6):`);
    await callApi('GET', `/api/releases/${cleanScenario.releaseId}/quorum`);

    console.log(`\n[8/10] Inspecting Release Cryptographic Audit Trail (Phase 7):`);
    await callApi('GET', `/api/releases/${cleanScenario.releaseId}/audit`);

    // 4. Scenario B: Conflicted Release (Compromised Builder)
    console.log('\n[9/10] SCENARIO B: Generating Conflicted Release (2-of-3 Honest, Builder Gamma Compromised)...');
    const conflictScenario = await runBuilderScenario({ scenario: 'conflict', db, artifactsDir });
    console.log(`Generated Conflicted Release: ${conflictScenario.releaseId}`);

    console.log(`Evaluating Conflicted Release: POST /api/releases/${conflictScenario.releaseId}/evaluate:`);
    await callApi('POST', `/api/releases/${conflictScenario.releaseId}/evaluate`);

    console.log(`Inspecting Conflicted Release Quorum Result (Expected FLAGGED):`);
    await callApi('GET', `/api/releases/${conflictScenario.releaseId}/quorum`);

    // 5. Scenario C: No-Consensus Release
    console.log('\n[10/10] SCENARIO C: Generating No-Consensus Release (3 Distinct Compilations / No Quorum)...');
    const noConsensusScenario = await runBuilderScenario({ scenario: 'no-consensus', db, artifactsDir });
    console.log(`Generated No-Consensus Release: ${noConsensusScenario.releaseId}`);

    console.log(`Evaluating No-Consensus Release: POST /api/releases/${noConsensusScenario.releaseId}/evaluate:`);
    await callApi('POST', `/api/releases/${noConsensusScenario.releaseId}/evaluate`);

    console.log(`Inspecting No-Consensus Release Quorum Result (Expected REJECTED):`);
    await callApi('GET', `/api/releases/${noConsensusScenario.releaseId}/quorum`);

    // 6. Complete Audit Ledger Verification
    console.log(`\nVerifying Complete Tamper-Evident Audit Ledger Hash Chain:`);
    await callApi('GET', '/api/ledger/verify');

    console.log('\n======================================================================');
    console.log('ALL PHASE 8 REST API DEMONSTRATIONS COMPLETED SUCCESSFULLY');
    console.log('======================================================================\n');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (db && db.open) {
      db.close();
    }
  }
}

runDemo().catch((err) => {
  console.error('API Demonstration failed:', err);
  process.exit(1);
});
