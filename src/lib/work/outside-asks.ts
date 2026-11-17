/**
 * 外部 AI 的提问原话（11-17，借鉴宇宁 extract_questions.py 的粗到细做法）：候选人在自己电脑上用 ChatGPT / Kimi / WorkBuddy 时，
 * 平台没有对话记录（量表的 D1）。这里从截图 / 插件抓的网页正文里把他发给 AI 的话抽出来，给 AI 驾驭量表用。
 *   ① 粗筛：全部截图缩到 768px，12 张一批让视觉模型只答 A / B（A = 正在和 AI 对话的界面），拿不准归 B；命中帧前后各扩 1 帧
 *   ② 精读：A 帧 4 张一批，只抽「用户」发出去的原话，排除 AI 回答、界面文字、悬浮菜单 / 历史引用；截断的标 complete=false
 *   ③ 合并：相邻帧同一句会反复出现，相似度 ≥0.85 的并成一条，留最长的完整版
 *   ④ 清洗：界面元素、文件名、过短无义、疑似 AI 反问
 *   ⑤ 复核（我们加的，11-17 实测）：自己会汇报进度的 AI 智能体（WorkBuddy 这类）说的话也短，「第一行加好了」「数据齐了，我先…」会被当成用户消息；
 *      把合并后的整串按顺序给文字模型逐条判「用户 / AI / 界面」，只留用户的
 * 插件模式：AI 网站的网页正文（ai_chat 里「（插件读到的 … 页面」那几条）用文字模型抽，同样合并清洗。
 * 不替换原来的「看图写说明」（screen 事件），只在算 AI 驾驭量表时用。
 */
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';

const VL_MODEL = process.env.OUTSIDE_ASK_VL_MODEL || 'qwen3-vl-plus';
const TEXT_MODEL = process.env.OUTSIDE_ASK_MODEL || 'qwen-plus';
const VERIFY_MODEL = process.env.OUTSIDE_ASK_VERIFY_MODEL || 'qwen3.7-plus';
export interface OutsideAsk { t: number; q: string; complete: boolean; src: 'screen' | 'page'; seen: number }

