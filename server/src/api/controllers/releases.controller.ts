import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ReleasesRepository } from '../../db/repositories/releases.repository.js';
import { ArtifactsRepository } from '../../db/repositories/artifacts.repository.js';
import { VerificationEngine } from '../../verification/verification-engine.js';
import { QuorumEngine } from '../../quorum/quorum-engine.js';
import { LedgerService } from '../../ledger/ledger-service.js';
import { sha256 } from '../../crypto/hash.js';
import { DEFAULT_ARTIFACTS_DIR } from '../../builders/artifact-builder.js';
import { parseMultipartRequest } from '../middleware/multipart.js';
import { GitHubSourceService, SourceResolutionError } from '../../source/index.js';
import {
  ApiResponse,
  ReleaseDto,
  ReleaseEvaluationResponse,
  UploadReleaseResponse,
  CreateReleaseFromSourceResponse,
} from '../api.types.js';
import { getSingleParam } from '../middleware/request-validation.js';

export class ReleasesController {
  private readonly releasesRepo: ReleasesRepository;
  private readonly verificationEngine: VerificationEngine;
  private readonly quorumEngine: QuorumEngine;
  private readonly db: Database.Database;
  private readonly artifactsDir: string | undefined;
  private readonly githubSourceService: GitHubSourceService;

  constructor(db: Database.Database, artifactsDir?: string, githubSourceService?: GitHubSourceService) {
    this.releasesRepo = new ReleasesRepository(db);
    this.verificationEngine = new VerificationEngine(db, artifactsDir);
    this.quorumEngine = new QuorumEngine(db, artifactsDir);
    this.db = db;
    this.artifactsDir = artifactsDir;
    this.githubSourceService = githubSourceService ?? new GitHubSourceService();
  }

  private extractReleaseMetadata(r: { build_spec_json?: string | null; repo_url?: string }): {
    ownerAvatarUrl: string | null;
    visibility: string;
  } {
    let ownerAvatarUrl: string | null = null;
    let visibility = 'public';
    if (r.build_spec_json) {
      try {
        const spec = JSON.parse(r.build_spec_json);
        if (spec.ownerAvatarUrl) ownerAvatarUrl = spec.ownerAvatarUrl;
        if (spec.visibility) visibility = spec.visibility;
      } catch {}
    }
    if (!ownerAvatarUrl && r.repo_url && r.repo_url.includes('github.com/')) {
      const match = r.repo_url.match(/github\.com\/([^/]+)/);
      if (match && match[1]) {
        ownerAvatarUrl = `https://github.com/${match[1]}.png?size=128`;
      }
    }
    return { ownerAvatarUrl, visibility };
  }

  getReleases = (_req: Request, res: Response<ApiResponse<ReleaseDto[]>>): void => {
    const releases = this.releasesRepo.getAllReleases();

    const dtos: ReleaseDto[] = releases.map((r) => {
      const { ownerAvatarUrl, visibility } = this.extractReleaseMetadata(r);
      return {
        releaseId: r.id,
        project: r.project_name,
        version: r.version,
        repoUrl: r.repo_url,
        commitSha: r.commit_sha,
        expectedArtifactName: r.expected_artifact_name,
        expectedHash: r.expected_hash,
        status: r.status,
        createdAt: r.created_at,
        ownerAvatarUrl,
        visibility,
      };
    });

    res.status(200).json({
      success: true,
      data: dtos,
    });
  };

  getReleaseById = (req: Request, res: Response<ApiResponse<ReleaseDto>>): void => {
    const releaseId = getSingleParam(req.params.releaseId);
    const release = this.releasesRepo.getReleaseById(releaseId);

    if (!release) {
      res.status(404).json({
        success: false,
        error: {
          code: 'RELEASE_NOT_FOUND',
          message: `Release with ID '${releaseId}' was not found`,
        },
      });
      return;
    }

    const { ownerAvatarUrl, visibility } = this.extractReleaseMetadata(release);

    const dto: ReleaseDto = {
      releaseId: release.id,
      project: release.project_name,
      version: release.version,
      repoUrl: release.repo_url,
      commitSha: release.commit_sha,
      expectedArtifactName: release.expected_artifact_name,
      expectedHash: release.expected_hash,
      status: release.status,
      createdAt: release.created_at,
      ownerAvatarUrl,
      visibility,
    };

    res.status(200).json({
      success: true,
      data: dto,
    });
  };

