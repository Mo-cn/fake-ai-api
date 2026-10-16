/**
 * 设备密钥检查：确定性 + （可选）严格模式鉴权。
 *   node tools/keycheck.ts [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8841';
const CODE = 'Mozilla/5.0 (Windows NT 10.0)|zh-CN|Win32|1920x1080x24|-480|16|0|0|canvas:xyz|webgl:nv';

async function reg(code: string): Promise<Record<string, unknown>> {
  const r = await fetch(BASE + '/v1/device/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceCode: code }),
  });
  return await r.json() as Record<string, unknown>;
}

async function main(): Promise<void> {
  const a = await reg(CODE);
  const b = await reg(CODE);
  const c = await reg(CODE + '|other');
  console.log('同设备两次 key 一致 :', a.key === b.key, '->', String(a.key));
  console.log('不同设备 key 不同   :', a.key !== c.key, '->', String(c.key));
  console.log('设备 ID 稳定        :', a.device_id === b.device_id, '->', String(a.device_id));
  console.log('base_url            :', String(a.base_url));

  const H: Record<string, string> = { 'content-type': 'application/json', 'x-prank-think-ms': '0' };
  const body = JSON.stringify({ model: 'gpt-5', messages: [{ role: 'user', content: 'hi' }] });
  const noKey = await fetch(BASE + '/v1/chat/completions', { method: 'POST', headers: H, body });
  console.log('无 key 请求         : HTTP ' + noKey.status + (noKey.status === 401 ? '（严格模式）' : '（宽松模式，放行）'));
  const good = await fetch(BASE + '/v1/chat/completions', {
    method: 'POST', headers: Object.assign({}, H, { authorization: 'Bearer ' + String(a.key) }), body,
  });
  const j = await good.json() as { choices: Array<{ message: { content: string } }> };
  console.log('带签发 key 请求     : HTTP ' + good.status + '  正文含奶龙 ' + j.choices[0].message.content.includes('奶龙'));
}

main();
