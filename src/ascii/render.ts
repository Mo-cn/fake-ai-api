/**
 * 字符画渲染管线：
 *   1. 由外向内裁掉不含浅色背景的外框/色带（trimFrame）
 *   2. 按行/列最强笔触裁出主体
 *   3. 饱和度优先算墨量，映射到字符 ramp（单色）或 24 位真彩半块（color）
 */
import { decodePNGFile } from './png.ts';
import type { DecodedImage } from './png.ts';
import type { AsciiMode } from '../types.ts';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RenderOptions {
  width?: number;
  mode?: AsciiMode;
  crop?: boolean;
}

export const RAMP = '@%#*+=-:. ';
const GAMMA = 0.8;

/** 单像素"墨量"：饱和度优先（白/灰底天然归零），再补一层变暗权重。 */
export function inkRaw(r: number, g: number, b: number): number {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const mx = Math.max(R, G, B);
  const mn = Math.min(R, G, B);
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  return Math.min(1, Math.max(sat * 1.35, (0.72 - lum) * 2.2, 0));
}

/** 由外向内扫描，裁掉不含浅色背景的外框/色带；不会切进主体内部。 */
export function trimFrame(img: DecodedImage): Box {
  const width = img.width;
  const height = img.height;
  const rgba = img.rgba;

  const isLight = (x: number, y: number): boolean => {
    const o = (y * width + x) * 4;
    const r = rgba[o] / 255;
    const g = rgba[o + 1] / 255;
    const b = rgba[o + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return sat < 0.12 && lum > 0.88;
  };

  const colLight = new Array<number>(width).fill(0);
  const rowLight = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isLight(x, y)) {
        colLight[x] += 1;
        rowLight[y] += 1;
      }
    }
  }
  const colOk = colLight.map((c) => c > height * 0.005);
  const rowOk = rowLight.map((c) => c > width * 0.005);

  let x0 = 0;
  let x1 = width - 1;
  let y0 = 0;
  let y1 = height - 1;
  while (x0 < x1 && !colOk[x0]) x0 += 1;
  while (x1 > x0 && !colOk[x1]) x1 -= 1;
  while (y0 < y1 && !rowOk[y0]) y0 += 1;
  while (y1 > y0 && !rowOk[y1]) y1 -= 1;
  return { x0, y0, x1, y1 };
}

/** 把矩形区域盒式降采样成 cols x rows 的 RGB 网格（透明合成到白底）。 */
export function sampleGrid(img: DecodedImage, box: Box, cols: number, rows: number): number[][][] {
  const width = img.width;
  const height = img.height;
  const rgba = img.rgba;
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const grid: number[][][] = [];

  for (let cy = 0; cy < rows; cy += 1) {
    const row: number[][] = [];
    const y0 = Math.max(0, Math.floor(box.y0 + (cy * bh) / rows));
    const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil(box.y0 + ((cy + 1) * bh) / rows)));
    for (let cx = 0; cx < cols; cx += 1) {
      const x0 = Math.max(0, Math.floor(box.x0 + (cx * bw) / cols));
      const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil(box.x0 + ((cx + 1) * bw) / cols)));
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const o = (y * width + x) * 4;
          const a = rgba[o + 3] / 255;
          rs += rgba[o] * a + 255 * (1 - a);
          gs += rgba[o + 1] * a + 255 * (1 - a);
          bs += rgba[o + 2] * a + 255 * (1 - a);
          n += 1;
        }
      }
      row.push(n ? [rs / n, gs / n, bs / n] : [255, 255, 255]);
    }
    grid.push(row);
  }
  return grid;
}

export function inkGrid(grid: number[][][]): number[][] {
  return grid.map((row) => row.map((px) => inkRaw(px[0], px[1], px[2])));
}

/** 按 99 分位归一化到 0..1。 */
export function normalizeInk(ink: number[][]): number[][] {
  const flat = ink.flat().slice().sort((a, b) => a - b);
  const hi = flat[Math.min(flat.length - 1, Math.floor(flat.length * 0.99))] || 1;
  const span = Math.max(0.08, hi);
  return ink.map((row) => row.map((v) => Math.min(1, v / span)));
}

