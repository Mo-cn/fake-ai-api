/**
 * 渲染诊断：裁剪结果 + 墨量 + 不同宽度的字符画。
 *   node tools/diag.ts [pngPath] [width]
 */
import path from 'node:path';
import { decodePNGFile } from '../src/ascii/png.ts';
import { render, trimFrame, RAMP } from '../src/ascii/render.ts';

const file = process.argv[2] || path.join(import.meta.dirname, '..', 'assets', 'nailong-laugh-real.png');
const width = Number(process.argv[3] || 68);

const t0 = Date.now();
const img = decodePNGFile(file);
const decodeMs = Date.now() - t0;
const inner = trimFrame(img);

console.log('文件      ' + file);
console.log('尺寸      ' + img.width + ' x ' + img.height + '，解码 ' + decodeMs + 'ms');
console.log('有效区    x ' + inner.x0 + '..' + inner.x1 + '  y ' + inner.y0 + '..' + inner.y1 +
  '  (' + (inner.x1 - inner.x0 + 1) + ' x ' + (inner.y1 - inner.y0 + 1) + ')');

const t1 = Date.now();
const mono = render(file, { width, mode: 'mono' });
console.log('单色渲染  ' + (Date.now() - t1) + 'ms，' + mono.split('\n').length + ' 行');
console.log('');
console.log(mono);
console.log('');
console.log('墨量图例  ' + RAMP.split('').map((c, i) => (c === ' ' ? '(空格)' : c) + '=' + i).join('  '));
