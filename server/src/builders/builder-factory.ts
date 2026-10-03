import type Database from 'better-sqlite3';
import { generateEd25519KeyPair } from '../crypto/keys.js';
import { BuildersRepository } from '../db/repositories/builders.repository.js';
import { DeterministicSimulatorBuilder } from './builder.js';
import { BuilderIdentity } from './builder.types.js';

export interface BuilderFactoryOptions {
  artifactsDir?: string;
  db?: Database.Database;
}

/**
 * Creates the 3 independent simulated builders (Alpha, Beta, Gamma).
 * Generates genuine in-memory Ed25519 keypairs for each.
 * 
 * SECURITY GUARANTEE:
 * Private keys exist ONLY in runtime memory.
 * If a Database instance is provided, ONLY public keys are persisted to SQLite.
 */
export function createDefaultBuilders(
  options: BuilderFactoryOptions = {}
): DeterministicSimulatorBuilder[] {
  const configs: Omit<BuilderIdentity, 'keyPair'>[] = [
    {
      id: 'bld_node_alpha_us',
      name: 'Builder Alpha',
      operatorIdentity: 'Security Consortium - Node Alpha',
      environment: {
        os: 'ubuntu-simulated',
        arch: 'x86_64',
        compiler: 'gcc-11.4.0-sim',
        reproducibleFlags: {
          SOURCE_DATE_EPOCH: 1700000000,
          TZ: 'UTC',
          LANG: 'C.UTF-8',
        },
      },
    },
    {
      id: 'bld_node_beta_eu',
      name: 'Builder Beta',
      operatorIdentity: 'Reproducible Builds Foundation - Node Beta',
      environment: {
        os: 'debian-simulated',
        arch: 'x86_64',
        compiler: 'gcc-12.2.0-sim',
        reproducibleFlags: {
          SOURCE_DATE_EPOCH: 1700000000,
          TZ: 'UTC',
          LANG: 'C.UTF-8',
        },
      },
    },
    {
      id: 'bld_node_gamma_apac',
      name: 'Builder Gamma',
      operatorIdentity: 'Independent Witness - Node Gamma',
      environment: {
        os: 'alpine-simulated',
        arch: 'x86_64',
        compiler: 'musl-gcc-12.2.1-sim',
        reproducibleFlags: {
          SOURCE_DATE_EPOCH: 1700000000,
          TZ: 'UTC',
          LANG: 'C.UTF-8',
        },
      },
    },
  ];

  const builders: DeterministicSimulatorBuilder[] = [];
  const repo = options.db ? new BuildersRepository(options.db) : null;

  for (const cfg of configs) {
    // Generate genuine Ed25519 keypair in memory using builder seed
    const seed = `quorum_sim_builder_seed_${cfg.id}`;
    const keyPair = generateEd25519KeyPair(cfg.id, seed);

    const identity: BuilderIdentity = {
      ...cfg,
      keyPair, // Stored in RAM only
    };

    // If database provided, ensure builder record exists with PUBLIC KEY ONLY
    if (repo && options.db) {
      const existing = repo.getBuilderById(cfg.id);
      if (!existing) {
        repo.createBuilder({
          id: cfg.id,
          name: cfg.name,
          publicKey: keyPair.publicKeyPem, // PUBLIC KEY ONLY
          operatorIdentity: cfg.operatorIdentity,
          status: 'ACTIVE',
        });
      } else if (existing.public_key !== keyPair.publicKeyPem) {
        options.db.prepare('UPDATE builders SET public_key = ? WHERE id = ?').run(
          keyPair.publicKeyPem,
          cfg.id
        );
      }
    }

    builders.push(new DeterministicSimulatorBuilder(identity, options.artifactsDir));
  }

  return builders;
}
