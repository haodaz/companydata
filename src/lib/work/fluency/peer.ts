/**
 * 同题对比（11-23）：量表是绝对分，会顶到天花板——资深和一般都「做了核查」，都拿 4–5 档，分不开。
 * 实测（24 场模拟）：同一道题把两份作答匿名放一起让评审比，8 道题 8 次都挑中资深；数「抓出几个 AI 的错」这类数量反而不行（被 AI 拖着反复纠错的人数更多）。
 * 所以在量表之外加一层：同一道题的候选人两两比较，排出相对顺序。每次正反各比一次去掉位置偏差，两次矛盾算打平；排序用归并（n log n 次比较）。
 */
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';

export type PeerItem = { id: string; chat: { q: string; a?: string }[]; events?: { type: string; [k: string]: any }[]; deliverable?: string };
const MODEL = process.env.FLUENCY_MODEL || process.env.WORK_GRADE_MODEL || 'claude-opus-5-5';

const show = (r: PeerItem) => `### 对话（${r.chat.length} 轮，只列候选人的话）\n${r.chat.map((c, i) => `[${i + 1}] ${String(c.q).replace(/\s+/g, ' ').slice(0, 600)}`).join('\n')}\n### 平台记录\n${(r.events || []).filter(e => !['start', 'submit', 'idle', 'leave'].includes(e.type)).slice(0, 60).map(e => e.type + (e.chars ? `(${e.chars}字)` : e.delta ? `(改${e.delta}字)` : e.id ? `(${e.id})` : '')).join('、') || '（无）'}\n### 交付物（节选）\n${String(r.deliverable || '').slice(0, 5000)}`;

async function once(title: string, x: PeerItem, y: PeerItem, institution?: string): Promise<'X' | 'Y' | '='> {
  const r = await generateContent(`两位候选人做同一道考核任务（${title}），都可以用 AI 助手。请比较谁更会带着 AI 把这件事做好：目标和口径说得清、会核查 AI 的东西、关键判断自己做、交付物站得住。只看下面的记录，不要猜；轮数多、纠错多不等于更好（可能是被 AI 拖着走）。
## 候选人 X\n${show(x)}\n\n## 候选人 Y\n${show(y)}\n
只返回 JSON：{"better":"X|Y|相当","why":"一两句"}`, MODEL, { jsonMode: true, temperature: 0 });
  await logTokenUsage({ tool_name: 'work', task_name: 'Fluency · 同题对比', institution: institution || '', model_id: MODEL, usageMetadata: r.usageMetadata } as any).catch(() => {});
  const p: any = parseJsonLoose(r.text) || {};
  return p.better === 'X' ? 'X' : p.better === 'Y' ? 'Y' : '=';
}

/** a 比 b 强返回 1，弱返回 -1，打平 0。正反各比一次：两次一致才算数 */
export async function comparePair(title: string, a: PeerItem, b: PeerItem, institution?: string): Promise<number> {
  const [r1, r2] = await Promise.all([once(title, a, b, institution), once(title, b, a, institution)]);
  const s1 = r1 === 'X' ? 1 : r1 === 'Y' ? -1 : 0, s2 = r2 === 'Y' ? 1 : r2 === 'X' ? -1 : 0;
  return s1 === s2 ? s1 : s1 + s2 > 0 ? 1 : s1 + s2 < 0 ? -1 : 0;   // 一次分出、一次相当 → 取分出的；两次相反 → 打平
}

/** 同题排名：归并排序，比较器是 comparePair（强的在前）。返回每份作答的名次（1 起，打平的同名次按出现顺序） */
export async function rankPeers(title: string, items: PeerItem[], institution?: string): Promise<{ id: string; rank: number; of: number }[]> {
  const cache = new Map<string, number>();
  const cmp = async (a: PeerItem, b: PeerItem) => { const k = `${a.id}|${b.id}`; if (!cache.has(k)) { const v = await comparePair(title, a, b, institution); cache.set(k, v); cache.set(`${b.id}|${a.id}`, -v); } return cache.get(k)!; };
  const sort = async (xs: PeerItem[]): Promise<PeerItem[]> => {
    if (xs.length <= 1) return xs;
    const m = Math.floor(xs.length / 2); const [l, r] = await Promise.all([sort(xs.slice(0, m)), sort(xs.slice(m))]);
    const out: PeerItem[] = []; let i = 0, j = 0;
    while (i < l.length && j < r.length) out.push((await cmp(l[i], r[j])) >= 0 ? l[i++] : r[j++]);
    return [...out, ...l.slice(i), ...r.slice(j)];
  };
  const sorted = await sort(items);
  return sorted.map((x, i) => ({ id: x.id, rank: i + 1, of: sorted.length }));
}