  /**
   * Executes the complete verification and quorum evaluation pipeline:
   * 1. Phase 5: Verification Engine evaluates attestations into verification_results
   * 2. Phase 6: Quorum Engine evaluates consensus and updates release status
   * 3. Phase 7: Tamper-Evident Audit Ledger records all transitions
   */
  evaluateRelease = async (
    req: Request,
    res: Response<ApiResponse<ReleaseEvaluationResponse>>
  ): Promise<void> => {
    const releaseId = getSingleParam(req.params.releaseId);
    const release = this.releasesRepo.getReleaseById(releaseId);

    if (!release) {
      res.status(404).json({
        success: false,
        error: {
          code: 'RELEASE_NOT_FOUND',
          message: `Cannot evaluate: Release with ID '${releaseId}' was not found`,
        },
      });
      return;
    }

    // Step 1: Execute Phase 5 Verification Engine
    const verificationResults = await this.verificationEngine.verifyReleaseAttestations(releaseId);

    // Step 2: Execute Phase 6 Quorum Engine (persists quorum and records Phase 7 audit events)
    const quorumResult = await this.quorumEngine.evaluateReleaseQuorum(releaseId);

    const validCount = verificationResults.filter((v) => v.status === 'VALID').length;
    const invalidCount = verificationResults.length - validCount;

    const responseData: ReleaseEvaluationResponse = {
      releaseId: release.id,
      status: quorumResult.status,
      verification: {
        total: verificationResults.length,
        valid: validCount,
        invalid: invalidCount,
      },
      quorum: {
        consensusPercentage: quorumResult.consensusPercentage,
        dominantHash: quorumResult.dominantHash,
        disagreementDetected: quorumResult.disagreementDetected,
      },
    };

    res.status(200).json({
      success: true,
      data: responseData,
    });
  };

