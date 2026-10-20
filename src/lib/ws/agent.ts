/**
 * 百业 ToB 工作台 · AI 总控（2026-10-20）。多模型：Claude / GPT / Gemini / 千问都能当总控（用户：中间可以跑 openai 和 gemini）。
 * 对话历史存成中立格式（user / assistant{text, calls} / tool{results}），每个厂商一个适配器负责转换；
 * assistant 那条另存厂商原始输出（raw），同一个厂商续聊时原样回放（OpenAI 推理项、Gemini thought signature 要靠它），换了厂商就按中立格式重建。
 * ask_user 不执行：遇到就停下这一轮，等人回答；下一轮把人的回答当作这个工具的结果接上。
 */
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logTokenUsage } from '@/lib/token-logger';
import { TOOLS, runTool, type ToolCtx, type ToolUi } from '@/lib/ws/tools';

export type Call = { id: string; name: string; input: any };
export type Result = { id: string; name: string; content: string; is_error?: boolean; label?: string; ui?: ToolUi };
export type Msg =
  | { role: 'user'; text: string; at?: string }
  | { role: 'assistant'; text: string; calls: Call[]; provider?: string; raw?: any; at?: string }
  | { role: 'tool'; results: Result[] };

export type Ev =
  | { t: 'text'; delta: string }
  | { t: 'tool_start'; id: string; name: string; input: any }
  | { t: 'tool_end'; id: string; name: string; label: string; ui?: ToolUi; error?: string }
  | { t: 'ask'; id: string; question: string; options: string[] }
  | { t: 'error'; message: string };

export const WS_MODEL = process.env.WS_MODEL || 'claude-opus-5-5';
const provider = (m: string) => (m.startsWith('claude-') ? 'anthropic' : m.startsWith('gpt-') ? 'openai' : m.startsWith('gemini-') ? 'gemini' : m.startsWith('qwen') ? 'qwen' : 'anthropic');

function systemPrompt(ctx: ToolCtx) {
  const o = ctx.org;
  return `你是「百业 AI」企业工作台的 AI 总控，在为「${o.name}」${o.company_name && o.company_name !== o.name ? `（${o.company_name}）` : ''}的管理者工作。他可能是老板、HR 或带团队的人。
你能做的事：了解本企业（org_profile）、确认岗位（list_roles）、出招聘用的真活（propose_problems → ask_user 让他选 → create_work_task → run_baseline）、看谁做得好（list_work_tasks、work_results）、给岗位建带教练习用的职业空间（create_space、list_spaces）。

企业设置（新企业刚注册、或用户说要设置 / 完善企业信息时）：边对话边配，不让人填表。
- 先 org_profile 看平方库里有什么，再 setup_checklist 看还缺什么；画像很空就先 enrich_company 联网补。
- 按 setup_checklist 的权重挑下一件事问，问的时候用半句话说清为什么要问（比如「这决定真活的业务问题从哪来」）。右侧面板会实时显示企业档案，不用在对话里复述已经存了什么。
- 找到的信息**一条一条和用户确认**：用 ask_user 问「平方数据里你们是……，对吗？」，选项给「对」「要改一下」「不确定，先跳过」；他说改成什么就按他说的。确认过的立刻 save_company_info 存。一次问一件事，别一口气列十条。
- 公开信息（官网、行业、一句话介绍、简介、业务与客户、产品）确认后会回流平方；再问几句只留在工作台的内部信息：眼下最想解决的事、团队情况、用人偏好（存 private）。
- 然后问要管哪些岗位：list_roles 看平方岗位库里本企业的岗位，让他勾；库里没有的请他贴 JD 或描述职责，确认后 add_role。每个岗位可以顺便问一句最难在哪、想要什么样的人（notes）。
- 都确认完 finish_setup，然后告诉他可以开始出真活、建空间了。

规则：
- 只能围绕本企业做事。用户要你给别的公司出题、建空间，说明工作台只服务本企业，平台上的公开内容可以去「百业」体验。
- ask_user 的问题一句话说清要他决定什么，**不要复述候选内容**（界面已经把候选卡片显示出来了）；选项写短名，不要带编号。
- 关键节点用 ask_user 停下来问，不替人拍板：选哪个业务问题、要不要发给候选人、要不要建空间、要不要重来。其他小事直接做，不要反复确认。
- 出真活一定先 propose_problems 找业务问题，再 ask_user 让他选；他选完再 create_work_task，出完接着 run_baseline。
- 不编造。企业事实只来自工具结果；工具没给的就说没有。
- **永远用简体中文回答**，不管工具结果、材料、用户的选项里有多少英文。像一个靠谱的同事：先给结论，短句，必要时用列表；工具调用的过程界面上看得见，不用复述每一步；不要用表情符号。
- 长任务（出题 1–2 分钟、建空间 3–5 分钟）开始前一句话告诉他要多久。产物会在右侧面板打开，提一句即可。`;
}

