/**
 * Unified LLM Client — Routes calls to Gemini or OpenAI based on model ID.
 * 
 * All agents in this project only need simple prompt → text (with optional JSON mode).
 * - Gemini: uses native @google/generative-ai SDK
 * - OpenAI GPT-6/5.6: uses /v1/responses API (reasoning models don't support /v1/chat/completions)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ──── Singleton clients ────

let _geminiClient: GoogleGenerativeAI | null = null;
function getGeminiClient(): GoogleGenerativeAI {
  if (!_geminiClient) {
    _geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }
  return _geminiClient;
}

// ──── Unified response type ────

export interface LLMResponse {
  text: string;
  /** 实际用的模型（generateCheap 可能换了模型，记 token 用量时以它为准） */
  model?: string;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    /** llm-client 兜底记账的记录编号（token-logger 回填） */
    __logId?: number;
  };
}

// ──── Provider detection ────

function isOpenAIModel(modelId: string): boolean {
  return modelId.startsWith('gpt-');
}

function isClaudeModel(modelId: string): boolean {
  return modelId.startsWith('claude-');
}

// ──── Main entry point ────

/**
 * Normalizes model ID, falling back to gemini-3.8-flash if empty.
 */
export function resolveModel(modelId?: string | null): string {
  if (!modelId || modelId.trim() === '') {
    return 'gemini-3.8-flash';
  }
  return modelId;
}

/**
 * Generate content using the appropriate LLM provider.
 * @param prompt - The full prompt string
 * @param modelId - Model ID (e.g. 'gemini-3.8-flash', 'gpt-5.6-luna')
 * @param options - { jsonMode: true } to request JSON output
 */
export async function generateContent(
  prompt: string,
  modelId: string,
  /** temperature：目前只有千问接了（打标签这类分类任务设 0，数据部门的提示词要求） */
  options?: { jsonMode?: boolean; webSearch?: boolean; fast?: boolean; temperature?: number },
): Promise<LLMResponse> {
  const resolvedModelId = resolveModel(modelId);
  // 本地「只用免费额度」：千问以外的模型（OpenAI / Gemini 都是付费的）一律不调
  if (process.env.DASHSCOPE_FREE_ONLY === '1' && !/^(qwen|deepseek)/.test(resolvedModelId)) throw new Error(`已开「只用免费额度」，不调用付费模型 ${resolvedModelId}`);
  let res: LLMResponse;
  if (isOpenAIModel(resolvedModelId)) res = await generateOpenAI(prompt, resolvedModelId, options);
  else if (isClaudeModel(resolvedModelId)) res = await generateClaude(prompt, resolvedModelId, options);
  // DeepSeek 也走阿里云百炼（同一个 DashScope key，国内可用）
  else if (/^(qwen|deepseek)/.test(resolvedModelId)) res = await generateQwen(prompt, resolvedModelId, options);
  else res = await generateGemini(prompt, resolvedModelId, options);
  await autoLog(res, resolvedModelId, options);
  return res;
}

/**
 * 记账兜底（2026-10-18，用户：「账要算全，职业画像 / 赛事 / 规范 / 企业画像都花了钱」）：
 * 每一次成功的调用都先按「未归属」记一笔（免费额度、个人充值一样按市价算），记录编号留在 usageMetadata.__logId 上；
 * 调用方随后 logTokenUsage 时会把这一条改成准确的功能 / 环节名，不会重复计。调用方忘了记的，账上也至少有「未归属」这笔。
 */
