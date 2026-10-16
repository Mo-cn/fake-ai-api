/**
 * 协议层公用工具。
 */
import crypto from 'node:crypto';
import * as script from '../core/script.ts';
import type { Reply, RequestContext } from '../types.ts';

export type Body = Record<string, unknown>;

export function rid(prefix: string, n?: number): string {
  return prefix + crypto.randomBytes(n || 12).toString('hex');
}

/** 按行切块，超长行再按 48 字切，模拟「一个字一个字往外蹦」。 */
export function chunkify(str: string): string[] {
  const out: string[] = [];
  for (const line of String(str).split('\n')) {
    if (line.length <= 48) {
      out.push(line + '\n');
      continue;
    }
    for (let i = 0; i < line.length; i += 48) out.push(line.slice(i, i + 48));
    out.push('\n');
  }
  if (out.length) out[out.length - 1] = out[out.length - 1].replace(/\n$/, '');
  return out;
}

export function pickModel(body: Body, fallback?: string): string {
  const m = body.model || body.modelId;
  return String(m || fallback || 'auto');
}

export function replyOf(body: Body, ctx: RequestContext, modelId?: string): Reply {
  return script.buildReply({
    body,
    modelId: modelId || pickModel(body),
    asciiWidth: ctx.asciiWidth,
    asciiMode: ctx.asciiMode,
    toolMode: ctx.toolMode,
  });
}

export function usageOf(reply: Reply): { prompt_tokens: number; completion_tokens: number; total_tokens: number } {
  return {
    prompt_tokens: reply.inputTokens,
    completion_tokens: reply.outputTokens,
    total_tokens: reply.inputTokens + reply.outputTokens,
  };
}
