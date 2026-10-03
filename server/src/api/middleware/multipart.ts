import type { Request } from 'express';
import { Readable } from 'node:stream';

export interface UploadedFile {
  fieldName: string;
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

export interface ParsedMultipart {
  fields: Record<string, string>;
  file: UploadedFile | null;
}

/**
 * Native, zero-dependency multipart/form-data parser using Web Standards (Node.js 18+).
 * Converts Express Request stream to Web FormData.
 */
export async function parseMultipartRequest(req: Request): Promise<ParsedMultipart> {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    throw new Error('Request Content-Type must be multipart/form-data');
  }

  // Convert Node IncomingMessage to Web ReadableStream
  const webStream = Readable.toWeb(req as unknown as Readable);
  const response = new Response(webStream as any, {
    headers: {
      'content-type': contentType,
      ...(req.headers['content-length'] ? { 'content-length': req.headers['content-length'] } : {}),
    },
  });

  const formData = await response.formData();
  const fields: Record<string, string> = {};
  let file: UploadedFile | null = null;

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      fields[key] = value;
    } else if (value && typeof value === 'object' && 'arrayBuffer' in (value as any)) {
      const webFile = value as any;
      const arrayBuf = await webFile.arrayBuffer();
      file = {
        fieldName: key,
        originalName: webFile.name || 'artifact.bin',
        mimeType: webFile.type || 'application/octet-stream',
        size: webFile.size,
        buffer: Buffer.from(arrayBuf),
      };
    }
  }

  return { fields, file };
}