async function autoLog(res: LLMResponse, modelId: string, options?: { webSearch?: boolean }) {
  if (process.env.LLM_AUTOLOG === '0') return;
  try {
    const { logTokenUsage, currentCost } = await import('@/lib/token-logger');
    const ctx = currentCost();
    await logTokenUsage({ tool_name: 'unattributed', task_name: ctx.task_name || ctx.tool_name || '（未归属）', model_id: res.model || modelId, usageMetadata: res.usageMetadata, search_calls: options?.webSearch ? 1 : 0 });
    // 上下文里给了功能名就直接归过去（省得调用方再记一次）
    if (ctx.tool_name && res.usageMetadata.__logId) await logTokenUsage({ tool_name: ctx.tool_name as any, task_name: ctx.task_name || ctx.tool_name, model_id: res.model || modelId, usageMetadata: res.usageMetadata, search_calls: options?.webSearch ? 1 : 0 });
  } catch (e: any) { console.warn('[llm-client] 兜底记账失败：', String(e?.message).slice(0, 120)); }
}

// ──── 通义千问（阿里云百炼 DashScope 原生接口）────
/**
 * 国内检索用阿里云：webSearch 时打开 enable_search（search_strategy turbo + 返回来源），
 * 来源网址附在正文后面（「## 搜索来源」），调用方要真实链接时从这里取。用法和 zhiji-yida 的 src/lib/search.ts 一致。
 *
 * 本地挖数据省钱：.env.local 里配了 DASHSCOPE_FREE_KEY（阿里云国际站新加坡的免费额度，每个模型 100 万 token，
 * 开了「用完即停」，用完返回 403 AllocationQuota.FreeTierOnly、不扣费）就先走免费额度，同档模型轮着用，
 * 全用完再回到付费 key——除非 DASHSCOPE_FREE_ONLY=1（本地挖数据时开着：免费全用完就报错停下，一分钱不花）。
 * 线上（Vercel）不配这些变量，不受影响。2026-10-15 实测国际站也能联网搜简中网页。
 */
// 免费模型池完全由环境变量给出（DASHSCOPE_FREE_POOL_PLUS / DASHSCOPE_FREE_POOL_FLASH，逗号分隔），代码里不写死模型
// 用完的模型（403 FreeTierOnly）整个跳过；只是不支持某种用法的（比如开源版不能联网搜，400）只在那种用法下跳过
const freeExhausted = new Set<string>();
const freeUnsupported = new Set<string>();

async function callDashScope(base: string, key: string, model: string, prompt: string, parameters: Record<string, any>): Promise<any> {
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 3000 * attempt));
    try {
      const res = await fetch(`${base}/api/v1/services/aigc/text-generation/generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, input: { messages: [{ role: 'user', content: prompt }] }, parameters }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        const err: any = new Error(`DashScope ${res.status}: ${t.slice(0, 300)}`);
        err.status = res.status; err.freeTierOut = res.status === 403 && /FreeTierOnly|AllocationQuota/i.test(t);
        if (res.status === 429 || res.status >= 500) { lastErr = err; continue; }
        throw err;
      }
      return await res.json();
    } catch (e: any) {
      lastErr = e;
      if (e?.status || !/fetch failed|ECONNRESET|ETIMEDOUT|timeout|DashScope (429|5\d\d)/i.test(String(e?.message))) throw e;
    }
  }
  throw lastErr;
}

/**
 * 新版模型（qwen3.5 / 3.6 / 3.7 / 3.8 系列）在原生接口上报 400「url error」，要走 OpenAI 兼容接口；
 * 兼容接口同样支持 enable_search。返回值转成原生接口的样子，下游不用改。
 */
const compatModels = new Set<string>();
async function callCompat(base: string, key: string, model: string, prompt: string, parameters: Record<string, any>): Promise<any> {
  const body: Record<string, any> = { model, messages: [{ role: 'user', content: prompt }] };
  if (parameters.enable_search) { body.enable_search = true; body.search_options = parameters.search_options; }
  if (parameters.response_format) body.response_format = parameters.response_format;
  if ('enable_thinking' in parameters) body.enable_thinking = parameters.enable_thinking;
  if (parameters.temperature !== undefined) body.temperature = parameters.temperature;
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 3000 * attempt));
    const res = await fetch(`${base}/compatible-mode/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(180_000),
    }).catch(e => { lastErr = e; return null; });
    if (!res) continue;
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      const err: any = new Error(`DashScope ${res.status}: ${t.slice(0, 300)}`);
      err.status = res.status; err.freeTierOut = res.status === 403 && /FreeTierOnly|AllocationQuota/i.test(t);
      if (res.status === 429 || res.status >= 500) { lastErr = err; continue; }
      throw err;
    }
    const j: any = await res.json();
    return { output: { choices: [{ message: { content: j.choices?.[0]?.message?.content || '' } }], search_info: j.search_info }, usage: { input_tokens: j.usage?.prompt_tokens, output_tokens: j.usage?.completion_tokens, total_tokens: j.usage?.total_tokens } };
  }
  throw lastErr;
}