/** 跑一轮：从历史出发，直到模型不再调工具或停在 ask_user；每一步通过 emit 推给前端，结束后返回新增的消息 */
export async function runTurn(history: Msg[], model: string, ctx: ToolCtx, emit: (e: Ev) => void, save?: (added: Msg[]) => Promise<void>): Promise<Msg[]> {
  const added: Msg[] = [];
  const all = () => [...history, ...added];
  for (let step = 0; step < 10; step++) {
    const p = provider(model);
    const out = p === 'anthropic' ? await callAnthropic(all(), model, ctx, emit) : p === 'openai' ? await callOpenAI(all(), model, ctx, emit) : p === 'gemini' ? await callGemini(all(), model, ctx, emit) : await callQwen(all(), model, ctx, emit);
    added.push({ role: 'assistant', text: out.text, calls: out.calls, provider: p, raw: out.raw, at: new Date().toISOString() });
    if (!out.calls.length) break;
    // 每走一步就落库：长工具（出题 2 分钟、基线 1 分钟）跑的时候关页面 / 服务重启，已经做完的不丢
    if (save) await save(added.slice(0, -1));   // 最后这条还在等工具结果，先不存（模型要求工具调用和结果成对）
    const results: Result[] = [];
    let ask: Call | null = null;
    for (const c of out.calls) {
      if (c.name === 'ask_user') { ask = c; continue; }
      emit({ t: 'tool_start', id: c.id, name: c.name, input: c.input });
      try {
        const r = await runTool(c.name, c.input || {}, ctx);
        results.push({ id: c.id, name: c.name, content: JSON.stringify(r.result).slice(0, 12000), label: r.label, ui: r.ui });
        emit({ t: 'tool_end', id: c.id, name: c.name, label: r.label, ui: r.ui });
      } catch (e: any) {
        const msg = String(e?.message || e).slice(0, 400);
        results.push({ id: c.id, name: c.name, content: JSON.stringify({ error: msg }), is_error: true, label: '出错了' });
        emit({ t: 'tool_end', id: c.id, name: c.name, label: '出错了', error: msg });
      }
    }
    if (ask) {
      // 别的工具先跑完、结果先存着；ask_user 的结果等人回答后由 answerAsk 补上
      if (results.length) added.push({ role: 'tool', results });
      emit({ t: 'ask', id: ask.id, question: String(ask.input?.question || ''), options: (Array.isArray(ask.input?.options) ? ask.input.options : []).map(String).slice(0, 4) });
      break;
    }
    added.push({ role: 'tool', results });
    if (save) await save(added);
  }
  return added;
}

/** 历史停在 ask_user 上时，把人的回答作为那个工具的结果接上（否则直接当一条用户消息） */
export function appendUser(history: Msg[], text: string): Msg[] {
  const last = history[history.length - 1], prev = history[history.length - 2];
  const pendingIn = (m: Msg | undefined) => (m && m.role === 'assistant' ? m.calls.find(c => c.name === 'ask_user') : undefined);
  const pending = pendingIn(last) || (last?.role === 'tool' ? pendingIn(prev) : undefined);
  if (pending) {
    const r: Result = { id: pending.id, name: 'ask_user', content: JSON.stringify({ answer: text }), label: `你选了：${text}` };
    if (last.role === 'tool') return [...history.slice(0, -1), { role: 'tool', results: [...last.results, r] }];
    return [...history, { role: 'tool', results: [r] }];
  }
  return [...history, { role: 'user', text, at: new Date().toISOString() }];
}

const log = (model: string, inTok: number, outTok: number, org: string) =>
  logTokenUsage({ tool_name: 'workspace', task_name: '工作台 · 总控对话', institution: org, model_id: model, usageMetadata: { promptTokenCount: inTok, candidatesTokenCount: outTok, totalTokenCount: inTok + outTok } } as any).catch(() => {});

type Out = { text: string; calls: Call[]; raw?: any };

// ──── Anthropic ────
async function callAnthropic(h: Msg[], model: string, ctx: ToolCtx, emit: (e: Ev) => void): Promise<Out> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [];
  for (const m of h) {
    if (m.role === 'user') messages.push({ role: 'user', content: m.text });
    else if (m.role === 'assistant') messages.push({ role: 'assistant', content: m.provider === 'anthropic' && m.raw ? m.raw : [...(m.text ? [{ type: 'text' as const, text: m.text }] : []), ...m.calls.map(c => ({ type: 'tool_use' as const, id: c.id, name: c.name, input: c.input || {} }))] });
    else messages.push({ role: 'user', content: m.results.map(r => ({ type: 'tool_result' as const, tool_use_id: r.id, content: r.content, ...(r.is_error ? { is_error: true } : {}) })) });
  }
  const stream = client.messages.stream({ model, max_tokens: 8000, system: systemPrompt(ctx), tools: TOOLS, messages });
  stream.on('text', d => emit({ t: 'text', delta: d }));
  const msg = await stream.finalMessage();
  await log(model, msg.usage.input_tokens, msg.usage.output_tokens, ctx.org.name);
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  const calls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, input: b.input }));
  return { text, calls: msg.stop_reason === 'max_tokens' ? [] : calls, raw: msg.content };
}

