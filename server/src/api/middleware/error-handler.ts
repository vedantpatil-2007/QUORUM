import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log full error on server side for observability (e.g. Render log stream)
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Quorum Server Error]', err);
  }

  // Safe default message without leaking internals or stack traces
  const statusCode = (err as { status?: number }).status || 500;
  const message = statusCode === 500 ? 'An unexpected internal error occurred' : err.message;
  const code = (err as { code?: string }).code || 'INTERNAL_SERVER_ERROR';

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}