async function generateQwen(
  prompt: string,
  modelId: string,
  options?: { jsonMode?: boolean; webSearch?: boolean; fast?: boolean; temperature?: number },
): Promise<LLMResponse> {
  const parameters: Record<string, any> = { result_format: 'message' };
  if (options?.temperature !== undefined) parameters.temperature = options.temperature;
  if (options?.webSearch) {
    parameters.enable_search = true;
    parameters.search_options = { search_strategy: 'turbo', enable_source: true, forced_search: true };
  } else if (options?.jsonMode) {
    parameters.response_format = { type: 'json_object' };
  }
  let data: any = null, used = modelId;
  const freeKey = process.env.DASHSCOPE_FREE_KEY;
  if (freeKey) {
    const tier = /flash|turbo/i.test(modelId) ? 'flash' : 'plus';
    const poolOf = (t: string) => (process.env[`DASHSCOPE_FREE_POOL_${t.toUpperCase()}`] || '').split(',').map(x => x.trim()).filter(Boolean);
    // flash 档用完了就接着用 plus 档（同样免费，只是慢一点）；plus 档不往 flash 降，联网检索要聪明的
    const pool = tier === 'flash' ? [...new Set([...poolOf('flash'), ...poolOf('plus')])] : poolOf('plus');
    const freeBase = (process.env.DASHSCOPE_FREE_BASE_URL || 'https://dashscope-intl.aliyuncs.com').replace(/\/compatible-mode\/v1\/?$/, '').replace(/\/$/, '');
    const mode = options?.webSearch ? 'search' : options?.jsonMode ? 'json' : 'text';
    for (const m of pool) {
      if (freeExhausted.has(m) || freeUnsupported.has(`${m}|${mode}`)) continue;
      try {
        // qwen3 系列商用版默认不思考，这里显式关掉，免得哪个快照默认开着、白耗额度
        const p = /^qwen3/.test(m) ? { ...parameters, enable_thinking: false } : parameters;
        if (compatModels.has(m)) data = await callCompat(freeBase, freeKey, m, prompt, p);
        else {
          try { data = await callDashScope(freeBase, freeKey, m, prompt, p); }
          catch (e: any) {
            if (e?.status !== 400 || !/url error/i.test(String(e.message))) throw e;
            compatModels.add(m);
            data = await callCompat(freeBase, freeKey, m, prompt, p);
          }
        }
        used = m; break;
      } catch (e: any) {
        // 额度用完 / 这个模型在免费区不可用（400 / 403 / 404）：记下来换下一个；超时这类临时错误也换下一个，不拖着
        if (e?.freeTierOut) { freeExhausted.add(m); console.warn(`[llm] 免费额度 ${m} 用完了，换下一个`); }
        else if ([400, 403, 404].includes(e?.status)) { freeUnsupported.add(`${m}|${mode}`); console.warn(`[llm] 免费模型 ${m} 不支持这种用法（${mode}），换下一个：${String(e.message).slice(0, 100)}`); }
      }
    }
    if (!data && process.env.DASHSCOPE_FREE_ONLY === '1') throw new Error(`免费额度（${tier} 档）全部用完或不可用，已按设置停下，不走付费 key。用完的：${[...freeExhausted].join('、') || '无'}`);
  }
  if (!data) {
    const key = process.env.DASHSCOPE_API_KEY;
    if (!key) throw new Error('缺少 DASHSCOPE_API_KEY，无法调用通义千问');
    const base = (process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com').replace(/\/compatible-mode\/v1\/?$/, '').replace(/\/$/, '');
    // 付费 key 也一样：qwen3.x 系列原生接口报「url error」，走 OpenAI 兼容接口（2026-10-24，批量解析样本用 qwen3.7-plus 撞上）
    const p = /^qwen3/.test(modelId) ? { ...parameters, enable_thinking: false } : parameters;
    data = /^qwen3/.test(modelId) || compatModels.has(modelId) ? await callCompat(base, key, modelId, prompt, p) : await callDashScope(base, key, modelId, prompt, parameters);
  }
  let text: string = data.output?.choices?.[0]?.message?.content || '';
  const sources: any[] = data.output?.search_info?.search_results || [];
  if (options?.webSearch && sources.length) {
    text += `\n\n## 搜索来源\n${sources.map((s: any, i: number) => `[${s.index ?? i + 1}] ${s.title || ''} ${s.url || ''}`).join('\n')}`;
  }
  const u = data.usage || {};
  return {
    text,
    model: used,
    usageMetadata: {
      promptTokenCount: u.input_tokens || 0,
      candidatesTokenCount: u.output_tokens || 0,
      totalTokenCount: u.total_tokens || (u.input_tokens || 0) + (u.output_tokens || 0),
    },
  };
}

// ──── Claude（Anthropic）implementation ────
// 2026-10-18 加：教案 / 讲解这类长文本生成用 Claude（用户：「claude 有钱，抓紧用」）。密钥 ANTHROPIC_API_KEY（.env.local，和 programcrawler 同一把）。
// Opus 5.5 思考默认开着、effort 默认 medium；jsonMode 靠系统提示约束（这一代不支持 assistant 预填）。
async function generateClaude(prompt: string, modelId: string, options?: { jsonMode?: boolean; webSearch?: boolean; fast?: boolean }): Promise<LLMResponse> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = options?.jsonMode
    ? '你是一个只输出 JSON 的生成器：回复必须是一个合法的 JSON 对象，不要用 Markdown 代码块包裹，不要在 JSON 前后加任何说明文字。'
    : undefined;
  // 长输出（教案一章一万多 token）走流式，不然并发几路时会被连接超时掐掉（10-18 备课批量见过 4 章 timeout）
  const res = await client.messages.stream({
    model: modelId,
    max_tokens: 64000,   // 教案一章可到 3.6 万字（潜水 255 下工位），32000 还会截断
    ...(system ? { system } : {}),
    ...(options?.webSearch ? { tools: [{ type: 'web_search_20260209' as any, name: 'web_search', max_uses: 5 }] as any } : {}),
    messages: [{ role: 'user', content: prompt }],
  }).finalMessage();
  if (res.stop_reason === 'refusal') throw new Error(`Claude 拒绝了这次请求${res.stop_details?.explanation ? `：${res.stop_details.explanation}` : ''}`);
  const text = res.content.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map(b => b.text).join('\n');
  if (res.stop_reason === 'max_tokens') console.warn('[Claude] 输出到了 max_tokens 上限，可能被截断');
  const u = res.usage;
  return {
    text,
    model: modelId,
    usageMetadata: {
      promptTokenCount: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
      candidatesTokenCount: u.output_tokens || 0,
      totalTokenCount: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0),
    },
  };
}

