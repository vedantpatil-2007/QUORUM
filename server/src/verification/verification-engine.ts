import type Database from 'better-sqlite3';
import {
  AttestationVerificationResult,
  VerificationCheckDetail,
  VerificationOptions,
  CheckStatus,
} from './verification.types.js';
import { VerificationCheckCode, VerificationEngineError } from './verification-errors.js';
import { validateArtifactOnDisk } from './artifact-validator.js';
import {
  validateAttestationSchema,
  validateBuilderIdentity,
  validateSourceCommit,
  verifyAttestationSignature,
} from './attestation-validator.js';
import { AttestationsRepository } from '../db/repositories/attestations.repository.js';
import { BuildersRepository } from '../db/repositories/builders.repository.js';
import { ReleasesRepository } from '../db/repositories/releases.repository.js';
import { VerificationRepository } from '../db/repositories/verification.repository.js';
import { DEFAULT_ARTIFACTS_DIR } from '../builders/artifact-builder.js';
import { AttestationStatement } from '../models/attestation.types.js';
import { LedgerService } from '../ledger/ledger-service.js';

export class VerificationEngine {
  private readonly attestationsRepo: AttestationsRepository;
  private readonly buildersRepo: BuildersRepository;
  private readonly releasesRepo: ReleasesRepository;
  private readonly verificationRepo: VerificationRepository;
  private readonly ledgerService: LedgerService;
  private readonly artifactsDir: string;

  constructor(
    private readonly db: Database.Database,
    artifactsDir: string = DEFAULT_ARTIFACTS_DIR
  ) {
    this.attestationsRepo = new AttestationsRepository(db);
    this.buildersRepo = new BuildersRepository(db);
    this.releasesRepo = new ReleasesRepository(db);
    this.verificationRepo = new VerificationRepository(db);
    this.ledgerService = new LedgerService(db);
    this.artifactsDir = artifactsDir;
  }

