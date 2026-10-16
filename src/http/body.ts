/**
 * 请求体读取与解析。
 */
import type { IncomingMessage } from 'node:http';

const MAX_BODY = 64 * 1024 * 1024;

export function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function parseJson(buf: Buffer): Record<string, unknown> {
  if (!buf || buf.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(buf.toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return parseJson(await readBody(req));
}
