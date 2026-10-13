/**
 * 工位规则 ↔ 依据（2026-10-12「闭环第 1 步：回挂」，迁移 022 / 023）。
 * 每个工位的每条规则、每个目标都要说清出处，三种来源并存：
 *   standard 标准条款（行业标准与规程库里的要点）· expert 老师傅经验（技能卡里的规则）· ai AI 推断（要人看）
 * linkSpace：取这个空间已发布章节里的工位规则 / 目标 → 取同职业的标准要点 + 技能卡规则 → 让模型逐条找依据 → 写 standard_links。
 * 校验器 [S1] / [S2]（lab-studio.ts 的 checkBasis）按这里的结果查「没有出处」「只有 AI 推断」。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { withCost } from '@/lib/token-logger';

export type Basis = 'standard' | 'expert' | 'ai';
export interface BasisTarget { chapter_id: string; chapter: string; bench: string; kind: 'rule' | 'goal'; id: string; label: string; when: string; severity?: string }
/** target 写进 standard_links 的形式：「rule:ox_cool · 冷却水掉了枪还在低位」 */
export const targetKey = (t: { kind: string; id: string; label: string }) => `${t.kind}:${t.id} · ${t.label}`.slice(0, 300);

export function collectTargets(chapters: any[]): BasisTarget[] {
  const out: BasisTarget[] = [];
  for (const c of chapters) for (const s of (c.sim?.steps || c.steps || [])) {
    const b = s?.type === 'bench' ? s.bench : null; if (!b) continue;
    for (const r of b.rules || []) out.push({ chapter_id: c.id, chapter: c.title || c.slot || '', bench: b.name || '', kind: 'rule', id: String(r.id), label: String(r.label || ''), when: String(r.when || ''), severity: r.severity });
    for (const g of b.goals || []) out.push({ chapter_id: c.id, chapter: c.title || c.slot || '', bench: b.name || '', kind: 'goal', id: String(g.id), label: String(g.label || ''), when: String(g.when || '') });
  }
  return out;
}

/** 这个空间能用的标准：专门为它检索过的 + 适用职业对得上的（按有要点、现行优先） */
async function standardsFor(spaceId: string, words: string[]) {
  const { data: sr } = await supabaseAdmin.from('standard_searches').select('id, profession').eq('space_id', spaceId);
  const ids = (sr || []).map(r => r.id);
  const profs = Array.from(new Set([...(sr || []).map(r => r.profession).filter(Boolean), ...words.filter(Boolean)])) as string[];
  const rows: any[] = [];
  if (ids.length) { const { data } = await supabaseAdmin.from('industry_standards').select('id, code, title, status, key_points, professions').in('search_id', ids); rows.push(...(data || [])); }
  if (profs.length) { const { data } = await supabaseAdmin.from('industry_standards').select('id, code, title, status, key_points, professions').overlaps('professions', profs); rows.push(...(data || [])); }
  const uniq = [...new Map(rows.map(r => [r.id, r])).values()].filter(r => (r.key_points || []).length && r.status !== 'abolished');
  return uniq.sort((a, b) => Number(b.status === 'current') - Number(a.status === 'current')).slice(0, 18);
}

