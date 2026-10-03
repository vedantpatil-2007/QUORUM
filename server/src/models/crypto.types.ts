export type KeyAlgorithm = 'Ed25519';

export interface Ed25519KeyPair {
  algorithm: KeyAlgorithm;
  keyId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  publicKeyBase64: string;
  publicKeyFingerprint: string;
}

export interface SignatureEnvelope {
  algorithm: KeyAlgorithm;
  publicKeyId: string;
  signature: string; // Base64-encoded Ed25519 signature
  signedAt: string; // ISO-8601 UTC timestamp
}

export interface CryptoVerificationResult {
  isValid: boolean;
  error?: string;
  keyId?: string;
  canonicalBytesLength?: number;
}
