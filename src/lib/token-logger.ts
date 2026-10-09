import { supabaseAdmin as supabase } from '@/lib/supabase';
import { resolveModel } from '@/lib/llm-client';

// PRICING MAP (USD per 1M tokens, default to Gemini 1.5 Flash prices if unknown)
const PRICING: Record<string, { input: number; output: number }> = {
  // 和 Token 用量页的参考价一致（以前写的 0.075 / 0.3 是早期占位价，低了 10 倍）；库里 model_pricing 有的以库为准
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-3.5-flash': { input: 0.75, output: 3.75 },
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
  'gemini-1.5-pro': { input: 3.5, output: 10.5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  // OpenAI GPT
  'gpt-6-astra': { input: 10, output: 30 },
  'gpt-5.6-terra': { input: 2.5, output: 10 },
  'gpt-5.6-luna': { input: 0.5, output: 2 },
  // 通义千问（按人民币价折美元的粗估；联网搜索另按次计费，这里没算）
  'qwen-plus': { input: 0.11, output: 0.28 },
  'qwen-max': { input: 0.33, output: 1.33 },
  'qwen-turbo': { input: 0.04, output: 0.08 },
};

export interface TokenUsageParams {
  tool_name: 'finder' | 'fetcher' | 'structurer-job' | 'company-profile' | 'company-pipeline' | 'company-deep-research' | 'competition-radar' | 'office-chief' | 'office-chat' | 'skill-lab' | 'flywheel';
  task_name: string;      // e.g. "Careers URLs Search", "Extract Jobs"
  institution?: string;   // 企业名或目标 URL（列名沿用院校版）
  model_id: string;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  success?: boolean;
  error_message?: string;
  batch_id?: number;
  /** 这次调用触发的联网搜索次数（Grounding / enable_search / web search 按次另收费） */
  search_calls?: number;
}

// ── 价目表：库里的 model_pricing 优先（Token 用量页可改），读不到用上面的默认价（美元） ──
type Price = { currency: 'USD' | 'CNY'; input_per_m: number; output_per_m: number; search_per_k: number };
let priceCache: { at: number; map: Map<string, Price> } | null = null;
async function priceOf(model: string): Promise<Price> {
  if (!priceCache || Date.now() - priceCache.at > 5 * 60_000) {
    const map = new Map<string, Price>();
    try {
      const { data } = await supabase.from('model_pricing').select('model_id, currency, input_per_m, output_per_m, search_per_k');
      for (const r of data || []) map.set(r.model_id, { currency: r.currency, input_per_m: +r.input_per_m, output_per_m: +r.output_per_m, search_per_k: +r.search_per_k });
    } catch { /* 表还没建：用默认价 */ }
    priceCache = { at: Date.now(), map };
  }
  const hit = priceCache.map.get(model);
  if (hit) return hit;
  const p = PRICING[model] || { input: 0.075, output: 0.3 };
  return { currency: 'USD', input_per_m: p.input, output_per_m: p.output, search_per_k: 0 };
}
export const invalidatePriceCache = () => { priceCache = null; };
const USD_CNY = () => parseFloat(process.env.USD_CNY_RATE || '7.2');

export async function logTokenUsage(params: TokenUsageParams) {
  try {
    const { tool_name, task_name, institution, model_id, usageMetadata, success = true, error_message, batch_id, search_calls = 0 } = params;

    const resolvedModelId = resolveModel(model_id);
    const inputTokens = usageMetadata?.promptTokenCount || 0;
    const outputTokens = usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = usageMetadata?.totalTokenCount || 0;

    // 费用 = token 费 + 联网搜索次数 × 单价；按价目表的币种算，统一折成美元存
    const price = await priceOf(resolvedModelId);
    const tokenCost = (inputTokens / 1_000_000) * price.input_per_m + (outputTokens / 1_000_000) * price.output_per_m;
    const searchCost = (search_calls / 1000) * price.search_per_k;
    const rate = USD_CNY();
    const toUsd = (v: number) => price.currency === 'CNY' ? v / rate : v;
    const costUsd = toUsd(tokenCost + searchCost);

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
        api_cost_cny: 0   // 这一列是「数据供应链」（第三方数据接口）费用，AI 费用（含联网搜索）全在 total_cost_usd
    };
    let { error } = await supabase.from('token_usage_logs').insert(row);
    // 迁移 014 还没跑时没有 search_calls / search_cost_usd 两列：去掉再写，不丢记录
    if (error && /search_calls|search_cost_usd/.test(error.message || '')) {
      const { search_calls: _a, search_cost_usd: _b, ...rest } = row;
      ({ error } = await supabase.from('token_usage_logs').insert(rest));
    }


    if (error) {
      console.error("[Token Logger] DB Insert error:", error);
    }
  } catch (err) {
    console.error("[Token Logger] Failed to log usage:", err);
  }
}
