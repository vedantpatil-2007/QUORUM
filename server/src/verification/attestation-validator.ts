import { BuilderRecord, ReleaseRecord } from '../models/db.types.js';
import { AttestationStatement } from '../models/attestation.types.js';
import { verifyStatementSignature } from '../crypto/verifier.js';
import { computeKeyFingerprint } from '../crypto/keys.js';

export interface SchemaValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates that an attestation statement contains all required fields and correct formats.
 */
export function validateAttestationSchema(statement: unknown): SchemaValidationResult {
  const errors: string[] = [];

  if (!statement || typeof statement !== 'object') {
    return { isValid: false, errors: ['Attestation statement must be a non-null object'] };
  }

  const s = statement as Partial<AttestationStatement>;

  if (!s.releaseId || typeof s.releaseId !== 'string') {
    errors.push('Missing or invalid "releaseId" in statement');
  }
  if (!s.builderId || typeof s.builderId !== 'string') {
    errors.push('Missing or invalid "builderId" in statement');
  }
  if (!s.publicKeyId || typeof s.publicKeyId !== 'string') {
    errors.push('Missing or invalid "publicKeyId" in statement');
  }

  // Source object validation
  if (!s.source || typeof s.source !== 'object') {
    errors.push('Missing or invalid "source" object in statement');
  } else {
    if (!s.source.commitSha || typeof s.source.commitSha !== 'string') {
      errors.push('Missing or invalid "source.commitSha" in statement');
    } else if (!/^[a-f0-9]{40}$/i.test(s.source.commitSha)) {
      errors.push(`Invalid commit SHA format: expected 40 hex chars, received "${s.source.commitSha}"`);
    }
  }

  // Artifact object validation
  if (!s.artifact || typeof s.artifact !== 'object') {
    errors.push('Missing or invalid "artifact" object in statement');
  } else {
    if (!s.artifact.name || typeof s.artifact.name !== 'string') {
      errors.push('Missing or invalid "artifact.name" in statement');
    }
    if (!s.artifact.sha256 || typeof s.artifact.sha256 !== 'string') {
      errors.push('Missing or invalid "artifact.sha256" in statement');
    } else if (!/^[a-f0-9]{64}$/i.test(s.artifact.sha256)) {
      errors.push(`Invalid artifact SHA-256 format: expected 64 hex chars, received "${s.artifact.sha256}"`);
    }
  }

  // Build Environment validation
  if (!s.buildEnvironment || typeof s.buildEnvironment !== 'object') {
    errors.push('Missing or invalid "buildEnvironment" object in statement');
  }

  // Build Metadata validation
  if (!s.buildMetadata || typeof s.buildMetadata !== 'object') {
    errors.push('Missing or invalid "buildMetadata" object in statement');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates builder identity, status, and public key identifier.
 */
export function validateBuilderIdentity(
  builder: BuilderRecord | null,
  claimedBuilderId: string,
  claimedPublicKeyId: string
): { isValid: boolean; active: boolean; error?: string } {
  if (!builder) {
    return {
      isValid: false,
      active: false,
      error: `Builder "${claimedBuilderId}" not found in registered builder store`,
    };
  }

  if (builder.status !== 'ACTIVE') {
    return {
      isValid: false,
      active: false,
      error: `Builder "${builder.id}" is not active. Current status: ${builder.status}`,
    };
  }

  // Verify public key ID association:
  // Either matches builder registered key ID format or fingerprint substring
  const expectedFingerprint = computeKeyFingerprint(builder.public_key).slice(0, 16);
  if (!claimedPublicKeyId.includes(expectedFingerprint) && !claimedPublicKeyId.includes(builder.id)) {
    return {
      isValid: false,
      active: true,
      error: `Public key ID mismatch: attestation specifies "${claimedPublicKeyId}", but registered key fingerprint is "${expectedFingerprint}"`,
    };
  }

  return { isValid: true, active: true };
}

/**
 * Validates that attestation source commit matches the release commit SHA.
 */
export function validateSourceCommit(
  attestationCommit: string,
  releaseCommit: string
): { matches: boolean; error?: string } {
  const matches = attestationCommit.toLowerCase() === releaseCommit.toLowerCase();
  return {
    matches,
    error: matches
      ? undefined
      : `Source commit mismatch: attestation references "${attestationCommit}", but release requires "${releaseCommit}"`,
  };
}

/**
 * Cryptographically verifies the Ed25519 signature over the canonicalized statement.
 */
export function verifyAttestationSignature(
  statement: unknown,
  signatureBase64: string,
  publicKeyPem: string,
  keyId?: string
): { isValid: boolean; error?: string } {
  const result = verifyStatementSignature(statement, signatureBase64, publicKeyPem, keyId);
  return {
    isValid: result.isValid,
    error: result.error,
  };
}
