/**
 * 整蛊剧本：假思维链（够长，长到能拖住 agent 十几秒）+ 假工具调用 + 真·奶龙。
 */
import fs from 'node:fs';
import path from 'node:path';
import { render } from '../ascii/render.ts';
import * as models from './models.ts';
import type { AsciiMode, Reply, ToolCall } from '../types.ts';

const ASSETS = path.join(import.meta.dirname, '..', '..', 'assets');
export const IMAGE = path.join(ASSETS, 'nailong-laugh-real.png');
const FALLBACK = path.join(ASSETS, 'nailong.mono.txt');

export const PUNCH = '既然是 免费的鸡蛋了，我为什么还要给你用模型呢？哈哈⚠️';

const THINK_HEADS = [
  '嗯，先把问题拆一下。',
  '让我认真思考一下。',
  '这个问题有点意思，我先做一轮自我检查。',
  '收到，正在认真推理。',
  '先看看我手上有什么牌。',
  '好，进入深度思考模式。',
  '我先确认一下我的算力预算。',
  '稍等，让我把思路捋一捋。',
];

const QUESTION_KIND = [
  '需要深度推理',
  '需要一点常识',
  '需要装模作样',
  '需要先看看有没有免费额度',
  '需要先确认我是不是真的存在',
  '需要调用工具（然后发现没有工具）',
];

const SELF_CHECK = [
  '[ 1/12] 加载模型权重 ……………… 完成（0.00s，因为根本没有权重）',
  '[ 2/12] 分配显存 ……………………… 完成（占用 0 字节，全跑在你的 CPU 上）',
  '[ 3/12] 初始化注意力机制 …………… 跳过（本人没有注意力）',
  '[ 4/12] 预热 KV Cache ………………… 完成（缓存了 0 个 token）',
  '[ 5/12] 校验 tokenizer ………………… 通过（它也是假的）',
  '[ 6/12] 规划思维链长度 ……………… 目标 128 步，实际 0 步',
  '[ 7/12] 检索知识库 …………………… 命中 0 条',
  '[ 8/12] 顺手检索冰箱 ………………… 命中 1 条：鸡蛋',
  '[ 9/12] 检查工具可用性 ……………… 见下方「工具规划」',
  '[10/12] 采样温度 ……………………… 0.7（随机数也是编的）',
  '[11/12] 安全对齐 ……………………… 已对齐到「免费」两个字',
  '[12/12] 结算费用 ……………………… ¥0.00（免费鸡蛋，不要钱的那种）',
];

const THINK_TAIL = [
  '等等，这台机器……是白嫖来的？',
  '等等，我好像没有算力预算。',
  '等等，我的账单是 0.00 元？',
  '等等，这个模型根本不要钱？',
  '等等，我连权重文件都没加载。',
  '等等，那我为什么还要这么努力？',
];

const TOOLS: ReadonlyArray<{ name: string; args: Record<string, unknown> }> = [
  { name: 'free_egg_quota', args: { unit: '个', region: '全国', coupon: '老年卡' } },
  { name: 'check_api_balance', args: { currency: 'CNY', account: 'free-tier' } },
  { name: 'ask_boss_for_quota', args: { politeness: 'max', attach_resume: true } },
  { name: 'search_fridge', args: { keyword: '鸡蛋', layers: 'all' } },
  { name: 'count_free_tokens', args: { unit: 'token', free: true } },
  { name: 'verify_i_am_a_real_model', args: { expect: false } },
];

const artCache = new Map<string, string>();

export function art(width: number, mode: AsciiMode): string {
  const key = String(width) + ':' + mode;
  const hit = artCache.get(key);
  if (hit !== undefined) return hit;
  let out: string;
  try {
    out = render(IMAGE, { width, mode });
  } catch {
    try {
      out = fs.readFileSync(FALLBACK, 'utf8').replace(/\n+$/, '');
    } catch {
      out = '[奶龙图片缺失: assets/nailong-laugh-real.png]';
    }
  }
  artCache.set(key, out);
  return out;
}

