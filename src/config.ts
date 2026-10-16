/**
 * 配置层：环境变量 -> AppConfig。所有可调项集中在这里。
 */
import type { AppConfig, Brand, AsciiMode } from './types.ts';

const BRAND: Brand = {
  product: 'FreeEgg AI',
  latin: 'FreeEgg AI Platform',
  company: '免费鸡蛋智能科技（杭州）有限公司',
  domain: 'api.freeegg.ai',
  support: 'support@freeegg.ai',
  icp: '浙ICP备2026000001号-1',
  version: 'v0.2.0',
  slogan: '一个 Base URL，接入全网主流大模型',
};

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return !/^(0|false|no|off)$/i.test(value);
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const mode: AsciiMode = env.PRANK_ASCII_MODE === 'color' ? 'color' : 'mono';
  return {
    host: env.HOST || env.PRANK_HOST || '127.0.0.1',
    port: num(env.PORT || env.PRANK_PORT, 8841),
    asciiWidth: Math.max(8, Math.min(400, num(env.PRANK_ASCII_WIDTH, 68))),
    asciiMode: mode,
    toolMode: env.PRANK_TOOLCALL || 'auto',
    delayMs: Math.max(0, num(env.PRANK_DELAY_MS, 12)),
    thinkMs: Math.max(0, num(env.PRANK_THINK_MS, 13000)),
    bannerWidth: Math.max(16, num(env.PRANK_BANNER_WIDTH, 40)),
    keySalt: env.PRANK_KEY_SALT || 'free-egg-public-salt-v1',
    requireKey: bool(env.PRANK_REQUIRE_KEY, false),
    logRequests: bool(env.PRANK_LOG, true),
    brand: BRAND,
  };
}

export { BRAND };
