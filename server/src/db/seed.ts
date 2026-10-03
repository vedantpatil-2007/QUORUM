import { initDatabase } from './database.js';
import { BuildersRepository } from './repositories/builders.repository.js';
import { generateEd25519KeyPair } from '../crypto/keys.js';

/**
 * Development seed utility.
 * Creates 3 initial builder profiles (Alpha, Beta, Gamma) with REAL Ed25519 keypairs.
 * ONLY public keys are saved to the database.
 * Does NOT generate attestations or fake releases.
 */
export function seedDefaultBuilders(): void {
  console.log('--- Quorum Database Seeder ---');
  const db = initDatabase();
  const repo = new BuildersRepository(db);

  const defaultBuilders = [
    {
      id: 'bld_node_alpha_us',
      name: 'Builder Node Alpha (US-East / Ubuntu 22.04)',
      operatorIdentity: 'Security Consortium - Node Alpha',
    },
    {
      id: 'bld_node_beta_eu',
      name: 'Builder Node Beta (EU-Central / Debian 12)',
      operatorIdentity: 'Reproducible Builds Foundation - Node Beta',
    },
    {
      id: 'bld_node_gamma_apac',
      name: 'Builder Node Gamma (APAC-East / Alpine Linux)',
      operatorIdentity: 'Independent Witness - Node Gamma',
    },
  ];
  for (const b of defaultBuilders) {
    const seed = `quorum_sim_builder_seed_${b.id}`;
    const keyPair = generateEd25519KeyPair(b.id, seed);
    const existing = repo.getBuilderById(b.id);
    if (existing) {
      console.log(`[SEED] Builder already exists: ${b.id} (${existing.name})`);
      if (existing.public_key !== keyPair.publicKeyPem) {
        db.prepare('UPDATE builders SET public_key = ? WHERE id = ?').run(
          keyPair.publicKeyPem,
          b.id
        );
        console.log(`[SEED] Synced registered public key for: ${b.id}`);
      }
    } else {
      repo.createBuilder({
        id: b.id,
        name: b.name,
        publicKey: keyPair.publicKeyPem,
        keyType: 'Ed25519',
        operatorIdentity: b.operatorIdentity,
        status: 'ACTIVE',
      });
      console.log(`[SEED] Created builder: ${b.id}`);
      console.log(`       Key ID: ${keyPair.keyId}`);
      console.log(`       Fingerprint: ${keyPair.publicKeyFingerprint}`);
    }
  }

  console.log('--- Seeding Complete ---');
}

// Execute seeding
seedDefaultBuilders();
