# Quorum Cryptographic Foundation

This module implements the core cryptographic primitives for the **Quorum** decentralized software-supply-chain verification engine.

---

## 1. Design Principles

1. **Zero Mock Cryptography:** All signatures are genuine Ed25519 digital signatures, and all hashes are true SHA-256 digests computed using OpenSSL-backed native Node.js `crypto` primitives.
2. **Deterministic Serialization (RFC 8785):** Statements are serialized using the JSON Canonicalization Scheme (JCS) prior to signing and verification. This prevents signature invalidation caused by key reordering, spacing differences, or number representation discrepancies across different runtimes.
3. **Defense-in-Depth Verification:** Verifiers perform strict syntax and length checks (e.g., verifying 64-byte Ed25519 signature bounds) before executing cryptographic operations to protect against malformed payload attacks.

---

## 2. Cryptographic Specifications

### Algorithm Selection: Ed25519 (EdDSA over Curve25519)
- **Security:** ~128-bit security level, immune to side-channel timing attacks, deterministic nonces (eliminating the catastrophic private key leaks seen in ECDSA with weak RNGs).
- **Performance:** Sub-millisecond signing and verification speeds.
- **Key Sizes:** 32-byte public keys, 64-byte signatures.
- **Standard Encodings:**
  - Public Keys: SubjectPublicKeyInfo (SPKI) in PEM and Base64 format.
  - Private Keys: PKCS#8 in PEM format.

### Hash Algorithm: SHA-256
- Artifacts, build logs, and audit chains use SHA-256 (FIPS 180-4).
- Hash comparisons employ constant-time comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.

### Canonical Serialization: RFC 8785 (JCS)
- Object keys sorted strictly by UTF-16 code units.
- No whitespace outside of string literals.
- Numbers formatted per ECMAScript specification (`-0` serialized as `0`).
- Strict JSON string escape rules.

---

## 3. Module Overview

| File | Purpose |
| :--- | :--- |
| [`keys.ts`](./keys.ts) | Ed25519 keypair generation, PEM/Base64 export, key validation, and SHA-256 key fingerprinting. |
| [`canonicalize.ts`](./canonicalize.ts) | Deterministic RFC 8785 JSON Canonicalization Scheme (JCS) implementation. |
| [`hash.ts`](./hash.ts) | Dynamic SHA-256 calculation for strings, Buffers, and disk-streamed files, with timing-safe comparison. |
| [`signer.ts`](./signer.ts) | Canonicalizes attestation statements and signs canonical UTF-8 bytes using Ed25519 private keys. |
| [`verifier.ts`](./verifier.ts) | Re-canonicalizes statements and verifies Ed25519 signatures against registered public keys with diagnostics. |

---

## 4. Verification Flow

```
Attestation Statement (JSON Object)
              │
              ▼
   [ RFC 8785 Canonicalizer ]
              │ (Bit-identical UTF-8 byte stream)
              ▼
   [ crypto.verify (Ed25519) ]  <───  Registered Public Key (PEM)
              │
      ┌───────┴───────┐
      ▼               ▼
 [ PASS ]         [ FAIL ]
Signature        Signature Tampered, Field Modified,
Valid            or Wrong Public Key
```
