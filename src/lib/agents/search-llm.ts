/**
 * 联网检索 + JSON 输出的统一调用：Gemini 走 googleSearch grounding，GPT 走 web_search 工具。
 * Finder / 企业画像等需要「先搜再答」的 agent 共用，顺带记录 Token 用量。
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage, type TokenUsageParams } from '@/lib/token-logger';

/** 从第一个「{」开始按括号配对（跳过字符串里的括号）截出完整对象 */
function firstBalanced(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

/** 去掉 ```json 围栏，取第一个完整 JSON 对象 */
export function parseJsonLoose(text: string): any {
  const clean = (text || '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  try { return JSON.parse(clean); } catch { /* 联网检索模式下模型偶尔会在 JSON 前后带说明文字 */ }
  // 先按括号配对取第一个完整对象：新版模型（qwen3.x 兼容接口）常在 JSON 后面再写一段带花括号的说明 / 第二个对象，
  // 贪婪匹配会把两段连在一起解析失败（10-15 批量补岗位连着几家寻源报「after JSON at position …」）
  const bal = firstBalanced(clean);
  if (bal) { try { return JSON.parse(bal); } catch { try { return JSON.parse(repairJson(bal)); } catch { /* 退回老办法 */ } } }
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) { console.error('[parseJsonLoose] no JSON in response:', clean.slice(0, 800)); throw new Error(`大模型未返回有效 JSON${clean ? `（返回开头：${clean.slice(0, 120)}）` : '（返回为空）'}`); }
  try { return JSON.parse(match[0]); } catch { /* 再试一次修补 */ }
  try { return JSON.parse(repairJson(match[0])); } catch (e: any) { console.error('[parseJsonLoose] invalid JSON:', match[0].slice(0, 800)); throw new Error(`大模型返回的 JSON 无法解析: ${e.message}`); }
}

/**
 * 模型写长文本时常把真换行直接打进字符串里（JSON 里这是非法的），偶尔还留个尾随逗号。
 * 这两类就是格式小毛病，内容本身是好的——补一下比整次重跑便宜得多。
 */
function repairJson(src: string): string {
  let out = '', inStr = false, esc = false;
  for (const ch of src) {
    if (esc) { out += ch; esc = false; continue; }
    if (ch === '\\') { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr) {
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      if (ch < ' ') { continue; }
    }
    out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
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

export async function searchJson(prompt: string, modelId: string, log: Pick<TokenUsageParams, 'tool_name' | 'task_name' | 'institution' | 'batch_id'>, opts: { lenient?: boolean } = {}): Promise<{ parsed: any; searchQueries: string[]; sources: { title: string; url: string }[] }> {
  let text: string;
  let sources: { title: string; url: string }[] = [];
  let usageMetadata: any;
  let searchQueries: string[] = [];

  if (modelId.startsWith('qwen')) {
    // 阿里云：通义千问 + 联网搜索（国内企业用这个，便宜、搜得到国内站点）
    const result = await generateContent(prompt, modelId, { webSearch: true });
    // 千问自己写进 JSON 的网址常是编的，真的链接在附带的「搜索来源」里：拆出来一并返回，调用方拿它校对
    const tail = result.text.match(/\n\n## 搜索来源\n([\s\S]*)$/)?.[1] || '';
    sources = tail.split('\n').map(l => l.match(/^\[\d+\]\s*(.*?)\s+(https?:\/\/\S+)\s*$/)).filter(Boolean).map(m => ({ title: m![1].trim(), url: m![2] }));
    text = result.text.replace(/\n\n## 搜索来源[\s\S]*$/, '');
    usageMetadata = result.usageMetadata;
  } else if (process.env.DASHSCOPE_FREE_ONLY === '1') {
    throw new Error(`已开「只用免费额度」，不调用付费模型 ${modelId} 联网检索`);
  } else if (!modelId.startsWith('gpt-')) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    // Gemini 联网检索偶尔整包空返回（没有 candidates，只消耗了思考 token）：先重试，仍为空就换一版 flash 兜底
    const attempts = [modelId, modelId, modelId === 'gemini-3.8-flash' ? 'gemini-3.6-flash' : modelId];
    text = '';
    for (let i = 0; i < attempts.length; i++) {
      // @ts-ignore googleSearch 工具在运行时可用，SDK 类型未收录
      const model = genAI.getGenerativeModel({ model: attempts[i], tools: [{ googleSearch: {} }] });
      let result: any;
      try {
        result = await model.generateContent(prompt);
      } catch (e: any) {
        // 503 超时 / 429 限流 / 500：等一下换下一档（最后一档是 3.6-flash）再试；欠费 402 直接抛
        const msg = String(e?.message || '');
        // 出错的这次也记一笔搜索（Grounding 失败也可能已计费；10-21 对账漏了 147 次失败）
        await logTokenUsage({ ...log, model_id: attempts[i], success: false, error_message: msg.slice(0, 200), search_calls: 1 }).catch(() => {});
        if (/402|Payment Required|credits are depleted/i.test(msg) || i === attempts.length - 1 || !/503|429|500|Deadline|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|fetch failed/i.test(msg)) throw e;
        console.warn(`[searchJson] ${attempts[i]} 出错（第 ${i + 1} 次），稍后重试：${msg.slice(0, 100)}`, log.task_name);
        await new Promise(r => setTimeout(r, 4000 * (i + 1)));
        continue;
      }
      usageMetadata = result.response.usageMetadata;
      try { text = result.response.text() || ''; } catch { text = ''; }
      searchQueries = result.response.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];
      if (text.trim()) { if (attempts[i] !== modelId) console.warn(`[searchJson] ${modelId} 连续空返回，已用 ${attempts[i]} 兜底`); break; }
      console.warn(`[searchJson] ${attempts[i]} 空返回（第 ${i + 1} 次）`, log.task_name);
      await logTokenUsage({ ...log, model_id: attempts[i], usageMetadata, success: false, error_message: 'empty response', search_calls: 1 }).catch(() => {});
    }
  } else {
    const result = await generateContent(prompt, modelId, { jsonMode: true, webSearch: true, fast: true });
    text = result.text;
    usageMetadata = result.usageMetadata;
  }

  // 每次 searchJson 是一次带搜索的调用（Gemini 按 grounded prompt、阿里云 / OpenAI 按搜索调用计费）
  await logTokenUsage({ ...log, model_id: modelId, usageMetadata, success: true, search_calls: 1 }).catch(e => console.error('Token logging failed', e));
  // lenient：只拿它找信源时，模型回了一段话而不是 JSON 也不算失败，信源照样返回给下一步去抓
  let parsed: any;
  try { parsed = parseJsonLoose(text); } catch (e) { if (!opts.lenient) throw e; parsed = {}; }
  return { parsed: await resolveGroundingRedirects(parsed), searchQueries, sources };
}
