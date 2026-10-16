/**
 * 设备码 -> API Key 派生。
 *
 * 浏览器端把设备指纹（UA / 屏幕 / 时区 / canvas / WebGL ...）拼成 deviceCode 上报，
 * 服务端用 HMAC-SHA256(salt, code) 派生出稳定的 sk- 密钥：
 * 同一台设备永远拿到同一个 key，换设备就换 key —— 看起来像真的按设备签发。
 */
import { createHash, createHmac } from 'node:crypto';
import type { DeviceProfile } from '../types.ts';

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function base62(buf: Buffer): string {
  let out = '';
  for (let i = 0; i < buf.length; i += 1) out += B62[buf[i] % 62];
  return out;
}

export function normalizeCode(raw: unknown): string {
  return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, 1024);
}

/** 设备指纹摘要（对外可展示的设备 ID）。 */
export function deviceId(code: string): string {
  return 'dev_' + createHash('sha256').update(code).digest('hex').slice(0, 20);
}

/** 由设备码派生 API Key：HMAC-SHA512 -> base62 -> 取前 40 位。 */
export function deriveKey(code: string, salt: string): string {
  const digest = createHmac('sha512', salt).update(code).digest();
  return 'sk-fe-' + base62(digest).slice(0, 40);
}

export function profileOf(code: string, salt: string): DeviceProfile {
  return {
    code,
    id: deviceId(code),
    key: deriveKey(code, salt),
    createdAt: Date.now(),
  };
}

/** 校验一个 key 是不是本服务派发出来的（用于 PRANK_REQUIRE_KEY=1）。 */
export function isIssuedKey(key: string, salt: string, knownCodes: Iterable<string>): boolean {
  const k = String(key || '').trim();
  if (!/^sk-fe-[0-9A-Za-z]{40}$/.test(k)) return false;
  for (const code of knownCodes) {
    if (deriveKey(code, salt) === k) return true;
  }
  return false;
}
