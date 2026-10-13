/**
 * 示范评审报告（2026-10-12「专家数采」第 1 步）：一次操作（老师傅示范 / 真人作答）算不算「值得学习的操作」。
 * AI 不当裁判：每个判断都引用出处——标准 / 设备手册（硬性）、老师傅经验（软性）、其他示范者（一致性）；三边都没有的写「待定」。
 * 五道关：① 守红线 ② 达目标 ③ 讲得清 ④ 可复现 ⑤ 有增量 → 三档：示范级 / 参考级 / 不采纳（不采纳转反例）。
 * 本步不调模型：判定全靠工位事件流 × standard_links 的出处（迁移 022 / 023）。③⑤ 要访谈，第 2 步接上。
 */
import { supabaseAdmin } from '@/lib/supabase';

export type Gate = 'pass' | 'fail' | 'pending' | 'warn';
export interface Finding { kind: 'rule' | 'goal'; id: string; label: string; hit: boolean; severity?: string; basis: 'standard' | 'expert' | 'ai' | 'none'; source?: string | null; clause?: string | null; evidence?: string | null; note?: string | null; t?: number | null; verdict: string }
export interface BenchReview { step: string; bench: string; duration: number; findings: Finding[]; goalsDone: number; goalsTotal: number }
export interface DemoReview {
  submission: { id: string; name: string; type: string; score: number | null; at: string | null };
  space: { id: string; role: string };
  chapter: { id: string | null; title: string };
  benches: BenchReview[];
  gates: { key: string; label: string; state: Gate; detail: string }[];
  grade: { key: 'exemplar' | 'reference' | 'rejected'; label: string; why: string };
  questions: string[];
  peers: { name: string; score: number | null; type: string }[];
  coverage: { standard: number; expert: number; ai: number; none: number };
}

const fmtT = (t?: number | null) => t == null ? '' : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;

