/**
 * HTTP 响应助手：统一 CORS、JSON、纯文本与 SSE 头。
 */
import type { ServerResponse } from 'node:http';

export const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': '*',
};

export function corsHeaders(extra?: Record<string, string>): Record<string, string> {
  return Object.assign({}, CORS, extra || {});
}

export function json(res: ServerResponse, code: number, obj: unknown, extraHeaders?: Record<string, string>): void {
  const buf = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, corsHeaders(Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(buf.length),
    'x-powered-by': 'FreeEgg-Gateway',
  }, extraHeaders || {})));
  res.end(buf);
}

export function text(res: ServerResponse, code: number, body: string, type?: string): void {
  const buf = Buffer.from(body, 'utf8');
  res.writeHead(code, corsHeaders({
    'content-type': (type || 'text/plain') + '; charset=utf-8',
    'content-length': String(buf.length),
  }));
  res.end(buf);
}

export function html(res: ServerResponse, code: number, body: string): void {
  const buf = Buffer.from(body, 'utf8');
  res.writeHead(code, corsHeaders({
    'content-type': 'text/html; charset=utf-8',
    'content-length': String(buf.length),
    'cache-control': 'no-cache',
  }));
  res.end(buf);
}

export function sseHead(res: ServerResponse): void {
  res.writeHead(200, corsHeaders({
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  }));
}

export function ndjsonHead(res: ServerResponse): void {
  res.writeHead(200, corsHeaders({
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache',
  }));
}

/** 标准错误体：仿 OpenAI 的 error 结构。 */
export function apiError(
  res: ServerResponse,
  code: number,
  message: string,
  type: string,
  extra?: Record<string, unknown>,
  headers?: Record<string, string>,
): void {
  json(res, code, Object.assign({
    error: Object.assign({ message, type, param: null, code: type }, extra || {}),
  }, {}), headers);
}
