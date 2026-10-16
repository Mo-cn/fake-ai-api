/**
 * 重新烘焙字符画到 assets/。
 *   node tools/bake.ts [width]
 */
import fs from 'node:fs';
import path from 'node:path';
import { render } from '../src/ascii/render.ts';

const ROOT = path.join(import.meta.dirname, '..');
const IMAGE = path.join(ROOT, 'assets', 'nailong-laugh-real.png');
const width = Number(process.argv[2] || 68);

const mono = render(IMAGE, { width, mode: 'mono' });
const ansi = render(IMAGE, { width, mode: 'color' });
fs.writeFileSync(path.join(ROOT, 'assets', 'nailong.mono.txt'), mono + '\n');
fs.writeFileSync(path.join(ROOT, 'assets', 'nailong.ansi.txt'), ansi + '\n');
console.log('已烘焙 width=' + width + '：单色 ' + mono.split('\n').length + ' 行，真彩 ' + ansi.split('\n').length + ' 行');