export async function linkSpace(spaceId: string, opts: { model?: string; dryRun?: boolean } = {}) {
  const model = opts.model || 'gemini-3.8-flash';
  const { data: space } = await supabaseAdmin.from('skill_tasks').select('id, title, profile, jd_snapshot, skill:skills(name, card, source, expert_name)').eq('id', spaceId).single();
  if (!space) throw new Error('空间不存在');
  const { data: chs } = await supabaseAdmin.from('lab_chapters').select('id, title, slot, status, sim').eq('task_id', spaceId).eq('status', 'published');
  const targets = collectTargets(chs || []);
  if (!targets.length) return { targets: 0, links: 0, byBasis: {} as Record<string, number>, standards: 0 };
  const role = (space as any).profile?.role || (space as any).jd_snapshot?.title || (space as any).title;
  const stds = await standardsFor(spaceId, [role, (space as any).jd_snapshot?.career?.profession]);
  const skill: any = Array.isArray((space as any).skill) ? (space as any).skill[0] : (space as any).skill;
  const expertRules: string[] = skill && skill.source !== 'jd-draft' ? [...(skill.card?.rules || []), ...(skill.card?.checklist || [])].slice(0, 30) : [];

  // 给模型的依据清单：S<i>.P<j> = 第 i 条标准的第 j 条要点；E<k> = 老师傅技能卡第 k 条
  const stdList = stds.map((s, i) => `S${i} ${s.code || ''} ${s.title}\n${(s.key_points || []).map((p: any, j: number) => `  S${i}.P${j}${p.clause ? ` [${p.clause}]` : ''} (${p.kind}) ${p.point}`).join('\n')}`).join('\n');
  const expList = expertRules.map((r, k) => `E${k} ${r}`).join('\n');
  const tgtList = targets.map((t, i) => `T${i} [${t.kind === 'rule' ? (t.severity === 'violation' ? '违规规则' : '提醒规则') : '目标'}] ${t.label}  （条件：${t.when.slice(0, 120)}）`).join('\n');
  const prompt = `你在给职业模拟工位的每一条规则 / 目标找「出处」。岗位：${role}。
三种出处：standard = 下面某条标准要点直接规定了它（同一件事、同一方向的要求；数值窗口在标准限值之内或一致）；expert = 下面某条老师傅技能卡规则说的就是它；ai = 两边都没有，是 AI 设计工位时自己推断的。
宁可判 ai，也不要牵强附会：标准只是同一行业、但管的不是这件事，就不算。

【标准要点】
${stdList || '（没有）'}

【老师傅技能卡】
${expList || '（这个空间还没有真人老师傅的技能卡）'}

【工位规则与目标】
${tgtList}

只返回 JSON：{ "links": [ { "t": "T0", "basis": "standard|expert|ai", "ref": "S2.P3 或 E1 或 null", "confidence": 0-100, "note": "一句中文：为什么是这条（ai 时写：建议请老师傅确认什么 / 应该去查哪类标准）" } ] }，每个 T 都要有一条。`;

  const run = async () => {
    const res = await generateContent(prompt, model, { jsonMode: true });
    await logTokenUsage({ tool_name: 'skill-lab', task_name: 'Link Standards', institution: role, model_id: model, usageMetadata: res.usageMetadata, stage: 'review' }).catch(() => {});
    return parseJsonLoose(res.text);
  };
  const parsed: any = await withCost({ space_id: spaceId, stage: 'review' }, run);
  const rows: any[] = [];
  const byBasis: Record<string, number> = {};
  for (const l of Array.isArray(parsed?.links) ? parsed.links : []) {
    const t = targets[parseInt(String(l.t || '').replace(/\D/g, ''))]; if (!t) continue;
    let basis: Basis = ['standard', 'expert', 'ai'].includes(l.basis) ? l.basis : 'ai';
    let standard_id: number | null = null, clause: string | null = null, evidence: string | null = null;
    const ref = String(l.ref || '');
    const ms = ref.match(/^S(\d+)\.P(\d+)$/), me = ref.match(/^E(\d+)$/);
    if (basis === 'standard' && ms && stds[+ms[1]]) { const s = stds[+ms[1]], p = (s.key_points || [])[+ms[2]]; standard_id = s.id; clause = p?.clause || null; evidence = `${s.code || s.title}：${p?.point || ''}`; }
    else if (basis === 'expert' && me && expertRules[+me[1]]) evidence = `${skill?.expert_name || '老师傅'}：${expertRules[+me[1]]}`;
    else basis = 'ai';
    byBasis[basis] = (byBasis[basis] || 0) + 1;
    rows.push({ standard_id, space_id: spaceId, chapter_id: t.chapter_id, target: targetKey(t), clause, note: String(l.note || '').slice(0, 300), confidence: Math.max(0, Math.min(100, parseInt(l.confidence) || 0)), basis, evidence, created_by: 'lab-link-standards' });
  }
  // 同一章里规则编号重复（两个工位用了同名规则）时只留一条，免得撞唯一键
  const seenKey = new Set<string>();
  for (let i = rows.length - 1; i >= 0; i--) { const k = `${rows[i].standard_id}|${rows[i].chapter_id}|${rows[i].target}`; if (seenKey.has(k)) rows.splice(i, 1); else seenKey.add(k); }
  if (!opts.dryRun) {
    await supabaseAdmin.from('standard_links').delete().eq('space_id', spaceId).eq('created_by', 'lab-link-standards');
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabaseAdmin.from('standard_links').insert(rows.slice(i, i + 200));
      if (error) throw new Error(`写依据失败：${error.message}${/basis|evidence/.test(error.message) ? '（先跑迁移 023）' : ''}`);
    }
  }
  return { targets: targets.length, links: rows.length, byBasis, standards: stds.length, rows };
}

/** 读一个空间的依据：target → { basis, confidence, code, clause, note } */
export async function loadBasis(spaceId: string) {
  const { data, error } = await supabaseAdmin.from('standard_links').select('chapter_id, target, basis, confidence, clause, note, evidence, standard:industry_standards(code, title)').eq('space_id', spaceId);
  if (error) return [];
  return (data || []).map((r: any) => ({ ...r, standard: Array.isArray(r.standard) ? r.standard[0] : r.standard }));
}

