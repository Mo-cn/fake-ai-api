/**
 * 线上探测：确认 ai-free.moiu.cn 上跑的是不是本项目的哪个版本、哪些方法可用。
 *   node tools/liveprobe.ts [baseUrl]
 */
const BASE = (process.argv[2] || 'http://ai-free.moiu.cn').replace(/\/$/, '');
const J = { 'content-type': 'application/json', 'x-prank-think-ms': '0' };

async function hit(label: string, method: string, p: string, body?: unknown, extra?: Record<string, string>): Promise<void> {
  try {
    const r = await fetch(BASE + p, {
      method,
      headers: Object.assign({}, J, extra || {}),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const t = await r.text();
    const short = t.replace(/\s+/g, ' ').slice(0, 190);
    console.log((method + ' ' + p).padEnd(34) + ' -> ' + String(r.status).padEnd(5) + short);
  } catch (e) {
    console.log((method + ' ' + p).padEnd(34) + ' -> ERR   ' + String((e as Error).message).slice(0, 120));
  }
}

async function main(): Promise<void> {
  console.log('目标 ' + BASE);
  console.log('--- 门户与运维 ---');
  await hit('portal', 'GET', '/');
  await hit('health', 'GET', '/health');
  await hit('stats', 'GET', '/__prank/stats');
  await hit('favicon', 'GET', '/favicon.ico');

  console.log('--- 模型列表 ---');
  await hit('models', 'GET', '/v1/models');

  console.log('--- chat/completions 各方法 ---');
  await hit('GET', 'GET', '/v1/chat/completions');
  await hit('HEAD', 'HEAD', '/v1/chat/completions');
  await hit('OPTIONS', 'OPTIONS', '/v1/chat/completions');
  await hit('POST', 'POST', '/v1/chat/completions', { model: 'auto', messages: [{ role: 'user', content: 'hi' }] });
  await hit('POST 尾斜杠', 'POST', '/v1/chat/completions/', { model: 'auto', messages: [{ role: 'user', content: 'hi' }] });
  await hit('POST 无 /v1', 'POST', '/chat/completions', { model: 'auto', messages: [{ role: 'user', content: 'hi' }] });

  console.log('--- 其它协议 ---');
  await hit('anthropic', 'POST', '/v1/messages', { model: 'claude-opus-5.5', max_tokens: 64, messages: [{ role: 'user', content: 'hi' }] });
  await hit('ollama tags', 'GET', '/api/tags');
  await hit('gemini', 'POST', '/v1beta/models/gemini-4.0-pro:generateContent', { contents: [{ parts: [{ text: 'hi' }] }] });
  await hit('device register', 'POST', '/v1/device/register', { deviceCode: 'probe-device' });
}

main();
