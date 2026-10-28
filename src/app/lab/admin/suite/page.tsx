'use client';

/**
 * 百业后台 · 一个 JD 生成整套（2026-10-28）：贴一份 JD → 职业体验空间（一天骨架 + 写 3 章 + 发布 + 备教案）→ 2 道真活 →
 * 另一个模型交叉审稿 → 严重问题打回去改一轮 → 复审 → 开课（给几位平台学员开学籍）。
 * 页面按步骤调各自已有的接口（整套要 15–25 分钟，单个请求撑不住）；进度写进空间的 jd_snapshot.suite，?space=<id> 打开能接着跑。
 * 只给管理员（每一步都花钱）。
 */
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { SuiteReview, SuiteState } from '@/lib/suite';

type Status = 'wait' | 'run' | 'done' | 'fail' | 'skip';
type StepKey = 'space' | 'day' | 'chapters' | 'publish' | 'lessons' | 'work' | 'review' | 'fix' | 'rereview' | 'course';
const STEPS: { k: StepKey; t: string; d: string }[] = [
  { k: 'space', t: '建体验空间', d: '读 JD → 技能卡草案 + 数字职人 + 工位 + 场景（2–4 分钟）' },
  { k: 'day', t: '排一天', d: '这一行的一天排成 6–8 格' },
  { k: 'chapters', t: '写章节', d: '先写前 3 格：故事线、步骤、示范答案、配图' },
  { k: 'publish', t: '发布章节', d: '过工作室校验，发布后就是一门课' },
  { k: 'lessons', t: '备教案', d: '每章「跟我学」的分步讲解' },
  { k: 'work', t: '出真活', d: '从 JD 挑 2 项最能拉开差距的职责，各出一道' },
  { k: 'review', t: '交叉审稿', d: '换一个模型对着 JD 逐条审：覆盖、重复、硬伤' },
  { k: 'fix', t: '按审稿改', d: '严重问题打回生成器改一轮（真活修订 / 章节重写）' },
  { k: 'rereview', t: '复审', d: '改完再审一遍，看分数涨没涨' },
  { k: 'course', t: '开课', d: '给几位平台学员（大模型）开学籍，入学考到教务里跑' },
];
const N_CHAPTERS = 3, MAX_FIX = 3;
/** 建空间 / 写章节用的模型：Claude Opus 优先，失败用千问 3.7 Plus / 千问 Max 兜底（不传会落到 Gemini）。
 *  审稿在服务端用 Claude Sonnet，连不上退千问 */
