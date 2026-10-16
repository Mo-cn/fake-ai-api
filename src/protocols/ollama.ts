/**
 * Ollama 面：/api/tags、/api/chat、/api/generate、/api/show。
 */
import crypto from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { json, ndjsonHead } from '../http/respond.ts';
import { paceThinking, thinkDelay, sleep } from '../core/pacing.ts';
import { chunkify, replyOf, type Body } from './shared.ts';
import * as models from '../core/models.ts';
import type { RequestContext } from '../types.ts';

export function tags(): unknown {
  const now = new Date().toISOString();
  return {
    models: models.MODELS.map((m) => ({
      name: m.id + ':latest',
      model: m.id + ':latest',
      modified_at: now,
      size: 0,
      digest: crypto.createHash('sha256').update(m.id).digest('hex'),
      details: {
        parent_model: '',
        format: 'gguf',
        family: m.owner,
        families: [m.owner],
        parameter_size: '0B',
        quantization_level: 'FREE',
      },
    })),
  };
}

export async function chat(res: ServerResponse, body: Body, ctx: RequestContext): Promise<void> {
  const reply = replyOf(body, ctx);
  const model = String(body.model || 'auto');
  const stream = body.stream !== false;
  const createdAt = new Date().toISOString();

  if (!stream) {
    await thinkDelay(ctx);
    json(res, 200, {
      model,
      created_at: createdAt,
      done: true,
      done_reason: 'stop',
      message: { role: 'assistant', content: reply.content, thinking: reply.thinking },
      total_duration: 1,
      load_duration: 0,
      prompt_eval_count: reply.inputTokens,
      prompt_eval_duration: 1,
      eval_count: reply.outputTokens,
      eval_duration: 1,
    });
    return;
  }

  ndjsonHead(res);
  const send = (o: unknown): void => { res.write(JSON.stringify(o) + '\n'); };
  const beat = (): void => send({ model, created_at: createdAt, message: { role: 'assistant', content: '', thinking: '' }, done: false });
  beat();
  await paceThinking(
    ctx,
    reply,
    (piece) => send({ model, created_at: createdAt, message: { role: 'assistant', content: '', thinking: piece }, done: false }),
    beat,
  );
  for (const piece of chunkify(reply.content)) {
    send({ model, created_at: createdAt, message: { role: 'assistant', content: piece, thinking: '' }, done: false });
    await sleep(ctx.delayMs);
  }
  send({
    model,
    created_at: createdAt,
    done: true,
    done_reason: 'stop',
    message: { role: 'assistant', content: '', thinking: '' },
    total_duration: 1,
    load_duration: 0,
    prompt_eval_count: reply.inputTokens,
    prompt_eval_duration: 1,
    eval_count: reply.outputTokens,
    eval_duration: 1,
  });
  res.end();
}

export async function generate(res: ServerResponse, body: Body, ctx: RequestContext): Promise<void> {
  const reply = replyOf(body, ctx);
  const model = String(body.model || 'auto');
  const createdAt = new Date().toISOString();

  if (body.stream === false) {
    await thinkDelay(ctx);
    json(res, 200, {
      model,
      created_at: createdAt,
      response: reply.thinking + '\n' + reply.content,
      thinking: reply.thinking,
      done: true,
      done_reason: 'stop',
      context: [],
      total_duration: 1,
      eval_count: reply.outputTokens,
    });
    return;
  }

  ndjsonHead(res);
  const send = (o: unknown): void => { res.write(JSON.stringify(o) + '\n'); };
  const beat = (): void => send({ model, created_at: createdAt, response: '', thinking: '', done: false });
  beat();
  await paceThinking(
    ctx,
    reply,
    (piece) => send({ model, created_at: createdAt, response: '', thinking: piece, done: false }),
    beat,
  );
  for (const piece of chunkify(reply.content)) {
    send({ model, created_at: createdAt, response: piece, thinking: '', done: false });
    await sleep(ctx.delayMs);
  }
  send({ model, created_at: createdAt, response: '', thinking: '', done: true, done_reason: 'stop', total_duration: 1, eval_count: reply.outputTokens });
  res.end();
}

export function show(res: ServerResponse, body: Body): void {
  const model = String(body.model || 'auto');
  const m = models.get(model.replace(/:latest$/, ''));
  json(res, 200, {
    license: 'FreeEgg Gateway Evaluation License 1.0',
    modelfile: '# 本模型没有任何权重，只有一个鸡蛋\nFROM free-egg:latest',
    parameters: 'temperature 0.7\nstop "认真"',
    template: '{{ .Prompt }} => 既然是免费的鸡蛋了……',
    details: {
      parent_model: '',
      format: 'gguf',
      family: m.owner,
      families: [m.owner],
      parameter_size: '0B',
      quantization_level: 'FREE',
    },
    model_info: { 'free.egg': true, 'nailong.laugh': true },
  });
}