export async function reviewSubmission(submissionId: string): Promise<DemoReview> {
  const { data: sub, error } = await supabaseAdmin.from('skill_submissions').select('id, task_id, chapter_id, candidate_name, candidate_type, score, trace, submitted_at').eq('id', submissionId).single();
  if (error || !sub) throw new Error(error?.message || '找不到这次作答');
  const [{ data: space }, { data: chapter }, { data: links }, { data: peers }] = await Promise.all([
    supabaseAdmin.from('skill_tasks').select('id, title, profile, jd_snapshot, sim').eq('id', sub.task_id).single(),
    sub.chapter_id ? supabaseAdmin.from('lab_chapters').select('id, title, slot, sim').eq('id', sub.chapter_id).single() : Promise.resolve({ data: null } as any),
    supabaseAdmin.from('standard_links').select('chapter_id, target, basis, clause, evidence, note, confidence, standard:industry_standards(code, title)').eq('space_id', sub.task_id),
    supabaseAdmin.from('skill_submissions').select('id, candidate_name, candidate_type, score, chapter_id').eq('task_id', sub.task_id).neq('id', sub.id),
  ]);
  const sim: any = chapter?.sim || (space as any)?.sim || {};
  const chId = chapter?.id || null;
  const linkOf = new Map<string, any>();
  for (const l of links || []) if (!chId || l.chapter_id === chId) linkOf.set(String(l.target).split(' · ')[0], l);

  const benches: BenchReview[] = [];
  const cov = { standard: 0, expert: 0, ai: 0, none: 0 };
  for (const st of sim.steps || []) {
    if (st?.type !== 'bench' || !st.bench) continue;
    const tr: any = (sub.trace || {})[st.id];
    if (!tr?.events) continue;
    const spec = st.bench;
    const firstHit = new Map<string, any>();
    for (const e of tr.events) if ((e.kind === 'rule' || e.kind === 'goal') && e.id && !firstHit.has(`${e.kind}:${e.id}`)) firstHit.set(`${e.kind}:${e.id}`, e);
    const findings: Finding[] = [];
    for (const r of spec.rules || []) {
      const l = linkOf.get(`rule:${r.id}`); const e = firstHit.get(`rule:${r.id}`);
      const basis = (l?.basis || 'none') as Finding['basis']; cov[basis]++;
      const std = Array.isArray(l?.standard) ? l.standard[0] : l?.standard;
      const hard = basis === 'standard';
      const verdict = !e ? (hard ? '守住（有标准依据）' : '没有触发')
        : r.severity !== 'violation' ? '提醒：不扣关'
        : hard ? '越过红线：违反标准条款，这次不能当范本'
        : basis === 'expert' ? '和老师傅经验不一致：要追问'
        : '触发了 AI 推断的规则：待定，追问是不是规则定错了';
      findings.push({ kind: 'rule', id: r.id, label: r.label, hit: !!e, severity: r.severity, basis, source: std ? `${std.code || ''} ${std.title || ''}`.trim() : basis === 'expert' ? (l?.evidence || '').split('：')[0] : null, clause: l?.clause, evidence: l?.evidence, note: l?.note, t: e?.t ?? null, verdict });
    }
    let done = 0;
    for (const g of spec.goals || []) {
      const l = linkOf.get(`goal:${g.id}`); const e = firstHit.get(`goal:${g.id}`);
      const basis = (l?.basis || 'none') as Finding['basis']; cov[basis]++;
      if (e) done++;
      const std = Array.isArray(l?.standard) ? l.standard[0] : l?.standard;
      findings.push({ kind: 'goal', id: g.id, label: g.label, hit: !!e, basis, source: std ? `${std.code || ''} ${std.title || ''}`.trim() : basis === 'expert' ? (l?.evidence || '').split('：')[0] : null, clause: l?.clause, evidence: l?.evidence, note: l?.note, t: e?.t ?? null, verdict: e ? `达成 ${fmtT(e.t)}` : '没有达成' });
    }
    benches.push({ step: st.title || st.id, bench: spec.name || '', duration: tr.metrics?.duration || tr.duration || 0, findings, goalsDone: done, goalsTotal: (spec.goals || []).length });
  }
  if (!benches.length) throw new Error('这次作答里没有工位操作记录（示范评审只看工位）');

  const all = benches.flatMap(b => b.findings);
  const redline = all.filter(f => f.kind === 'rule' && f.hit && f.severity === 'violation' && f.basis === 'standard');
  const softConflict = all.filter(f => f.kind === 'rule' && f.hit && f.severity === 'violation' && f.basis === 'expert');
  const aiHits = all.filter(f => f.kind === 'rule' && f.hit && f.severity === 'violation' && (f.basis === 'ai' || f.basis === 'none'));
  const goals = all.filter(f => f.kind === 'goal');
  const missed = goals.filter(g => !g.hit);
  const notes = benches.length && Object.values(sub.trace || {}).some((v: any) => v?.events?.some((e: any) => e.kind === 'note'));
  const samePeers = (peers || []).filter((p: any) => p.chapter_id === sub.chapter_id && p.candidate_type !== 'ai');
  const strongPeers = samePeers.filter((p: any) => (p.score ?? 0) >= 80);

  const gates: DemoReview['gates'] = [
    { key: 'redline', label: '① 守红线', state: redline.length ? 'fail' : 'pass', detail: redline.length ? `越过 ${redline.length} 条有标准依据的红线：${redline.map(f => `「${f.label}」（${f.source}${f.clause ? ` ${f.clause}` : ''}）`).join('、')}` : `有标准依据的 ${all.filter(f => f.kind === 'rule' && f.basis === 'standard').length} 条红线全部守住` },
    { key: 'goals', label: '② 达目标', state: missed.length ? (missed.length === goals.length ? 'fail' : 'warn') : 'pass', detail: `目标 ${goals.length - missed.length}/${goals.length}${missed.length ? `；没达成：${missed.slice(0, 3).map(g => `「${g.label}」`).join('')}` : ''}` },
    { key: 'explain', label: '③ 讲得清', state: notes ? 'warn' : 'pending', detail: notes ? '操作里有口述，访谈后逐条核对理由' : '还没有访谈：关键决策的理由要听他讲（第 2 步接上，追问盯着下面的偏差问）' },
    { key: 'repeat', label: '④ 可复现', state: strongPeers.length >= 1 ? 'pass' : samePeers.length ? 'warn' : 'pending', detail: samePeers.length ? `同一章还有 ${samePeers.length} 位真人做过，其中 ${strongPeers.length} 位 ≥ 80 分` : '这一章只有他一个人做过：最多算参考级' },
    { key: 'delta', label: '⑤ 有增量', state: 'pending', detail: `标准管不到的地方（AI 推断 ${cov.ai + cov.none} 条）正是他能教出新东西的地方，访谈后判定` },
  ];
  const grade: DemoReview['grade'] = redline.length
    ? { key: 'rejected', label: '不采纳 · 转反例', why: '越过了有标准依据的红线。这次操作不当范本，但会存成反例，教新手「为什么不能这么做」。' }
    : missed.length === 0 && softConflict.length === 0 && aiHits.length === 0 && strongPeers.length >= 1 && notes
      ? { key: 'exemplar', label: '示范级', why: '红线全守、目标全达、和其他示范者一致、讲得清。可以采纳为这个工位的标准轨迹。' }
      : { key: 'reference', label: '参考级', why: [missed.length ? '有目标没达成' : '', softConflict.length ? '有和老师傅经验不一致的地方' : '', aiHits.length ? '触发了 AI 推断的规则（可能是规则定错了）' : '', !strongPeers.length ? '还没有第二位示范者印证' : '', !notes ? '还没访谈' : ''].filter(Boolean).join('；') + '。红线守住了，先当参考；把下面的问题问清楚就可能升到示范级。' };

  const questions = [
    ...redline.map(f => `「${f.label}」：${f.source}${f.clause ? ` ${f.clause}` : ''} 的要求是「${(f.evidence || '').split('：').slice(1).join('：')}」。你当时为什么这样做？是现场条件不同，还是这条标准在你们那里不这么执行？`),
    ...softConflict.map(f => `「${f.label}」：老师傅说过「${(f.evidence || '').split('：').slice(1).join('：')}」，你的做法不一样。哪种更对，还是看情况？`),
    ...aiHits.map(f => `「${f.label}」：这条是系统自己推断的规则，你触发了它。是规则定严了（阈值该改成多少？），还是你确实冒了险？`),
    ...missed.slice(0, 3).map(g => `「${g.label}」没达成：是模拟器的窗口和现场不一样，还是这一步本来就该放弃？`),
  ].slice(0, 8);

  return {
    submission: { id: sub.id, name: sub.candidate_name || '匿名', type: sub.candidate_type, score: sub.score ?? null, at: sub.submitted_at },
    space: { id: sub.task_id, role: (space as any)?.profile?.role || (space as any)?.jd_snapshot?.title || (space as any)?.title || '' },
    chapter: { id: chId, title: chapter?.title || chapter?.slot || '' },
    benches, gates, grade, questions,
    peers: samePeers.map((p: any) => ({ name: p.candidate_name, score: p.score, type: p.candidate_type })),
    coverage: cov,
  };
}

