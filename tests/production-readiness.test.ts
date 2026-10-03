import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Express } from 'express';
import type * as net from 'node:net';
import path from 'node:path';
import { createApp } from '../server/src/api/app.js';
import { initDatabase, resolveDatabasePath } from '../server/src/db/database.js';
import { resolveArtifactsDir } from '../server/src/builders/artifact-builder.js';
import { securityMiddleware } from '../server/src/api/middleware/security.js';

interface TestResponse {
  status: number;
  body: any;
  headers: Headers;
}

function request(app: Express) {
  const makeRequest = (
    method: string,
    reqPath: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<TestResponse> => {
    return new Promise((resolve, reject) => {
      const server = app.listen(0, async () => {
        try {
          const addr = server.address() as net.AddressInfo;
          const url = `http://127.0.0.1:${addr.port}${reqPath}`;
          const reqHeaders: Record<string, string> = { ...headers };
          if (body && !reqHeaders['Content-Type']) {
            reqHeaders['Content-Type'] = 'application/json';
          }

          const res = await fetch(url, {
            method,
            headers: Object.keys(reqHeaders).length > 0 ? reqHeaders : undefined,
            body: body ? JSON.stringify(body) : undefined,
          });

          let json: any = null;
          const text = await res.text();
          try {
            json = JSON.parse(text);
          } catch {
            json = text;
          }

          server.close(() => {
            resolve({
              status: res.status,
              body: json,
              headers: res.headers,
            });
          });
        } catch (err) {
          server.close(() => reject(err));
        }
      });
      server.on('error', reject);
    });
  };

  return {
    get: (reqPath: string, headers?: Record<string, string>) =>
      makeRequest('GET', reqPath, undefined, headers),
    post: (reqPath: string, body?: any, headers?: Record<string, string>) =>
      makeRequest('POST', reqPath, body, headers),
    options: (reqPath: string, headers?: Record<string, string>) =>
      makeRequest('OPTIONS', reqPath, undefined, headers),
  };
}

describe('Render Production Readiness (Step 1)', () => {
  let app: Express;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    const db = initDatabase({ dbPath: ':memory:' });
    app = createApp({ db });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Health Endpoints', () => {
    it('GET /health returns 200 with service metadata for Render health checks', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.service).toBe('quorum-api');
      expect(res.body.data.version).toBe('1.0.0');
    });

    it('GET /api/health returns 200 with identical service metadata', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.service).toBe('quorum-api');
      expect(res.body.data.version).toBe('1.0.0');
    });
  });

  describe('Production CORS & Security Headers', () => {
    it('allows configured production origin from FRONTEND_URL and sets Vary: Origin', async () => {
      process.env.FRONTEND_URL = 'https://quorum-app.onrender.com';

      const res = await request(app).get('/health', {
        Origin: 'https://quorum-app.onrender.com',
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://quorum-app.onrender.com');
      expect(res.headers.get('vary')).toBe('Origin');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
    });

    it('supports comma-separated origins in FRONTEND_URL', async () => {
      process.env.FRONTEND_URL = 'https://quorum.vercel.app, https://custom-domain.org/';

      const res1 = await request(app).get('/health', {
        Origin: 'https://quorum.vercel.app',
      });
      expect(res1.headers.get('access-control-allow-origin')).toBe('https://quorum.vercel.app');

      const res2 = await request(app).get('/health', {
        Origin: 'https://custom-domain.org',
      });
      expect(res2.headers.get('access-control-allow-origin')).toBe('https://custom-domain.org');
    });

    it('does not allow unauthorized third-party origins', async () => {
      process.env.FRONTEND_URL = 'https://quorum-app.onrender.com';

      const res = await request(app).get('/health', {
        Origin: 'https://evil-attacker.example.com',
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
      expect(res.headers.get('vary')).toBe('Origin');
    });

    it('handles OPTIONS preflight requests with 204 No Content and CORS headers', async () => {
      process.env.FRONTEND_URL = 'https://quorum-app.onrender.com';

      const res = await request(app).options('/api/releases', {
        Origin: 'https://quorum-app.onrender.com',
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://quorum-app.onrender.com');
      expect(res.headers.get('access-control-allow-methods')).toContain('GET, POST, OPTIONS');
      expect(res.headers.get('access-control-max-age')).toBe('86400');
    });
  });

  describe('Path Resolvers for Render Persistent Storage', () => {
    it('resolveDatabasePath respects custom path parameter', () => {
      const custom = '/mnt/data/custom.db';
      expect(resolveDatabasePath(custom)).toBe(custom);
    });

    it('resolveDatabasePath respects DATABASE_PATH environment variable', () => {
      const renderDiskDb = path.resolve('/var/data/quorum.db');
      process.env.DATABASE_PATH = renderDiskDb;
      expect(resolveDatabasePath()).toBe(renderDiskDb);
    });

    it('resolveDatabasePath falls back to deterministic local path ending in quorum.db', () => {
      delete process.env.DATABASE_PATH;
      const resolved = resolveDatabasePath();
      expect(resolved.endsWith('quorum.db')).toBe(true);
    });

    it('resolveArtifactsDir respects custom directory parameter', () => {
      const custom = '/mnt/data/artifacts';
      expect(resolveArtifactsDir(custom)).toBe(custom);
    });

    it('resolveArtifactsDir respects ARTIFACTS_DIR environment variable', () => {
      const renderDiskArtifacts = path.resolve('/var/data/artifacts');
      process.env.ARTIFACTS_DIR = renderDiskArtifacts;
      expect(resolveArtifactsDir()).toBe(renderDiskArtifacts);
    });

    it('resolveArtifactsDir falls back to deterministic local path ending in artifacts', () => {
      delete process.env.ARTIFACTS_DIR;
      const resolved = resolveArtifactsDir();
      expect(resolved.endsWith('artifacts')).toBe(true);
    });
  });
});
