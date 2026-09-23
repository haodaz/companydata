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
  if (!match) { console.error('[parseJsonLoose] no JSON in response:', clean.slice(0, 800)); throw new Error(`大模型未返回有效 JSON${clean ? `（返回开头：${clean.slice(0, 120)}）` : '（返回为空）'}`); }
  try { return JSON.parse(match[0]); } catch (e: any) { console.error('[parseJsonLoose] invalid JSON:', match[0].slice(0, 800)); throw new Error(`大模型返回的 JSON 无法解析: ${e.message}`); }
}

const GROUNDING_REDIRECT = /^https?:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//i;

/** Gemini grounding 给出的来源是一次性跳转链接，落库前解析成真实文章地址（失败就保留原链接） */
async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const loc = res.headers.get('location');
    if (loc && /^https?:\/\//i.test(loc)) return loc;
    // 有些跳转用 200 + meta refresh / JS
    const html = res.status === 200 ? (await res.text()).slice(0, 4000) : '';
    const m = html.match(/url=(https?:\/\/[^"'\s>]+)/i) || html.match(/href="(https?:\/\/[^"]+)"/i);
    return m ? m[1] : url;
  } catch { return url; }
}

/** 深度遍历结果，把所有 grounding 跳转链接换成真实地址（同一链接只解析一次，最多并发 8） */
export async function resolveGroundingRedirects<T>(value: T): Promise<T> {
  const found = new Set<string>();
  const walk = (v: any) => {
    if (typeof v === 'string') { if (GROUNDING_REDIRECT.test(v)) found.add(v); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  if (!found.size) return value;
  const map = new Map<string, string>();
  const list = Array.from(found);
  for (let i = 0; i < list.length; i += 8) {
    const batch = list.slice(i, i + 8);
    const resolved = await Promise.all(batch.map(resolveRedirect));
    batch.forEach((u, j) => map.set(u, resolved[j]));
  }
  const replace = (v: any): any => {
    if (typeof v === 'string') return map.get(v) ?? v;
    if (Array.isArray(v)) return v.map(replace);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replace(x)]));
    return v;
  };
  return replace(value);
}

export async function searchJson(prompt: string, modelId: string, log: Pick<TokenUsageParams, 'tool_name' | 'task_name' | 'institution' | 'batch_id'>): Promise<{ parsed: any; searchQueries: string[] }> {
  let text: string;
  let usageMetadata: any;
  let searchQueries: string[] = [];

  if (!modelId.startsWith('gpt-')) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    // Gemini 联网检索偶尔整包空返回（没有 candidates，只消耗了思考 token）：先重试，仍为空就换一版 flash 兜底
    const attempts = [modelId, modelId, modelId === 'gemini-3.8-flash' ? 'gemini-3.6-flash' : modelId];
    text = '';
    for (let i = 0; i < attempts.length; i++) {
      // @ts-ignore googleSearch 工具在运行时可用，SDK 类型未收录
      const model = genAI.getGenerativeModel({ model: attempts[i], tools: [{ googleSearch: {} }] });
      const result = await model.generateContent(prompt);
      usageMetadata = result.response.usageMetadata;
      try { text = result.response.text() || ''; } catch { text = ''; }
      searchQueries = result.response.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];
      if (text.trim()) { if (attempts[i] !== modelId) console.warn(`[searchJson] ${modelId} 连续空返回，已用 ${attempts[i]} 兜底`); break; }
      console.warn(`[searchJson] ${attempts[i]} 空返回（第 ${i + 1} 次）`, log.task_name);
      await logTokenUsage({ ...log, model_id: attempts[i], usageMetadata, success: false, error_message: 'empty response' }).catch(() => {});
    }
  } else {
    const result = await generateContent(prompt, modelId, { jsonMode: true, webSearch: true, fast: true });
    text = result.text;
    usageMetadata = result.usageMetadata;
  }

  await logTokenUsage({ ...log, model_id: modelId, usageMetadata, success: true }).catch(e => console.error('Token logging failed', e));
  return { parsed: await resolveGroundingRedirects(parseJsonLoose(text)), searchQueries };
}
