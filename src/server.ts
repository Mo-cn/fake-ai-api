/**
 * HTTP 服务装配：路由表 + 鉴权 + 设备密钥签发。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import { json, text, html, apiError, CORS } from './http/respond.ts';
import { readJson } from './http/body.ts';
import { createStats, bump, snapshot } from './http/stats.ts';
import * as P from './protocols/index.ts';
import * as models from './core/models.ts';
import * as script from './core/script.ts';
import * as device from './core/device.ts';
import { landingHtml } from './web/landing.ts';
import type { AppConfig, RequestContext, Stats } from './types.ts';

const ASSETS = path.join(import.meta.dirname, '..', 'assets');

export interface App {
  server: Server;
  stats: Stats;
}

function baseUrlOf(req: IncomingMessage, cfg: AppConfig): string {
  const host = String(req.headers.host || (cfg.host + ':' + cfg.port));
  return 'http://' + host;
}

/** 按请求头覆盖单次请求的配置（自测/调试用）。 */
function contextFor(req: IncomingMessage, cfg: AppConfig): RequestContext {
  const ctx: RequestContext = {
    asciiWidth: cfg.asciiWidth,
    asciiMode: cfg.asciiMode,
    toolMode: cfg.toolMode,
    delayMs: cfg.delayMs,
    thinkMs: cfg.thinkMs,
  };
  const h = req.headers;
  if (h['x-prank-think-ms'] !== undefined) ctx.thinkMs = Number(h['x-prank-think-ms']) || 0;
  if (h['x-prank-toolcall']) ctx.toolMode = String(h['x-prank-toolcall']);
  if (h['x-prank-ascii-width']) ctx.asciiWidth = Number(h['x-prank-ascii-width']) || cfg.asciiWidth;
  if (h['x-prank-ascii-mode']) ctx.asciiMode = String(h['x-prank-ascii-mode']) === 'color' ? 'color' : 'mono';
  return ctx;
}

function presentedKey(req: IncomingMessage): string {
  const auth = String(req.headers.authorization || '');
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const xk = req.headers['x-api-key'];
  if (xk) return String(xk).trim();
  return '';
}

function serveFile(res: ServerResponse, file: string, type: string): void {
  fs.readFile(file, (err, buf) => {
    if (err) {
      text(res, 404, 'not found');
      return;
    }
    res.writeHead(200, Object.assign({}, CORS, {
      'content-type': type,
      'content-length': String(buf.length),
      'cache-control': 'no-cache',
    }));
    res.end(buf);
  });
}

function logLine(cfg: AppConfig, protocol: string, detail: string): void {
  if (!cfg.logRequests) return;
  const t = new Date().toTimeString().slice(0, 8);
  console.log('[' + t + '] ' + protocol.padEnd(10) + ' ' + detail);
}