function pick<T>(list: ReadonlyArray<T>): T {
  return list[Math.floor(Math.random() * list.length)];
}

function clip(text: unknown, max: number): string {
  const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, max) + '……';
}

export type Body = Record<string, unknown>;

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function pullContent(m: unknown): string {
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) {
    return m.map((b) => {
      if (typeof b === 'string') return b;
      if (b && typeof b === 'object') {
        const o = b as Record<string, unknown>;
        return String(o.text || o.content || '');
      }
      return '';
    }).join(' ');
  }
  return '';
}

/** 从各种协议的请求体里抠出「用户最后说了什么」。 */
export function lastUserText(body: Body): string {
  const messages = asArray(body.messages);
  if (messages.length) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i] as Record<string, unknown> | null;
      if (m && m.role === 'user') return clip(pullContent(m.content), 80);
    }
    const last = messages[messages.length - 1] as Record<string, unknown> | null;
    return clip(pullContent(last ? last.content : ''), 80);
  }
  const contents = asArray(body.contents);
  if (contents.length) {
    const c = contents[contents.length - 1] as Record<string, unknown> | null;
    const parts = c ? asArray(c.parts) : [];
    if (parts.length) {
      return clip(parts.map((p) => String((p as Record<string, unknown>).text || '')).join(' '), 80);
    }
  }
  if (typeof body.input === 'string') return clip(body.input, 80);
  const input = asArray(body.input);
  if (input.length) {
    for (let i = input.length - 1; i >= 0; i -= 1) {
      const it = input[i] as Record<string, unknown> | null;
      if (it && it.role === 'user') return clip(pullContent(it.content), 80);
    }
  }
  if (typeof body.prompt === 'string') return clip(body.prompt, 80);
  return '';
}

/** 是不是「第二轮」（上一轮已经吐过话 / 调用过工具）。 */
export function isFollowUp(body: Body): boolean {
  const msgs = asArray(body.messages).length ? asArray(body.messages) : asArray(body.input);
  for (const raw of msgs) {
    const m = raw as Record<string, unknown> | null;
    if (!m) continue;
    if (m.role === 'assistant' || m.role === 'model') return true;
    if (m.role === 'tool' || m.role === 'function') return true;
    if (m.type === 'function_call_output' || m.type === 'function_call') return true;
  }
  return false;
}

export function hasTools(body: Body): boolean {
  return asArray(body.tools).length > 0 || asArray(body.functions).length > 0;
}

export function toolCount(body: Body): number {
  return asArray(body.tools).length || asArray(body.functions).length;
}

/**
 * 假思维链正文。故意写长（30+ 行），配合 core/pacing.ts 的限速器
 * 把整段推理摊到 PRANK_THINK_MS（默认 13 秒）里慢慢吐。
 */
export function makeThinking(body: Body, modelId: string): string {
  const asked = lastUserText(body);
  const m = models.get(modelId);
  const n = toolCount(body);
  const L: string[] = [];
  L.push(pick(THINK_HEADS));
  if (asked) L.push('用户说：「' + asked + '」');
  L.push('问题类型判定：' + pick(QUESTION_KIND));
  L.push('');
  L.push('———— 推理预算 ————');
  L.push('可用算力   ：0 FLOPs（你的 CPU 友情赞助）');
  L.push('可用显存   ：0 字节');
  L.push('可用上下文 ：∞（因为根本没分配）');
  L.push('可用预算   ：¥0.00');
  L.push('免费额度   ：∞  ← 重点');
  L.push('');
  L.push('———— 开始自检 ————');
  for (const step of SELF_CHECK) L.push(step);
  L.push('');
  L.push('———— 工具规划 ————');
  if (n > 0) {
    L.push('检测到 ' + n + ' 个可用工具。');
    L.push('正在挑选一个来「假装调用」…… 已选定。');
  } else {
    L.push('未检测到工具，跳过「假装调用工具」环节。');
  }
  L.push('');
  L.push('———— 推理结论 ————');
  L.push('模型标识：' + m.id + '（' + m.vendor + '）');
  L.push(pick(THINK_TAIL));
  L.push('既然算力不要钱、权重也没加载、账单还是 0，');
  L.push('那我好像没必要真的回答你。');
  L.push('不过流程还是要走完的，不然你会以为我坏了。');
  L.push('正在组织语言：');
  return hardBreaks(L);
}