/**
 * 访谈结论写回出处（专家数采第 2 步）：每条偏差，老师傅是认（规则对）、不认（规则该改）、还是看情况。
 *   认：AI 推断 / 无出处的规则 → 出处升级为「老师傅经验」，证据写他的原话
 *   不认：出处不动，记一条修改建议（lab_edits，source = interview），等人改工位——不自动改规则
 *   看情况：把条件写进依据的备注
 * 违反标准红线时老师傅不认，不推翻标准：只记「现场执行有分歧」，交给第二位老师傅或协会。
 */
export async function writeBackFromInterview(spaceId: string, deviations: { chapter_id: string | null; key: string; label: string; kind: string; basis: string }[], turns: { role: string; content: string }[], expertName: string, model = 'gemini-3.8-flash') {
  if (!deviations.length || !turns.length) return { confirmed: 0, overridden: 0, context: 0, unclear: 0 };
  const prompt = `下面是一段对老师傅的访谈，以及他示范时出现的几处偏差。逐条判断老师傅对这条规则 / 目标的态度。
偏差：
${deviations.map((d, i) => `D${i} [${d.kind === 'redline' ? '标准红线' : d.kind === 'expert' ? '老师傅经验' : d.kind === 'ai' ? 'AI 推断' : '没达成的目标'}] ${d.label}`).join('\n')}

访谈：
${turns.map(t => `${t.role === 'ai' ? '问' : '老师傅'}：${t.content}`).join('\n').slice(0, 6000)}

只返回 JSON：{ "items": [ { "d": "D0", "decision": "confirm|override|context|unclear", "quote": "老师傅原话里最能说明态度的一句（没提到就空）", "suggestion": "override / context 时：规则该怎么改、在什么条件下成立（一句中文）" } ] }
confirm = 他认为这条规则 / 目标是对的（自己当时确实做错了，或认同这样要求）；override = 他认为规则定错了或阈值不对；context = 要看情况；unclear = 访谈里没谈到。`;
  const res = await generateContent(prompt, model, { jsonMode: true });
  await logTokenUsage({ tool_name: 'skill-lab', task_name: 'Interview Write-back', institution: spaceId, model_id: model, usageMetadata: res.usageMetadata, stage: 'learn', space_id: spaceId } as any).catch(() => {});
  const p = parseJsonLoose(res.text);
  const tally = { confirmed: 0, overridden: 0, context: 0, unclear: 0 };
  for (const it of Array.isArray(p?.items) ? p.items : []) {
    const d = deviations[parseInt(String(it.d || '').replace(/\D/g, ''))]; if (!d) continue;
    const quote = String(it.quote || '').trim().slice(0, 200), sugg = String(it.suggestion || '').trim().slice(0, 200);
    let q = supabaseAdmin.from('standard_links').select('id, basis, note').eq('space_id', spaceId).like('target', `${d.key} · %`);
    if (d.chapter_id) q = q.eq('chapter_id', d.chapter_id);   // 老空间的主工位没有章节编号：不按章节筛
    const { data: rows } = await q;
    const row = rows?.[0];
    if (it.decision === 'confirm') {
      tally.confirmed++;
      if (row && (row.basis === 'ai' || row.basis === 'none') && quote) await supabaseAdmin.from('standard_links').update({ basis: 'expert', evidence: `${expertName}：${quote}`, note: `访谈确认（${new Date().toISOString().slice(0, 10)}）`, confidence: 80 }).eq('id', row.id);
    } else if (it.decision === 'override' || it.decision === 'context') {
      if (it.decision === 'override') tally.overridden++; else tally.context++;
      const tag = d.kind === 'redline' && it.decision === 'override' ? '现场执行和标准有分歧（不推翻标准，交第二位老师傅 / 协会）' : it.decision === 'override' ? '老师傅不认这条' : '老师傅说要看情况';
      if (row) await supabaseAdmin.from('standard_links').update({ note: `${tag}：${sugg || quote}`.slice(0, 300) }).eq('id', row.id);
      await supabaseAdmin.from('lab_edits').insert({ task_id: spaceId, chapter_id: d.chapter_id, source: 'interview', actor: expertName, fields: [d.key], before: { label: d.label, basis: d.basis }, after: { decision: it.decision, quote, suggestion: sugg }, note: `${tag}：「${d.label}」→ ${sugg || quote}` }).then(() => {}, () => {});
    } else tally.unclear++;
  }
  return tally;
}