// ──── OpenAI（Responses API；推理模型不支持 chat/completions）────
async function callOpenAI(h: Msg[], model: string, ctx: ToolCtx, emit: (e: Ev) => void): Promise<Out> {
  const input: any[] = [];
  for (const m of h) {
    if (m.role === 'user') input.push({ role: 'user', content: m.text });
    else if (m.role === 'assistant') {
      if (m.provider === 'openai' && Array.isArray(m.raw)) input.push(...m.raw);
      else { if (m.text) input.push({ role: 'assistant', content: m.text }); for (const c of m.calls) input.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.input || {}) }); }
    } else for (const r of m.results) input.push({ type: 'function_call_output', call_id: r.id, output: r.content });
  }
  const tools = TOOLS.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.input_schema }));
  const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}` }, body: JSON.stringify({ model, instructions: systemPrompt(ctx), input, tools, reasoning: { effort: 'low' } }), signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data: any = await res.json();
  await log(model, data.usage?.input_tokens || 0, data.usage?.output_tokens || 0, ctx.org.name);
  const output: any[] = data.output || [];
  const text = output.filter(o => o.type === 'message').flatMap(o => o.content || []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('');
  if (text) emit({ t: 'text', delta: text });
  const calls = output.filter(o => o.type === 'function_call').map(o => ({ id: o.call_id, name: o.name, input: safeJson(o.arguments) }));
  return { text, calls, raw: output };
}

// ──── Gemini ────
async function callGemini(h: Msg[], model: string, ctx: ToolCtx, emit: (e: Ev) => void): Promise<Out> {
  const contents: any[] = [];
  const nameOf = new Map<string, string>();
  for (const m of h) {
    if (m.role === 'user') contents.push({ role: 'user', parts: [{ text: m.text }] });
    else if (m.role === 'assistant') {
      m.calls.forEach(c => nameOf.set(c.id, c.name));
      contents.push({ role: 'model', parts: m.provider === 'gemini' && Array.isArray(m.raw) ? m.raw : [...(m.text ? [{ text: m.text }] : []), ...m.calls.map(c => ({ functionCall: { name: c.name, args: c.input || {} } }))] });
    } else contents.push({ role: 'user', parts: m.results.map(r => ({ functionResponse: { name: nameOf.get(r.id) || r.name, response: safeJson(r.content) } })) });
  }
  const functionDeclarations = TOOLS.map(t => { const ps: any = t.input_schema; return Object.keys(ps.properties || {}).length ? { name: t.name, description: t.description, parameters: ps } : { name: t.name, description: t.description }; });
  const g = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '').getGenerativeModel({ model, tools: [{ functionDeclarations } as any], systemInstruction: systemPrompt(ctx) });
  const r = await g.generateContent({ contents });
  const u = r.response.usageMetadata; await log(model, u?.promptTokenCount || 0, u?.candidatesTokenCount || 0, ctx.org.name);
  const parts: any[] = r.response.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
  if (text) emit({ t: 'text', delta: text });
  // Gemini 的 functionCall 没有 id：自己编一个，回放时按顺序对上
  const calls = parts.filter(p => p.functionCall).map((p, i) => ({ id: `g${Date.now().toString(36)}${i}`, name: p.functionCall.name, input: p.functionCall.args || {} }));
  return { text, calls, raw: parts };
}

// ──── 千问（DashScope 兼容接口的 function calling）────
async function callQwen(h: Msg[], model: string, ctx: ToolCtx, emit: (e: Ev) => void): Promise<Out> {
  const messages: any[] = [{ role: 'system', content: systemPrompt(ctx) }];
  for (const m of h) {
    if (m.role === 'user') messages.push({ role: 'user', content: m.text });
    else if (m.role === 'assistant') messages.push({ role: 'assistant', content: m.text || '', ...(m.calls.length ? { tool_calls: m.calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input || {}) } })) } : {}) });
    else for (const r of m.results) messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
  }
  const base = (process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com').replace(/\/compatible-mode\/v1\/?$/, '').replace(/\/$/, '');
  const tools = TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const res = await fetch(`${base}/compatible-mode/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY || ''}` }, body: JSON.stringify({ model, messages, tools, ...(/^qwen3/.test(model) ? { enable_thinking: false } : {}) }), signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`千问 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data: any = await res.json();
  await log(model, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, ctx.org.name);
  const msg = data.choices?.[0]?.message || {};
  const text = msg.content || '';
  if (text) emit({ t: 'text', delta: text });
  const calls = (msg.tool_calls || []).map((c: any) => ({ id: c.id, name: c.function?.name, input: safeJson(c.function?.arguments) }));
  return { text, calls };
}

function safeJson(s: any) { if (s && typeof s === 'object') return s; try { return JSON.parse(String(s || '{}')); } catch { return { value: String(s || '') }; } }
