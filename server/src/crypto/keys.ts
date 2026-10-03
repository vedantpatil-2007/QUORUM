import crypto from 'node:crypto';
import { Ed25519KeyPair } from '../models/crypto.types.js';
import { sha256 } from './hash.js';

export class KeyManagementError extends Error {
  constructor(message: string) {
    super(`Key management error: ${message}`);
    this.name = 'KeyManagementError';
  }
}

/**
 * Generates an Ed25519 keypair.
 * If an optional seed is provided, deterministically derives the keypair in memory (RFC 8410).
 * Otherwise generates a fresh random keypair.
 * 
 * Returns public/private keys in standard PEM format, base64 public key representation,
 * and a deterministic key identifier.
 */
export function generateEd25519KeyPair(
  keyIdPrefix = 'key_ed25519',
  seed?: string | Buffer
): Ed25519KeyPair {
  let publicKeyPem: string;
  let privateKeyPem: string;
  let rawDer: Buffer;

  if (seed) {
    // RFC 8410 ASN.1 PKCS#8 prefix for Ed25519 (16 bytes)
    const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const seedBytes =
      typeof seed === 'string'
        ? Buffer.from(sha256(seed), 'hex')
        : Buffer.from(seed);
    const pkcs8Der = Buffer.concat([pkcs8Prefix, seedBytes.subarray(0, 32)]);

    const privKey = crypto.createPrivateKey({
      key: pkcs8Der,
      format: 'der',
      type: 'pkcs8',
    });
    const pubKey = crypto.createPublicKey(privKey);

    privateKeyPem = privKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    publicKeyPem = pubKey.export({ type: 'spki', format: 'pem' }) as string;
    rawDer = pubKey.export({ type: 'spki', format: 'der' }) as Buffer;
  } else {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    publicKeyPem = publicKey;
    privateKeyPem = privateKey;
    rawDer = crypto.createPublicKey(publicKey).export({
      type: 'spki',
      format: 'der',
    }) as Buffer;
  }

  const publicKeyBase64 = rawDer.toString('base64');
  const fingerprint = sha256(rawDer);
  const keyId = `${keyIdPrefix}_${fingerprint.slice(0, 16)}`;

  return {
    algorithm: 'Ed25519',
    keyId,
    publicKeyPem,
    privateKeyPem,
    publicKeyBase64,
    publicKeyFingerprint: fingerprint,
  };
}

/**
 * Computes deterministic fingerprint (SHA-256) of a public key in PEM or DER format.
 */
export function computeKeyFingerprint(publicKeyPem: string): string {
  try {
    const keyObj = crypto.createPublicKey(publicKeyPem);
    const der = keyObj.export({ type: 'spki', format: 'der' });
    return sha256(der);
  } catch (err) {
    throw new KeyManagementError(
      `Failed to compute fingerprint from public key: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Validates that a given string is a valid Ed25519 public key.
 */
export function validatePublicKey(publicKeyPem: string): boolean {
  try {
    const keyObj = crypto.createPublicKey(publicKeyPem);
    return keyObj.asymmetricKeyType === 'ed25519';
  } catch {
    return false;
  }
}

/**
 * Validates that a given string is a valid Ed25519 private key.
 */
export function validatePrivateKey(privateKeyPem: string): boolean {
  try {
    const keyObj = crypto.createPrivateKey(privateKeyPem);
    return keyObj.asymmetricKeyType === 'ed25519';
  } catch {
    return false;
  }
}
