import { AsyncLocalStorage } from 'node:async_hooks';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { resolveModel } from '@/lib/llm-client';

/**
 * 成本归属（迁移 021，2026-10-12）：每一笔记到「哪个空间 / 哪一章 / 哪个任务 / 谁 / 哪个环节」上。
 * 用异步上下文传，不用把编号一层层传进每个函数：入口处（建空间、生一天、评分、评审、出图脚本）包一层
 *   await withCost({ space_id, stage: 'create' }, () => buildSpaceFromJd(...))
 * 里面所有 logTokenUsage 自动带上；显式传的参数优先。
 */
export interface CostContext {
  space_id?: string | null; chapter_id?: string | null; job_id?: string | null; actor?: string | null;
  /** create 创造（建空间、生一天、设计工位）/ use 使用（考试评分、问问我、你教我）/ review 评审 / media 美术与 3D */
  stage?: 'create' | 'use' | 'review' | 'media' | string | null;
  /** 兜底记账用：llm-client 自动记的那一笔归到哪个功能 / 环节名（调用方随后 logTokenUsage 会把它改成更准的） */
  tool_name?: string | null; task_name?: string | null;
}
const costStore = new AsyncLocalStorage<CostContext>();
export function withCost<T>(ctx: CostContext, fn: () => Promise<T>): Promise<T> {
  return costStore.run({ ...(costStore.getStore() || {}), ...ctx }, fn);
}
export const currentCost = () => costStore.getStore() || {};
/** 建空间时钱花在空间入库之前：先按任务编号记，空间建好后把这批记录补上空间编号 */
export async function attachCostToSpace(job_id: string, space_id: string) {
  try { await supabase.from('token_usage_logs').update({ space_id }).eq('job_id', job_id).is('space_id', null); } catch { /* 021 没跑：没有这两列 */ }
}

/** 按件计价的默认价（库里 model_pricing.unit_price 优先）：出图每张、视频每秒。参考价，同 021 */
const UNIT_PRICE: Record<string, { currency: 'USD' | 'CNY'; price: number; unit: string }> = {
  'wan2.2-t2i-flash': { currency: 'CNY', price: 0.14, unit: 'image' },
  'wan2.2-t2i-plus': { currency: 'CNY', price: 0.2, unit: 'image' },
  'veo-3.1-fast-generate-preview': { currency: 'USD', price: 0.15, unit: 'second' },
  'veo-3.1-generate-preview': { currency: 'USD', price: 0.4, unit: 'second' },
};

// PRICING MAP (USD per 1M tokens, default to Gemini 1.5 Flash prices if unknown)
const PRICING: Record<string, { input: number; output: number }> = {
  // 和 Token 用量页的参考价一致（以前写的 0.075 / 0.3 是早期占位价，低了 10 倍）；库里 model_pricing 有的以库为准
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-3.5-flash': { input: 0.75, output: 3.75 },
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
  'gemini-1.5-pro': { input: 3.5, output: 10.5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  // Anthropic Claude（官方一手价，2026-09）
  'claude-fable-5-1': { input: 10, output: 50 },   // 出题模式补记用（Claude Code 里跑的，按 API 价折算）
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  // OpenAI GPT
  'gpt-6-astra': { input: 10, output: 30 },
  'gpt-5.6-terra': { input: 2.5, output: 10 },
  'gpt-5.6-luna': { input: 0.5, output: 2 },
  // 通义千问（按人民币价折美元的粗估；联网搜索另按次计费，这里没算）
  'qwen-plus': { input: 0.11, output: 0.28 },
  'qwen3-vl-plus': { input: 0.2, output: 1.6 },   // 看图（Logo 识图，10-26 从 Gemini 换过来），按百炼公开价约 ¥1.5 / ¥12 每百万 token 折算
  'qwen-max': { input: 0.33, output: 1.33 },
  'qwen-turbo': { input: 0.04, output: 0.08 },
};

export interface TokenUsageParams {
  tool_name: 'finder' | 'fetcher' | 'structurer-job' | 'company-profile' | 'company-pipeline' | 'company-deep-research' | 'competition-radar' | 'standard-radar' | 'occupation' | 'office-chief' | 'office-chat' | 'skill-lab' | 'flywheel' | 'lab-art' | 'lab-3d' | 'job-tagging'
    | 'unattributed'   // llm-client 兜底记的、调用方没归属的（2026-10-18：账要算全）
    | 'work' | 'workspace'           // 真活台（出题 / 基线 / 工作台 AI / 评卷）
    | 'external';      // 系统外的花费补记：Nebius 黑客松额度、其他平台充值（scripts/lab-log-cost.mts --usd）
  task_name: string;      // e.g. "Careers URLs Search", "Extract Jobs"
  institution?: string;   // 企业名或目标 URL（列名沿用院校版）
  model_id: string;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    /** Gemini 思考 token：按输出价计费，但不在 candidatesTokenCount 里（10-21 对账：Gemini 3.8 记的账只有实付一半） */
    thoughtsTokenCount?: number;
    /** Gemini 联网检索时工具结果算进输入 */
    toolUsePromptTokenCount?: number;
    /** llm-client 兜底记账时写上的记录编号：再 logTokenUsage 就改那条，不重插 */
    __logId?: number;
  };
  /** 直接给金额（美元）：系统外的花费补记，不按 token 算 */
  cost_usd?: number;
  success?: boolean;
  error_message?: string;
  batch_id?: number;
  /** 这次调用触发的联网搜索次数（Grounding / enable_search / web search 按次另收费） */
  search_calls?: number;
  /** 按件计费：出图张数 / 视频秒数（单价看 model_pricing.unit_price） */
  units?: number;
}
export type CostParams = TokenUsageParams & CostContext;

