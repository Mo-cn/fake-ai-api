/**
 * Anthropic Messages API：thinking / tool_use 内容块 + 完整流式事件。
 */
import type { ServerResponse } from 'node:http';
import { json, sseHead } from '../http/respond.ts';
import { paceThinking, thinkDelay, sleep } from '../core/pacing.ts';
import { chunkify, rid, replyOf, type Body } from './shared.ts';
import type { Reply, RequestContext } from '../types.ts';

function blocks(reply: Reply): unknown[] {
  const out: unknown[] = [{ type: 'thinking', thinking: reply.thinking, signature: rid('sig_', 24) }];
  if (reply.toolCall) {
    out.push({ type: 'tool_use', id: rid('toolu_'), name: reply.toolCall.name, input: reply.toolCall.argumentsObj });
  } else {
    out.push({ type: 'text', text: reply.content });
  }
  return out;
}

export async function messages(res: ServerResponse, body: Body, ctx: RequestContext): Promise<void> {
  const reply = replyOf(body, ctx, String(body.model || 'claude-sonnet-4-5'));
  const id = rid('msg_');
  const usage = { input_tokens: reply.inputTokens, output_tokens: reply.outputTokens };

  if (!body.stream) {
    await thinkDelay(ctx);
    json(res, 200, {
      id,
      type: 'message',
      role: 'assistant',
      model: reply.modelId,
      content: blocks(reply),
      stop_reason: reply.toolCall ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage,
    });
    return;
  }

  sseHead(res);
  const emit = (event: string, payload: Record<string, unknown>): void => {
    res.write('event: ' + event + '\ndata: ' + JSON.stringify(Object.assign({ type: event }, payload)) + '\n\n');
  };

  emit('message_start', {
    message: {
      id,
      type: 'message',
      role: 'assistant',
      model: reply.modelId,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: reply.inputTokens, output_tokens: 0 },
    },
  });
  emit('ping', {});

  emit('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
  await paceThinking(
    ctx,
    reply,
    (piece) => emit('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: piece } }),
    () => emit('ping', {}),
  );
  emit('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: rid('sig_', 24) } });
  emit('content_block_stop', { index: 0 });

  if (reply.toolCall) {
    emit('content_block_start', {
      index: 1,
      content_block: { type: 'tool_use', id: rid('toolu_'), name: reply.toolCall.name, input: {} },
    });
    for (const piece of chunkify(reply.toolCall.arguments)) {
      emit('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: piece } });
      await sleep(ctx.delayMs);
    }
    emit('content_block_stop', { index: 1 });
  } else {
    emit('content_block_start', { index: 1, content_block: { type: 'text', text: '' } });
    for (const piece of chunkify(reply.content)) {
      emit('content_block_delta', { index: 1, delta: { type: 'text_delta', text: piece } });
      await sleep(ctx.delayMs);
    }
    emit('content_block_stop', { index: 1 });
  }

  emit('message_delta', {
    delta: { stop_reason: reply.toolCall ? 'tool_use' : 'end_turn', stop_sequence: null },
    usage: { output_tokens: reply.outputTokens },
  });
  emit('message_stop', {});
  res.end();
}

export function countTokens(res: ServerResponse, body: Body): void {
  const n = Math.max(1, Math.round(JSON.stringify(body || {}).length / 4));
  json(res, 200, { input_tokens: n });
}