  uploadReleaseArtifact = async (
    req: Request,
    res: Response<ApiResponse<UploadReleaseResponse>>
  ): Promise<void> => {
    try {
      const parsed = await parseMultipartRequest(req);
      if (!parsed.file || parsed.file.buffer.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_UPLOADED',
            message: 'No artifact file was uploaded. Please provide an artifact file.',
          },
        });
        return;
      }

      const file = parsed.file;
      const originalName = path.basename(file.originalName || 'artifact.bin');
      const fileBytes = file.buffer;
      const sizeBytes = fileBytes.length;

      // 1. Calculate REAL SHA-256 directly from the actual uploaded bytes
      const artifactSha256 = sha256(fileBytes);

      // 2. Extract metadata with clean fallbacks
      const projectName = (
        parsed.fields.projectName ||
        path.parse(originalName).name ||
        'uploaded-project'
      ).trim();
      const version = (parsed.fields.version || '1.0.0').trim();
      const repoUrl = (parsed.fields.repoUrl || 'https://local.upload/artifact').trim();
      const commitSha = (
        parsed.fields.commitSha ||
        crypto.createHash('sha1').update(fileBytes).digest('hex')
      ).trim().toLowerCase();

      // 3. Store actual artifact file on disk using existing artifact storage architecture
      const artifactsDir = this.artifactsDir ?? DEFAULT_ARTIFACTS_DIR;
      if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
      }
      const targetPath = path.join(artifactsDir, originalName);
      fs.writeFileSync(targetPath, fileBytes);

      // 4. Generate unique release ID
      const sanitizedProject = projectName.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const releaseId = `rel_${Date.now()}_${sanitizedProject || 'app'}`;

      // 5. Create release record with real expected_hash = calculated SHA-256
      const release = this.releasesRepo.createRelease({
        id: releaseId,
        projectName,
        version,
        repoUrl,
        commitSha,
        buildSpecJson: JSON.stringify({
          source: 'user-artifact-upload',
          uploadedAt: new Date().toISOString(),
          filename: originalName,
          sizeBytes,
          sha256: artifactSha256,
        }),
        expectedArtifactName: originalName,
        expectedHash: artifactSha256,
        status: 'PENDING',
      });

      // 6. Store artifact in artifacts table
      const artifactsRepo = new ArtifactsRepository(this.db);
      artifactsRepo.createArtifact({
        id: `art_${releaseId}`,
        releaseId,
        filename: originalName,
        expectedSha256: artifactSha256,
        sizeBytes,
      });

      // 7. Record real RELEASE_CREATED event in tamper-evident audit ledger
      const ledger = new LedgerService(this.db);
      ledger.recordReleaseCreated({
        releaseId,
        projectName,
        version,
        commitSha,
        repoUrl,
        expectedArtifactName: originalName,
      });

      res.status(201).json({
        success: true,
        data: {
          releaseId,
          projectName,
          version,
          repoUrl,
          commitSha,
          expectedArtifactName: originalName,
          artifactSha256,
          sizeBytes,
          status: 'PENDING',
          createdAt: release.created_at,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  };

  createRelease = async (
    req: Request,
    res: Response<ApiResponse<any>>
  ): Promise<void> => {
    // If multipart/form-data, handle as real file upload
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      return this.uploadReleaseArtifact(req, res);
    }

    const { projectName, version, repoUrl, commitSha, expectedArtifactName, buildScenario } = req.body;

    // Validate required fields
    if (!projectName || !version || !repoUrl || !commitSha || !expectedArtifactName) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Required fields: projectName, version, repoUrl, commitSha, expectedArtifactName',
        },
      });
      return;
    }

    const validScenarios = ['clean', 'conflict', 'no-consensus', 'insufficient'];
    const scenario = buildScenario && validScenarios.includes(buildScenario) ? buildScenario : 'clean';

    try {
      const { runBuilderScenario } = await import('../../builders/demo-scenarios.js');
      const { DEFAULT_ARTIFACTS_DIR } = await import('../../builders/artifact-builder.js');

      const scenarioResult = await runBuilderScenario({
        scenario,
        db: this.db,
        artifactsDir: this.artifactsDir ?? DEFAULT_ARTIFACTS_DIR,
        releaseIdPrefix: 'rel',
        overrideMetadata: {
          projectName,
          version,
          repoUrl,
          commitSha,
          expectedArtifactName,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          releaseId: scenarioResult.releaseId,
          projectName,
          version,
          repoUrl,
          commitSha,
          expectedArtifactName,
          scenario,
          status: 'PENDING',
          builderCount: scenarioResult.builderOutputs.length,
          distinctHashes: scenarioResult.distinctHashes,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: {
          code: 'RELEASE_CREATION_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  };

  /**
   * Resolves a public GitHub repository source reference, creates a release,
   * runs the deterministic builder simulation, verifies attestations (Phase 5),
   * evaluates quorum consensus (Phase 6), and records all audit ledger events (Phase 7).
   */
  createReleaseFromSource = async (
    req: Request,
    res: Response<ApiResponse<CreateReleaseFromSourceResponse>>
  ): Promise<void> => {
    try {
      const { repositoryUrl, ref, scenario } = req.body;

      if (!repositoryUrl || typeof repositoryUrl !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_URL',
            message: 'Field "repositoryUrl" is required and must be a valid GitHub HTTPS URL',
          },
        });
        return;
      }

      // 1. Resolve source repository and commit SHA via GitHub public API
      const resolution = await this.githubSourceService.resolveSource({
        repositoryUrl,
        ref,
      });

      const validScenarios = ['clean', 'conflict', 'no-consensus', 'insufficient'];
      const chosenScenario = scenario && validScenarios.includes(scenario) ? scenario : 'clean';

      const {
        owner,
        repository,
        repositoryUrl: resolvedRepoUrl,
        commitSha,
        ref: resolvedRef,
        ownerAvatarUrl,
        visibility,
      } = resolution;
      const projectName = `${owner}/${repository}`;
      const expectedArtifactName = `${repository}-${resolvedRef}-linux-amd64.bin`;

      // 2. Run deterministic builder simulation with the resolved source identity
      const { runBuilderScenario } = await import('../../builders/demo-scenarios.js');
      const { DEFAULT_ARTIFACTS_DIR } = await import('../../builders/artifact-builder.js');

      const scenarioResult = await runBuilderScenario({
        scenario: chosenScenario,
        db: this.db,
        artifactsDir: this.artifactsDir ?? DEFAULT_ARTIFACTS_DIR,
        releaseIdPrefix: 'rel',
        overrideMetadata: {
          projectName,
          version: resolvedRef,
          repoUrl: resolvedRepoUrl,
          commitSha,
          expectedArtifactName,
          buildSpecExtras: {
            ownerAvatarUrl,
            visibility,
          },
        },
      });

      // 3. Execute Phase 5 Verification Engine
      const verificationResults = await this.verificationEngine.verifyReleaseAttestations(
        scenarioResult.releaseId
      );

      // 4. Execute Phase 6 Quorum Engine (persists quorum and records Phase 7 audit events)
      const quorumResult = await this.quorumEngine.evaluateReleaseQuorum(scenarioResult.releaseId);

      const validCount = verificationResults.filter((v) => v.status === 'VALID').length;
      const invalidCount = verificationResults.length - validCount;

      res.status(201).json({
        success: true,
        data: {
          releaseId: scenarioResult.releaseId,
          status: quorumResult.status,
          source: resolution,
          verification: {
            total: verificationResults.length,
            valid: validCount,
            invalid: invalidCount,
          },
          quorum: {
            consensusPercentage: quorumResult.consensusPercentage,
            dominantHash: quorumResult.dominantHash,
            disagreementDetected: quorumResult.disagreementDetected,
          },
          simulationNote:
            "Source repository resolved. Builder verification uses Quorum's deterministic builder simulation for this MVP.",
        },
      });
    } catch (err) {
      if (err instanceof SourceResolutionError) {
        res.status(err.statusCode).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'RELEASE_CREATION_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  };
}

