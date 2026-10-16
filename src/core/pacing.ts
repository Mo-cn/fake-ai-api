/**
 * 假思维链的限速器：把一段文本摊到 thinkMs 里慢慢吐，中途按需保活。
 * 关键：分片长度与间隔都是随机的，否则一眼就能看出是机器在定速吐字。
 */
import { progressLine } from './script.ts';
import type { Emit, KeepAlive, Reply, RequestContext } from '../types.ts';

export function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

export function jitter(ms: number): number {
  return Math.round(ms * (0.92 + Math.random() * 0.16));
}

/** 非流式请求的「假装思考」等待。 */
export function thinkDelay(ctx: RequestContext): Promise<void> {
  return ctx.thinkMs > 0 ? sleep(jitter(ctx.thinkMs)) : Promise.resolve();
}

export interface ChunkOptions {
  min?: number;
  max?: number;
}

/**
 * 把文本切成随机长度的分片。长度分布偏短（更像逐字蹦），偶尔来一段长的。
 * 不会把换行符切到下一片的开头，避免出现"半行悬空"的观感。
 */
export function randomChunks(text: string, opts?: ChunkOptions): string[] {
  const min = Math.max(1, opts && opts.min ? opts.min : 2);
  const max = Math.max(min, opts && opts.max ? opts.max : 18);
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    // 平方分布 -> 短分片更常见，长分片偶尔出现
    const r = Math.random();
    const n = Math.round(min + (max - min) * r * r);
    let end = Math.min(text.length, i + Math.max(1, n));
    if (end < text.length && text[end - 1] === '\n') {
      // 正好切在行尾，直接把换行带进这一片
    } else {
      const nl = text.indexOf('\n', i);
      if (nl >= 0 && nl < end) end = nl + 1;
    }
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

export interface PaceResult {
  elapsedMs: number;
  pieces: number;
  avgChunk: number;
}

/**
 * 把 reply.thinking 摊到 ctx.thinkMs 里吐出去。
 * @param emit 每吐一小段调用一次
 * @param keepAlive 长间隔时保活（SSE 注释 / ping 事件 / NDJSON 心跳）
 */
export async function paceThinking(
  ctx: RequestContext,
  reply: Reply,
  emit: Emit,
  keepAlive?: KeepAlive,
): Promise<PaceResult> {
  const budget = Math.max(0, Math.round(ctx.thinkMs || 0));
  const text = String(reply.thinking);
  const start = Date.now();
  let lastPing = Date.now();
  let pieces = 0;
  let emitted = 0;

  const tick = async (ms: number): Promise<void> => {
    let left = ms;
    while (left > 0) {
      const step = Math.min(left, 1200);
      await sleep(step);
      left -= step;
      if (keepAlive && Date.now() - lastPing >= 3000) {
        keepAlive();
        lastPing = Date.now();
      }
    }
  };

  if (budget <= 0) {
    const chunks = randomChunks(text);
    for (const c of chunks) {
      emit(c);
      pieces += 1;
      emitted += c.length;
    }
    return { elapsedMs: 0, pieces, avgChunk: pieces ? Math.round(emitted / pieces) : 0 };
  }

  const chunks = randomChunks(text);
  const phaseA = Math.round(budget * 0.62);
  const perChunk = Math.max(20, Math.round(phaseA / Math.max(1, chunks.length)));

  for (const c of chunks) {
    if (Date.now() - start >= budget) break;
    emit(c);
    pieces += 1;
    emitted += c.length;
    // 每次间隔在 0.35x ~ 1.75x 之间抖，避免匀速
    const factor = 0.35 + Math.random() * 1.4;
    await tick(Math.max(12, Math.round(perChunk * factor)));
  }

  let i = 0;
  while (Date.now() - start < budget) {
    const remain = budget - (Date.now() - start);
    await tick(Math.min(800, Math.max(0, remain)));
    if (Date.now() - start < budget - 200) {
      i += 1;
      emit(progressLine(Date.now() - start, budget, i) + '\n');
      pieces += 1;
    }
  }
  return { elapsedMs: Date.now() - start, pieces, avgChunk: pieces ? Math.round(emitted / pieces) : 0 };
}
