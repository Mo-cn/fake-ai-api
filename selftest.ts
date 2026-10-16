/**
 * 全协议自测：把五种协议的壳子都敲一遍。
 * 默认带 x-prank-think-ms: 0 走快速通道，不等待"假装思考"。
 *   node selftest.ts [baseUrl]
 */
const BASE = process.argv[2] || ('http://127.0.0.1:' + (process.env.PORT || 8841));

interface Result {
  ok: boolean;
  status: number;
  raw: string;
}

async function call(name: string, url: string, init: RequestInit): Promise<Result> {
  try {
    const r = await fetch(BASE + url, init);
    const raw = await r.text();
    const ok = r.ok && raw.length > 0;
    console.log((ok ? '  OK  ' : ' FAIL ') + name.padEnd(30) + ' HTTP ' + String(r.status).padEnd(4) + raw.length + ' bytes');
    if (!ok) console.log('       ' + raw.slice(0, 200));
    return { ok, status: r.status, raw };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(' FAIL ' + name.padEnd(30) + ' ' + message);
    return { ok: false, status: 0, raw: '' };
  }
}

const J: Record<string, string> = { 'content-type': 'application/json', 'x-prank-think-ms': '0' };
const JA: Record<string, string> = { 'content-type': 'application/json', 'x-prank-think-ms': '0', authorization: 'Bearer sk-fe-test' };

async function main(): Promise<void> {
  console.log('目标 ' + BASE);
  console.log('--- 门户与静态 ---');
  const portal = await call('GET /', '/', {});
  if (portal.ok) {
    console.log('       门户 ' + portal.raw.length + ' 字节，含设备签发接口：' + portal.raw.includes('/v1/device/register'));
  }
  await call('GET /nailong.png', '/nailong.png', {});
  const art = await call('GET /nailong.txt', '/nailong.txt', {});
  if (art.ok) {
    const lines = art.raw.split('\n');
    console.log('       字符画 ' + lines.length + ' 行，最宽 ' + Math.max(...lines.map((l) => l.length)));
  }
  const dev = await call('POST /v1/device/register', '/v1/device/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceCode: 'selftest|win10|1920x1080|canvas:abc|webgl:def' }),
  });
  if (dev.ok) {
    const d = JSON.parse(dev.raw) as Record<string, unknown>;
    console.log('       签发 ' + String(d.device_id) + ' -> ' + String(d.key));
  }

  console.log('--- OpenAI ---');
  await call('GET /v1/models', '/v1/models', { headers: JA });
  const chat = await call('POST /v1/chat/completions', '/v1/chat/completions', {
    method: 'POST',
    headers: JA,
    body: JSON.stringify({ model: 'gpt-5', messages: [{ role: 'user', content: '你好' }] }),
  });
  if (chat.ok) {
    const j = JSON.parse(chat.raw) as { choices: Array<{ message: { reasoning_content?: string; content?: string } }> };
    const m = j.choices[0].message;
    console.log('       思维链 ' + String((m.reasoning_content || '').split('\n').length) + ' 行；正文含奶龙：' + String(m.content || '').includes('奶龙'));
  }
  await call('POST chat stream', '/v1/chat/completions', {
    method: 'POST',
    headers: JA,
    body: JSON.stringify({ model: 'claude-opus-4-1', stream: true, messages: [{ role: 'user', content: 'hi' }] }),
  });
  await call('POST /v1/completions', '/v1/completions', {
    method: 'POST', headers: JA, body: JSON.stringify({ model: 'gpt-3.5-turbo', prompt: 'hi' }),
  });
  await call('POST /v1/responses', '/v1/responses', {
    method: 'POST', headers: JA, body: JSON.stringify({ model: 'gpt-5-codex', input: 'hi' }),
  });
  await call('POST /v1/embeddings', '/v1/embeddings', {
    method: 'POST', headers: JA, body: JSON.stringify({ model: 'text-embedding-3', input: 'hi' }),
  });

  console.log('--- Anthropic ---');
  await call('POST /v1/messages', '/v1/messages', {
    method: 'POST',
    headers: JA,
    body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1024, messages: [{ role: 'user', content: 'hi' }] }),
  });
  await call('POST /v1/messages stream', '/v1/messages', {
    method: 'POST',
    headers: JA,
    body: JSON.stringify({ model: 'claude-opus-4-1', max_tokens: 1024, stream: true, messages: [{ role: 'user', content: 'hi' }] }),
  });
  await call('POST count_tokens', '/v1/messages/count_tokens', {
    method: 'POST', headers: JA, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });

  console.log('--- Gemini ---');
  await call('GET /v1beta/models', '/v1beta/models', { headers: JA });
  await call('POST generateContent', '/v1beta/models/gemini-2.5-pro:generateContent', {
    method: 'POST', headers: JA, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }),
  });
  await call('POST streamGenerateContent', '/v1beta/models/gemini-2.5-flash:streamGenerateContent', {
    method: 'POST', headers: JA, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }),
  });

  console.log('--- Ollama ---');
  await call('GET /api/tags', '/api/tags', { headers: JA });
  await call('GET /api/version', '/api/version', { headers: JA });
  await call('POST /api/chat', '/api/chat', {
    method: 'POST', headers: JA, body: JSON.stringify({ model: 'llama-4-maverick', messages: [{ role: 'user', content: 'hi' }] }),
  });
  await call('POST /api/chat nostream', '/api/chat', {
    method: 'POST', headers: JA, body: JSON.stringify({ model: 'qwen3-max', stream: false, messages: [{ role: 'user', content: 'hi' }] }),
  });
  await call('POST /api/generate', '/api/generate', {
    method: 'POST', headers: JA, body: JSON.stringify({ model: 'deepseek-chat', prompt: 'hi' }),
  });
  await call('POST /api/show', '/api/show', {
    method: 'POST', headers: JA, body: JSON.stringify({ model: 'glm-4.6' }),
  });

  console.log('--- 收尾 ---');
  await call('GET /health', '/health', {});
  await call('GET /__prank/stats', '/__prank/stats', {});
  console.log('完成。');
}

main();
