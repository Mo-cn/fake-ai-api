/**
 * 纯 Node PNG 解码：chunk 解析 + zlib 解压 + 手写 Sub/Up/Average/Paeth 反滤波。
 * 支持位深 8/16、颜色类型 0/2/3/4/6、非隔行扫描。
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA，长度 = width * height * 4 */
  rgba: Buffer;
}

interface Header {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePNG(buf: Buffer): DecodedImage {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('不是 PNG 文件');

  let pos = 8;
  let ihdr: Header | null = null;
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];

  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') {
      plte = Buffer.from(data);
    } else if (type === 'tRNS') {
      trns = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  if (!ihdr) throw new Error('PNG 缺少 IHDR');
  if (ihdr.interlace !== 0) throw new Error('暂不支持隔行扫描(interlace)PNG');
  if (ihdr.bitDepth !== 8 && ihdr.bitDepth !== 16) throw new Error('暂不支持位深 ' + ihdr.bitDepth);
  const chans = CHANNELS[ihdr.colorType];
  if (!chans) throw new Error('暂不支持颜色类型 ' + ihdr.colorType);

  const width = ihdr.width;
  const height = ihdr.height;
  const bitDepth = ihdr.bitDepth;
  const colorType = ihdr.colorType;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const step = bitDepth === 16 ? 2 : 1;
  const stride = Math.ceil((width * chans * bitDepth) / 8);
  const bpp = Math.max(1, Math.ceil((chans * bitDepth) / 8));
  const out = Buffer.alloc(stride * height);

  let rp = 0;
  for (let y = 0; y < height; y += 1) {
    const ft = raw[rp];
    rp += 1;
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v = (v + a) & 0xff;
      else if (ft === 2) v = (v + b) & 0xff;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else if (ft !== 0) {
        throw new Error('未知滤波器类型 ' + ft);
      }
      cur[x] = v;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  const to8 = bitDepth === 16 ? 255 / 65535 : 1;
  const rd = bitDepth === 16
    ? (o: number): number => out.readUInt16BE(o)
    : (o: number): number => out[o];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = y * stride + x * chans * step;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;
      if (colorType === 0) {
        r = rd(base); g = r; b = r;
      } else if (colorType === 2) {
        r = rd(base); g = rd(base + step); b = rd(base + 2 * step);
      } else if (colorType === 3) {
        const idx = out[base];
        r = plte ? plte[idx * 3] : 0;
        g = plte ? plte[idx * 3 + 1] : 0;
        b = plte ? plte[idx * 3 + 2] : 0;
        a = trns && idx < trns.length ? trns[idx] : 255;
      } else if (colorType === 4) {
        r = rd(base); g = r; b = r; a = rd(base + step);
      } else {
        r = rd(base); g = rd(base + step); b = rd(base + 2 * step); a = rd(base + 3 * step);
      }
      const o = (y * width + x) * 4;
      rgba[o] = Math.round(r * to8);
      rgba[o + 1] = Math.round(g * to8);
      rgba[o + 2] = Math.round(b * to8);
      rgba[o + 3] = bitDepth === 16 ? Math.round(a * to8) : a;
    }
  }

  return { width, height, rgba };
}

export function decodePNGFile(file: string): DecodedImage {
  return decodePNG(fs.readFileSync(file));
}
