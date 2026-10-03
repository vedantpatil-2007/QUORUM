import crypto from 'node:crypto';
import { SignatureEnvelope } from '../models/crypto.types.js';
import { canonicalizeToBuffer } from './canonicalize.js';

export class SigningError extends Error {
  constructor(message: string) {
    super(`Signing error: ${message}`);
    this.name = 'SigningError';
  }
}

/**
 * Signs raw UTF-8 canonical bytes using an Ed25519 private key.
 * Returns Base64-encoded signature.
 */
export function signBytes(canonicalBytes: Buffer | Uint8Array, privateKeyPem: string): string {
  try {
    const signatureBuffer = crypto.sign(null, canonicalBytes, privateKeyPem);
    return signatureBuffer.toString('base64');
  } catch (err) {
    throw new SigningError(
      `Failed to sign bytes with Ed25519: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Canonicalizes any JSON-compatible statement using RFC 8785 (JCS) and signs it
 * using the provided Ed25519 private key.
 * 
 * Returns the original statement along with its cryptographic SignatureEnvelope.
 */
export function signStatement<T extends object>(
  statement: T,
  privateKeyPem: string,
  publicKeyId: string
): { statement: T; envelope: SignatureEnvelope; canonicalBytes: Buffer } {
  try {
    const canonicalBytes = canonicalizeToBuffer(statement);
    const signature = signBytes(canonicalBytes, privateKeyPem);

    const envelope: SignatureEnvelope = {
      algorithm: 'Ed25519',
      publicKeyId,
      signature,
      signedAt: new Date().toISOString(),
    };

    return {
      statement,
      envelope,
      canonicalBytes,
    };
  } catch (err) {
    if (err instanceof SigningError) throw err;
    throw new SigningError(
      `Failed to sign statement: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
