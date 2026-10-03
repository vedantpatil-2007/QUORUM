import fs from 'node:fs';
import path from 'node:path';
import { sha256FileSync, verifySha256 } from '../crypto/hash.js';
import { DEFAULT_ARTIFACTS_DIR } from '../builders/artifact-builder.js';

export interface ArtifactValidationResult {
  nameMatches: boolean;
  artifactExists: boolean;
  artifactPath: string | null;
  calculatedSha256: string | null;
  hashMatches: boolean;
  buildLogCheck: 'PASSED' | 'UNAVAILABLE';
  error?: string;
}

/**
 * Validates the physical artifact on disk against the attestation claims.
 * 
 * CRITICAL SECURITY PROPERTY:
 * Never trusts the SHA-256 string written in the attestation without
 * independently hashing the actual on-disk binary bytes.
 */
export function validateArtifactOnDisk(
  builderId: string,
  claimedArtifactName: string,
  expectedArtifactName: string,
  claimedSha256: string,
  artifactsDir: string = DEFAULT_ARTIFACTS_DIR
): ArtifactValidationResult {
  // 1. Verify artifact name matches release declaration
  const nameMatches = claimedArtifactName === expectedArtifactName;
  if (!nameMatches) {
    return {
      nameMatches: false,
      artifactExists: false,
      artifactPath: null,
      calculatedSha256: null,
      hashMatches: false,
      buildLogCheck: 'UNAVAILABLE',
      error: `Artifact name mismatch: attestation claimed "${claimedArtifactName}" but release expects "${expectedArtifactName}"`,
    };
  }

  // 2. Locate artifact file on disk:
  // Check builder-prefixed filename first (e.g. bld_node_alpha_us-app.bin), then plain filename
  const prefixedPath = path.join(artifactsDir, `${builderId}-${claimedArtifactName}`);
  const plainPath = path.join(artifactsDir, claimedArtifactName);

  let targetPath: string | null = null;
  if (fs.existsSync(prefixedPath)) {
    targetPath = prefixedPath;
  } else if (fs.existsSync(plainPath)) {
    targetPath = plainPath;
  }

  if (!targetPath) {
    return {
      nameMatches: true,
      artifactExists: false,
      artifactPath: null,
      calculatedSha256: null,
      hashMatches: false,
      buildLogCheck: 'UNAVAILABLE',
      error: `Artifact file not found on disk at "${prefixedPath}" or "${plainPath}"`,
    };
  }

  // 3. Compute REAL SHA-256 of the actual file on disk
  let calculatedSha256: string;
  try {
    calculatedSha256 = sha256FileSync(targetPath);
  } catch (err) {
    return {
      nameMatches: true,
      artifactExists: true,
      artifactPath: targetPath,
      calculatedSha256: null,
      hashMatches: false,
      buildLogCheck: 'UNAVAILABLE',
      error: `Failed to read and hash artifact file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Compare calculated SHA-256 with claimed SHA-256 using timing-safe comparison
  const hashMatches = verifySha256(calculatedSha256, claimedSha256);

  // 5. Build log availability check (optional check)
  // For the simulator, build logs are checked if on-disk log file exists
  const logPath = path.join(artifactsDir, `${builderId}-build.log`);
  const buildLogCheck = fs.existsSync(logPath) ? 'PASSED' : 'UNAVAILABLE';

  return {
    nameMatches: true,
    artifactExists: true,
    artifactPath: targetPath,
    calculatedSha256,
    hashMatches,
    buildLogCheck,
    error: hashMatches
      ? undefined
      : `Artifact hash mismatch: calculated actual SHA-256 (${calculatedSha256}) does not match claimed SHA-256 (${claimedSha256})`,
  };
}