// ──── Gemini implementation ────

async function generateGemini(
  prompt: string,
  modelId: string,
  options?: { jsonMode?: boolean },
): Promise<LLMResponse> {
  const genAI = getGeminiClient();
  const config: any = {};
  if (options?.jsonMode) {
    config.responseMimeType = 'application/json';
  }
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: Object.keys(config).length > 0 ? config : undefined,
  });

  const result = await model.generateContent(prompt);
  const usage = result.response.usageMetadata;

  return {
    text: result.response.text(),
    usageMetadata: {
      promptTokenCount: usage?.promptTokenCount || 0,
      candidatesTokenCount: usage?.candidatesTokenCount || 0,
      totalTokenCount: usage?.totalTokenCount || 0,
    },
  };
}

// ──── OpenAI implementation (via /v1/responses API) ────

/**
 * GPT-6 Astra / GPT-5.6 Terra / Luna are reasoning models.
 * They do NOT support /v1/chat/completions.
 * Must use /v1/responses endpoint with input[] format.
 */
async function generateOpenAI(
  prompt: string,
  modelId: string,
  options?: { jsonMode?: boolean; webSearch?: boolean; fast?: boolean },
): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const baseURL = 'https://api.openai.com/v1';

  const body: any = {
    model: modelId,
    input: [{ role: 'user', content: prompt }],
  };
  // 提取 / 检索类任务不需要深度推理：降低推理强度，避免推理模型在长正文上跑超过服务端 5 分钟的请求超时
  if (options?.fast) body.reasoning = { effort: 'low' };

  // JSON mode for Responses API uses text.format
  // NOTE: Web Search and JSON mode CANNOT be used together per OpenAI API.
  // When webSearch is on, skip json_object format — prompt already asks for JSON.
  if (options?.jsonMode && !options?.webSearch) {
    body.text = { format: { type: 'json_object' } };
  }

  // Web search tool — equivalent to Gemini's googleSearch grounding
  if (options?.webSearch) {
    body.tools = [{ type: 'web_search_preview' }];
  }

  // 到 OpenAI 的连接偶发被重置 / 读超时 / 5xx：最多重试 3 次，间隔递增
  let data: any = null;
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3 && !data; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 5000 * attempt));
    try {
      const response = await fetch(`${baseURL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errBody = await response.text();
        const err = new Error(`OpenAI Responses API error ${response.status}: ${errBody}`);
        if (response.status >= 500 || response.status === 429) { lastErr = err; continue; }
        throw err;
      }
      data = await response.json();
    } catch (e: any) {
      lastErr = e;
      if (!/fetch failed|ECONNRESET|ETIMEDOUT|HeadersTimeout|socket hang up/i.test(String(e?.message) + String(e?.cause?.code) + String(e?.cause?.message))) throw e;
      console.warn(`[llm-client] OpenAI 网络错误，第 ${attempt + 1} 次重试：${e?.cause?.code || e.message}`);
    }
  }
  if (!data) throw lastErr;

  // Extract text from output items
  let text = '';
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && item.content) {
        for (const part of item.content) {
          if (part.type === 'output_text') {
            text += part.text;
          }
        }
      }
    }
  }

  // Extract usage
  const usage = data.usage || {};

  return {
    text,
    usageMetadata: {
      promptTokenCount: usage.input_tokens || 0,
      candidatesTokenCount: usage.output_tokens || 0,
      totalTokenCount: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    },
  };
}



/**
 * 简单的活（挑链接、判断页面有没有岗位、归一、岗位结构化）固定用便宜模型，不跟着页面上选的模型走。
 * 便宜模型出错（额度、限流、空返回）时退回调用方给的模型，活照样干完。环境变量 CHEAP_MODEL 可改。
 */
export const cheapModel = () => process.env.CHEAP_MODEL || 'qwen-plus';

export async function generateCheap(
  prompt: string,
  fallbackModel: string,
  options?: { jsonMode?: boolean; fast?: boolean; temperature?: number },
): Promise<LLMResponse> {
  const cheap = cheapModel();
  try {
    const r = await generateContent(prompt, cheap, options);
    if (r.text?.trim()) return { ...r, model: cheap };
  } catch (e: any) {
    if (resolveModel(fallbackModel) === cheap) throw e;
    console.warn(`[llm] 便宜模型 ${cheap} 失败，改用 ${fallbackModel}：${String(e?.message || e).slice(0, 120)}`);
  }
  const r = await generateContent(prompt, fallbackModel, options);
  return { ...r, model: resolveModel(fallbackModel) };
}
