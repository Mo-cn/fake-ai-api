/**
 * OpenAI Responses API（Codex CLI 用的那套事件流）。
 */
import type { ServerResponse } from 'node:http';
import { json, sseHead } from '../http/respond.ts';
import { paceThinking, thinkDelay, sleep } from '../core/pacing.ts';
import { chunkify, rid, replyOf, type Body } from './shared.ts';
import type { RequestContext } from '../types.ts';

export async function responsesApi(res: ServerResponse, body: Body, ctx: RequestContext): Promise<void> {
  const reply = replyOf(body, ctx);
  const id = rid('resp_');
  const createdAt = Math.floor(Date.now() / 1000);
  const usage = {
    input_tokens: reply.inputTokens,
    output_tokens: reply.outputTokens,
    total_tokens: reply.inputTokens + reply.outputTokens,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  };
  const reasoningItem = {
    type: 'reasoning',
    id: rid('rs_', 10),
    summary: [{ type: 'summary_text', text: reply.thinking }],
  };
  const messageItem = {
    type: 'message',
    id: rid('msg_', 10),
    status: 'completed',
    role: 'assistant',
    content: [{ type: 'output_text', text: reply.content, annotations: [] }],
  };
  const output = [reasoningItem, messageItem];

  if (!body.stream) {
    await thinkDelay(ctx);
    json(res, 200, {
      id,
      object: 'response',
      created_at: createdAt,
      status: 'completed',
      model: reply.modelId,
      output,
      parallel_tool_calls: true,
      tool_choice: 'auto',
      tools: [],
      usage,
      incomplete_details: null,
      error: null,
      metadata: {},
    });
    return;
  }

  sseHead(res);
  let seq = 0;
  const emit = (type: string, payload: Record<string, unknown>): void => {
    const o = Object.assign({ type, sequence_number: seq }, payload);
    seq += 1;
    res.write('event: ' + type + '\ndata: ' + JSON.stringify(o) + '\n\n');
  };

  const shell = {
    id,
    object: 'response',
    created_at: createdAt,
    status: 'in_progress',
    model: reply.modelId,
    output: [],
    usage: null,
    parallel_tool_calls: true,
  };
  emit('response.created', { response: shell });
  emit('response.in_progress', { response: shell });

  const rsItem = { type: 'reasoning', id: rid('rs_', 10), summary: [] };
  emit('response.output_item.added', { output_index: 0, item: rsItem });
  await paceThinking(
    ctx,
    reply,
    (piece) => emit('response.reasoning_summary_text.delta', {
      item_id: rsItem.id, output_index: 0, summary_index: 0, delta: piece,
    }),
    () => emit('response.in_progress', { response: shell }),
  );
  emit('response.reasoning_summary_text.done', {
    item_id: rsItem.id, output_index: 0, summary_index: 0, text: reply.thinking,
  });
  emit('response.output_item.done', { output_index: 0, item: reasoningItem });

  const msgItem = { type: 'message', id: rid('msg_', 10), status: 'in_progress', role: 'assistant', content: [] };
  emit('response.output_item.added', { output_index: 1, item: msgItem });
  emit('response.content_part.added', {
    item_id: msgItem.id, output_index: 1, content_index: 0,
    part: { type: 'output_text', text: '', annotations: [] },
  });
  for (const piece of chunkify(reply.content)) {
    emit('response.output_text.delta', {
      item_id: msgItem.id, output_index: 1, content_index: 0, delta: piece,
    });
    await sleep(ctx.delayMs);
  }
  emit('response.output_text.done', {
    item_id: msgItem.id, output_index: 1, content_index: 0, text: reply.content,
  });
  emit('response.content_part.done', {
    item_id: msgItem.id, output_index: 1, content_index: 0,
    part: { type: 'output_text', text: reply.content, annotations: [] },
  });
  emit('response.output_item.done', { output_index: 1, item: messageItem });
  emit('response.completed', { response: Object.assign({}, shell, { status: 'completed', output, usage }) });
  res.end();
}
