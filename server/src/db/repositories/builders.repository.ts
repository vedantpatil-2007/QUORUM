import type Database from 'better-sqlite3';
import { BuilderRecord, BuilderStatus } from '../../models/db.types.js';

export interface CreateBuilderInput {
  id: string;
  name: string;
  publicKey: string;
  keyType?: string;
  operatorIdentity: string;
  status?: BuilderStatus;
  registeredAt?: string;
}

export class BuildersRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Registers a new builder.
   * Public key only; private keys are NEVER stored in the database.
   */
  createBuilder(input: CreateBuilderInput): BuilderRecord {
    const keyType = input.keyType ?? 'Ed25519';
    const status = input.status ?? 'ACTIVE';
    const registeredAt = input.registeredAt ?? new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO builders (
        id, name, public_key, key_type, operator_identity, status, registered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.id,
      input.name,
      input.publicKey,
      keyType,
      input.operatorIdentity,
      status,
      registeredAt
    );

    return {
      id: input.id,
      name: input.name,
      public_key: input.publicKey,
      key_type: keyType,
      operator_identity: input.operatorIdentity,
      status,
      registered_at: registeredAt,
    };
  }

  /**
   * Retrieves a builder by unique ID.
   */
  getBuilderById(id: string): BuilderRecord | null {
    const stmt = this.db.prepare('SELECT * FROM builders WHERE id = ?');
    const row = stmt.get(id) as BuilderRecord | undefined;
    return row ?? null;
  }

  /**
   * Retrieves all registered builders.
   */
  getAllBuilders(): BuilderRecord[] {
    const stmt = this.db.prepare('SELECT * FROM builders ORDER BY registered_at ASC');
    return stmt.all() as BuilderRecord[];
  }

  /**
   * Retrieves only active builders.
   */
  getActiveBuilders(): BuilderRecord[] {
    const stmt = this.db.prepare('SELECT * FROM builders WHERE status = ? ORDER BY registered_at ASC');
    return stmt.all('ACTIVE') as BuilderRecord[];
  }

  /**
   * Updates operational status of a builder ('ACTIVE', 'SUSPENDED', 'REVOKED').
   */
  updateBuilderStatus(id: string, status: BuilderStatus): boolean {
    const stmt = this.db.prepare('UPDATE builders SET status = ? WHERE id = ?');
    const result = stmt.run(status, id);
    return result.changes > 0;
  }
}