  /**
   * Verifies an individual builder attestation against release specifications,
   * builder registry, physical on-disk artifact, and cryptographic signatures.
   */
  async verifyAttestation(
    attestationId: string,
    options: VerificationOptions = {}
  ): Promise<AttestationVerificationResult> {
    const verifiedAt = new Date().toISOString();
    const artifactsDir = options.artifactsDir ?? this.artifactsDir;

    // 1. Load Attestation
    const attestation = this.attestationsRepo.getAttestationById(attestationId);
    if (!attestation) {
      throw new VerificationEngineError(`Attestation "${attestationId}" not found in database.`);
    }

    // 2. Load Associated Release
    const release = this.releasesRepo.getReleaseById(attestation.release_id);
    if (!release) {
      throw new VerificationEngineError(`Associated release "${attestation.release_id}" not found.`);
    }

    const checkDetails: VerificationCheckDetail[] = [];
    const checks: Record<string, CheckStatus> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    const addCheck = (
      code: VerificationCheckCode,
      name: string,
      status: CheckStatus,
      details?: string
    ) => {
      checks[code] = status;
      checkDetails.push({ code, name, status, details });
      if (status === 'FAILED' && details) {
        errors.push(`[${name}] ${details}`);
      }
    };

    // Parse statement JSON
    let statement: AttestationStatement;
    try {
      statement = JSON.parse(attestation.statement_json) as AttestationStatement;
    } catch (err) {
      addCheck(
        VerificationCheckCode.SCHEMA_VALIDATION,
        'Schema Validation',
        'FAILED',
        `Corrupted statement JSON: ${err instanceof Error ? err.message : String(err)}`
      );
      return this.finalizeResult({
        attestationId,
        releaseId: release.id,
        builderId: attestation.builder_id,
        signatureValid: false,
        commitMatch: false,
        builderActive: false,
        artifactExists: false,
        artifactHashMatches: false,
        checks,
        checkDetails,
        errors,
        warnings,
        verifiedAt,
        options,
      });
    }

    // 3. Schema Validation
    const schemaValidation = validateAttestationSchema(statement);
    if (!schemaValidation.isValid) {
      addCheck(
        VerificationCheckCode.SCHEMA_VALIDATION,
        'Schema Validation',
        'FAILED',
        schemaValidation.errors.join('; ')
      );
    } else {
      addCheck(VerificationCheckCode.SCHEMA_VALIDATION, 'Schema Validation', 'PASSED');
    }

    // 4. Builder Lookup & Status Check
    const builder = this.buildersRepo.getBuilderById(attestation.builder_id);
    let builderActive = false;

    if (!builder) {
      addCheck(
        VerificationCheckCode.BUILDER_LOOKUP,
        'Builder Lookup',
        'FAILED',
        `Builder "${attestation.builder_id}" is not registered in the system.`
      );
    } else {
      addCheck(VerificationCheckCode.BUILDER_LOOKUP, 'Builder Lookup', 'PASSED');

      if (builder.status !== 'ACTIVE') {
        addCheck(
          VerificationCheckCode.BUILDER_STATUS,
          'Builder Status',
          'FAILED',
          `Builder is not active. Status: ${builder.status}`
        );
      } else {
        builderActive = true;
        addCheck(VerificationCheckCode.BUILDER_STATUS, 'Builder Status', 'PASSED');
      }

      // Check public key ID
      const builderIdValidation = validateBuilderIdentity(
        builder,
        attestation.builder_id,
        attestation.public_key_id
      );
      if (!builderIdValidation.isValid) {
        addCheck(
          VerificationCheckCode.PUBLIC_KEY_MATCH,
          'Public Key Identifier',
          'FAILED',
          builderIdValidation.error
        );
      } else {
        addCheck(VerificationCheckCode.PUBLIC_KEY_MATCH, 'Public Key Identifier', 'PASSED');
      }
    }

    // 5. Source Commit Verification
    const commitCheck = validateSourceCommit(attestation.source_commit, release.commit_sha);
    const commitMatch = commitCheck.matches;
    if (!commitMatch) {
      addCheck(
        VerificationCheckCode.COMMIT_MATCH,
        'Source Commit Match',
        'FAILED',
        commitCheck.error
      );
    } else {
      addCheck(VerificationCheckCode.COMMIT_MATCH, 'Source Commit Match', 'PASSED');
    }

    // 6. Artifact Verification (Existence, Name, & Real SHA-256 Calculation)
    const artifactCheck = validateArtifactOnDisk(
      attestation.builder_id,
      attestation.artifact_name,
      release.expected_artifact_name,
      attestation.artifact_sha256,
      artifactsDir
    );

    if (!artifactCheck.nameMatches) {
      addCheck(
        VerificationCheckCode.ARTIFACT_IDENTITY,
        'Artifact Name Match',
        'FAILED',
        artifactCheck.error
      );
    } else {
      addCheck(VerificationCheckCode.ARTIFACT_IDENTITY, 'Artifact Name Match', 'PASSED');
    }

    if (!artifactCheck.artifactExists) {
      addCheck(
        VerificationCheckCode.ARTIFACT_EXISTS,
        'Artifact On-Disk Check',
        'FAILED',
        artifactCheck.error
      );
    } else {
      addCheck(VerificationCheckCode.ARTIFACT_EXISTS, 'Artifact On-Disk Check', 'PASSED');
    }

    if (!artifactCheck.hashMatches) {
      addCheck(
        VerificationCheckCode.ARTIFACT_HASH_MATCH,
        'Artifact SHA-256 Digest Match',
        'FAILED',
        artifactCheck.error
      );
    } else {
      addCheck(VerificationCheckCode.ARTIFACT_HASH_MATCH, 'Artifact SHA-256 Digest Match', 'PASSED');
    }

    // Build log check (informational / audit)
    if (artifactCheck.buildLogCheck === 'PASSED') {
      addCheck(VerificationCheckCode.BUILD_LOG_HASH, 'Build Log Hash Check', 'PASSED');
    } else {
      addCheck(
        VerificationCheckCode.BUILD_LOG_HASH,
        'Build Log Hash Check',
        'UNAVAILABLE',
        'Build log file not present on disk for this builder run'
      );
      warnings.push('Build log file not available for independent hash verification.');
    }

    // 7. Cryptographic Ed25519 Signature Verification
    let signatureValid = false;
    if (builder) {
      const sigCheck = verifyAttestationSignature(
        statement,
        attestation.signature,
        builder.public_key,
        attestation.public_key_id
      );
      signatureValid = sigCheck.isValid;

      if (!signatureValid) {
        addCheck(
          VerificationCheckCode.SIGNATURE_VERIFICATION,
          'Cryptographic Signature',
          'FAILED',
          sigCheck.error ?? 'Ed25519 signature verification failed against registered public key'
        );
      } else {
        addCheck(VerificationCheckCode.SIGNATURE_VERIFICATION, 'Cryptographic Signature', 'PASSED');
      }
    } else {
      addCheck(
        VerificationCheckCode.SIGNATURE_VERIFICATION,
        'Cryptographic Signature',
        'SKIPPED',
        'Cannot verify signature: builder public key not found'
      );
    }

    return this.finalizeResult({
      attestationId,
      releaseId: release.id,
      builderId: attestation.builder_id,
      signatureValid,
      commitMatch,
      builderActive,
      artifactExists: artifactCheck.artifactExists,
      artifactHashMatches: artifactCheck.hashMatches,
      checks,
      checkDetails,
      errors,
      warnings,
      verifiedAt,
      options,
    });
  }