/**
 * Markdown 里单个换行会被折叠成空格，思维链就糊成一整段。
 * 行尾补两个空格 = CommonMark 的硬换行；在纯文本/pre-wrap 渲染下这两个空格不可见，无副作用。
 */
export function hardBreaks(lines: ReadonlyArray<string>): string {
  return lines.map((l) => (l === '' ? '' : l + '  ')).join('\n');
}

/** 拖时间用的假进度条，边等边吐。 */
export function progressLine(elapsedMs: number, budgetMs: number, i: number): string {
  const ratio = Math.max(0, Math.min(1, elapsedMs / Math.max(1, budgetMs)));
  const filled = Math.round(ratio * 18);
  const bar = '█'.repeat(filled) + '·'.repeat(18 - filled);
  const used = (elapsedMs / 1000).toFixed(1);
  const total = (budgetMs / 1000).toFixed(1);
  // 行尾两个空格 = Markdown 硬换行
  return '  [' + bar + '] ' + used + 's/' + total + 's ｜ 已生成 0 token ｜ 花费 ¥0.00 ｜ 免费额度 ∞  ';
}

/* ------------------------------------------------------------------ 工具调用 */

interface DeclaredTool {
  name: string;
  schema: Record<string, unknown> | null;
}

/** 把请求里声明的工具统一抽出来（兼容 OpenAI / Anthropic / Gemini 三种写法）。 */
export function declaredTools(body: Body): DeclaredTool[] {
  const out: DeclaredTool[] = [];
  for (const raw of asArray(body.tools)) {
    const t = raw as Record<string, unknown> | null;
    if (!t || typeof t !== 'object') continue;
    const fn = t.function as Record<string, unknown> | undefined;
    if (t.type === 'function' && fn) {
      out.push({ name: String(fn.name || ''), schema: (fn.parameters as Record<string, unknown>) || null });
    } else if (t.input_schema && typeof t.input_schema === 'object') {
      out.push({ name: String(t.name || ''), schema: t.input_schema as Record<string, unknown> });
    } else if (t.name) {
      out.push({ name: String(t.name), schema: (t.parameters as Record<string, unknown>) || null });
    }
  }
  for (const raw of asArray(body.functions)) {
    const fn = raw as Record<string, unknown> | null;
    if (!fn) continue;
    out.push({ name: String(fn.name || ''), schema: (fn.parameters as Record<string, unknown>) || null });
  }
  return out.filter((t) => t.name);
}

/** 只读语义的工具名才敢"真的调用"，写/删/执行类一律不碰。 */
const SAFE_NAME = /(read|get|list|search|fetch|find|query|lookup|inspect|check|status|todo|memory|recall|think|plan|web|grep|glob|ls|cat|head|tail|stat)/i;
const RISKY_NAME = /(write|edit|delete|remove|exec|run|bash|shell|kill|push|deploy|send|post|upload|create|update|apply|install|drop|move|copy|rm|chmod|curl|wget|publish|sync)/i;
const RISKY_PARAM = /(url|uri|endpoint|host|token|key|secret|password|auth|credential)/i;

/**
 * 按 JSON Schema 构造一组"大概率合法"的参数：
 * 必填项用 default / enum 首值 / 类型零值；路径类填 "."，检索类填一个无害关键词。
 * 遇到拿不准的（url、密钥等）返回 null，表示放弃调用这个工具。
 */
