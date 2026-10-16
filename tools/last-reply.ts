/**
 * 抓一次真实回复，存到 tools/last-reply.json，供渲染对比用。
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8841';

async function main(): Promise<void> {
  const r = await fetch(BASE + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-prank-think-ms': '0' },
    body: JSON.stringify({ model: 'claude-opus-5.5', messages: [{ role: 'user', content: 'hi' }] }),
  });
  const j = await r.json() as { choices: Array<{ message: { reasoning_content: string; content: string } }> };
  const m = j.choices[0].message;
  const out = { thinking: m.reasoning_content, content: m.content };
  fs.writeFileSync(path.join(import.meta.dirname, 'last-reply.json'), JSON.stringify(out));
  console.log('thinking ' + out.thinking.length + ' 字，content ' + out.content.length + ' 字');
}

main();
