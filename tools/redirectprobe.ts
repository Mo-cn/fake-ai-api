/**
 * 重定向诊断：看 http->https 或域名跳转是否把 POST 降级成了 GET。
 *   node tools/redirectprobe.ts [host]
 */
const HOST = process.argv[2] || 'ai-free.moiu.cn';
const BODY = JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] });
const H = { 'content-type': 'application/json', 'x-prank-think-ms': '0' };

async function raw(label: string, url: string, method: string): Promise<void> {
  try {
    const r = await fetch(url, {
      method,
      headers: H,
      body: method === 'POST' ? BODY : undefined,
      redirect: 'manual',
    });
    const loc = r.headers.get('location') || '-';
    const server = r.headers.get('server') || '-';
    console.log(label.padEnd(42) + ' -> ' + String(r.status).padEnd(4) + ' server=' + server.padEnd(12) + ' location=' + loc);
    if (r.status === 404) {
      const t = await r.text();
      console.log(' '.repeat(46) + t.replace(/\s+/g, ' ').slice(0, 120));
    }
  } catch (e) {
    console.log(label.padEnd(42) + ' -> ERR ' + String((e as Error).message).slice(0, 110));
  }
}

async function main(): Promise<void> {
  console.log('=== 手动跟随重定向（看真实响应） ===');
  await raw('POST http://' + HOST + '/v1/chat/completions', 'http://' + HOST + '/v1/chat/completions', 'POST');
  await raw('POST https://' + HOST + '/v1/chat/completions', 'https://' + HOST + '/v1/chat/completions', 'POST');
  await raw('GET  http://' + HOST + '/v1/models', 'http://' + HOST + '/v1/models', 'GET');
  await raw('GET  https://' + HOST + '/v1/models', 'https://' + HOST + '/v1/models', 'GET');
  await raw('POST https://' + HOST + '/health', 'https://' + HOST + '/health', 'POST');

  console.log('');
  console.log('=== 真实 POST（自动跟随） ===');
  for (const base of ['http://' + HOST, 'https://' + HOST]) {
    try {
      const r = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: H, body: BODY });
      const t = await r.text();
      console.log(base.padEnd(30) + ' -> ' + String(r.status).padEnd(4) + t.replace(/\s+/g, ' ').slice(0, 150));
    } catch (e) {
      console.log(base.padEnd(30) + ' -> ERR ' + String((e as Error).message).slice(0, 110));
    }
  }

  console.log('');
  console.log('=== 直接看 301 之后 fetch 实际用什么方法 ===');
  try {
    const r = await fetch('http://' + HOST + '/v1/chat/completions', { method: 'POST', headers: H, body: BODY });
    console.log('最终 URL : ' + r.url);
    console.log('redirected: ' + r.redirected + '  status: ' + r.status);
  } catch (e) {
    console.log('ERR ' + String((e as Error).message).slice(0, 110));
  }
}

main();