/** 一个空间里可以评审的作答（有工位操作记录的真人 / 专家作答） */
export async function reviewableSubmissions(spaceId: string) {
  const { data } = await supabaseAdmin.from('skill_submissions').select('id, chapter_id, candidate_name, candidate_type, score, submitted_at, trace').eq('task_id', spaceId).neq('candidate_type', 'ai').order('submitted_at', { ascending: false }).limit(200);
  return (data || []).filter((s: any) => Object.values(s.trace || {}).some((v: any) => v?.events)).map(({ trace, ...s }: any) => s);
}

/**
 * 访谈用的偏差清单（专家数采第 2 步）：老师傅刚示范的几段（章节编号 → 作答轨迹）对照规则出处，挑出值得追问的地方。
 * 顺序：越过有标准依据的红线 → 和老师傅经验不一致 → 触发了 AI 推断的规则 → 没达成的目标。追问盯着这些问，访谈结论再写回出处。
 */
export interface Deviation { chapter_id: string | null; key: string; label: string; kind: 'redline' | 'expert' | 'ai' | 'missed'; basis: string; evidence: string | null; question: string }
export async function deviationsFor(spaceId: string, traces: Record<string, any>): Promise<Deviation[]> {
  const ids = Object.keys(traces || {}).filter(k => k !== 'base');
  const [{ data: chs }, { data: links }, { data: space }] = await Promise.all([
    ids.length ? supabaseAdmin.from('lab_chapters').select('id, sim').in('id', ids) : Promise.resolve({ data: [] as any[] } as any),
    supabaseAdmin.from('standard_links').select('chapter_id, target, basis, evidence, standard:industry_standards(code, title)').eq('space_id', spaceId),
    traces.base ? supabaseAdmin.from('skill_tasks').select('sim').eq('id', spaceId).single() : Promise.resolve({ data: null } as any),
  ]);
  const out: Deviation[] = [];
  const pairs: [string | null, any, any][] = [...(chs || []).map((c: any) => [c.id, c.sim, traces[c.id]] as [string, any, any]), ...(traces.base && space?.sim ? [[null, space.sim, traces.base] as [null, any, any]] : [])];
  for (const [cid, sim, tr] of pairs) {
    const linkOf = new Map<string, any>();
    for (const l of links || []) if (!cid || l.chapter_id === cid) linkOf.set(String(l.target).split(' · ')[0], l);
    for (const st of sim?.steps || []) {
      if (st?.type !== 'bench' || !st.bench) continue;
      const bt = tr?.[st.id]; if (!bt?.events) continue;
      const hit = new Set(bt.events.filter((e: any) => e.kind === 'rule' || e.kind === 'goal').map((e: any) => `${e.kind}:${e.id}`));
      for (const r of st.bench.rules || []) {
        if (r.severity !== 'violation' || !hit.has(`rule:${r.id}`)) continue;
        const l = linkOf.get(`rule:${r.id}`); const basis = l?.basis || 'none';
        const std = Array.isArray(l?.standard) ? l.standard[0] : l?.standard;
        const said = String(l?.evidence || '').split('：').slice(1).join('：');
        const kind: Deviation['kind'] = basis === 'standard' ? 'redline' : basis === 'expert' ? 'expert' : 'ai';
        const question = kind === 'redline' ? `你的操作触发了「${r.label}」，${std?.code || '标准'}要求「${said}」。当时为什么这样做？是现场条件不同，还是这条在你们那里不这么执行？`
          : kind === 'expert' ? `「${r.label}」：另一位老师傅说过「${said}」，你的做法不一样。哪种更对，还是看情况？`
          : `「${r.label}」是系统自己推断的规则，你触发了它。是规则定严了（应该放到多少？），还是这一下确实冒险？`;
        out.push({ chapter_id: cid, key: `rule:${r.id}`, label: r.label, kind, basis, evidence: l?.evidence || null, question });
      }
      for (const g of st.bench.goals || []) {
        if (hit.has(`goal:${g.id}`)) continue;
        const l = linkOf.get(`goal:${g.id}`);
        out.push({ chapter_id: cid, key: `goal:${g.id}`, label: g.label, kind: 'missed', basis: l?.basis || 'none', evidence: l?.evidence || null, question: `「${g.label}」这一步你没有做到：是模拟器的窗口和现场不一样，还是这一步本来就可以不做？` });
      }
    }
  }
  const order = { redline: 0, expert: 1, ai: 2, missed: 3 } as const;
  return out.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 8);
}
