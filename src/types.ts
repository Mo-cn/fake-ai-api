/**
 * 全局类型定义。全部是可擦除语法（interfaces / type / generics），
 * 因此 Node 24 的 type stripping 可以直接运行，无需任何构建步骤。
 */

export interface ModelEntry {
  id: string;
  owner: string;
  vendor: string;
}

export type AsciiMode = 'mono' | 'color';

export interface Brand {
  product: string;
  latin: string;
  company: string;
  domain: string;
  support: string;
  icp: string;
  version: string;
  slogan: string;
}

export interface AppConfig {
  host: string;
  port: number;
  asciiWidth: number;
  asciiMode: AsciiMode;
  toolMode: string;
  delayMs: number;
  thinkMs: number;
  bannerWidth: number;
  keySalt: string;
  requireKey: boolean;
  logRequests: boolean;
  brand: Brand;
}

/** 单次请求生效的配置（可被请求头按次覆盖）。 */
export interface RequestContext {
  asciiWidth: number;
  asciiMode: AsciiMode;
  toolMode: string;
  delayMs: number;
  thinkMs: number;
}

export interface ToolCall {
  name: string;
  arguments: string;
  argumentsObj: Record<string, unknown>;
}

export interface Reply {
  modelId: string;
  thinking: string;
  content: string;
  toolCall: ToolCall | null;
  inputTokens: number;
  outputTokens: number;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export type Emit = (piece: string) => void;
export type KeepAlive = () => void;

export interface DeviceProfile {
  code: string;
  id: string;
  key: string;
  createdAt: number;
}

export interface Stats {
  requests: number;
  pranked: number;
  startedAt: number;
  byProtocol: Record<string, number>;
  devices: number;
}