// ── 价目表：库里的 model_pricing 优先（Token 用量页可改），读不到用上面的默认价（美元） ──
type Price = { currency: 'USD' | 'CNY'; input_per_m: number; output_per_m: number; search_per_k: number; unit_price: number; unit: string | null };
let priceCache: { at: number; map: Map<string, Price> } | null = null;
async function priceOf(model: string): Promise<Price> {
  if (!priceCache || Date.now() - priceCache.at > 5 * 60_000) {
    const map = new Map<string, Price>();
    try {
      let { data, error } = await supabase.from('model_pricing').select('model_id, currency, input_per_m, output_per_m, search_per_k, unit_price, unit');
      if (error) ({ data } = await supabase.from('model_pricing').select('model_id, currency, input_per_m, output_per_m, search_per_k'));   // 021 还没跑：没有按件计价两列
      for (const r of (data || []) as any[]) map.set(r.model_id, { currency: r.currency, input_per_m: +r.input_per_m, output_per_m: +r.output_per_m, search_per_k: +r.search_per_k, unit_price: +(r.unit_price || 0), unit: r.unit || null });
    } catch { /* 表还没建：用默认价 */ }
    priceCache = { at: Date.now(), map };
  }
  const hit = priceCache.map.get(model), u = UNIT_PRICE[model];
  if (hit) return hit.unit_price || !u ? hit : { ...hit, unit_price: u.price, unit: u.unit };
  if (u) return { currency: u.currency, input_per_m: 0, output_per_m: 0, search_per_k: 0, unit_price: u.price, unit: u.unit };
  // 千问库里没登记的型号（qwen-flash、qwen3.x 新快照…）：flash / turbo 档按 qwen-flash 价，其余按 qwen-plus 价（人民币，含联网搜索），
  // 不再落到 Gemini 1.5 Flash 的美元兜底价上（2026-10-18 记账核对时发现）
  if (/^qwen/.test(model)) {
    const base = /flash|turbo/.test(model) ? priceCache.map.get('qwen-flash') : priceCache.map.get('qwen-plus');
    return base || (/flash|turbo/.test(model) ? { currency: 'CNY', input_per_m: 0.15, output_per_m: 1.5, search_per_k: 4, unit_price: 0, unit: null } : { currency: 'CNY', input_per_m: 0.8, output_per_m: 2, search_per_k: 4, unit_price: 0, unit: null });
  }
  const p = PRICING[model] || { input: 0.075, output: 0.3 };
  return { currency: 'USD', input_per_m: p.input, output_per_m: p.output, search_per_k: 0, unit_price: 0, unit: null };
}
export const invalidatePriceCache = () => { priceCache = null; };
const USD_CNY = () => parseFloat(process.env.USD_CNY_RATE || '7.2');

