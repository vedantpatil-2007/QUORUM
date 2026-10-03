import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  generateEd25519KeyPair,
  validatePublicKey,
  validatePrivateKey,
  computeKeyFingerprint,
} from '../server/src/crypto/keys.js';
import {
  canonicalize,
  canonicalizeToBuffer,
} from '../server/src/crypto/canonicalize.js';
import {
  sha256,
  sha256Buffer,
  sha256File,
  sha256FileSync,
  verifySha256,
} from '../server/src/crypto/hash.js';
import { signStatement, signBytes } from '../server/src/crypto/signer.js';
import {
  verifyStatementSignature,
  verifyBytesSignature,
} from '../server/src/crypto/verifier.js';
import { AttestationStatement } from '../server/src/models/attestation.types.js';

describe('Quorum Cryptographic Utilities (Phase 2)', () => {
  // Sample realistic attestation statement
  const createSampleStatement = (): AttestationStatement => ({
    statementVersion: '1.0.0',
    attestationId: 'att_01J98Y7Z3K001',
    releaseId: 'rel_01J98X7A9C000',
    builderId: 'bld_node_alpha_us',
    publicKeyId: 'key_ed25519_node_alpha',
    source: {
      repoUrl: 'https://github.com/example/cryptolib',
      commitSha: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
    },
    artifact: {
      name: 'cryptolib-v1.4.0-linux-amd64.tar.gz',
      sha256: '8f434346648f6b96df89dda901c5176b10f607662cee1b3ec12e8b1e5bda7439',
      sizeBytes: 2490368,
    },
    buildEnvironment: {
      os: 'linux-ubuntu-22.04',
      arch: 'x86_64',
      compiler: 'gcc-11.4.0',
      reproducibleFlags: {
        SOURCE_DATE_EPOCH: 1700000000,
        TZ: 'UTC',
      },
    },
    buildMetadata: {
      buildTimestamp: '2026-10-03T11:15:30Z',
      buildDurationMs: 18450,
      buildLogSha256: '4a5b6c7d8e9f0123456789abcdef0123456789abcdef0123456789abcdef0123',
    },
  });

  // TEST 1: Generate Ed25519 keypair → sign message → verify → PASS
  it('TEST 1: Generate Ed25519 keypair -> sign message -> verify -> PASS', () => {
    const keyPair = generateEd25519KeyPair('builder_alpha');

    expect(keyPair.algorithm).toBe('Ed25519');
    expect(keyPair.keyId).toMatch(/^builder_alpha_[a-f0-9]{16}$/);
    expect(validatePublicKey(keyPair.publicKeyPem)).toBe(true);
    expect(validatePrivateKey(keyPair.privateKeyPem)).toBe(true);

    const statement = createSampleStatement();
    statement.publicKeyId = keyPair.keyId;

    const { envelope } = signStatement(statement, keyPair.privateKeyPem, keyPair.keyId);

    expect(envelope.algorithm).toBe('Ed25519');
    expect(envelope.publicKeyId).toBe(keyPair.keyId);
    expect(typeof envelope.signature).toBe('string');
    expect(envelope.signature.length).toBeGreaterThan(0);

    // Verify using public key
    const verification = verifyStatementSignature(statement, envelope.signature, keyPair.publicKeyPem, keyPair.keyId);
    expect(verification.isValid).toBe(true);
    expect(verification.error).toBeUndefined();
    expect(verification.canonicalBytesLength).toBeGreaterThan(0);
  });

  // TEST 2: Sign statement → modify one field → verification must FAIL
  it('TEST 2: Sign statement -> modify one field -> verification must FAIL', () => {
    const keyPair = generateEd25519KeyPair();
    const statement = createSampleStatement();

    const { envelope } = signStatement(statement, keyPair.privateKeyPem, keyPair.keyId);

    // Verify original first succeeds
    expect(verifyStatementSignature(statement, envelope.signature, keyPair.publicKeyPem).isValid).toBe(true);

    // Tamper with one field: alter the artifact SHA-256 hash
    const tamperedStatement: AttestationStatement = JSON.parse(JSON.stringify(statement));
    tamperedStatement.artifact.sha256 = '0000000000000000000000000000000000000000000000000000000000000000';

    const failedVerification = verifyStatementSignature(
      tamperedStatement,
      envelope.signature,
      keyPair.publicKeyPem
    );

    expect(failedVerification.isValid).toBe(false);
    expect(failedVerification.error).toContain('Cryptographic signature verification failed');

    // Tamper with another field: alter commit SHA
    const tamperedCommit: AttestationStatement = JSON.parse(JSON.stringify(statement));
    tamperedCommit.source.commitSha = '1111111111111111111111111111111111111111';

    const commitFail = verifyStatementSignature(tamperedCommit, envelope.signature, keyPair.publicKeyPem);
    expect(commitFail.isValid).toBe(false);
  });

  // TEST 3: Same JSON content with different key ordering → canonical bytes must be identical
  it('TEST 3: Same JSON content with different key ordering -> canonical bytes must be identical', () => {
    const objVariantA = {
      zebra: 'stripes',
      alpha: 1,
      nested: {
        charlie: true,
        bravo: [3, 2, 1],
        delta: null,
      },
    };

    const objVariantB = {
      nested: {
        delta: null,
        bravo: [3, 2, 1],
        charlie: true,
      },
      alpha: 1,
      zebra: 'stripes',
    };

    const canonicalA = canonicalize(objVariantA);
    const canonicalB = canonicalize(objVariantB);

    // String representations must be strictly identical
    expect(canonicalA).toBe(canonicalB);

    // UTF-8 Buffer representations must be bit-for-bit identical
    const bufA = canonicalizeToBuffer(objVariantA);
    const bufB = canonicalizeToBuffer(objVariantB);
    expect(bufA.equals(bufB)).toBe(true);

    // Standard JSON.stringify would have failed this equality check:
    expect(JSON.stringify(objVariantA)).not.toBe(JSON.stringify(objVariantB));

    // A signature generated on objVariantA must verify on objVariantB
    const keyPair = generateEd25519KeyPair();
    const { envelope } = signStatement(objVariantA, keyPair.privateKeyPem, keyPair.keyId);

    const verificationOnB = verifyStatementSignature(objVariantB, envelope.signature, keyPair.publicKeyPem);
    expect(verificationOnB.isValid).toBe(true);
  });

  // TEST 4: Calculate SHA-256 of known test data → verify expected digest
  it('TEST 4: Calculate SHA-256 of known test data -> verify expected digest', () => {
    // NIST / FIPS test vectors
    // Empty string SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

    // Known ASCII vector: "abc"
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

    // Buffer test
    const buf = Buffer.from('abc', 'utf8');
    expect(sha256(buf)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Buffer(buf).toString('hex')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

    // Constant-time verification helper
    expect(verifySha256(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toBe(true);
    expect(verifySha256(sha256('abc'), 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD')).toBe(true);
  });

  // TEST 5: Change one byte of an artifact → SHA-256 must change
  it('TEST 5: Change one byte of an artifact -> SHA-256 must change (avalanche effect)', () => {
    const originalArtifactBytes = Buffer.from(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'utf8'
    );

    const tamperedArtifactBytes = Buffer.from(originalArtifactBytes);
    // Flip a single bit in the 10th byte
    tamperedArtifactBytes[10] = tamperedArtifactBytes[10]! ^ 0x01;

    const originalHash = sha256(originalArtifactBytes);
    const tamperedHash = sha256(tamperedArtifactBytes);

    expect(originalHash).not.toBe(tamperedHash);
    expect(verifySha256(originalHash, tamperedHash)).toBe(false);

    // Verify avalanche effect: at least 20 hex characters should differ
    let diffCount = 0;
    for (let i = 0; i < originalHash.length; i++) {
      if (originalHash[i] !== tamperedHash[i]) diffCount++;
    }
    expect(diffCount).toBeGreaterThanOrEqual(25);
  });

  // TEST 6: Tamper with signature → verification must FAIL
  it('TEST 6: Tamper with signature -> verification must FAIL', () => {
    const keyPair = generateEd25519KeyPair();
    const statement = createSampleStatement();

    const { envelope } = signStatement(statement, keyPair.privateKeyPem, keyPair.keyId);

    // 1. Bit-flip the signature payload
    const rawSig = Buffer.from(envelope.signature, 'base64');
    rawSig[0] = rawSig[0]! ^ 0xff; // Invert first byte
    const tamperedBase64Sig = rawSig.toString('base64');

    const resultTampered = verifyStatementSignature(statement, tamperedBase64Sig, keyPair.publicKeyPem);
    expect(resultTampered.isValid).toBe(false);
    expect(resultTampered.error).toContain('Cryptographic signature verification failed');

    // 2. Corrupt signature length (truncate to 32 bytes)
    const truncatedSig = rawSig.subarray(0, 32).toString('base64');
    const resultTruncated = verifyStatementSignature(statement, truncatedSig, keyPair.publicKeyPem);
    expect(resultTruncated.isValid).toBe(false);
    expect(resultTruncated.error).toContain('expected 64 bytes');

    // 3. Verify with wrong public key (Builder B's key)
    const wrongKeyPair = generateEd25519KeyPair('builder_beta');
    const resultWrongKey = verifyStatementSignature(statement, envelope.signature, wrongKeyPair.publicKeyPem);
    expect(resultWrongKey.isValid).toBe(false);
    expect(resultWrongKey.error).toContain('Cryptographic signature verification failed');
  });

  // Additional robustness tests
  it('Handles file hashing correctly for on-disk artifacts', async () => {
    const tmpDir = os.tmpdir();
    const testFile = path.join(tmpDir, `quorum-test-artifact-${Date.now()}.bin`);
    const testContent = Buffer.from('Reproducible binary artifact payload 2026', 'utf8');

    fs.writeFileSync(testFile, testContent);

    try {
      const syncHash = sha256FileSync(testFile);
      const asyncHash = await sha256File(testFile);
      const directHash = sha256(testContent);

      expect(syncHash).toBe(directHash);
      expect(asyncHash).toBe(directHash);
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });

  it('Generates consistent key fingerprints', () => {
    const keyPair = generateEd25519KeyPair();
    const fp1 = computeKeyFingerprint(keyPair.publicKeyPem);
    const fp2 = computeKeyFingerprint(keyPair.publicKeyPem);

    expect(fp1).toBe(fp2);
    expect(fp1).toBe(keyPair.publicKeyFingerprint);
  });
});
