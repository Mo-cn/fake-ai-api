/**
 * 流式节奏实测：分片长度分布 + 关键时刻 + keep-alive 条数。
 *   node tools/streamcheck.ts [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8841';

async function main(): Promise<void> {
  const t0 = Date.now();
  const r = await fetch(BASE + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus-5.5', stream: true, messages: [{ role: 'user', content: '你好' }] }),
  });
  const reader = (r.body as ReadableStream<Uint8Array>).getReader();
  const dec = new TextDecoder();
  let buf = '';
  const marks: Array<[string, number]> = [];
  const sizes: number[] = [];
  const gaps: number[] = [];
  let think = 0;
  let content = 0;
  let pings = 0;
  let lastAt = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const p of parts) {
      const s = p.trim();
      if (s.startsWith(':')) { pings += 1; continue; }
      if (!s.startsWith('data:')) continue;
      const pl = s.slice(5).trim();
      if (pl === '[DONE]') continue;
      try {
        const d = (JSON.parse(pl) as { choices: Array<{ delta: Record<string, unknown> }> }).choices[0].delta;
        if (typeof d.reasoning_content === 'string' && d.reasoning_content.length) {
          if (!think) marks.push(['首个思维链分片', Date.now() - t0]);
          const now = Date.now();
          if (lastAt) gaps.push(now - lastAt);
          lastAt = now;
          sizes.push(d.reasoning_content.length);
          think += d.reasoning_content.length;
        }
        if (typeof d.content === 'string' && d.content.length) {
          if (!content) marks.push(['首个正文字分片', Date.now() - t0]);
          content += d.content.length;
        }
      } catch { /* 忽略 */ }
    }
  }
  marks.push(['流结束', Date.now() - t0]);

  const stat = (a: number[]): string => {
    if (!a.length) return 'n/a';
    const s = a.slice().sort((x, y) => x - y);
    const sum = s.reduce((p, c) => p + c, 0);
    return 'min ' + s[0] + ' / 中位 ' + s[Math.floor(s.length / 2)] + ' / 平均 ' + (sum / s.length).toFixed(1) + ' / max ' + s[s.length - 1];
  };

  console.log('思维链 ' + think + ' 字，正文 ' + content + ' 字，SSE keep-alive ' + pings + ' 条');
  console.log('思维链分片 ' + sizes.length + ' 个：' + stat(sizes));
  console.log('分片间隔   ' + gaps.length + ' 个：' + stat(gaps) + ' ms');
  console.log('前 24 片长度：' + sizes.slice(0, 24).join(' '));
  for (const [k, v] of marks) console.log('  ' + k.padEnd(16) + (v / 1000).toFixed(2) + 's');
}

main();
