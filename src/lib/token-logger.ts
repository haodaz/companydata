import { supabaseAdmin as supabase } from '@/lib/supabase';
import { resolveModel } from '@/lib/llm-client';

// PRICING MAP (USD per 1M tokens, default to Gemini 1.5 Flash prices if unknown)
const PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3.8-flash': { input: 0.075, output: 0.3 }, // Mock price
  'gemini-3.6-flash': { input: 0.075, output: 0.3 }, // Mock price
  'gemini-3.5-flash': { input: 0.075, output: 0.3 },
  'gemini-3.1-pro-preview': { input: 3.5, output: 10.5 },
  'gemini-1.5-pro': { input: 3.5, output: 10.5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  // OpenAI GPT
  'gpt-6-astra': { input: 10, output: 30 },
  'gpt-5.6-terra': { input: 2.5, output: 10 },
  'gpt-5.6-luna': { input: 0.5, output: 2 },
};

export interface TokenUsageParams {
  tool_name: 'finder' | 'fetcher' | 'structurer-job' | 'company-profile' | 'company-pipeline' | 'office-chief' | 'office-chat' | 'skill-lab';
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
}

export async function logTokenUsage(params: TokenUsageParams) {
  try {
    const { tool_name, task_name, institution, model_id, usageMetadata, success = true, error_message, batch_id } = params;

    const resolvedModelId = resolveModel(model_id);
    const inputTokens = usageMetadata?.promptTokenCount || 0;
    const outputTokens = usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = usageMetadata?.totalTokenCount || 0;

    // Calculate cost in USD
    const pricing = PRICING[resolvedModelId] || { input: 0.075, output: 0.3 };
    const costUsd = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;

    const { error } = await supabase
      .from('token_usage_logs')
      .insert({
        tool_name,
        task_name,
        institution: institution || '',
        model_id: resolvedModelId,
        total_input_tokens: inputTokens,
        total_output_tokens: outputTokens,
        total_tokens: totalTokens,
        total_cost_usd: costUsd,
        success,
        error_message,
        batch_id,
        // Optional tracking fields matching datasquare
        records: [],
        model_breakdown: {},
        api_cost_cny: 0
      });

    if (error) {
      console.error("[Token Logger] DB Insert error:", error);
    }
  } catch (err) {
    console.error("[Token Logger] Failed to log usage:", err);
  }
}
