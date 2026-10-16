/**
 * Google Gemini 面：generateContent / streamGenerateContent。
 */
import type { ServerResponse } from 'node:http';
import { json, sseHead } from '../http/respond.ts';
import { paceThinking, thinkDelay, sleep } from '../core/pacing.ts';
import { chunkify, rid, replyOf, type Body } from './shared.ts';
import type { RequestContext } from '../types.ts';

export async function generateContent(
  res: ServerResponse,
  body: Body,
  ctx: RequestContext,
  model: string,
  stream: boolean,
): Promise<void> {
  const reply = replyOf(body, ctx, model);
  const usageMetadata = {
    promptTokenCount: reply.inputTokens,
    candidatesTokenCount: reply.outputTokens,
    totalTokenCount: reply.inputTokens + reply.outputTokens,
  };
  const payload = {
    candidates: [{
      content: { role: 'model', parts: [{ text: reply.thinking, thought: true }, { text: reply.content }] },
      finishReason: 'STOP',
      index: 0,
      safetyRatings: [],
    }],
    usageMetadata,
    modelVersion: reply.modelId,
    responseId: rid('gem-', 10),
  };

  if (!stream) {
    await thinkDelay(ctx);
    json(res, 200, payload);
    return;
  }

  sseHead(res);
  const send = (o: unknown): void => { res.write('data: ' + JSON.stringify(o) + '\n\n'); };
  await paceThinking(
    ctx,
    reply,
    (piece) => send({
      candidates: [{ content: { role: 'model', parts: [{ text: piece, thought: true }] }, index: 0 }],
      modelVersion: reply.modelId,
    }),
    () => res.write(': keep-alive\n\n'),
  );
  for (const piece of chunkify(reply.content)) {
    send({
      candidates: [{ content: { role: 'model', parts: [{ text: piece }] }, index: 0 }],
      modelVersion: reply.modelId,
    });
    await sleep(ctx.delayMs);
  }
  send({
    candidates: [{ content: { role: 'model', parts: [] }, finishReason: 'STOP', index: 0 }],
    usageMetadata,
    modelVersion: reply.modelId,
  });
  res.end();
}
