import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { QuorumRepository } from '../../db/repositories/quorum.repository.js';
import { ReleasesRepository } from '../../db/repositories/releases.repository.js';
import { ApiResponse, QuorumResultDto } from '../api.types.js';
import { QUORUM_THRESHOLD_PERCENT } from '../../quorum/quorum-rules.js';
import { getSingleParam } from '../middleware/request-validation.js';

export class QuorumController {
  private readonly quorumRepo: QuorumRepository;
  private readonly releasesRepo: ReleasesRepository;

  constructor(db: Database.Database) {
    this.quorumRepo = new QuorumRepository(db);
    this.releasesRepo = new ReleasesRepository(db);
  }

  getQuorumResult = (req: Request, res: Response<ApiResponse<QuorumResultDto>>): void => {
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

    const quorumRecord = this.quorumRepo.getQuorumResultByReleaseId(releaseId);

    if (!quorumRecord) {
      res.status(404).json({
        success: false,
        error: {
          code: 'QUORUM_NOT_EVALUATED',
          message: `Quorum consensus has not yet been evaluated for release '${releaseId}'. Call POST /api/releases/${releaseId}/evaluate first.`,
        },
      });
      return;
    }

    let parsedBreakdown: any = {};
    try {
      parsedBreakdown = JSON.parse(quorumRecord.breakdown_json);
    } catch {
      // fallback
    }

    const hashGroups = parsedBreakdown.hashGroups ?? [];
    const invalidAttestations = parsedBreakdown.invalidAttestationCount ?? 0;
    const disagreementDetected =
      parsedBreakdown.disagreementDetected ?? (hashGroups.length > 1);
    const sufficientEvidence = quorumRecord.total_builders >= 3;

    const dto: QuorumResultDto = {
      releaseId: quorumRecord.release_id,
      status: quorumRecord.quorum_status,
      validAttestations: quorumRecord.total_builders,
      invalidAttestations,
      dominantHash: quorumRecord.canonical_hash,
      dominantBuilderCount: quorumRecord.agreeing_count,
      consensusPercentage: quorumRecord.consensus_percentage,
      threshold: QUORUM_THRESHOLD_PERCENT,
      sufficientEvidence,
      disagreementDetected,
      hashGroups,
      evaluatedAt: quorumRecord.decided_at,
      explanation: parsedBreakdown.explanation,
    };

    res.status(200).json({
      success: true,
      data: dto,
    });
  };
}