const base = () => (process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com').replace(/\/compatible-mode\/v1\/?$/, '').replace(/\/$/, '');
async function vl(content: any[], maxTokens: number, task: string, institution?: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${base()}/compatible-mode/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY || ''}` },
        body: JSON.stringify({ model: VL_MODEL, messages: [{ role: 'user', content }], max_tokens: maxTokens, temperature: 0 }), signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
      const j: any = await res.json();
      await logTokenUsage({ tool_name: 'work', task_name: task, institution: institution || '', model_id: VL_MODEL, usageMetadata: { promptTokenCount: j.usage?.prompt_tokens || 0, candidatesTokenCount: j.usage?.completion_tokens || 0, totalTokenCount: j.usage?.total_tokens || 0 } } as any).catch(() => {});
      return String(j.choices?.[0]?.message?.content || '');
    } catch (e) { if (attempt === 2) throw e; await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); }
  }
  return '';
}
async function dataUrl(jpeg: Buffer, maxSide = 0) {
  if (maxSide) { try { const sharp = (await import('sharp')).default; jpeg = await sharp(jpeg).resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(); } catch { /* 缩不了就用原图 */ } }
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

const SCREEN_PROMPT = `对每张图判断：它是不是「用户正在与 AI 对话」的界面。
A = 是。画面必须同时能看出：1. 有对话区 / 消息列表（不是单个输入框、不是纯代码、不是纯文档）；2. 有用户向 AI 提问或下指令的消息；3. 有 AI 在作答的痕迹（回复气泡、流式输出、思考中都算）。
满足即 A，不要求看到完整一问一答；滚动中间态、加载中、半截消息，只要能辨认是 AI 对话就算 A。平台不限：DeepSeek / ChatGPT / Claude / 豆包 / 通义 / Kimi / WorkBuddy / Cursor / Copilot Chat / IDE 内嵌 AI 面板都算。
B = 不是 A 的一切：代码编辑器、终端、浏览器网页、桌面、文档、表格、PPT、PDF、邮件、加载页、空白帧。拿不准的一律归 B。
只输出一个字母序列，按图片顺序，不要任何解释。例如 3 张图是 对话 / 编辑器 / 对话，就输出：ABA`;

const EXTRACT_PROMPT = `提取这些截图里【用户】发给 AI 的消息原文（相邻截图可能是同一段对话的滚动状态）。
## 什么是用户消息
- 用户主动发的问题、指令、粘贴的报错或材料；通常是较短的提问或指令，位置常在右侧或标有用户标识
## 什么不是（必须排除）
- AI 的回复：通常较长、分段结构化、带标题或列表，位置常在左侧或有 AI 标识
- 右键悬浮菜单 / 历史消息引用列表：虽然可能靠右，但它是系统下拉菜单，列的是历史片段，不是新发出去的消息
- 界面文字（按钮、菜单、时间戳、输入框占位符）、侧边栏的会话标题、文件树
## 输出要求
- 保留原始措辞，不要改写；同一句话出现在多张图里只输出一次；这批图里没有用户消息就返回空数组
- frame 写这条消息最早出现在第几张图（从 1 数）
只输出 JSON：{"questions":[{"frame":1,"text":"原文","complete":true}]}
complete 为 false 表示该条在截图里被截断。`;

/** 文字相似度（近似 Python difflib 的 ratio，用 2-gram 的 Dice 系数；去掉空白和标点） */
const normQ = (s: string) => s.replace(/\s+/g, '').replace(/[，。！？、；：“”"'（）()【】[\]…·,.!?;:]/g, '').toLowerCase();
function similar(a: string, b: string) {
  const x = normQ(a), y = normQ(b);
  if (!x || !y) return 0; if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const g = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i + 2 <= s.length; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1); return m; };
  const gx = g(x), gy = g(y); let hit = 0;
  for (const [k, n] of gx) hit += Math.min(n, gy.get(k) || 0);
  // 一条是另一条的前缀 / 截断版也算同一句
  if (x.length >= 12 && (y.includes(x.slice(0, 12)) || x.includes(y.slice(0, 12))) && Math.min(x.length, y.length) / Math.max(x.length, y.length) > 0.3) return Math.max(0.86, (2 * hit) / (x.length + y.length - 2));
  return (2 * hit) / (x.length + y.length - 2);
}
/** ③ 合并 + ④ 清洗 */
export function mergeAsks(raw: OutsideAsk[], threshold = 0.85): OutsideAsk[] {
  const merged: OutsideAsk[] = [];
  for (const q of raw.sort((a, b) => a.t - b.t)) {
    const text = q.q.trim(); if (!text) continue;
    const m = merged.find(x => similar(text, x.q) >= threshold);
    if (m) { m.seen++; if (text.length > m.q.length && (q.complete || !m.complete)) { m.q = text; m.complete = q.complete; } continue; }
    merged.push({ ...q, q: text, seen: 1 });
  }
  return merged.filter(m => {
    const t = m.q.trim();
    if (/^(给\s*\S+\s*发送(信息|消息)|发送(信息|消息)|复制|引用|重新生成|停止生成|新建对话|新对话|Message \S+|Send a message|Reply to \S+)$/i.test(t)) return false;   // 界面元素
    if (/^[\w\-./\\]*[\w-]\.[A-Za-z][A-Za-z0-9]{0,5}$/.test(t) && /[\\/.]/.test(t)) return false;   // 文件名
    if (normQ(t).length <= 4 && !/[一-鿿]{3,}/.test(t)) return false;   // 过短无义
    if (/(要(我|的话)|需要你|你(直接)?(拿|确认|告诉)|如果你(需要|想|要)|这样(的)?(话)?我(就|直接))/.test(t) && /[吗？?]\s*$/.test(t)) return false;   // 疑似 AI 反问
    return true;
  });
}

/** ⑤ 复核：整串按顺序看，逐条判是不是用户发的（有上下文时 AI 的进度汇报、回答、侧边栏标题很好分） */
export async function verifyAsks(asks: OutsideAsk[], institution?: string): Promise<OutsideAsk[]> {
  if (!asks.length) return asks;
  const out: OutsideAsk[] = [];
  for (let i = 0; i < asks.length; i += 60) {
    const chunk = asks.slice(i, i + 60);
    try {
      const r = await generateContent(`下面是从一个候选人和 AI 工具的对话界面（截图或网页）里自动抽出来的消息，按时间顺序。抽取会出错：有些其实是 AI 说的（回答、进度汇报如「我先把…」「已完成…」「第一行加好了」、核实结论、给出的建议文案），有些是界面文字（侧边栏的历史会话标题——通常是几条连在一起的短名词短语，如「制作企鹅过场动画」「JSON和Lottie区别」；按钮；状态如「等待模型响应」「调用外部服务」）。
判断要点：用户的话是对 AI 提要求、追问、反馈、纠错（常有「帮我」「你」「改成」「不要」「怎么」「？」，或口语、错别字）；AI 的话是在汇报自己做了什么、给结论、给建议文案（常以「我先」「我只改」「已」「建议」开头，或是规整的成段说明、标题式总结）。
请逐条判断它是不是【用户】自己发给 AI 的消息（提问、指令、反馈、粘贴的材料或任务要求都算用户的）。
只输出 JSON：{"labels":[{"i":1,"who":"user|ai|ui"}]}
${chunk.map((a, k) => `[${k + 1}] ${a.q.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')}`, VERIFY_MODEL, { jsonMode: true, temperature: 0 });
      await logTokenUsage({ tool_name: 'work', task_name: 'Grade · 外部 AI 提问 · 复核', institution: institution || '', model_id: VERIFY_MODEL, usageMetadata: r.usageMetadata } as any).catch(() => {});
      const lab = new Map(((parseJsonLoose(r.text)?.labels || []) as any[]).map(x => [Number(x.i), String(x.who)]));
      chunk.forEach((a, k) => { if ((lab.get(k + 1) || 'user') === 'user') out.push(a); });
    } catch { out.push(...chunk); }   // 复核失败就原样留
  }
  return out;
}

