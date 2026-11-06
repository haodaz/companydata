'use client';

/**
 * 百业工厂 · 新建空间（2026-11-06，照真活「填表出任务」分两层）：
 *   第一层「定位」：输入职业 / 岗位 / 「公司 + 岗位」/ 学科 → 职业库、岗位库里的候选 + AI 给的三种粒度（常见叫法 / 具体岗位 / 细分方向），点一个；
 *                  也可以直接粘贴一份 JD。生成的东西就落在点中的这一层。
 *   第二层「生成要求」：给谁看、要多深、考核多难、参考资料、必须放进去的、不要的——都是自然语言，可以先点一个预设再改。
 *   生成约 2–4 分钟（进度轮询 /api/lab/spaces?build=），做完进工作室接着排一天。
 * 要求存在空间的 jd_snapshot.spec 里，以后排一天、写每一章、出评分都按它来；工作室里还能改。
 */
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App } from 'antd';
import { useModel } from '@/lib/model-context';
import { type Anchor, type GenSpec } from '@/lib/lab-spec';
import { SpecEditor, SPEC_CSS } from '@/components/lab/SpecEditor';

type Occ = { id: number; name: string; category: string; intro: string };
type Job = { id: number; name: string; company: string; location?: string; brief: string };
type Level = { name: string; tier: 'common' | 'role' | 'niche'; why: string; occupation?: Occ | null };
const TIER: Record<string, string> = { common: '常见叫法', role: '具体岗位', niche: '细分方向' };

export default function NewSpacePage() { return <App><NewSpace /></App>; }