  /**
   * Verifies all attestations for a given release independently.
   * Persists every result into SQLite and returns the results list.
   */
  async verifyReleaseAttestations(
    releaseId: string,
    options: VerificationOptions = {}
  ): Promise<AttestationVerificationResult[]> {
    const attestations = this.attestationsRepo.getAttestationsByReleaseId(releaseId);
    const results: AttestationVerificationResult[] = [];

    for (const att of attestations) {
      const res = await this.verifyAttestation(att.id, options);
      results.push(res);
    }

    return results;
  }

  private finalizeResult(params: {
    attestationId: string;
    releaseId: string;
    builderId: string;
    signatureValid: boolean;
    commitMatch: boolean;
    builderActive: boolean;
    artifactExists: boolean;
    artifactHashMatches: boolean;
    checks: Record<string, CheckStatus>;
    checkDetails: VerificationCheckDetail[];
    errors: string[];
    warnings: string[];
    verifiedAt: string;
    options: VerificationOptions;
  }): AttestationVerificationResult {
    // Final status is VALID only if all required checks passed
    const isOverallValid =
      params.signatureValid &&
      params.commitMatch &&
      params.builderActive &&
      params.artifactExists &&
      params.artifactHashMatches &&
      params.errors.length === 0;

    const status: 'VALID' | 'INVALID' = isOverallValid ? 'VALID' : 'INVALID';

    const notes = JSON.stringify({
      checks: params.checks,
      errors: params.errors,
      warnings: params.warnings,
    });

    // Persist to verification_results table unless skipPersistence is requested
    if (!params.options.skipPersistence) {
      const verificationId = `vr_${params.attestationId}_${Date.now()}`;
      this.verificationRepo.createVerificationResult({
        id: verificationId,
        releaseId: params.releaseId,
        attestationId: params.attestationId,
        signatureValid: params.signatureValid ? 1 : 0,
        commitMatch: params.commitMatch ? 1 : 0,
        builderActive: params.builderActive ? 1 : 0,
        status,
        notes,
        verifiedAt: params.verifiedAt,
      });

      this.ledgerService.recordAttestationVerified({
        releaseId: params.releaseId,
        attestationId: params.attestationId,
        builderId: params.builderId,
        status,
        signatureValid: params.signatureValid,
        commitMatch: params.commitMatch,
        builderActive: params.builderActive,
      });
    }

    return {
      attestationId: params.attestationId,
      releaseId: params.releaseId,
      builderId: params.builderId,
      signatureValid: params.signatureValid,
      commitMatch: params.commitMatch,
      builderActive: params.builderActive,
      artifactExists: params.artifactExists,
      artifactHashMatches: params.artifactHashMatches,
      status,
      checks: params.checks,
      checkDetails: params.checkDetails,
      errors: params.errors,
      warnings: params.warnings,
      notes,
      verifiedAt: params.verifiedAt,
    };
  }
}
