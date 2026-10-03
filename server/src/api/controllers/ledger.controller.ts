import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { AuditLedgerRepository } from '../../ledger/ledger.repository.js';
import { verifyLedger } from '../../ledger/ledger-verifier.js';
import { ReleasesRepository } from '../../db/repositories/releases.repository.js';
import { ApiResponse, LedgerVerifyDto, LedgerEntryDto } from '../api.types.js';
import { getSingleParam } from '../middleware/request-validation.js';

export class LedgerController {
  private readonly ledgerRepo: AuditLedgerRepository;
  private readonly releasesRepo: ReleasesRepository;

  constructor(db: Database.Database) {
    this.ledgerRepo = new AuditLedgerRepository(db);
    this.releasesRepo = new ReleasesRepository(db);
  }

  getLedgerEntries = (req: Request, res: Response<ApiResponse<LedgerEntryDto[]>>): void => {
    let limit = 50;
    if (req.query.limit) {
      const parsedLimit = parseInt(req.query.limit as string, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, 500);
      }
    }

    const allEntries = this.ledgerRepo.getAllEntries();
    // Return the latest entries up to limit
    const entries = allEntries.slice(-limit);

    res.status(200).json({
      success: true,
      data: entries,
    });
  };

  getLedgerEntryBySequence = (req: Request, res: Response<ApiResponse<LedgerEntryDto>>): void => {
    const sequenceStr = getSingleParam(req.params.sequence);
    const sequence = parseInt(sequenceStr, 10);
    const entry = this.ledgerRepo.getEntryBySequence(sequence);

    if (!entry) {
      res.status(404).json({
        success: false,
        error: {
          code: 'LEDGER_ENTRY_NOT_FOUND',
          message: `Audit ledger entry with sequence ${sequence} was not found`,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: entry,
    });
  };

  verifyLedgerChain = (_req: Request, res: Response<ApiResponse<LedgerVerifyDto>>): void => {
    const verification = verifyLedger(this.ledgerRepo);

    res.status(200).json({
      success: true,
      data: verification,
    });
  };

  getReleaseAudit = (req: Request, res: Response<ApiResponse<LedgerEntryDto[]>>): void => {
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

    const entries = this.ledgerRepo.getEntriesByReleaseId(releaseId);

    res.status(200).json({
      success: true,
      data: entries,
    });
  };
}
