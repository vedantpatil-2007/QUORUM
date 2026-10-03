import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { VerificationRepository } from '../../db/repositories/verification.repository.js';
import { ReleasesRepository } from '../../db/repositories/releases.repository.js';
import { AttestationsRepository } from '../../db/repositories/attestations.repository.js';
import { ApiResponse, VerificationResultDto } from '../api.types.js';
import { getSingleParam } from '../middleware/request-validation.js';

export class VerificationController {
  private readonly verificationRepo: VerificationRepository;
  private readonly releasesRepo: ReleasesRepository;
  private readonly attestationsRepo: AttestationsRepository;

  constructor(db: Database.Database) {
    this.verificationRepo = new VerificationRepository(db);
    this.releasesRepo = new ReleasesRepository(db);
    this.attestationsRepo = new AttestationsRepository(db);
  }

  getVerificationResults = (
    req: Request,
    res: Response<ApiResponse<VerificationResultDto[]>>
  ): void => {
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

    const records = this.verificationRepo.getVerificationResultsByReleaseId(releaseId);

    const dtos: VerificationResultDto[] = records.map((r) => {
      const attestation = this.attestationsRepo.getAttestationById(r.attestation_id);
      let parsedNotes: unknown = null;
      if (r.notes) {
        try {
          parsedNotes = JSON.parse(r.notes);
        } catch {
          parsedNotes = r.notes;
        }
      }

      return {
        id: r.id,
        attestationId: r.attestation_id,
        builderId: attestation?.builder_id ?? 'unknown_builder',
        signatureValid: r.signature_valid === 1,
        commitMatch: r.commit_match === 1,
        builderActive: r.builder_active === 1,
        status: r.status,
        notes: parsedNotes,
        verifiedAt: r.verified_at,
      };
    });

    // Deduplicate by builderId for the current/latest evaluation per unique builder
    // If client passes query ?all=true, return full historical list
    const returnAll = req.query.all === 'true';
    let data = dtos;
    if (!returnAll) {
      const latestPerBuilder = new Map<string, VerificationResultDto>();
      const sorted = [...dtos].sort(
        (a, b) => new Date(a.verifiedAt).getTime() - new Date(b.verifiedAt).getTime()
      );
      for (const d of sorted) {
        latestPerBuilder.set(d.builderId, d);
      }
      data = Array.from(latestPerBuilder.values());
    }

    res.status(200).json({
      success: true,
      data,
    });
  };
}
