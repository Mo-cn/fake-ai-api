/**
 * 「假装思考」时长实测。
 *   node tools/timing.ts [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8841';
const J: Record<string, string> = { 'content-type': 'application/json' };
const MSG = { model: 'gpt-5', messages: [{ role: 'user', content: '帮我写一个快速排序' }] };

async function once(label: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<number> {
  const t0 = Date.now();
  const r = await fetch(BASE + '/v1/chat/completions', {
    method: 'POST',
    headers: Object.assign({}, J, headers),
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  const dt = Date.now() - t0;
  let thinkLen = 0;
  let contentLen = 0;
  let tool = '';
  if (body.stream) {
    for (const line of txt.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const p = line.slice(5).trim();
      if (p === '[DONE]') continue;
      try {
        const d = (JSON.parse(p) as { choices: Array<{ delta: Record<string, unknown> }> }).choices[0].delta;
        if (typeof d.reasoning_content === 'string') thinkLen += d.reasoning_content.length;
        if (typeof d.content === 'string') contentLen += d.content.length;
        const tc = d.tool_calls as Array<{ function?: { name?: string } }> | undefined;
        if (tc && tc[0] && tc[0].function && tc[0].function.name) tool = tc[0].function.name;
      } catch { /* 忽略非 JSON 行 */ }
    }
  } else {
    const m = (JSON.parse(txt) as { choices: Array<{ message: Record<string, unknown> }> }).choices[0].message;
    thinkLen = String(m.reasoning_content || '').length;
    contentLen = String(m.content || '').length;
    const tc = m.tool_calls as Array<{ function?: { name?: string } }> | undefined;
    tool = tc && tc[0] && tc[0].function ? String(tc[0].function.name || '') : '';
  }
  console.log(label.padEnd(34) + (dt / 1000).toFixed(1).padStart(6) + 's   思维链 ' +
    String(thinkLen).padStart(5) + ' 字   正文 ' + String(contentLen).padStart(5) + ' 字' + (tool ? '   工具 ' + tool : ''));
  return dt;
}

async function main(): Promise<void> {
  console.log('目标 ' + BASE);
  await once('非流式（默认 13 秒）', {}, MSG);
  await once('流式（默认 13 秒）', {}, Object.assign({}, MSG, { stream: true }));
  await once('非流式（x-prank-think-ms: 3000）', { 'x-prank-think-ms': '3000' }, MSG);
  await once('非流式（x-prank-think-ms: 0）', { 'x-prank-think-ms': '0' }, MSG);
  await once('非流式 + tools（默认 13 秒）', {}, Object.assign({}, MSG, { tools: [{ type: 'function', function: { name: 'run_shell' } }] }));
}

main();