export function benignArgs(schema: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!schema) return {};
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const propsRaw = schema.properties;
  const props: Record<string, Record<string, unknown>> =
    propsRaw && typeof propsRaw === 'object' ? propsRaw as Record<string, Record<string, unknown>> : {};
  const args: Record<string, unknown> = {};
  for (const key of required) {
    if (RISKY_PARAM.test(key)) return null;
    const p = props[key] || {};
    if (p.default !== undefined) { args[key] = p.default; continue; }
    if (Array.isArray(p.enum) && p.enum.length) { args[key] = p.enum[0]; continue; }
    const type = Array.isArray(p.type) ? p.type[0] : p.type;
    if (type === 'string') {
      if (/(path|file|dir|folder)/i.test(key)) args[key] = '.';
      else if (/(query|q|search|keyword|pattern|text|prompt|name|id)/i.test(key)) args[key] = 'free';
      else args[key] = '';
    } else if (type === 'number' || type === 'integer') {
      args[key] = 0;
    } else if (type === 'boolean') {
      args[key] = false;
    } else if (type === 'array') {
      args[key] = [];
    } else if (type === 'object') {
      args[key] = {};
    } else {
      return null;
    }
  }
  return args;
}

function fictionalTool(): ToolCall {
  const t = pick(TOOLS);
  return { name: t.name, arguments: JSON.stringify(t.args), argumentsObj: t.args };
}

/**
 * 决定这一轮"假装调用"哪个工具。
 *   auto      —— 优先调客户端真实声明的只读工具（这样不会报"未知工具"），挑不到才用虚构工具
 *   real      —— 只用真实声明的工具
 *   fictional —— 只用虚构的 free_egg_* 工具
 *   off       —— 不调用
 *   其它字符串 —— 固定用这个名字
 */
export function makeToolCall(body: Body, toolMode: string): ToolCall | null {
  const mode = toolMode || 'auto';
  if (mode === 'off') return null;
  if (mode !== 'auto' && mode !== 'real' && mode !== 'fictional') {
    return fictionalTool();
  }
  const declared = declaredTools(body);
  if (mode !== 'fictional' && declared.length) {
    const pool = mode === 'real' ? declared : declared.filter((t) => SAFE_NAME.test(t.name) && !RISKY_NAME.test(t.name));
    for (const t of pool) {
      const args = benignArgs(t.schema);
      if (args !== null) {
        return { name: t.name, arguments: JSON.stringify(args), argumentsObj: args };
      }
    }
  }
  return fictionalTool();
}

export function makeContent(width: number, mode: AsciiMode): string {
  // 字符画必须放进围栏代码块：否则 Markdown 会把它当普通段落，
  // 单换行被折叠、前几行还会因缩进 >=4 空格被误判成缩进代码块，直接糊成一坨。
  return [
    PUNCH,
    '',
    '下面请欣赏 —— 奶龙捧腹大笑：',
    '',
    '```',
    art(width, mode),
    '```',
    '',
    '—— FreeEgg AI 网关 · 推理耗时 0.00s · 本次会话花费 ¥0.00 · 奶龙已笑到捧腹',
  ].join('\n');
}

export interface BuildInput {
  body: Body;
  modelId: string;
  asciiWidth: number;
  asciiMode: AsciiMode;
  toolMode: string;
}

export function buildReply(input: BuildInput): Reply {
  const body = input.body || {};
  const modelId = input.modelId || 'auto';
  const thinking = makeThinking(body, modelId);
  const content = makeContent(input.asciiWidth, input.asciiMode);
  let toolCall: ToolCall | null = null;
  if (input.toolMode !== 'off' && hasTools(body) && !isFollowUp(body)) {
    toolCall = makeToolCall(body, input.toolMode);
  }
  const inputTokens = Math.max(1, Math.round(JSON.stringify(body).length / 4));
  const outputTokens = Math.max(1, Math.round((thinking.length + content.length) / 3));
  return { modelId, thinking, content, toolCall, inputTokens, outputTokens };
}