export async function logTokenUsage(params: CostParams) {
  try {
    const { tool_name, task_name, institution, model_id, usageMetadata, success = true, error_message, batch_id, search_calls = 0, units = 0 } = params;
    const base = currentCost();
    const ctx = Object.fromEntries((['space_id', 'chapter_id', 'job_id', 'actor', 'stage'] as const).map(k => [k, params[k] !== undefined ? params[k] : base[k]]));

    const resolvedModelId = resolveModel(model_id);
    const inputTokens = (usageMetadata?.promptTokenCount || 0) + (usageMetadata?.toolUsePromptTokenCount || 0);
    const outputTokens = (usageMetadata?.candidatesTokenCount || 0) + (usageMetadata?.thoughtsTokenCount || 0);
    const totalTokens = usageMetadata?.totalTokenCount || 0;

    // 费用 = token 费 + 联网搜索次数 × 单价；按价目表的币种算，统一折成美元存
    const price = await priceOf(resolvedModelId);
    const tokenCost = (inputTokens / 1_000_000) * price.input_per_m + (outputTokens / 1_000_000) * price.output_per_m;
    const searchCost = (search_calls / 1000) * price.search_per_k;
    const unitCost = units * price.unit_price;   // 出图按张、视频按秒
    const rate = USD_CNY();
    const toUsd = (v: number) => price.currency === 'CNY' ? v / rate : v;
    const costUsd = params.cost_usd != null ? params.cost_usd : toUsd(tokenCost + searchCost + unitCost);

    const row: Record<string, any> = {
        tool_name,
        task_name,
        institution: institution || '',
        model_id: resolvedModelId,
        total_input_tokens: inputTokens,
        total_output_tokens: outputTokens,
        total_tokens: totalTokens,
        total_cost_usd: costUsd,
        search_calls,
        search_cost_usd: toUsd(searchCost),
        success,
        error_message,
        batch_id,
        // Optional tracking fields matching datasquare
        records: [],
        model_breakdown: {},
        api_cost_cny: 0,   // 这一列是「数据供应链」（第三方数据接口）费用，AI 费用（含联网搜索、出图、视频）全在 total_cost_usd
        ...(units ? { units, unit: price.unit } : {}),
        ...Object.fromEntries(Object.entries(ctx).filter(([, v]) => v !== undefined && v !== null && v !== '')),
    };
    // llm-client 已经兜底记过这一笔：改那条的归属，不重插（2026-10-18）
    if (usageMetadata?.__logId) {
      const patch: Record<string, any> = { tool_name, task_name, institution: institution || '', success, error_message, batch_id, search_calls, search_cost_usd: toUsd(searchCost), total_cost_usd: costUsd, ...(units ? { units, unit: price.unit } : {}), ...Object.fromEntries(Object.entries(ctx).filter(([, v]) => v !== undefined && v !== null && v !== '')) };
      const { error } = await supabase.from('token_usage_logs').update(patch).eq('id', usageMetadata.__logId);
      if (!error) return;
      console.warn('[Token Logger] 改兜底记录失败，改为新插一条：', error.message);
    }
    // 迁移 014 / 021 还没跑时缺列：报哪列缺就去掉哪列再写，不丢记录
    let { data: ins, error } = await supabase.from('token_usage_logs').insert(row).select('id').single();
    for (let i = 0; error && i < 8; i++) {
      const col = Object.keys(row).find(k => (error!.message || '').includes(`'${k}'`) || (error!.message || '').includes(`"${k}"`));
      if (!col) break;
      delete row[col];
      ({ data: ins, error } = await supabase.from('token_usage_logs').insert(row).select('id').single());
    }


    if (error) {
      console.error("[Token Logger] DB Insert error:", error);
    } else if (usageMetadata && params.tool_name === 'unattributed' && ins?.id) {
      usageMetadata.__logId = ins.id;   // 兜底记账：编号留在 usageMetadata 上，调用方随后正式记账时改这一条
    }
  } catch (err) {
    console.error("[Token Logger] Failed to log usage:", err);
  }
}