/** 截图 → 用户提问。frames 要按时间排好；控制成本和时长：粗筛最多均匀取 maxScreen 张、精读最多 maxRead 张，过了 deadline（时间戳）就不再开新批 */
export async function asksFromShots(frames: { t: number; jpeg: Buffer }[], institution?: string, opts: { maxScreen?: number; maxRead?: number; deadline?: number } = {}): Promise<{ asks: OutsideAsk[]; screened: number; hits: number; partial: boolean }> {
  const maxScreen = opts.maxScreen ?? 600, maxRead = opts.maxRead ?? 160, late = () => !!opts.deadline && Date.now() > opts.deadline;
  const all = frames.length <= maxScreen ? frames : Array.from({ length: maxScreen }, (_, i) => frames[Math.round(i * (frames.length - 1) / (maxScreen - 1))]);
  if (!all.length) return { asks: [], screened: 0, hits: 0, partial: false };
  let partial = false;
  // ① 粗筛：12 张一批，4 批并发；失败的批保守地全留
  const hit = new Set<number>(); const starts = Array.from({ length: Math.ceil(all.length / 12) }, (_, k) => k * 12); let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < starts.length) {
      if (late()) { partial = true; return; }
      const i = starts[next++], chunk = all.slice(i, i + 12);
      try {
        const content: any[] = [{ type: 'text', text: SCREEN_PROMPT }];
        for (const f of chunk) content.push({ type: 'image_url', image_url: { url: await dataUrl(f.jpeg, 768) } });
        const letters = ((await vl(content, 64, 'Grade · 外部 AI 提问 · 粗筛', institution)).toUpperCase().match(/[ABC]/g) || []).map(c => c === 'A');
        chunk.forEach((_, j) => { if (letters[j]) hit.add(i + j); });
      } catch { chunk.forEach((_, j) => hit.add(i + j)); }
    }
  }));
  // 邻域扩展 ±1：粗筛有抖动，对话界面通常持续多帧
  const keep = [...new Set([...hit].flatMap(i => [i - 1, i, i + 1]).filter(i => i >= 0 && i < all.length))].sort((a, b) => a - b).slice(0, maxRead).map(i => all[i]);
  // ② 精读：4 张一批（相邻帧放一批，能看出滚动），4 批并发
  const raw: OutsideAsk[] = []; const st2 = Array.from({ length: Math.ceil(keep.length / 4) }, (_, k) => k * 4); next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < st2.length) {
      if (late()) { partial = true; return; }
      const i = st2[next++], chunk = keep.slice(i, i + 4);
      try {
        const content: any[] = [{ type: 'text', text: EXTRACT_PROMPT }];
        for (const f of chunk) content.push({ type: 'image_url', image_url: { url: await dataUrl(f.jpeg, 1600) } });
        const p = parseJsonLoose(await vl(content, 2000, 'Grade · 外部 AI 提问 · 精读', institution));
        for (const q of (p?.questions || []) as any[]) { const fr = chunk[Math.min(chunk.length, Math.max(1, Number(q.frame) || 1)) - 1]; if (String(q.text || '').trim()) raw.push({ t: fr.t, q: String(q.text).slice(0, 4000), complete: q.complete !== false, src: 'screen', seen: 1 }); }
      } catch { /* 这批跳过 */ }
    }
  }));
  return { asks: await verifyAsks(mergeAsks(raw), institution), screened: all.length, hits: keep.length, partial };
}

/** 插件抓到的 AI 网页正文 → 用户提问（文字模型，按页抽，再合并） */
export async function asksFromPages(pages: { t: number; host: string; text: string }[], institution?: string): Promise<OutsideAsk[]> {
  const raw: OutsideAsk[] = []; let next = 0;
  const list = pages.filter(p => p.text.trim()).slice(0, 120);
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < list.length) {
      const p = list[next++];
      try {
        const r = await generateContent(`下面是浏览器插件读到的一页 AI 对话网页（${p.host}）的正文，用户的消息和 AI 的回答混在一起，没有标记。
请只抽出【用户】发给 AI 的消息原文：通常是较短的提问、指令、粘贴的材料；AI 的回答通常较长、分段、带列表，「Thinking」「Working for 7s」这类是界面状态。界面按钮、侧边栏会话标题不算。
保留原始措辞，不要改写；按出现顺序；看不出哪句是用户发的就返回空数组。
只输出 JSON：{"questions":[{"text":"原文","complete":true}]}
## 网页正文
${p.text.slice(0, 12000)}`, TEXT_MODEL, { jsonMode: true, temperature: 0 });
        await logTokenUsage({ tool_name: 'work', task_name: 'Grade · 外部 AI 提问 · 插件网页', institution: institution || '', model_id: TEXT_MODEL, usageMetadata: r.usageMetadata } as any).catch(() => {});
        const j = parseJsonLoose(r.text);
        (j?.questions || []).forEach((q: any, k: number) => { if (String(q.text || '').trim()) raw.push({ t: p.t + k * 0.01, q: String(q.text).slice(0, 4000), complete: q.complete !== false, src: 'page', seen: 1 }); });
      } catch { /* 这页跳过 */ }
    }
  }));
  return verifyAsks(mergeAsks(raw), institution);
}
