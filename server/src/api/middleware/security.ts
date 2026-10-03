import type { Request, Response, NextFunction } from 'express';

/**
 * Controlled CORS and security headers middleware.
 * Configured for future React dashboard while blocking unsafe cross-origin practices.
 */
export function securityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  const requestOrigin = req.headers.origin;

  // Controlled CORS: allow requested origin if it matches allowed origin or local dev
  if (requestOrigin && (requestOrigin === allowedOrigin || requestOrigin.startsWith('http://localhost:'))) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