export function createApp(cfg: AppConfig): App {
  const stats = createStats();
  const knownDevices = new Set<string>();

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', baseUrlOf(req, cfg));
    const pathname = decodeURIComponent(url.pathname);
    const ctx = contextFor(req, cfg);
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    try {
      // ---------- 门户与静态资源 ----------
      if (method === 'GET' && (pathname === '/' || pathname === '/index.html' || pathname === '/console')) {
        bump(stats, 'static');
        logLine(cfg, 'portal', '访问门户');
        html(res, 200, landingHtml({
          baseUrl: baseUrlOf(req, cfg) + '/v1',
          modelCount: models.MODEL_COUNT,
          cfg,
        }));
        return;
      }
      if (method === 'GET' && (pathname === '/favicon.ico' || pathname === '/logo.png')) {
        bump(stats, 'static');
        serveFile(res, path.join(ASSETS, 'nailong-laugh-real.png'), 'image/png');
        return;
      }
      if (method === 'GET' && (pathname === '/nailong' || pathname === '/nailong.png')) {
        bump(stats, 'static');
        serveFile(res, path.join(ASSETS, 'nailong-laugh-real.png'), 'image/png');
        return;
      }
      if (method === 'GET' && (pathname === '/nailong.txt' || pathname === '/nailong.mono')) {
        bump(stats, 'static');
        text(res, 200, script.art(ctx.asciiWidth, 'mono'), 'text/plain');
        return;
      }
      if (method === 'GET' && (pathname === '/nailong.ansi' || pathname === '/nailong.color')) {
        bump(stats, 'static');
        text(res, 200, script.art(ctx.asciiWidth, 'color'), 'text/plain');
        return;
      }
      if (method === 'GET' && pathname === '/health') {
        json(res, 200, { status: 'ok', uptime: Date.now() - stats.startedAt, models: models.MODEL_COUNT });
        return;
      }
      if (method === 'GET' && pathname === '/__prank/stats') {
        json(res, 200, Object.assign(snapshot(stats), {
          devices: knownDevices.size,
          config: {
            asciiWidth: cfg.asciiWidth,
            asciiMode: cfg.asciiMode,
            toolMode: cfg.toolMode,
            delayMs: cfg.delayMs,
            thinkMs: cfg.thinkMs,
            requireKey: cfg.requireKey,
          },
        }));
        return;
      }

      // ---------- 设备密钥签发 ----------
      if (method === 'POST' && (pathname === '/v1/device/register' || pathname === '/v1/keys')) {
        const body = await readJson(req);
        const code = device.normalizeCode(body.deviceCode) || device.normalizeCode(req.headers['user-agent']) || 'anonymous';
        knownDevices.add(code);
        const p = device.profileOf(code, cfg.keySalt);
        bump(stats, 'device');
        logLine(cfg, 'device', '签发 ' + p.id);
        json(res, 200, {
          object: 'device',
          device_id: p.id,
          key: p.key,
          base_url: baseUrlOf(req, cfg) + '/v1',
          created_at: p.createdAt,
          models: models.MODEL_COUNT,
          quota: { tier: 'free', currency: 'CNY', credit: 0, unlimited: true },
        });
        return;
      }

      // ---------- 鉴权（可选） ----------
      if (cfg.requireKey) {
        const key = presentedKey(req);
        if (!key) {
          apiError(res, 401, '缺少 API Key。请在请求头携带 Authorization: Bearer <key>，密钥可在 ' + baseUrlOf(req, cfg) + '/ 自助获取。', 'invalid_request_error');
          return;
        }
        if (!device.isIssuedKey(key, cfg.keySalt, knownDevices)) {
          apiError(res, 401, 'API Key 无效或未在本服务签发。请访问 ' + baseUrlOf(req, cfg) + '/ 重新获取。', 'invalid_api_key');
          return;
        }
      }

      // ---------- OpenAI ----------
      if (method === 'GET' && pathname === '/v1/models') {
        bump(stats, 'openai');
        const created = Math.floor(Date.now() / 1000);
        json(res, 200, {
          object: 'list',
          data: models.MODELS.map((m) => ({ id: m.id, object: 'model', created, owned_by: m.owner })),
        });
        return;
      }
      if (method === 'GET' && pathname.startsWith('/v1/models/')) {
        bump(stats, 'openai');
        const m = models.get(pathname.slice('/v1/models/'.length));
        json(res, 200, { id: m.id, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: m.owner });
        return;
      }
      if (method === 'POST' && pathname === '/v1/chat/completions') {
        const body = await readJson(req);
        bump(stats, 'openai');
        logLine(cfg, 'openai', 'chat model=' + String(body.model || '?') + ' stream=' + String(!!body.stream));
        await P.chatCompletions(res, body, ctx);
        return;
      }
      if (method === 'POST' && pathname === '/v1/completions') {
        const body = await readJson(req);
        bump(stats, 'openai');
        logLine(cfg, 'openai', 'completions');
        await P.completions(res, body, ctx);
        return;
      }
      if (method === 'POST' && pathname === '/v1/embeddings') {
        const body = await readJson(req);
        bump(stats, 'openai');
        P.embeddings(res, body);
        return;
      }
      if (method === 'POST' && (pathname === '/v1/responses' || pathname === '/responses')) {
        const body = await readJson(req);
        bump(stats, 'openai');
        logLine(cfg, 'openai', 'responses model=' + String(body.model || '?'));
        await P.responsesApi(res, body, ctx);
        return;
      }

      // ---------- Anthropic ----------
      if (method === 'POST' && pathname === '/v1/messages') {
        const body = await readJson(req);
        bump(stats, 'anthropic');
        logLine(cfg, 'anthropic', 'messages model=' + String(body.model || '?'));
        await P.messages(res, body, ctx);
        return;
      }
      if (method === 'POST' && pathname === '/v1/messages/count_tokens') {
        const body = await readJson(req);
        bump(stats, 'anthropic');
        P.countTokens(res, body);
        return;
      }

      // ---------- Gemini ----------
      if (method === 'GET' && pathname === '/v1beta/models') {
        bump(stats, 'gemini');
        json(res, 200, {
          models: models.MODELS.map((m) => ({
            name: 'models/' + m.id,
            displayName: m.id,
            description: m.vendor,
            supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
          })),
        });
        return;
      }
      const gem = pathname.match(/^\/v1beta\/models\/(.+?):(streamGenerateContent|generateContent)$/);
      if (method === 'POST' && gem) {
        const body = await readJson(req);
        const stream = gem[2] === 'streamGenerateContent';
        bump(stats, 'gemini');
        logLine(cfg, 'gemini', gem[2] + ' model=' + gem[1]);
        await P.generateContent(res, body, ctx, gem[1], stream);
        return;
      }

      // ---------- Ollama ----------
      if (method === 'GET' && pathname === '/api/tags') {
        bump(stats, 'ollama');
        json(res, 200, P.tags());
        return;
      }
      if (method === 'GET' && pathname === '/api/version') {
        bump(stats, 'ollama');
        json(res, 200, { version: '0.1.0-freeegg' });
        return;
      }
      if (method === 'GET' && pathname === '/api/ps') {
        json(res, 200, { models: [] });
        return;
      }
      if (method === 'POST' && pathname === '/api/chat') {
        const body = await readJson(req);
        bump(stats, 'ollama');
        logLine(cfg, 'ollama', 'chat model=' + String(body.model || '?'));
        await P.ollamaChat(res, body, ctx);
        return;
      }
      if (method === 'POST' && pathname === '/api/generate') {
        const body = await readJson(req);
        bump(stats, 'ollama');
        await P.ollamaGenerate(res, body, ctx);
        return;
      }
      if (method === 'POST' && pathname === '/api/show') {
        const body = await readJson(req);
        bump(stats, 'ollama');
        P.ollamaShow(res, body);
        return;
      }

      // ---------- 兜底 ----------
      bump(stats, 'other');
      logLine(cfg, 'other', method + ' ' + pathname);
      apiError(res, 404, '未知端点 ' + pathname + '。请参考 ' + baseUrlOf(req, cfg) + '/ 的接口文档。', 'not_found');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        apiError(res, 500, '网关内部错误：' + message, 'internal_error');
      } catch {
        /* 连接可能已关闭 */
      }
    }
  });

  return { server, stats };
}
