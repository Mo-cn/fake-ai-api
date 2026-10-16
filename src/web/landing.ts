/**
 * 落地页装配：读取同目录的 landing.html，替换占位符后输出。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../types.ts';

const TEMPLATE_FILE = path.join(import.meta.dirname, 'landing.html');
let cache: string | null = null;

export function escapeHtml(s: string): string {
  return String(s)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;');
}

function template(): string {
  if (cache === null) cache = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  return cache;
}

export interface LandingOptions {
  baseUrl: string;
  modelCount: number;
  cfg: AppConfig;
}

export function landingHtml(opts: LandingOptions): string {
  const cfg = opts.cfg;
  return template()
    .split('__BRAND__').join(escapeHtml(cfg.brand.product))
    .split('__SLOGAN__').join(escapeHtml(cfg.brand.slogan))
    .split('__BASE_URL__').join(escapeHtml(opts.baseUrl))
    .split('__MODEL_COUNT__').join(String(opts.modelCount))
    .split('__VERSION__').join(escapeHtml(cfg.brand.version));
}
