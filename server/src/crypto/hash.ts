import crypto from 'node:crypto';
import fs from 'node:fs';

/**
 * Calculates SHA-256 digest of input data (string, Buffer, or Uint8Array).
 * Returns lowercase hexadecimal string.
 */
export function sha256(data: string | Buffer | Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('hex').toLowerCase();
}

/**
 * Calculates SHA-256 digest returning raw 32-byte Buffer.
 */
export function sha256Buffer(data: string | Buffer | Uint8Array): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}

/**
 * Streams a file from disk and computes its SHA-256 hash.
 * Returns lowercase hexadecimal string.
 */
export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Synchronously computes SHA-256 hash of a file on disk.
 * Returns lowercase hexadecimal string.
 */
export function sha256FileSync(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return sha256(fileBuffer);
}

/**
 * Safely compares two SHA-256 hashes using constant-time comparison.
 */
export function verifySha256(actualHash: string, expectedHash: string): boolean {
  if (typeof actualHash !== 'string' || typeof expectedHash !== 'string') {
    return false;
  }
  const cleanActual = actualHash.trim().toLowerCase();
  const cleanExpected = expectedHash.trim().toLowerCase();

  if (cleanActual.length !== 64 || cleanExpected.length !== 64) {
    return false;
  }

  const bufActual = Buffer.from(cleanActual, 'utf8');
  const bufExpected = Buffer.from(cleanExpected, 'utf8');

  return crypto.timingSafeEqual(bufActual, bufExpected);
}
