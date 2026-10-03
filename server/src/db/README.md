# Quorum Database & Persistence Layer

This module implements the SQLite persistence architecture for the **Quorum** decentralized software-supply-chain verification system.

---

## 1. Database Location & Engine

- **Engine:** SQLite 3 via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) (native, synchronous, high-throughput, zero external network dependency).
- **Default File Path:** `server/data/quorum.db`.
- **In-Memory Testing:** Supports `:memory:` path for test isolation.
- **Concurrency & WAL Mode:** File databases automatically enable Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) for enhanced read concurrency and crash durability.
- **Foreign Key Enforcement:** Foreign keys are explicitly enabled and verified on every connection (`PRAGMA foreign_keys = ON;`).

---

## 2. Relational Schema & Tables

```
                    ┌─────────────────────────┐
                    │        BUILDERS         │
                    ├─────────────────────────┤
                    │ id (PK)                 │
                    │ name                    │
                    │ public_key              │
                    │ key_type (Ed25519)      │
                    │ operator_identity       │
                    │ status (ACTIVE/...)     │
                    │ registered_at           │
                    └───────────┬─────────────┘
                                │
                                │ 1:N
                                ▼
┌─────────────────────────┐   ┌───────────────────────────┐
│        RELEASES         │   │       ATTESTATIONS        │
├─────────────────────────┤   ├───────────────────────────┤
│ id (PK)                 │1:N│ id (PK)                   │
│ project_name            ├───┼─► release_id (FK)         │
│ version                 │   │ builder_id (FK)           │
│ repo_url                │   │ source_commit             │
│ commit_sha              │   │ artifact_name             │
│ build_spec_json         │   │ artifact_sha256           │
│ expected_artifact_name  │   │ build_env_json            │
│ expected_hash           │   │ build_timestamp           │
│ status (PENDING/...)    │   │ build_duration_ms         │
│ created_at              │   │ build_log_sha256          │
└──────┬────────────┬─────┘   │ statement_json            │
       │            │         │ signature                 │
    1:N│         1:1│         │ public_key_id             │
       ▼            ▼         │ is_valid                  │
┌──────────────┐ ┌──────────┐ │ validation_error          │
│  ARTIFACTS   │ │  QUORUM  │ │ created_at                │
├──────────────┤ ├──────────┤ ├───────────────────────────┤
│ id (PK)      │ │ id (PK)  │ │ UNIQUE(rel_id, bld_id)    │
│ release_id   │ │ rel_id   │ └─────────────┬─────────────┘
│ filename     │ │ status   │               │
│ exp_sha256   │ │ canonical│               │ 1:N
│ size_bytes   │ │ ...      │               ▼
└──────────────┘ └──────────┘   ┌─────────────────────────┐
                                │  VERIFICATION_RESULTS   │
                                ├─────────────────────────┤
                                │ id (PK)                 │
                                │ release_id (FK)         │
                                │ attestation_id (FK)     │
                                │ signature_valid         │
                                │ commit_match            │
                                │ builder_active          │
                                │ status (VALID/INVALID)  │
                                │ notes, verified_at      │
                                └─────────────────────────┘
```

### Table Definitions & Constraints

1. **`builders`**
   - Stores registered independent builder nodes.
   - Enforces `CHECK(status IN ('ACTIVE', 'SUSPENDED', 'REVOKED'))`.
   - Stores **only** public keys. Private keys are never persisted.
2. **`releases`**
   - Declares release intent with commit SHA, build specification, and expected artifact.
   - Enforces `CHECK(status IN ('PENDING', 'INSUFFICIENT_EVIDENCE', 'VERIFIED', 'FLAGGED', 'REJECTED'))`.
3. **`artifacts`**
   - Declares binary files associated with releases.
   - Foreign key: `release_id REFERENCES releases(id) ON DELETE CASCADE`.
4. **`attestations`**
   - Cryptographic claims submitted by builders for specific releases.
   - Enforces `UNIQUE(release_id, builder_id)` constraint so each builder has strictly one vote per release.
   - Foreign key: `release_id REFERENCES releases(id) ON DELETE CASCADE`.
   - Foreign key: `builder_id REFERENCES builders(id) ON DELETE RESTRICT`.
5. **`verification_results`**
   - Detailed cryptographic audit record per attestation.
   - Enforces `CHECK(status IN ('VALID', 'INVALID'))`.
6. **`quorum_results`**
   - Final consensus decisions, dominant hash, and detailed disagreement breakdown.
   - Enforces `UNIQUE(release_id)` with `CHECK(quorum_status IN ('INSUFFICIENT_EVIDENCE', 'VERIFIED', 'FLAGGED', 'REJECTED'))`.
7. **`schema_migrations`**
   - Tracks sequentially applied migration versions.

---

## 3. Migration Mechanism

- Migrations are defined in [`migrations.ts`](./migrations.ts) with integer IDs and names.
- The runner inspects the `schema_migrations` table and applies pending migrations sequentially inside an atomic transaction.
- **Startup Guarantee:** The application **never** calls `DROP TABLE` on startup and will never destroy existing records.

---

## 4. Repository Architecture

All queries use parameterized statements (`?`) through typed repository classes in `repositories/`:
- `BuildersRepository`: `createBuilder`, `getBuilderById`, `getAllBuilders`, `updateBuilderStatus`, `getActiveBuilders`
- `ReleasesRepository`: `createRelease`, `getReleaseById`, `getAllReleases`, `updateReleaseStatus`
- `ArtifactsRepository`: `createArtifact`, `getArtifactsByReleaseId`
- `AttestationsRepository`: `createAttestation`, `getAttestationById`, `getAttestationsByReleaseId`, `getAttestationByBuilderAndRelease`
- `VerificationRepository`: `createVerificationResult`, `getVerificationResultsByReleaseId`
- `QuorumRepository`: `createOrReplaceQuorumResult`, `getQuorumResultByReleaseId`

---

## 5. Transactions

Atomic multi-table operations use `runTransaction(db, fn)` in `database.ts`:
```typescript
import { initDatabase, runTransaction } from './database.js';

const db = initDatabase();

runTransaction(db, () => {
  releasesRepo.createRelease(newRelease);
  artifactsRepo.createArtifact(newArtifact);
});
```
If any error occurs within the transaction callback, all mutations roll back automatically.

---

## 6. Security Considerations

1. **No Private Keys in Storage:** Builders retain their own Ed25519 private keys. Only Ed25519 SPKI public keys are stored in the database.
2. **Strict SQL Parameterization:** User and builder inputs are never concatenated into raw SQL strings, preventing SQL injection vulnerabilities.
3. **Foreign Key Integrity:** `PRAGMA foreign_keys = ON;` is strictly enforced to prevent orphan records.
4. **Multi-Vote Protection:** `UNIQUE(release_id, builder_id)` prevents builder Sybils from submitting multiple attestations for the same release.

---

## 7. Development Utilities & Database Reset

### Inspect Database
To check connection, PRAGMA status, and table row counts:
```bash
npm --prefix server run db:inspect
```

### Seed Development Builders
To seed Builder Alpha, Beta, and Gamma (with fresh Ed25519 public keys):
```bash
npm --prefix server run seed
```

### Reset Local Database Manually
To delete the development database file and start clean:
```powershell
# Windows PowerShell
Remove-Item -Path "server/data/quorum.db*" -Force
```
On next application launch, `initDatabase()` will automatically recreate `quorum.db` and apply migrations from scratch.
