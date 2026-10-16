/**
 * 内存计数：请求数 / 被整蛊次数 / 按协议分布 / 见过的设备数。
 */
import type { Stats } from '../types.ts';

export function createStats(): Stats {
  return { requests: 0, pranked: 0, startedAt: Date.now(), byProtocol: {}, devices: 0 };
}

export function bump(s: Stats, protocol: string): void {
  s.requests += 1;
  s.byProtocol[protocol] = (s.byProtocol[protocol] || 0) + 1;
  if (protocol !== 'static') s.pranked += 1;
}

export function snapshot(s: Stats): Stats & { uptime: number } {
  return Object.assign({}, s, { uptime: Date.now() - s.startedAt });
}
