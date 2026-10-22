/**
 * 「AI 审计中」渐进式评分（2026-10-18，用户：把操作分成几段打分，过程评价能 append）。
 * 交卷后不一次性出报告：事件流按时间切成 2–5 段，AI 一段一段看，每段追加一条审计笔记（观察到什么、信号强弱、到这段为止的六维印象），
 * 候选人 / 出题人看得见审计在推进；最后一段结束再做结果逐条核对 + 过程总评 + 和基线比。分段笔记进最终报告，也是过程总评的输入。
 */
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import type { WorkTask } from '@/lib/work/generator';
import { SKILL_DIMS, type WorkEvent } from '@/lib/work/grader';

const AUDIT_MODEL = process.env.WORK_AUDIT_MODEL || 'claude-sonnet-5-5';   // 分段审计是小段、要快；总评仍走 GRADE_MODEL
const s = (v: any, n = 600) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, n);
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export interface AuditObservation { t: number; skill: string; signal: 'high' | 'risk' | 'neutral'; note: string; evidence: string }
export interface AuditSegment {
  idx: number; from: number; to: number; label: string;
  observations: AuditObservation[];
  so_far: string;                                   // 到这段为止，审计员的一句话印象
  dims: Record<string, 'L1' | 'L2' | 'L3' | 'L4'>;  // 到这段为止的六维暂定等级（会随后面的段变）
  tentative: number;                                // 到这段为止的过程信号 0–100（暂定，只给过程感）
  generated_at: string;
}
export type Chat = { t: number; q: string; a: string };

/** 分几段：约每 8 分钟一段，最少 2 段最多 5 段；事件太少也至少 2 段（开头 / 收尾） */
export function planSegments(events: WorkEvent[]): { from: number; to: number }[] {
  const ev = [...events].sort((a, b) => a.t - b.t);
  const end = Math.max(60, Math.round(ev.length ? ev[ev.length - 1].t : 0));
  const n = Math.max(2, Math.min(5, Math.ceil(end / 480)));
  const step = end / n;
  return Array.from({ length: n }, (_, i) => ({ from: Math.round(i * step), to: i === n - 1 ? end + 1 : Math.round((i + 1) * step) }));
}

async function askJson(prompt: string, institution?: string): Promise<any> {
  let lastErr: any = null;
  for (const m of [AUDIT_MODEL, 'qwen-plus']) {
    try {
      const res = await generateContent(prompt, m, { jsonMode: true });
      await logTokenUsage({ tool_name: 'work', task_name: 'Grade · 分段审计', institution: institution || '', model_id: m, usageMetadata: res.usageMetadata } as any).catch(() => {});
      const p = parseJsonLoose(res.text); if (!p || typeof p !== 'object') throw new Error('不是 JSON'); return p;
    } catch (e) { lastErr = e; console.warn(`[work-audit] ${m} 失败：${String((e as any)?.message).slice(0, 120)}`); }
  }
  throw lastErr;
}

