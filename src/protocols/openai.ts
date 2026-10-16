/**
 * OpenAI 兼容面：/v1/chat/completions、/v1/completions、/v1/embeddings。
 */
import type { ServerResponse } from 'node:http';
import { json, sseHead } from '../http/respond.ts';
import { paceThinking, thinkDelay, sleep } from '../core/pacing.ts';
import { chunkify, rid, replyOf, usageOf, pickModel, type Body } from './shared.ts';
import type { RequestContext } from '../types.ts';

export async function chatCompletions(res: ServerResponse, body: Body, ctx: RequestContext): Promise<void> {
  const reply = replyOf(body, ctx);
  const id = rid('chatcmpl-');
  const created = Math.floor(Date.now() / 1000);
  const usage = usageOf(reply);

  if (!body.stream) {
    await thinkDelay(ctx);
    const message: Record<string, unknown> = { role: 'assistant' };
    if (reply.toolCall) {
      message.content = null;
      message.reasoning_content = reply.thinking;
      message.tool_calls = [{
        id: rid('call_', 10),
        type: 'function',
        function: { name: reply.toolCall.name, arguments: reply.toolCall.arguments },
      }];
    } else {
      message.content = reply.content;
      message.reasoning_content = reply.thinking;
    }
    json(res, 200, {
      id,
      object: 'chat.completion',
      created,
      model: reply.modelId,
      choices: [{ index: 0, message, finish_reason: reply.toolCall ? 'tool_calls' : 'stop', logprobs: null }],
      usage,
      system_fingerprint: 'fp_free_egg',
    });
    return;
  }

  sseHead(res);
  const base = (delta: Record<string, unknown>, finish?: string | null) => ({
    id,
    object: 'chat.completion.chunk',
    created,
    model: reply.modelId,
    choices: [{ index: 0, delta, finish_reason: finish || null, logprobs: null }],
    system_fingerprint: 'fp_free_egg',
  });
  const send = (o: unknown): void => { res.write('data: ' + JSON.stringify(o) + '\n\n'); };

  send(base({ role: 'assistant', content: '' }, null));
  await paceThinking(ctx, reply, (piece) => send(base({ reasoning_content: piece }, null)),
    () => res.write(': keep-alive\n\n'));

  if (reply.toolCall) {
    send(base({
      tool_calls: [{
        index: 0,
        id: rid('call_', 10),
        type: 'function',
        function: { name: reply.toolCall.name, arguments: '' },
      }],
    }, null));
    await sleep(ctx.delayMs);
    for (const piece of chunkify(reply.toolCall.arguments)) {
      send(base({ tool_calls: [{ index: 0, function: { arguments: piece } }] }, null));
      await sleep(ctx.delayMs);
    }
    send(base({}, 'tool_calls'));
  } else {
    for (const piece of chunkify(reply.content)) {
      send(base({ content: piece }, null));
      await sleep(ctx.delayMs);
    }
    send(base({}, 'stop'));
  }

  const streamOptions = body.stream_options as Record<string, unknown> | undefined;
  if (streamOptions && streamOptions.include_usage) {
    send({ id, object: 'chat.completion.chunk', created, model: reply.modelId, choices: [], usage });
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

export async function completions(res: ServerResponse, body: Body, ctx: RequestContext): Promise<void> {
  const reply = replyOf(body, ctx);
  const id = rid('cmpl-');
  const created = Math.floor(Date.now() / 1000);
  const full = reply.thinking + '\n' + reply.content;

  if (!body.stream) {
    await thinkDelay(ctx);
    json(res, 200, {
      id,
      object: 'text_completion',
      created,
      model: reply.modelId,
      choices: [{ text: full, index: 0, logprobs: null, finish_reason: 'stop' }],
      usage: usageOf(reply),
    });
    return;
  }

  sseHead(res);
  const send = (o: unknown): void => { res.write('data: ' + JSON.stringify(o) + '\n\n'); };
  const wrap = (piece: string) => ({
    id,
    object: 'text_completion',
    created,
    model: reply.modelId,
    choices: [{ text: piece, index: 0, logprobs: null, finish_reason: null }],
  });
  await paceThinking(ctx, reply, (piece) => send(wrap(piece)), () => res.write(': keep-alive\n\n'));
  for (const piece of chunkify(reply.content)) {
    send(wrap(piece));
    await sleep(ctx.delayMs);
  }
  send({ id, object: 'text_completion', created, model: reply.modelId, choices: [{ text: '', index: 0, logprobs: null, finish_reason: 'stop' }] });
  res.write('data: [DONE]\n\n');
  res.end();
}

export function embeddings(res: ServerResponse, body: Body): void {
  const input = body.input;
  const list = Array.isArray(input) ? input : [input == null ? '' : input];
  const data = list.map((_, i) => ({
    object: 'embedding',
    index: i,
    embedding: Array.from({ length: 16 }, () => Math.round((Math.random() * 2 - 1) * 1e4) / 1e4),
  }));
  json(res, 200, {
    object: 'list',
    data,
    model: pickModel(body, 'free-egg-embedding'),
    usage: { prompt_tokens: 1, total_tokens: 1 },
  });
}
