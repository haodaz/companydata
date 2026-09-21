/**
 * 联网检索 + JSON 输出的统一调用：Gemini 走 googleSearch grounding，GPT 走 web_search 工具。
 * Finder / 企业画像等需要「先搜再答」的 agent 共用，顺带记录 Token 用量。
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage, type TokenUsageParams } from '@/lib/token-logger';

/** 去掉 ```json 围栏，取第一个完整 JSON 对象 */
export function parseJsonLoose(text: string): any {
  const clean = (text || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  try { return JSON.parse(clean); } catch { /* 联网检索模式下模型偶尔会在 JSON 前后带说明文字 */ }
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('大模型未返回有效 JSON');
  return JSON.parse(match[0]);
}

export async function searchJson(prompt: string, modelId: string, log: Pick<TokenUsageParams, 'tool_name' | 'task_name' | 'institution'>): Promise<{ parsed: any; searchQueries: string[] }> {
  let text: string;
  let usageMetadata: any;
  let searchQueries: string[] = [];

  if (!modelId.startsWith('gpt-')) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    // @ts-ignore googleSearch 工具在运行时可用，SDK 类型未收录
    const model = genAI.getGenerativeModel({ model: modelId, tools: [{ googleSearch: {} }] });
    const result = await model.generateContent(prompt);
    text = result.response.text();
    usageMetadata = result.response.usageMetadata;
    searchQueries = result.response.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];
  } else {
    const result = await generateContent(prompt, modelId, { jsonMode: true, webSearch: true });
    text = result.text;
    usageMetadata = result.usageMetadata;
  }

  await logTokenUsage({ ...log, model_id: modelId, usageMetadata, success: true }).catch(e => console.error('Token logging failed', e));
  return { parsed: parseJsonLoose(text), searchQueries };
}
