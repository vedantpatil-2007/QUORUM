import type { Request, Response, NextFunction } from 'express';

/**
 * Production-ready CORS and security headers middleware.
 * - Supports FRONTEND_URL and FRONTEND_ORIGIN (single or comma-separated list).
 * - Preserves localhost and 127.0.0.1 development access.
 * - Strictly avoids insecure wildcard ('*') CORS.
 * - Appends standard security headers (nosniff, frameguard, referrer-policy, etc.).
 */
export function securityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const configuredOriginsRaw = process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

  // Parse comma-separated origins, normalize trailing slashes
  const allowedOrigins = configuredOriginsRaw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const requestOrigin = req.headers.origin;

  if (requestOrigin) {
    const normalizedRequestOrigin = requestOrigin.trim().replace(/\/+$/, '');
    const isAllowedConfigured = allowedOrigins.includes(normalizedRequestOrigin);
    const isLocalhost =
      normalizedRequestOrigin.startsWith('http://localhost:') ||
      normalizedRequestOrigin === 'http://localhost' ||
      normalizedRequestOrigin.startsWith('http://127.0.0.1:') ||
      normalizedRequestOrigin === 'http://127.0.0.1';

    if (isAllowedConfigured || isLocalhost) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    res.setHeader('Vary', 'Origin');
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