const GEN_MODELS = ['claude-opus-5-5', 'qwen3.7-plus', 'qwen-max'];   // 优先 Claude，千问兜底
const QUOTA = /./;   // 出什么错都换下一个（兜底只有一层）
/** 用第一个模型跑，失败了换下一个 */
async function withModels<T>(f: (model: string) => Promise<T>, onSwitch?: (m: string) => void): Promise<T> {
  let last: any;
  for (let i = 0; i < GEN_MODELS.length; i++) {
    try { return await f(GEN_MODELS[i]); }
    catch (e: any) { last = e; if (!QUOTA.test(String(e?.message || e)) || i === GEN_MODELS.length - 1) throw e; onSwitch?.(GEN_MODELS[i + 1]); }
  }
  throw last;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
  if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
const post = (url: string, body: any) => api(url, { method: 'POST', body: JSON.stringify(body) });
const hasSteps = (c: any) => (c.sim?.steps?.length || 0) > 0;

export default function SuitePage() { return <Suspense fallback={null}><Suite /></Suspense>; }

function Suite() {
  const sp = useSearchParams();
  const [spaceId, setSpaceId] = useState<string>(sp.get('space') || '');
  const [form, setForm] = useState({ company: '', title: '', jd: '' });
  const [st, setSt] = useState<Record<StepKey, { s: Status; note?: string; t0?: number; t1?: number }>>(() => Object.fromEntries(STEPS.map(x => [x.k, { s: 'wait' }])) as any);
  const [suite, setSuite] = useState<SuiteState | null>(null);
  const [space, setSpace] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [, tick] = useState(0);
  const stop = useRef(false);
  useEffect(() => { const t = setInterval(() => tick(v => v + 1), 1000); return () => clearInterval(t); }, []);

  const set = (k: StepKey, s: Status, note?: string) => setSt(p => ({ ...p, [k]: { s, note: note ?? p[k].note, t0: s === 'run' ? (p[k].s === 'run' ? p[k].t0 : Date.now()) : p[k].t0, t1: s === 'run' ? undefined : s === 'wait' ? undefined : Date.now() } }));
  const refresh = useCallback(async (id = spaceId) => {
    if (!id) return;
    const [a, b] = await Promise.all([api(`/api/lab/suite?space_id=${id}`).catch(() => null), api(`/api/lab/studio/${id}`).catch(() => null)]);
    if (a) setSuite(a.suite); if (b) setSpace(b);
    return { suite: a?.suite as SuiteState | null, studio: b };
  }, [spaceId]);
  useEffect(() => { if (spaceId) refresh(spaceId); }, [spaceId, refresh]);
  // 打开已有的整套（?space=）：按记录推断每步做到哪了（不在跑的时候才推，跑着就听跑的）
  useEffect(() => {
    if (busy || !spaceId || !space) return;
    const chs: any[] = space.chapters || [], su = suite;
    const done: Partial<Record<StepKey, string | false>> = {
      space: '已建好', day: chs.length >= 4 && `${chs.length} 格`, chapters: chs.some(hasSteps) && `写好 ${chs.filter(hasSteps).length} 章`,
      publish: chs.some((c: any) => c.status === 'published') && `发布 ${chs.filter((c: any) => c.status === 'published').length} 章`,
      lessons: chs.some((c: any) => c.lesson_at) && `${chs.filter((c: any) => c.lesson_at).length} 章有教案`,
      work: !!su?.work?.length && `${su.work.length} 道真活`, review: !!su?.reviews?.length && `${su.reviews[0].score} 分`,
      fix: !!su?.fixed?.length && `改了 ${su.fixed.length} 处`, rereview: (su?.reviews?.length || 0) > 1 && `${su!.reviews[0].score} → ${su!.reviews[su!.reviews.length - 1].score} 分`,
      course: !!su?.enrollments?.length && `${su.enrollments.length} 位学员入学`,
    };
    setSt(p => Object.fromEntries(STEPS.map(x => [x.k, p[x.k].s === 'wait' && done[x.k] ? { s: 'done', note: done[x.k] as string } : p[x.k]])) as any);
  }, [space, suite, spaceId, busy]);
  const log = (step: string, note: string) => spaceId && post('/api/lab/suite', { action: 'log', space_id: spaceId, step, note }).catch(() => {});

  /** 等工作室的后台任务（排一天 / 写一章）跑完 */
  const waitJob = async (id: string, jobId: string, k: StepKey, label: string) => {
    for (let i = 0; i < 300 && !stop.current; i++) {
      await sleep(4000);
      const j = await api(`/api/lab/studio/${id}/jobs`).catch(() => null);
      const job = j?.jobs?.find((x: any) => x.id === jobId);
      if (!job) continue;
      set(k, 'run', `${label}：${job.phase || ''}${job.detail ? ` · ${String(job.detail).slice(0, 60)}` : ''}`);
      if (job.status === 'done') return job;
      if (job.status === 'failed') throw new Error(job.error || `${label}失败`);
    }
    throw new Error(`${label}等太久了`);
  };

  const run = async () => {
    setBusy(true); setErr(''); stop.current = false;
    let id = spaceId; let cur: StepKey = 'space';
    const step = async (k: StepKey, f: () => Promise<string | void>) => { cur = k; if (stop.current) throw new Error('已停下'); set(k, 'run'); const note = await f(); set(k, note === 'skip' ? 'skip' : 'done', note && note !== 'skip' ? note : undefined); if (note && note !== 'skip') post('/api/lab/suite', { action: 'log', space_id: id, step: k, note }).catch(() => {}); };
    try {
      // 1 空间
      await step('space', async () => {
        if (id) return '已有空间，接着跑';
        if (form.jd.trim().length < 40) throw new Error('JD 正文太短了，至少贴上职责或要求的几条');
        const buildId = Math.random().toString(36).slice(2);
        let done = false;
        (async () => { while (!done) { await sleep(3000); const b = await api(`/api/lab/spaces?build=${buildId}`).catch(() => null); if (b?.build?.phase && !done) set('space', 'run', `${b.build.phase}${b.build.detail ? ` · ${b.build.detail}` : ''}`); } })();
        const r = await withModels(model => post('/api/lab/spaces', { jdText: form.jd.trim(), title: form.title.trim(), company: form.company.trim(), buildId, model }), m => set('space', 'run', `千问没成，换 ${m} 重试`)).finally(() => { done = true; });
        id = r.id; setSpaceId(id);
        window.history.replaceState(null, '', `/lab/admin/suite?space=${id}`);
        return `空间建好：${r.summary?.title || ''}（${r.summary?.steps || 0} 步、工位 ${r.summary?.bench ? r.summary.bench.name : '无'}）`;
      });
      // 2 一天
      await step('day', async () => {
        const s = (await refresh(id))!.studio;
        if ((s?.chapters?.length || 0) >= 4) return `已有 ${s.chapters.length} 格`;
        const job = await withModels(async model => { const j = await post(`/api/lab/studio/${id}/day`, { model }); return waitJob(id, j.job.id, 'day', '排一天'); }, m => set('day', 'run', `千问没成，换 ${m} 重试`));
        return job.detail || '排好了';
      });
      // 3 章节
      await step('chapters', async () => {
        let chs: any[] = (await refresh(id))!.studio?.chapters || [];
        let written = chs.filter(hasSteps).length;
        const todo = chs.filter(c => !hasSteps(c) && !c.locked).slice(0, Math.max(0, N_CHAPTERS - written));
        for (const c of todo) {
          set('chapters', 'run', `写《${c.title}》`);
          await withModels(async model => { const j = await post(`/api/lab/studio/${id}/chapters/${c.id}/generate`, { art: true, model }); return waitJob(id, j.job.id, 'chapters', `写《${c.title}》`); }, m => set('chapters', 'run', `千问没成，换 ${m} 重试`));
          written++;
        }
        chs = (await refresh(id))!.studio?.chapters || [];
        return `写好 ${chs.filter(hasSteps).length} 章（共 ${chs.length} 格）`;
      });
      // 4 发布
      await step('publish', async () => {
        const chs: any[] = (await refresh(id))!.studio?.chapters || [];
        const ok: string[] = [], bad: string[] = [];
        for (const c of chs.filter(hasSteps)) {
          if (c.status === 'published') { ok.push(c.title); continue; }
          try { await api(`/api/lab/studio/${id}/chapters/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) }); ok.push(c.title); }
          catch (e: any) { bad.push(`《${c.title}》${e.message}`); }
        }
        if (!ok.length) throw new Error(`一章也没发布出去：${bad[0] || '没有写好的章节'}`);
        return `发布 ${ok.length} 章${bad.length ? `；${bad.length} 章没过校验（${bad[0].slice(0, 60)}）` : ''}`;
      });
      // 5 教案
      await step('lessons', async () => {
        const chs: any[] = ((await refresh(id))!.studio?.chapters || []).filter((c: any) => c.status === 'published');
        let n = 0;
        for (const c of chs) { set('lessons', 'run', `备《${c.title}》`); await api(`/api/lab/spaces/${id}/lesson?chapter=${c.id}`).then(() => n++).catch(() => {}); }
        return `${n} / ${chs.length} 章备好教案`;
      });
      // 6 真活
      await step('work', async () => {
        let s = (await refresh(id))!.suite;
        let plan = s?.plan;
        if (!plan?.length) { set('work', 'run', '从 JD 挑职责'); plan = (await post('/api/lab/suite', { action: 'plan_work', space_id: id, n: 2 })).plan; }
        for (const p of plan!) {
          if (s?.work?.some(w => w.focus === p.focus)) continue;
          set('work', 'run', `出一道：${p.focus.slice(0, 40)}…`);
          await post('/api/lab/suite', { action: 'make_work', space_id: id, focus: p.focus });
          s = (await refresh(id))!.suite;
        }
        return `${s?.work?.length || 0} 道真活`;
      });
      // 7 审稿
      const R: { first: SuiteReview | null } = { first: null };
      await step('review', async () => {
        R.first = (await post('/api/lab/suite', { action: 'review', space_id: id })).review;
        await refresh(id);
        return `${R.first!.score} 分 · ${R.first!.issues.filter(x => x.severity === 'high').length} 个必须改`;
      });
      // 8 改
      let fixed = 0;
      await step('fix', async () => {
        // 指到具体章节 / 真活的打回去改；整体缺口（某项职责没覆盖）补一道真活，最多补一道
        const highs = [...R.first!.issues.filter(x => x.severity === 'high' && x.id && (x.target === 'work' || x.target === 'chapter')), ...R.first!.issues.filter(x => x.severity === 'high' && x.target === 'suite').slice(0, 1)].slice(0, MAX_FIX);
        if (!highs.length) return 'skip';
        for (const x of highs) {
          set('fix', 'run', x.target === 'suite' ? `补一道真活：${x.problem.slice(0, 30)}` : `改${x.target === 'work' ? '真活' : '章节'}《${x.title || x.id}》`);
          try {
            if (x.target === 'suite') { await post('/api/lab/suite', { action: 'make_work', space_id: id, focus: x.fix.replace(/^再出一道真活[:：]?/, '') }); await post('/api/lab/suite', { action: 'mark_fixed', space_id: id, target: 'suite', id: 'gap', fix: x.fix }); }
            else if (x.target === 'work') await post('/api/lab/suite', { action: 'fix_work', space_id: id, task_id: x.id, fix: x.fix });
            else {
              await withModels(async model => { const j = await post(`/api/lab/studio/${id}/chapters/${x.id}/generate`, { art: false, model, hint: `审稿意见（必须改）：${x.problem}。修改：${x.fix}` }); return waitJob(id, j.job.id, 'fix', `重写《${x.title}》`); });
              await api(`/api/lab/studio/${id}/chapters/${x.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) }).catch(() => {});
              await api(`/api/lab/spaces/${id}/lesson?chapter=${x.id}&force=1`).catch(() => {});
              await post('/api/lab/suite', { action: 'mark_fixed', space_id: id, target: 'chapter', id: x.id, fix: x.fix });
            }
            fixed++;
          } catch (e: any) { log('fix', `《${x.title}》没改成：${e.message}`); }
        }
        await refresh(id);
        return `改了 ${fixed} / ${highs.length} 处`;
      });
      // 9 复审
      await step('rereview', async () => {
        if (!fixed) return 'skip';
        const r: SuiteReview = (await post('/api/lab/suite', { action: 'review', space_id: id })).review;
        await refresh(id);
        return `${R.first!.score} → ${r.score} 分`;
      });
      // 10 开课
      await step('course', async () => {
        const e = (await post('/api/lab/suite', { action: 'open_course', space_id: id })).enrollments;
        await refresh(id);
        return `${e.length} 位学员入学`;
      });
    } catch (e: any) {
      set(cur, 'fail', e.message); setErr(`${STEPS.find(x => x.k === cur)?.t}：${e.message}`);
    } finally { setBusy(false); }
  };

  const reviews = suite?.reviews || [];
  const last = reviews[reviews.length - 1];
  const chs: any[] = space?.chapters || [];
  const dur = (x: { t0?: number; t1?: number }) => (x.t0 ? `${Math.round(((x.t1 || Date.now()) - x.t0) / 1000)}s` : '');
  const ICON: Record<Status, string> = { wait: '○', run: '◐', done: '●', fail: '✕', skip: '–' };
  const COLOR: Record<Status, string> = { wait: 'var(--ink3)', run: 'var(--v)', done: '#0d7a3d', fail: '#b23a48', skip: 'var(--ink3)' };
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>一个 JD 生成整套</h1>
        <Link href="/lab/admin" className="lab-chip g" style={{ textDecoration: 'none' }}>← 百业后台</Link>
        <span className="lab-mono lab-cap">jd → space · work · course</span>
      </div>
      <p style={{ color: 'var(--ink2)', maxWidth: 860, lineHeight: 1.8 }}>贴一份 JD：先建职业体验空间（一天 + 前 3 章 + 教案），再出 2 道真活；然后换一个模型对着 JD 交叉审稿，严重问题打回去改一轮、复审；最后开课，给几位平台学员开学籍。整套 15–25 分钟，中途关了页面用 <code>?space=</code> 打开能接着跑。</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="suite-grid">
        <div className="lab-glass" style={{ padding: 20 }}>
          {!spaceId ? <>
            <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>JD</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="lab-input" placeholder="企业（可空）" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} style={{ flex: 1 }} />
              <input className="lab-input" placeholder="岗位名" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ flex: 1 }} />
            </div>
            <textarea className="lab-input" value={form.jd} onChange={e => setForm(f => ({ ...f, jd: e.target.value }))} placeholder="把 JD 的职责、要求整段贴进来" rows={12} style={{ width: '100%', resize: 'vertical', lineHeight: 1.7 }} />
          </> : <div>
            <div className="lab-mono lab-cap">空间</div>
            <div style={{ fontSize: 18, fontWeight: 800, margin: '4px 0' }}>{space?.space?.profile?.role || space?.space?.title || '…'}</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{space?.space?.jd_snapshot?.company} · {chs.length} 格 · 写好 {chs.filter(hasSteps).length} 章 · 发布 {chs.filter((c: any) => c.status === 'published').length} 章</div>
          </div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="lab-btn" disabled={busy || (!spaceId && form.jd.trim().length < 40)} onClick={run}>{busy ? '跑着呢…' : spaceId ? '接着跑 →' : '开始生成整套 →'}</button>
            {busy && <button className="lab-btn ghost" onClick={() => { stop.current = true; }}>停下</button>}
          </div>
          {err && <div style={{ color: '#b23a48', fontSize: 13, marginTop: 10, lineHeight: 1.7 }}>{err}</div>}
        </div>

        <div className="lab-glass" style={{ padding: '14px 20px' }}>
          {STEPS.map(x => { const v = st[x.k]; return (
            <div key={x.k} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: COLOR[v.s], fontSize: 15, width: 16, textAlign: 'center' }}>{ICON[v.s]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><b style={{ fontSize: 14 }}>{x.t}</b><span style={{ fontSize: 12, color: 'var(--ink3)' }}>{x.d}</span><span className="lab-mono" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink3)', letterSpacing: 0 }}>{dur(v)}</span></div>
                {v.note && <div style={{ fontSize: 12.5, color: v.s === 'fail' ? '#b23a48' : 'var(--ink2)', marginTop: 2, lineHeight: 1.6 }}>{v.note}</div>}
              </div>
            </div>); })}
        </div>
      </div>

      {spaceId && <div className="lab-glass" style={{ padding: 20, marginTop: 16 }}>
        <div className="lab-mono lab-cap" style={{ marginBottom: 10 }}>整套</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div><b>体验空间</b><div style={{ fontSize: 13, lineHeight: 1.9, marginTop: 4 }}><a href={`/lab/${spaceId}`} target="_blank" rel="noreferrer">打开空间 ↗</a> · <a href={`/lab/studio/${spaceId}`} target="_blank" rel="noreferrer">工作室 ↗</a>{chs.filter(hasSteps).map((c: any) => <div key={c.id} style={{ color: 'var(--ink2)' }}>{c.status === 'published' ? '●' : '○'} {c.slot ? `${c.slot} ` : ''}{c.title}</div>)}</div></div>
          <div><b>真活</b><div style={{ fontSize: 13, lineHeight: 1.9, marginTop: 4 }}>{(suite?.work || []).length ? suite!.work.map(w => <div key={w.id}><a href={`/work/${w.token}/owner?k=${encodeURIComponent(w.owner_key)}`} target="_blank" rel="noreferrer">{w.title} ↗</a></div>) : <span style={{ color: 'var(--ink3)' }}>还没出</span>}</div></div>
          <div><b>学院课程</b><div style={{ fontSize: 13, lineHeight: 1.9, marginTop: 4 }}>{(suite?.enrollments || []).length ? suite!.enrollments.map(e => <div key={e.id}><a href={`/college/admin/training/${e.id}`} target="_blank" rel="noreferrer">{e.model} 的学籍 ↗</a></div>) : <span style={{ color: 'var(--ink3)' }}>还没开课</span>}</div></div>
        </div>
      </div>}

      {last && <div className="lab-glass" style={{ padding: 20, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div className="lab-mono lab-cap">交叉审稿 · {last.model}</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{reviews.length > 1 ? <>{reviews[0].score} → {last.score}</> : last.score}<span style={{ fontSize: 14, color: 'var(--ink3)', fontWeight: 400 }}> / 100</span></div>
          {reviews.length > 1 && <span style={{ fontSize: 13, color: 'var(--ink3)' }}>改了 {suite?.fixed?.length || 0} 处后复审</span>}
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.8, margin: '6px 0 14px' }}>{last.summary}</p>
        <div className="lab-glass cp-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 18 }}>
            <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>JD 每项职责的覆盖</div>
            {last.coverage.map((c, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.7, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <b>{c.duty}</b> <span style={{ color: c.covered_by.length ? '#0d7a3d' : '#b23a48' }}>{c.covered_by.length ? `· ${c.covered_by.length} 处覆盖` : '· 没覆盖'}</span>
              {c.gap && <div style={{ color: 'var(--ink3)' }}>缺：{c.gap}</div>}
            </div>)}
          </div>
          <div style={{ padding: 18, borderLeft: '1px solid var(--line)' }}>
            <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>问题</div>
            {!last.issues.length && <div style={{ fontSize: 13, color: 'var(--ink3)' }}>没有问题</div>}
            {last.issues.map((x, i) => { const done = suite?.fixed?.some(f => f.id === x.id); return (
              <div key={i} style={{ fontSize: 13, lineHeight: 1.7, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span className={`lab-chip ${x.severity === 'high' ? 'p' : x.severity === 'mid' ? 'c' : 'g'}`} style={{ marginRight: 6 }}>{x.severity === 'high' ? '必须改' : x.severity === 'mid' ? '建议改' : '小问题'}</span>
                <b>{x.target === 'work' ? '真活' : x.target === 'chapter' ? '章节' : '整套'}{x.title ? `《${x.title}》` : ''}</b>{done && <span style={{ color: '#0d7a3d' }}> · 已改</span>}
                <div>{x.problem}</div><div style={{ color: 'var(--ink3)' }}>→ {x.fix}</div>
              </div>); })}
          </div>
        </div>
      </div>}

      {!!suite?.log?.length && <details style={{ marginTop: 14 }}><summary style={{ cursor: 'pointer', color: 'var(--ink3)', fontSize: 13 }}>流水（{suite.log.length}）</summary>
        <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.8, marginTop: 6 }}>{suite.log.map((l, i) => <div key={i}><span className="lab-mono" style={{ letterSpacing: 0 }}>{l.at.slice(5, 16).replace('T', ' ')}</span> · {l.step} · {l.note}</div>)}</div>
      </details>}
      <style>{`@media (max-width: 900px) { .suite-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