function NewSpace() {
  const router = useRouter(); const { message } = App.useApp(); const { currentModel } = useModel();
  // 第一层
  const [mode, setMode] = useState<'career' | 'discipline' | 'paste'>('career');
  const [q, setQ] = useState(''); const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<{ q: string; occupations: Occ[]; jobs: Job[]; levels: Level[] } | null>(null);
  const [paste, setPaste] = useState({ title: '', company: '', text: '' });
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // 第二层
  const [spec, setSpec] = useState<GenSpec>({});
  // 生成
  const [building, setBuilding] = useState<{ buildId: string; phase: string; detail?: string; since: number } | null>(null);
  const [, tick] = useState(0);
  const step2 = useRef<HTMLDivElement>(null);

  const find = async () => {
    if (q.trim().length < 2) return;
    setFinding(true); setFound(null); setAnchor(null);
    const j = await (await fetch('/api/lab/anchor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, mode }) })).json().catch(() => ({ ok: false, error: '网络错误' }));
    setFinding(false);
    if (!j.ok) { message.error(j.error); return; }
    setFound(j);
  };
  const pick = (a: Anchor) => { setAnchor(a); setTimeout(() => step2.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };
  const usePaste = () => pick({ kind: 'pasted', label: paste.title.trim() || '未命名岗位', company: paste.company.trim() || null });

  // 生成进度
  useEffect(() => {
    if (!building) return;
    const t = setInterval(async () => {
      tick(x => x + 1);
      const j = await (await fetch(`/api/lab/spaces?build=${building.buildId}`)).json().catch(() => null);
      if (j?.build?.phase) setBuilding(b => b && { ...b, phase: j.build.phase, detail: j.build.detail });
    }, 2000);
    return () => clearInterval(t);
  }, [building?.buildId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const go = async () => {
    if (!anchor) return;
    if (anchor.kind === 'pasted' && paste.text.trim().length < 40) { message.warning('JD 正文至少 40 字'); return; }
    const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setBuilding({ buildId, phase: anchor.kind === 'job' || anchor.kind === 'pasted' ? '读取岗位 JD' : '结构化职业 · 推断典型岗位', since: Date.now() });
    const body: any = { anchor, spec, model: currentModel, buildId, draft: true };
    if (anchor.kind === 'pasted') Object.assign(body, { jdText: paste.text.trim(), title: paste.title.trim(), company: paste.company.trim() });
    const j = await (await fetch('/api/lab/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json().catch(() => ({ ok: false, error: '网络错误' }));
    if (!j.ok) { setBuilding(null); message.error(j.error || '生成失败'); return; }
    message.success('空间生成好了，进工作室接着排一天');
    router.push(`/lab/studio/${j.id}`);
  };

  if (building) {
    const secs = Math.round((Date.now() - building.since) / 1000);
    return (
      <div className="ns-wrap"><style>{CSS}</style>
        <div className="lab-glass ns-card" style={{ textAlign: 'center', padding: '48px 28px' }}>
          <div className="lab-mono lab-cap">BUILDING · {secs}s</div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '10px 0 6px' }}>正在生成「{anchor?.label}」</div>
          <div style={{ color: 'var(--ink2)', fontSize: 14.5 }}>{building.phase}{building.detail ? ` · ${building.detail}` : ''}<span className="lab-dots" /></div>
          <div style={{ color: 'var(--ink3)', fontSize: 13, marginTop: 14, lineHeight: 1.8 }}>约 2–4 分钟：故事线 → 技能集 / 虚拟工位 / 场景规划 → 画图。<br />都会按你写的生成要求来；可以先去做别的，别关这个页面。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="ns-wrap"><style>{CSS + SPEC_CSS}</style>
      <button className="lab-btn ghost sm" onClick={() => router.push('/lab/spaces')}>← 百业工厂</button>
      <h1 className="ns-h1">新建一个空间</h1>
      <p className="ns-lead">两步：先定位做的是哪一个，再说清楚给谁看、要多深、考核多难。说清楚了，后面每一步（故事线、工位、美术、一天的每一章、评分）都按它来。</p>

      {/* ── 第一层：定位 ── */}
      <section className="lab-glass ns-card">
        <div className="ns-step"><b>1</b>做的是哪一个</div>
        <div className="ns-tabs">{([['career', '职业 / 岗位'], ['discipline', '学科 · 研究领域'], ['paste', '粘贴一份 JD']] as const).map(([k, t]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => { setMode(k); setFound(null); setAnchor(null); }}>{t}</button>)}</div>
        {mode !== 'paste' ? <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="lab-input ns-in" style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) find(); }}
              placeholder={mode === 'discipline' ? '如：材料科学、计算生物学、固态电池界面' : '如：程序员、精算师、咖啡师、高级 SRE，或「宁德时代 电池测试工程师」'} />
            <button className="lab-btn" disabled={finding || q.trim().length < 2} onClick={find}>{finding ? '找…' : '找一找'}</button>
          </div>
          {found && <div className="ns-found">
            {found.levels.length > 0 && <div className="ns-group">
              <div className="ns-glabel">按粒度选一个（给高中生一般选「常见叫法」）</div>
              <div className="ns-opts">{found.levels.map(l => {
                const a: Anchor = { kind: mode === 'discipline' ? 'discipline' : l.occupation ? 'occupation' : 'career', label: l.occupation?.name || l.name, occupation_id: l.occupation?.id ?? null, from: found.q };
                const on = anchor?.label === a.label && anchor.kind === a.kind;
                return <button key={l.name} className={`ns-opt${on ? ' on' : ''}`} onClick={() => pick(a)}><span className="ns-tier">{TIER[l.tier]}</span><b>{l.name}</b><small>{l.why}</small>{l.occupation && <em>职业库已有</em>}</button>;
              })}</div>
            </div>}
            {found.occupations.length > 0 && <div className="ns-group">
              <div className="ns-glabel">职业库里的</div>
              <div className="ns-opts">{found.occupations.map(o => { const on = anchor?.occupation_id === o.id; return <button key={o.id} className={`ns-opt${on ? ' on' : ''}`} onClick={() => pick({ kind: 'occupation', label: o.name, occupation_id: o.id, from: found.q })}><span className="ns-tier">{o.category || '职业'}</span><b>{o.name}</b><small>{o.intro}</small></button>; })}</div>
            </div>}
            {found.jobs.length > 0 && <div className="ns-group">
              <div className="ns-glabel">岗位库里的真实 JD（按这一条 JD 来做）</div>
              <div className="ns-opts">{found.jobs.map(jb => { const on = anchor?.job_id === jb.id; return <button key={jb.id} className={`ns-opt${on ? ' on' : ''}`} onClick={() => pick({ kind: 'job', label: jb.name, job_id: jb.id, company: jb.company, from: found.q })}><span className="ns-tier">{jb.company}{jb.location ? ` · ${jb.location}` : ''}</span><b>{jb.name}</b><small>{jb.brief}</small></button>; })}</div>
            </div>}
            {!found.levels.length && !found.occupations.length && !found.jobs.length && <div className="ns-muted">没找到，换个说法试试；或者直接粘贴一份 JD。</div>}
          </div>}
        </> : <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input className="lab-input ns-in" style={{ flex: '2 1 220px' }} value={paste.title} onChange={e => setPaste(p => ({ ...p, title: e.target.value }))} placeholder="岗位名，如：储能系统测试工程师" />
            <input className="lab-input ns-in" style={{ flex: '1 1 160px' }} value={paste.company} onChange={e => setPaste(p => ({ ...p, company: e.target.value }))} placeholder="公司（可不填）" />
          </div>
          <textarea className="lab-input ns-in" rows={6} value={paste.text} onChange={e => setPaste(p => ({ ...p, text: e.target.value }))} placeholder={'岗位职责：\n1. …\n任职要求：\n1. …'} style={{ width: '100%', resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span className="ns-muted">{paste.text.trim().length < 40 ? '正文至少 40 字' : `${paste.text.trim().length} 字`}</span>
            <button className="lab-btn sm" disabled={paste.text.trim().length < 40 || !paste.title.trim()} onClick={usePaste}>就按这份 JD →</button>
          </div>
        </>}
        {anchor && <div className="ns-picked">定位到：<b>{anchor.label}</b>{anchor.company ? ` · ${anchor.company}` : ''}<span>{anchor.kind === 'occupation' ? '职业库' : anchor.kind === 'job' ? '岗位库 JD' : anchor.kind === 'pasted' ? '粘贴的 JD' : anchor.kind === 'discipline' ? '学科 · 研究领域' : '新职业（生成后自动建档）'}</span></div>}
      </section>

      {/* ── 第二层：生成要求 ── */}
      <section ref={step2} className={`lab-glass ns-card${anchor ? '' : ' ns-dim'}`}>
        <div className="ns-step"><b>2</b>生成要求<small>都用大白话写；不写的就按默认来</small></div>
        <SpecEditor spec={spec} setSpec={setSpec} />
        <div className="ns-go">
          <span className="ns-muted">{anchor ? `将生成「${anchor.label}」的空间，约 2–4 分钟` : '先在第 1 步选定做哪一个'}</span>
          <button className="lab-btn" disabled={!anchor} onClick={go}>生成空间 →</button>
        </div>
      </section>
    </div>
  );
}

const CSS = `
.ns-wrap { max-width: 880px; margin: 0 auto; padding: 24px 16px 80px; }
.ns-h1 { font-size: 28px; font-weight: 800; margin: 14px 0 6px; }
.ns-lead { color: var(--ink2); font-size: 14.5px; line-height: 1.8; margin: 0 0 18px; }
.ns-card { padding: 20px 22px; margin-bottom: 16px; }
.ns-dim { opacity: .55; }
.ns-step { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 800; margin-bottom: 14px; }
.ns-step b { width: 26px; height: 26px; border-radius: 50%; background: var(--v); color: #fff; display: grid; place-items: center; font-size: 14px; }
.ns-step small { font-size: 12.5px; color: var(--ink3); font-weight: 500; }
.ns-tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.ns-tabs button { border: 1px solid var(--line); background: rgba(255,255,255,.7); border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 13.5px; color: var(--ink2); cursor: pointer; }
.ns-tabs button.on { background: var(--v); border-color: var(--v); color: #fff; font-weight: 700; }
.ns-in { width: 100%; padding: 10px 13px; border-radius: 12px; border: 1px solid var(--line); font-size: 14px; line-height: 1.65; box-sizing: border-box; }
.ns-found { margin-top: 14px; display: grid; gap: 14px; }
.ns-glabel { font-size: 12.5px; color: var(--ink3); margin-bottom: 8px; font-weight: 600; }
.ns-glabel small { font-weight: 500; margin-left: 8px; }
.ns-opts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 8px; }
.ns-opt { text-align: left; border: 1px solid var(--line); background: rgba(255,255,255,.8); border-radius: 12px; padding: 10px 12px; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 3px; color: var(--ink); position: relative; }
.ns-opt:hover { border-color: var(--v); }
.ns-opt.on { border-color: var(--v); box-shadow: 0 0 0 2px var(--v); background: #fff; }
.ns-opt b { font-size: 14.5px; } .ns-opt small { font-size: 12px; color: var(--ink3); line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ns-tier { font-size: 11px; color: var(--v); font-weight: 700; } .ns-opt em { position: absolute; right: 10px; top: 9px; font-style: normal; font-size: 11px; color: #0d7a52; }
.ns-picked { margin-top: 14px; padding: 10px 12px; border-radius: 10px; background: rgba(106,92,255,.08); font-size: 14px; }
.ns-picked span { margin-left: 10px; font-size: 12px; color: var(--ink3); }
.ns-go { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.ns-muted { font-size: 13px; color: var(--ink3); }
`;
