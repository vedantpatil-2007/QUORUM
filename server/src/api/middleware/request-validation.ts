import type { Request, Response, NextFunction } from 'express';

const IDENTIFIER_REGEX = /^[a-zA-Z0-9_\-\.]{1,120}$/;

export function getSingleParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? '';
  return param ?? '';
}

/**
 * Validates :releaseId route parameter.
 */
export function validateReleaseId(req: Request, res: Response, next: NextFunction): void {
  const releaseId = getSingleParam(req.params.releaseId);

  if (!releaseId || !IDENTIFIER_REGEX.test(releaseId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_RELEASE_ID',
        message: 'Release ID must be a non-empty alphanumeric string (hyphens, underscores, and dots allowed)',
      },
    });
    return;
  }

  next();
}

/**
 * Validates :builderId route parameter.
 */
export function validateBuilderId(req: Request, res: Response, next: NextFunction): void {
  const builderId = getSingleParam(req.params.builderId);

  if (!builderId || !IDENTIFIER_REGEX.test(builderId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_BUILDER_ID',
        message: 'Builder ID must be a non-empty alphanumeric string (hyphens, underscores, and dots allowed)',
      },
    });
    return;
  }

  next();
}

/**
 * Validates :sequence route parameter.
 */
export function validateSequence(req: Request, res: Response, next: NextFunction): void {
  const sequence = getSingleParam(req.params.sequence);

  if (!sequence || !/^\d+$/.test(sequence) || parseInt(sequence, 10) < 1) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_SEQUENCE',
        message: 'Sequence parameter must be a positive integer greater than or equal to 1',
      },
    });
    return;
  }

  next();
}
