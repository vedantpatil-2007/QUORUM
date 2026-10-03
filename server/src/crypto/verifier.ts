import crypto from 'node:crypto';
import { CryptoVerificationResult } from '../models/crypto.types.js';
import { canonicalizeToBuffer } from './canonicalize.js';
import { validatePublicKey } from './keys.js';

/**
 * Verifies an Ed25519 signature against raw canonical bytes and a public key.
 */
export function verifyBytesSignature(
  canonicalBytes: Buffer | Uint8Array,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  try {
    if (!validatePublicKey(publicKeyPem)) {
      return false;
    }

    const signatureBuffer = Buffer.from(signatureBase64, 'base64');
    // Ed25519 signatures are strictly 64 bytes
    if (signatureBuffer.length !== 64) {
      return false;
    }

    return crypto.verify(null, canonicalBytes, publicKeyPem, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Canonicalizes the statement using RFC 8785 (JCS) and cryptographically verifies
 * the Ed25519 signature against the builder's public key.
 * 
 * Returns a detailed CryptoVerificationResult explaining success or failure.
 */
export function verifyStatementSignature(
  statement: unknown,
  signatureBase64: string,
  publicKeyPem: string,
  keyId?: string
): CryptoVerificationResult {
  if (!statement || typeof statement !== 'object') {
    return {
      isValid: false,
      error: 'Statement must be a valid non-null object',
      keyId,
    };
  }

  if (!signatureBase64 || typeof signatureBase64 !== 'string') {
    return {
      isValid: false,
      error: 'Signature must be a non-empty string',
      keyId,
    };
  }

  if (!publicKeyPem || typeof publicKeyPem !== 'string') {
    return {
      isValid: false,
      error: 'Public key must be provided as a PEM string',
      keyId,
    };
  }

  if (!validatePublicKey(publicKeyPem)) {
    return {
      isValid: false,
      error: 'Invalid or unsupported public key format. Must be an Ed25519 public key.',
      keyId,
    };
  }

  try {
    const canonicalBytes = canonicalizeToBuffer(statement);
    const signatureBuffer = Buffer.from(signatureBase64, 'base64');

    if (signatureBuffer.length !== 64) {
      return {
        isValid: false,
        error: `Invalid Ed25519 signature length: expected 64 bytes, received ${signatureBuffer.length} bytes`,
        keyId,
        canonicalBytesLength: canonicalBytes.length,
      };
    }

    const verified = crypto.verify(null, canonicalBytes, publicKeyPem, signatureBuffer);

    if (!verified) {
      return {
        isValid: false,
        error: 'Cryptographic signature verification failed: signature does not match canonical payload and public key',
        keyId,
        canonicalBytesLength: canonicalBytes.length,
      };
    }

    return {
      isValid: true,
      keyId,
      canonicalBytesLength: canonicalBytes.length,
    };
  } catch (err) {
    return {
      isValid: false,
      error: `Verification error: ${err instanceof Error ? err.message : String(err)}`,
      keyId,
    };
  }
}
