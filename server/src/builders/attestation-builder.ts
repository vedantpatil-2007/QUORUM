import type Database from 'better-sqlite3';
import { AttestationStatement, SignedAttestation } from '../models/attestation.types.js';
import { signStatement } from '../crypto/signer.js';
import { canonicalize } from '../crypto/canonicalize.js';
import { AttestationsRepository } from '../db/repositories/attestations.repository.js';
import { BuildResult, BuilderIdentity, CreateAttestationOptions } from './builder.types.js';

/**
 * Constructs, canonicalizes, and cryptographically signs a builder attestation.
 * Optionally persists the signed attestation to the SQLite database.
 */
export function createAndSignAttestation(
  builder: BuilderIdentity,
  buildResult: BuildResult,
  options: CreateAttestationOptions
): SignedAttestation {
  // 1. Construct canonical statement structure adhering to SLSA / in-toto inspired schema
  const attestationId = `att_${builder.id}_${buildResult.releaseId}_${Date.now()}`;

  const statement: AttestationStatement = {
    statementVersion: '1.0.0',
    attestationId,
    releaseId: buildResult.releaseId,
    builderId: builder.id,
    publicKeyId: builder.keyPair.keyId,
    source: {
      repoUrl: options.repoUrl,
      commitSha: options.sourceCommit,
    },
    artifact: {
      name: buildResult.artifactName,
      sha256: buildResult.artifactSha256,
      sizeBytes: buildResult.artifactSizeBytes,
    },
    buildEnvironment: builder.environment,
    buildMetadata: {
      buildTimestamp: buildResult.buildTimestamp,
      buildDurationMs: buildResult.buildDurationMs,
      buildLogSha256: buildResult.buildLogSha256,
    },
  };

  // 2. Sign canonical statement bytes with builder's Ed25519 private key (in memory)
  const { envelope } = signStatement(
    statement,
    builder.keyPair.privateKeyPem,
    builder.keyPair.keyId
  );

  const signedAttestation: SignedAttestation = {
    statement,
    envelope,
  };

  // 3. Persist to database if db instance provided
  if (options.db) {
    const repo = new AttestationsRepository(options.db);
    repo.createAttestation({
      id: attestationId,
      releaseId: buildResult.releaseId,
      builderId: builder.id,
      sourceCommit: options.sourceCommit,
      artifactName: buildResult.artifactName,
      artifactSha256: buildResult.artifactSha256,
      buildEnvJson: canonicalize(builder.environment),
      buildTimestamp: buildResult.buildTimestamp,
      buildDurationMs: buildResult.buildDurationMs,
      buildLogSha256: buildResult.buildLogSha256,
      statementJson: canonicalize(statement),
      signature: envelope.signature,
      publicKeyId: builder.keyPair.keyId,
      isValid: 1,
    });
  }

  return signedAttestation;
}
