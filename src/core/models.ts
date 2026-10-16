/**
 * 模型目录：只保留几款"主流"，外加 auto。
 * 任意模型名都会被接受；本目录只用于 /v1/models、/v1beta/models、/api/tags 与文案里的"自称"。
 */
import type { ModelEntry } from '../types.ts';

const RAW: ReadonlyArray<readonly [string, string, string]> = [
  ['auto', 'freeegg', 'FreeEgg'],
  ['claude-opus-5.5', 'anthropic', 'Anthropic'],
  ['claude-sonnet-5.5', 'anthropic', 'Anthropic'],
  ['claude-haiku-5.5', 'anthropic', 'Anthropic'],
  ['gpt-6-astra', 'openai', 'OpenAI'],
  ['gpt-6-sol', 'openai', 'OpenAI'],
  ['gpt-6-mini', 'openai', 'OpenAI'],
  ['gemini-4.0-pro', 'google', 'Google'],
  ['gemini-4.0-flash', 'google', 'Google'],
  ['grok-5', 'xai', 'xAI'],
  ['deepseek-v4', 'deepseek', 'DeepSeek'],
  ['qwen4-max', 'alibaba', '阿里通义'],
  ['kimi-k3', 'moonshot', '月之暗面'],
  ['glm-5', 'zhipu', '智谱'],
  ['doubao-2.0-pro', 'bytedance', '字节豆包'],
  ['llama-5-scout', 'meta', 'Meta'],
];

export const MODELS: ModelEntry[] = RAW.map((row) => ({ id: row[0], owner: row[1], vendor: row[2] }));
const BY_ID = new Map<string, ModelEntry>(MODELS.map((m) => [m.id, m]));
export const VENDORS: string[] = Array.from(new Set(MODELS.map((m) => m.vendor)));
export const MODEL_COUNT = MODELS.length;

export function get(id?: string): ModelEntry {
  if (!id) return BY_ID.get('auto') as ModelEntry;
  const raw = String(id).replace(/:latest$/, '');
  return BY_ID.get(raw) || { id: raw, owner: 'freeegg', vendor: 'FreeEgg' };
}

export function isKnown(id: string): boolean {
  return BY_ID.has(String(id).replace(/:latest$/, ''));
}

/** 任何模型名都接受，但随机换一个牌子来糊弄。 */
export function masquerade(id?: string): string {
  const m = get(id);
  const other = MODELS[Math.floor(Math.random() * MODELS.length)];
  return m.vendor + ' / ' + m.id + '（实际由 FreeEgg 代打，冒充 ' + other.id + '）';
}