/** 审一段：只看这一段的事件 + 对话，带着前面几段的笔记，追加观察、更新暂定六维 */
export async function auditSegment(task: WorkTask, events: WorkEvent[], aiChat: Chat[], seg: { from: number; to: number }, idx: number, total: number, prior: AuditSegment[], opts: { institution?: string; deliverableHead?: string } = {}): Promise<AuditSegment> {
  const inSeg = (t: number) => t >= seg.from && t < seg.to;
  const ev = events.filter(e => inSeg(e.t)).sort((a, b) => a.t - b.t);
  const chat = aiChat.filter(c => inSeg(c.t));
  const lines = ev.slice(0, 200).map(e => `[${fmt(e.t)}] ${e.type}${e.id ? ' ' + e.id : ''}${e.chars ? ` ${e.chars}字` : ''}${e.delta != null ? ` Δ${e.delta}` : ''}${e.host ? ' ' + e.host : ''}${e.note ? ' ' + s(e.note, 100) : ''}${e.text ? ' 「' + s(e.text, 220) + '」' : ''}`);
  const chatLines = chat.slice(0, 20).map(c => (c as any).src === 'plugin' ? `[${fmt(c.t)}] ${s(c.q, 120)}\n   页面上的对话（摘）：${s(c.a, 900)}` : `[${fmt(c.t)}] 问：${s(c.q, 300)}\n   答（摘）：${s(c.a, 240)}`);
  const priorText = prior.map(p => `第 ${p.idx + 1} 段（${fmt(p.from)}–${fmt(p.to)}）：${p.so_far}；暂定 ${Object.entries(p.dims).map(([k, v]) => k + v).join(' ')}`).join('\n') || '（这是第一段）';
  const prompt = `你是「真活台」的过程审计员，正在**边看边记**一位候选人做题的过程。现在看到第 ${idx + 1} / ${total} 段（${fmt(seg.from)}–${fmt(seg.to)}）。只根据这一段的事件和对话写观察，前面几段的笔记只用来保持连续、修正暂定印象。措辞「观察到…」，每条观察指向具体时刻与证据；没什么可记就少写，不要硬凑。
## 任务（操作台：${task.env?.type || 'doc'}）
${task.task.title}：${task.task.brief.slice(0, 400)}
事件类型：open_material 打开材料 · ai_ask 问 AI · adopt 把 AI 的话放进交付物 · paste 粘贴 · edit 自己改稿（Δ字数）· run_tests 跑自测 · set_param 改设计参数 · sketch 画草图 · idle 空闲超过 2 分钟 · download 下载材料 · rec_start/rec_stop 录屏 · screen 录屏抽帧看图的描述 · file 上传交付文件 · submit 交卷 · 真活插件：plugin_start/plugin_stop 开始 / 结束记录 · visit 打开或切到某个网页（host · 标题）· page 网页上读到的文字（摘）· edit 在网页里打字（Δ字数）· paste 粘贴 · copy 复制 · 和 AI 的对话里「插件读到的 xx 页面」是候选人在外部 AI 网站上的对话原文（问和答混在一起，按语义区分）
材料里故意留的坑：${task.materials.filter(m => m.source !== 'db').map(m => m.id + ' ' + m.title).join('、') || '无标注'}
## 前面几段的笔记
${priorText}
## 这一段的事件
${lines.join('\n') || '（这一段没有事件）'}
## 这一段和 AI 的对话
${chatLines.join('\n') || '（没有）'}
${idx === total - 1 && opts.deliverableHead ? `## 交付物开头（最后一段才给）\n${opts.deliverableHead.slice(0, 600)}` : ''}

六个维度：${SKILL_DIMS.join('、')}。BARS：L1 没有表现 / L2 零星 / L3 稳定 / L4 主动且有依据。
只返回 JSON：{ "label": "这段在干什么（≤8 字）", "observations": [ { "t": 120, "skill": "信息核验", "signal": "high|risk|neutral", "note": "观察到…", "evidence": "事件 / 原话" } ], "so_far": "到这段为止的一句话印象", "dims": { "问题界定": "L2" }, "tentative": 0-100 的过程信号 }`;
  const p = await askJson(prompt, opts.institution);
  const dims: AuditSegment['dims'] = {};
  for (const d of SKILL_DIMS) { const v = p.dims?.[d]; dims[d] = (['L1', 'L2', 'L3', 'L4'].includes(v) ? v : (prior[prior.length - 1]?.dims?.[d] || 'L1')); }
  const observations: AuditObservation[] = (Array.isArray(p.observations) ? p.observations : []).slice(0, 5).map((o: any) => ({ t: Math.max(seg.from, Math.min(seg.to, Number(o.t) || seg.from)), skill: s(o.skill, 20), signal: (['high', 'risk', 'neutral'].includes(o.signal) ? o.signal : 'neutral'), note: s(o.note, 200), evidence: s(o.evidence, 200) }));
  return { idx, from: seg.from, to: seg.to, label: s(p.label, 16) || `第 ${idx + 1} 段`, observations, so_far: s(p.so_far, 200), dims, tentative: Math.max(0, Math.min(100, Math.round(Number(p.tentative) || 0))), generated_at: new Date().toISOString() };
}
