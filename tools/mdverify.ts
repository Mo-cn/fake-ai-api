/**
 * 校验输出对 Markdown 渲染器友好：字符画在围栏内、思维链行尾有硬换行。
 *   node tools/mdverify.ts
 */
import { buildReply } from '../src/core/script.ts';
import { randomChunks } from '../src/core/pacing.ts';

const FENCE = String.fromCharCode(96).repeat(3);

const r = buildReply({
  body: { messages: [{ role: 'user', content: 'hi' }] },
  modelId: 'auto',
  asciiWidth: 68,
  asciiMode: 'mono',
  toolMode: 'off',
});

const joined = randomChunks(r.thinking).join('');
const lines = r.content.split('\n');
const fences = lines.filter((l) => l === FENCE).length;
const artLines = lines.filter((l) => l.length > 20);

console.log('分片重组后与原文一致       : ' + (joined === r.thinking));
console.log('硬换行（行尾双空格）保留   : ' + (joined.match(/ {2}\n/g) || []).length + ' 处');
console.log('正文围栏行数               : ' + fences);
console.log('字符画位于围栏内           : ' + (lines.indexOf(FENCE) >= 0 && lines.lastIndexOf(FENCE) > lines.indexOf(FENCE)));
console.log('字符画最长行               : ' + Math.max(...artLines.map((l) => l.length)) + ' 列');
console.log('围栏内无空行截断           : ' + (lines.slice(lines.indexOf(FENCE) + 1, lines.lastIndexOf(FENCE)).every((l) => l.length === 0 || l.trim().length > 0)));