/** 按"整行/整列最强笔触"裁出主体。 */
export function bboxOf(norm: number[][], cols: number, rows: number, threshold: number): Box {
  const rowMax: number[] = [];
  for (let y = 0; y < rows; y += 1) {
    let m = 0;
    for (let x = 0; x < cols; x += 1) if (norm[y][x] > m) m = norm[y][x];
    rowMax.push(m);
  }
  const colMax: number[] = [];
  for (let x = 0; x < cols; x += 1) {
    let m = 0;
    for (let y = 0; y < rows; y += 1) if (norm[y][x] > m) m = norm[y][x];
    colMax.push(m);
  }
  let y0 = 0;
  let y1 = rows - 1;
  let x0 = 0;
  let x1 = cols - 1;
  while (y0 < y1 && rowMax[y0] < threshold) y0 += 1;
  while (y1 > y0 && rowMax[y1] < threshold) y1 -= 1;
  while (x0 < x1 && colMax[x0] < threshold) x0 += 1;
  while (x1 > x0 && colMax[x1] < threshold) x1 -= 1;
  return { x0, y0, x1, y1 };
}

function toMono(norm: number[][]): string {
  return norm
    .map((row) => row
      .map((v) => {
        if (v < 0.1) return ' ';
        const idx = Math.min(RAMP.length - 1, Math.round((1 - Math.pow(v, GAMMA)) * (RAMP.length - 1)));
        return RAMP[idx];
      })
      .join('')
      .replace(/\s+$/, ''))
    .join('\n');
}

function toColor(grid: number[][][]): string {
  const lines: string[] = [];
  for (let y = 0; y + 1 < grid.length; y += 2) {
    let line = '';
    for (let x = 0; x < grid[y].length; x += 1) {
      const t = grid[y][x];
      const b = grid[y + 1][x];
      line += '\u001b[38;2;' + Math.round(t[0]) + ';' + Math.round(t[1]) + ';' + Math.round(t[2]) + 'm' +
        '\u001b[48;2;' + Math.round(b[0]) + ';' + Math.round(b[1]) + ';' + Math.round(b[2]) + 'm\u2580';
    }
    lines.push(line + '\u001b[0m');
  }
  return lines.join('\n');
}

/** 渲染字符画。 */
export function render(file: string, opts?: RenderOptions): string {
  const o = opts || {};
  const cols = Math.max(8, Math.min(400, Math.round(o.width || 64)));
  const mode: AsciiMode = o.mode === 'color' ? 'color' : 'mono';
  const img = decodePNGFile(file);
  const inner = trimFrame(img);
  const iw = inner.x1 - inner.x0 + 1;
  const ih = inner.y1 - inner.y0 + 1;

  const scanCols = Math.min(96, Math.max(24, cols));
  const scanRows = Math.max(4, Math.round((scanCols * ih) / iw / 2));
  const scanNorm = normalizeInk(inkGrid(sampleGrid(img, inner, scanCols, scanRows)));

  let box: Box = inner;
  if (o.crop !== false) {
    const bb = bboxOf(scanNorm, scanCols, scanRows, 0.3);
    const cw = iw / scanCols;
    const ch = ih / scanRows;
    box = {
      x0: Math.max(inner.x0, Math.floor(inner.x0 + bb.x0 * cw - cw * 0.6)),
      y0: Math.max(inner.y0, Math.floor(inner.y0 + bb.y0 * ch - ch * 0.6)),
      x1: Math.min(inner.x1, Math.ceil(inner.x0 + (bb.x1 + 1) * cw + cw * 0.6)),
      y1: Math.min(inner.y1, Math.ceil(inner.y0 + (bb.y1 + 1) * ch + ch * 0.6)),
    };
  }

  const aspect = (box.y1 - box.y0 + 1) / (box.x1 - box.x0 + 1);
  const charRows = Math.max(2, Math.round((cols * aspect) / 2));
  const grid = sampleGrid(img, box, cols, mode === 'color' ? charRows * 2 : charRows);
  if (mode === 'color') return toColor(grid);
  return toMono(normalizeInk(inkGrid(grid)));
}
