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
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

// ──── Provider detection ────

function isOpenAIModel(modelId: string): boolean {
  return modelId.startsWith('gpt-');
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
  options?: { jsonMode?: boolean; webSearch?: boolean },
): Promise<LLMResponse> {
  const resolvedModelId = resolveModel(modelId);
  if (isOpenAIModel(resolvedModelId)) {
    return generateOpenAI(prompt, resolvedModelId, options);
  }
  return generateGemini(prompt, resolvedModelId, options);
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
  options?: { jsonMode?: boolean; webSearch?: boolean },
): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const baseURL = 'https://api.openai.com/v1';

  const body: any = {
    model: modelId,
    input: [{ role: 'user', content: prompt }],
  };

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
    throw new Error(`OpenAI Responses API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();

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

