'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Modal, Popconfirm } from 'antd';
import { SKILL_KIND, expertiseLevel } from '@/lib/skill-lab';
import { useModel } from '@/lib/model-context';
import { familyOf } from '@/lib/career-family';
import { tagsOf, ALL_TAGS, FEATURE_TAGS } from '@/lib/career-tags';

const BUILD_STEPS = ['读取岗位 JD', '逐条拆解岗位职责', '对齐能力项', '设计可检验的任务', '生成评分标准', '唤醒岗位 AI 核心'];
/** 真实构建（任意 JD）的阶段：与服务端 progress 的 phase 文案一致 */
const BUILD_PHASES = ['结构化职业 · 推断典型岗位', '读取岗位 JD', '拆解职责 · 设计任务与故事线', '推断技能集 · 设计虚拟工位 · 规划场景', '生成场景与立绘', '唤醒岗位 AI 核心', '完成'];


export default function LabHome() {
  const { message } = App.useApp();
  const router = useRouter();

  const [spaces, setSpaces] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [needMigration, setNeedMigration] = useState('');
  /** 建空间的两个入口：'jd' 从岗位库的一份 JD 来，'career' 只给一个职业名 */
  const [pick, setPick] = useState<null | 'jd' | 'career'>(null);
  const [jds, setJds] = useState<any[]>([]);
  const [jdsLoading, setJdsLoading] = useState(false);
  const [building, setBuilding] = useState<any | null>(null);
  /** 刚生成完的成果小结（只给 AI 现场生成那条路；预置示范是现成的，直接进空间） */
  const [done, setDone] = useState<any | null>(null);
  const [buildStep, setBuildStep] = useState(0);
  // 任意 JD：岗位库搜索 + 真实构建进度
  const { currentModel } = useModel();
  const [jobQ, setJobQ] = useState('');
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [buildInfo, setBuildInfo] = useState<{ phase: string; detail?: string; error?: string } | null>(null);
  const [profession, setProfession] = useState('');
  const [buildSince, setBuildSince] = useState(0);
  const [now, setNow] = useState(0);
  // 「我有个问题」：一句话分给最合适的 1–3 位数字职人
  const [ask, setAsk] = useState('');
  const [asking, setAsking] = useState(false);
  const [picks, setPicks] = useState<any[] | null>(null);
  const routeProblem = async () => {
    const q = ask.trim();
    if (q.length < 4) { message.warning('把问题说具体一点'); return; }
    setAsking(true); setPicks(null);
    try {
      const j = await (await fetch('/api/lab/route-problem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ problem: q, model: currentModel }) })).json();
      if (!j.ok) throw new Error(j.error);
      setPicks(j.picks || []);
    } catch (e: any) { message.error(e.message); }
    finally { setAsking(false); }
  };
  /** 交给他：问题走 sessionStorage，不放进网址——网址会留在浏览器历史和服务器日志里 */
  const handTo = (id: string) => {
    try { sessionStorage.setItem(`lab:problem:${id}`, ask.trim()); } catch { /* 存不了就让人进去再贴一次 */ }
    router.push(`/lab/${id}?m=solve`);
  };

  // 列表筛选：搜一个词 + 选一个领域 + 勾若干标记（标记之间是「或」，人多了只想快速捞出一拨）
  const [q, setQ] = useState('');
  const [fam, setFam] = useState('');
  const [marks, setMarks] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await (await fetch('/api/lab/spaces')).json();
      if (json.ok) { setSpaces(json.data); setTotals(json.totals || null); setNeedMigration(''); }
      else if (json.needMigration) setNeedMigration(json.error);
      else message.error(json.error);
    } finally { setLoading(false); }
  }, [message]);

  useEffect(() => { load(); }, [load]);

  // 首页的「创造一个空间」直接带着意图跳进来，省掉一次点击
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('new');
    if (v === 'jd') { setPick('jd'); loadJds(); } else if (v === 'career') setPick('career');
    if (v) window.history.replaceState(null, '', '/lab/spaces');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 构建动画：步骤文案轮播
  useEffect(() => {
    if (!building) return;
    setBuildStep(0);
    if (building.buildId) {
      // 真实构建：轮询服务端进度
      const iv = setInterval(async () => {
        setNow(Date.now());
        try { const j = await (await fetch(`/api/lab/spaces?build=${building.buildId}`)).json(); if (j.build) setBuildInfo(j.build); } catch { /* 下一拍再试 */ }
      }, 1500);
      return () => clearInterval(iv);
    }
    const iv = setInterval(() => setBuildStep(s => Math.min(s + 1, BUILD_STEPS.length - 1)), 1500);
    return () => clearInterval(iv);
  }, [building]);

  const searchJobs = async (q: string) => {
    setJobQ(q);
    if (q.trim().length < 2) { setJobs([]); return; }
    setJobsLoading(true);
    try {
      const json = await (await fetch(`/api/db/jobs?search=${encodeURIComponent(q.trim())}&pageSize=8`)).json();
      const rows = (json.data || json.items || []) as any[];
      setJobs(rows.filter(r => r.responsibilities || r.overview));
    } catch { setJobs([]); }
    finally { setJobsLoading(false); }
  };

  /** 任意 JD → 岗位 AI 自己生成 技能集草案 + 故事线 + 虚拟工位 + 美术（约 2–4 分钟）；或只给一个职业名 → 职业探索空间 */
  /** 删掉一个空间（演示时反复构建用）；预置示范删掉后还能从 JD 弹窗重新构建 */
  const removeSpace = async (id: string) => {
    try {
      const json = await (await fetch(`/api/lab/spaces/${id}`, { method: 'DELETE' })).json();
      if (!json.ok) throw new Error(json.error || '删除失败');
      message.success('空间已删除');
      setSpaces(list => list.filter((x: any) => x.id !== id));
      loadJds();
    } catch (e: any) { message.error(e.message); }
  };

  const buildFromJob = async (job: any | null, prof?: string) => {
    const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setPick(null);
    const startedAt = Date.now();
    setBuildInfo({ phase: prof ? '结构化职业 · 推断典型岗位' : '读取岗位 JD' }); setBuildSince(startedAt); setNow(startedAt);
    setBuilding(prof ? { company: '职业探索', title: prof, buildId, career: true } : { company: job.institute_or_company_name, title: job.name, buildId });
    try {
      const json = await (await fetch('/api/lab/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prof ? { profession: prof, model: currentModel, buildId } : { jobId: job.id, model: currentModel, buildId }) })).json();
      if (!json.ok) throw new Error(json.error);
      setBuilding(null);
      setDone({ ...json, secs: Math.round((Date.now() - startedAt) / 1000), name: prof || job.name, company: prof ? '职业探索' : job.institute_or_company_name, career: !!prof });
      load();
    } catch (e: any) { message.error(e.message); setBuilding(null); }
  };

  const loadJds = async () => {
    setJdsLoading(true);
    try {
      const json = await (await fetch('/api/lab/seed')).json();
      if (json.ok) setJds(json.jds); else message.error(json.error);
    } finally { setJdsLoading(false); }
  };

  /** 从一条 JD 构建空间：拆解过程至少演完一遍再进入 */
  const build = async (jd: any) => {
    if (jd.space_id) { router.push(`/lab/${jd.space_id}`); return; }
    setPick(null);
    setBuilding(jd);
    try {
      const [json] = await Promise.all([
        fetch('/api/lab/seed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: jd.slug }) }).then(r => r.json()),
        new Promise(r => setTimeout(r, BUILD_STEPS.length * 1500 + 600)),
      ]);
      if (!json.ok) throw new Error(json.error);
      router.push(`/lab/${json.id}`);
    } catch (e: any) { message.error(e.message); setBuilding(null); }
  };

  // ── 构建中：全屏科技感加载 ──
  // 现场生成的落点：刚才那两分钟，岗位 AI 到底做出了什么
  if (done) {
    const sum = done.summary || {};
    const b = sum.bench;
    const mm = `${String(Math.floor(done.secs / 60)).padStart(2, '0')}:${String(done.secs % 60).padStart(2, '0')}`;
    const cards: { k: string; v: React.ReactNode; note: string }[] = [
      { k: '故事线', v: `${sum.steps || 0} 步`, note: sum.title || '一天的工作，拆成一连串要做的决定' },
      { k: '技能卡草案', v: `${sum.rules || 0} 条规则`, note: `${sum.cardSteps || 0} 步做法 · 等第一位真人专家来校正` },
      { k: '虚拟工位', v: b ? (b.track ? '轨迹工位' : '设备工位') : '本次没做出', note: b ? `${b.name}：${b.controls} 个控件 · ${b.goals} 个目标 · ${b.rules} 条规则` : (done.benchNote || '先以故事线为主') },
      { k: '场景美术', v: `${(done.artCount || 0) + (done.artReused || 0)} 张`, note: done.artReused ? `新生成 ${done.artCount} 张 · 复用素材库 ${done.artReused} 张` : (done.artCount ? `${sum.scenes || 0} 个场景 · ${sum.npcs || 0} 位人物` : '文生图服务不可用') },
    ];
    return (
      <div className="lab-in" style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, textAlign: 'center' }}>
        <div className="lab-orb" style={{ ['--s' as string]: '120px' }}><div className="ring" /><div className="ring r2" /><div className="core lab-mono" style={{ fontSize: 13 }}>✓</div><div className="sat" /></div>
        <div>
          <div className="lab-mono lab-cap">BUILT IN {mm}</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{done.company} · {done.name}</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink3)', marginTop: 6 }}>刚才这 {mm}，岗位 AI 从{done.career ? '一个职业名' : '这份 JD'}出发，自己做出了这些：</div>
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', width: 'min(100%, 880px)' }}>
          {cards.map(c => (
            <div key={c.k} className="lab-glass" style={{ padding: 16, textAlign: 'left' }}>
              <div className="lab-mono lab-cap" style={{ marginBottom: 6 }}>{c.k}</div>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{c.v}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 6, lineHeight: 1.6 }}>{c.note}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="lab-btn" onClick={() => router.push(`/lab/${done.id}`)}>进入空间 →</button>
          <button className="lab-btn ghost" onClick={() => { setDone(null); setPick(done.career ? 'career' : 'jd'); if (!done.career) loadJds(); }}>再生成一个</button>
          <button className="lab-btn ghost" onClick={() => setDone(null)}>回到列表</button>
        </div>
      </div>
    );
  }

  if (building) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 28 }}>
        <div className="lab-orb busy" style={{ ['--s' as string]: '200px' }}><div className="ring" /><div className="ring r2" /><div className="core" /><div className="sat" /></div>
        <div>
          <div className="lab-mono lab-cap">BUILDING SKILL SPACE</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{building.company} · {building.title}</div>
        </div>
        {building.buildId ? (() => {
          const cur = Math.max(0, BUILD_PHASES.indexOf(buildInfo?.phase || ''));
          const secs = Math.max(0, Math.round((now - buildSince) / 1000));
          return (
            <div className="lab-glass lab-scan" style={{ padding: '18px 26px', minWidth: 360, textAlign: 'left' }}>
              {BUILD_PHASES.slice(building.career ? 0 : 1, -1).map((s, i) => { i += building.career ? 0 : 1; return (
                <div key={s} className="lab-mono" style={{ fontSize: 13, padding: '4px 0', color: i < cur ? '#12a150' : i === cur ? 'var(--v)' : 'var(--ink3)', fontWeight: i === cur ? 700 : 400 }}>
                  {i < cur ? '✓' : i === cur ? '▸' : '·'} {s}{i === cur && <span className="lab-dots" />}
                  {i === cur && buildInfo?.detail && <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 400, paddingLeft: 18 }}>{buildInfo.detail}</div>}
                </div>
              ); })}
              <div className="lab-mono" style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 10, letterSpacing: '.08em' }}>{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')} · 岗位 AI 正在自己生成技能集、故事线、虚拟工位和场景，约 2–4 分钟</div>
            </div>
          );
        })() : (
        <div className="lab-glass lab-scan" style={{ padding: '18px 26px', minWidth: 320, textAlign: 'left' }}>
          {BUILD_STEPS.map((s, i) => (
            <div key={s} className="lab-mono" style={{ fontSize: 13, padding: '4px 0', color: i < buildStep ? '#12a150' : i === buildStep ? 'var(--v)' : 'var(--ink3)', fontWeight: i === buildStep ? 700 : 400 }}>
              {i < buildStep ? '✓' : i === buildStep ? '▸' : '·'} {s}{i === buildStep && <span className="lab-dots" />}
            </div>
          ))}
        </div>
        )}
      </div>
    );
  }

  // ── 给每个空间算出：可搜的正文、一级领域、标记 ──
  const enriched = useMemo(() => spaces.map((s: any) => {
    const jd = s.jd_snapshot || {};
    const p = s.profile || {};
    const prof = jd.career?.profession || '';
    const text = [p.name, p.codename, p.role, p.tagline, (p.capabilities || []).join(' '), jd.company, jd.title, prof, jd.location, s.skill?.name, s.skill?.domain, s.skill?.expert_location]
      .filter(Boolean).join(' ');
    // 打标记只认「这人是干什么的」，不拿 tagline 和能力词那堆自由文本去撞——
    // 不然西点师会因为一句「面糊是有记忆的材料」被打上「高精尖材料」
    const tags = tagsOf([p.role, prof, jd.title, s.skill?.name, s.skill?.domain].filter(Boolean).join(' '));
    tags.unshift(jd.kind === 'career' ? '职业探索' : '真实 JD');
    if (s.features?.immersive) tags.unshift('沉浸场景');
    if (s.features?.bench) tags.unshift('虚拟工位');
    return { s, tags, text: text.toLowerCase(), family: familyOf(prof, s.skill?.domain, jd.title, jd.company) };
  }), [spaces]);

  const famCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of enriched) m.set(e.family, (m.get(e.family) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [enriched]);
  const tagCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of enriched) for (const t of e.tags) m.set(t, (m.get(t) || 0) + 1);
    return ALL_TAGS.filter(t => m.has(t)).map(t => [t, m.get(t)!] as [string, number]);
  }, [enriched]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return enriched.filter(e =>
      (!fam || e.family === fam) &&
      (!marks.length || marks.some(t => e.tags.includes(t))) &&
      (!kw || e.text.includes(kw) || e.tags.some(t => t.toLowerCase().includes(kw)) || e.family.includes(kw)));
  }, [enriched, q, fam, marks]);
  const filtering = !!(q.trim() || fam || marks.length);
  const toggleMark = (t: string) => setMarks(l => l.includes(t) ? l.filter(x => x !== t) : [...l, t]);

  return (
    <>
      {/* 这一页只干活：介绍的话都在首页，这里直接是人和入口。页头压一条深色，跟首页接上 */}
      <style>{`
        .sp-head { position: relative; margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw); width: 100vw; margin-top: -24px; margin-bottom: 22px;
          background: radial-gradient(900px 300px at 18% -40%, rgba(106,92,255,.5), transparent 70%), radial-gradient(700px 260px at 86% 140%, rgba(18,181,203,.32), transparent 70%), #0a0c1a;
          border-bottom: 1px solid rgba(255,255,255,.1); overflow: hidden; }
        .sp-head::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .5;
          background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 44px 44px;
          mask-image: radial-gradient(ellipse 70% 100% at 40% 0%, #000 10%, transparent 75%); -webkit-mask-image: radial-gradient(ellipse 70% 100% at 40% 0%, #000 10%, transparent 75%); }
        .sp-head-in { position: relative; z-index: 1; max-width: 1280px; margin: 0 auto; padding: 34px 28px 22px; display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap; }
        .sp-ask { position: relative; z-index: 1; max-width: 1280px; margin: 0 auto; padding: 0 28px 26px; }
        .sp-ask .row { display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 16px; border-radius: 14px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14); }
        .sp-ask input { flex: 1; min-width: 0; background: none; border: 0; outline: none; color: #fff; font-size: 14.5px; font-family: inherit; }
        .sp-ask input::placeholder { color: rgba(255,255,255,.38); }
        .sp-ask .picks { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); margin-top: 12px; }
        .sp-ask .pick { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 14px; cursor: pointer; background: rgba(9,11,24,.55); border: 1px solid rgba(255,255,255,.12); transition: border-color .2s, transform .2s; }
        .sp-ask .pick:hover { border-color: rgba(159,145,255,.7); transform: translateY(-2px); }
        .sp-ask .pick img { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; object-position: 54% 10%; border: 2px solid rgba(255,255,255,.85); flex-shrink: 0; }
        .sp-ask .pick .go { font-size: 12.5px; font-weight: 700; color: #9f91ff; white-space: nowrap; }
        @media (max-width: 640px) { .sp-ask .row { flex-wrap: wrap; } .sp-ask .row > span { width: 100%; } }
      `}</style>
      <div className="sp-head sp-root">
        <div className="sp-head-in">
          <div style={{ flex: '1 1 340px', minWidth: 0 }}>
            <div className="lab-mono lab-cap" style={{ color: 'rgba(255,255,255,.52)' }}>AI 百业 · 百业空间</div>
            <h1 style={{ margin: '8px 0 6px', fontSize: 'clamp(23px, 3.2vw, 34px)', fontWeight: 900, letterSpacing: -.2, color: '#fff' }}>
              百业已入驻 <span style={{ background: 'linear-gradient(118deg, #9f91ff, #4fe0f2)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{totals?.spaces ?? spaces.length}</span> 位数字职人
            </h1>
            {totals && (
              <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.62)', lineHeight: 1.8 }}>
                {totals.experts > 0 && <>手艺来自{totals.expertPlaces?.length ? `${totals.expertPlaces.slice(0, 3).join('、')}${totals.expertPlaces.length > 3 ? '等地' : ''}` : ''}的 {totals.experts} 个人；</>}
                {totals.served > 0 && <>已经被 {totals.places} 个地方的 {totals.served} 个人用过。</>}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="lab-btn" disabled={!!needMigration} onClick={() => { setPick('jd'); loadJds(); }}>＋ 新岗位 · 从一份 JD 建</button>
            <button className="lab-btn ghost" disabled={!!needMigration} style={{ color: '#e7e9f8', background: 'rgba(255,255,255,.1)', boxShadow: '0 0 0 1px rgba(255,255,255,.2)' }} onClick={() => setPick('career')}>＋ 新职业 · 只给一个职业名</button>
          </div>
        </div>
        {/* 平行解决别人的问题：不用先猜该进哪个空间 */}
        <div className="sp-ask">
          <div className="row">
            <span className="lab-mono" style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, letterSpacing: '.12em', whiteSpace: 'nowrap' }}>我有个问题</span>
            <input value={ask} onChange={e => setAsk(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !asking) routeProblem(); }}
              placeholder="一句话说清楚，比如：狗一出门就暴冲拉绳 / 新产线焊缝老有气孔 / 婚礼当天新娘礼服开线了" />
            <button className="lab-btn sm" disabled={asking || ask.trim().length < 4} onClick={routeProblem}>{asking ? '在找人…' : '找谁帮忙 →'}</button>
          </div>
          {picks && (
            <div className="picks">
              {picks.length === 0 && <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 13 }}>在岗的人里暂时没有对口的。可以换个说法，或者用上面的「新职业」造一位。</div>}
              {picks.map(p => (
                <div key={p.id} className="pick" onClick={() => handTo(p.id)}>
                  {p.avatar && <img src={p.avatar} alt="" />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="lab-mono" style={{ fontSize: 10, letterSpacing: '.1em', color: '#9f91ff' }}>{p.name}{p.expert ? ' · 有真人专家校正' : ' · AI 草案'}</div>
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: '#fff' }}>{p.role}<span style={{ fontWeight: 500, color: 'rgba(255,255,255,.5)', fontSize: 12 }}> · {p.profession}</span></div>
                    <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.7)', marginTop: 2 }}>{p.why}</div>
                  </div>
                  <span className="go">交给他 →</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {needMigration && (
        <div className="lab-glass" style={{ padding: '14px 18px', marginBottom: 20, borderColor: '#ffd591', background: 'rgba(255,247,230,.85)' }}>
          <b>还差一步：</b>{needMigration}。执行后刷新本页即可（这份 SQL 同时包含「生产线任务历史」的表）。
        </div>
      )}


      {/* 四十来号人之后，列表得能捞：搜一个词、挑一个领域、勾几个标记 */}
      {spaces.length > 3 && (
        <div className="lab-glass" style={{ padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="lab-input" value={q} onChange={e => setQ(e.target.value)}
              placeholder="搜人、职业、企业、城市、技能——如：焊 / 星巴克 / 上海 / 潜水"
              style={{ flex: '1 1 280px', minWidth: 0, padding: '9px 14px', borderRadius: 12, border: '1px solid var(--line)', fontSize: 14, outline: 'none', background: '#fff' }}
            />
            <select
              value={fam} onChange={e => setFam(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 12, border: '1px solid var(--line)', fontSize: 13.5, background: '#fff', color: fam ? 'var(--v)' : 'var(--ink2)', fontWeight: fam ? 700 : 400, outline: 'none', cursor: 'pointer' }}
            >
              <option value="">全部行业 · {spaces.length}</option>
              {famCount.map(([f, n]) => <option key={f} value={f}>{f} · {n}</option>)}
            </select>
            {filtering && <button className="lab-btn sm ghost" onClick={() => { setQ(''); setFam(''); setMarks([]); }}>清空</button>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 11 }}>
            {tagCount.map(([t, n]) => {
              const on = marks.includes(t);
              const feat = FEATURE_TAGS.includes(t);
              return (
                <button
                  key={t} onClick={() => toggleMark(t)}
                  className={`lab-chip${on ? (feat ? ' c' : '') : ' g'}`}
                  style={{ cursor: 'pointer', fontSize: 12.5, padding: '5px 11px', border: on ? '1px solid var(--v)' : undefined, background: on && !feat ? 'rgba(106,92,255,.14)' : undefined, color: on && !feat ? 'var(--v)' : undefined, fontWeight: on ? 700 : 400 }}
                >
                  {t}<span className="lab-mono" style={{ opacity: .55, marginLeft: 5 }}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="lab-mono lab-cap" style={{ marginBottom: 10 }}>SPACES · {shown.length}{filtering ? ` / ${spaces.length}` : ''}</div>
      {loading ? (
        <div className="lab-glass lab-scan" style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}><span className="lab-mono">LOADING<span className="lab-dots" /></span></div>
      ) : spaces.length === 0 ? (
        <div className="lab-glass" style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)', lineHeight: 2 }}>
          这里还没有技能空间。<br />点上面的「<b style={{ color: 'var(--v)' }}>从岗位 JD 构建新空间</b>」，选一份 JD，看它被拆解成一个空间。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))' }}>
          {shown.map(({ s, tags: mk }, i) => {
            const jd = s.jd_snapshot || {};
            const kind = SKILL_KIND[s.skill?.kind];
            const profile = s.profile || {};
            const lv = expertiseLevel(s.skill);
            return (
              <div key={s.id} className="lab-glass hover lab-in" style={{ padding: 22, animationDelay: `${i * 90}ms`, minWidth: 0, position: 'relative' }} onClick={() => router.push(`/lab/${s.id}`)}>
                <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 12, top: 12, zIndex: 2 }}>
                  <Popconfirm title="删除这个技能空间？" description={<>作答、账本和蒸馏出的技能会一起删除。<br />预置示范删掉后可以重新构建。</>} onConfirm={() => removeSpace(s.id)} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                    <button title="删除空间" style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--line)', background: 'rgba(255,255,255,.7)', color: 'var(--ink3)', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  </Popconfirm>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  {/* 人就是人：不套转圈。这么小的圆里转着彩环，看起来就是闪屏 */}
                  {profile.avatar ? (
                    <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
                      <div style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: 'radial-gradient(circle at 50% 36%, rgba(167,155,255,.4), rgba(18,181,203,.14) 62%, transparent 76%)' }} />
                      <img src={profile.avatar} alt="" style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', objectPosition: '54% 10%', border: '2px solid rgba(255,255,255,.95)', boxShadow: '0 6px 18px rgba(60,45,130,.18)', background: 'rgba(255,255,255,.6)' }} />
                    </div>
                  ) : (
                    <div className="lab-orb" style={{ ['--s' as string]: '76px' }}>
                      <div className="ring" /><div className="core lab-mono" style={{ fontSize: 10 }}>Lv{lv.level}</div><div className="sat" />
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="lab-mono lab-cap">{profile.name || profile.codename || 'JD-CORE'}{profile.name && profile.codename ? ` · ${profile.codename}` : ''}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.35 }}>{profile.name ? <>{profile.name} <span style={{ color: 'var(--v)' }}>· {profile.role}</span></> : <>{jd.company} · {jd.title}</>}</div>
                    {profile.name && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 1 }}>{jd.company} · {jd.title}</div>}
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>{jd.kind === 'career' ? <span className="lab-chip c" style={{ marginRight: 6 }}>职业探索 · {jd.career?.profession}</span> : jd.job_req_id ? `职位 ID ${jd.job_req_id} · ` : ''}{jd.location}</div>
                  </div>
                </div>

                {profile.tagline && <div style={{ margin: '14px 0 10px', fontSize: 15, fontWeight: 600, color: 'var(--ink2)' }}>「{profile.tagline}」</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(profile.capabilities || []).slice(0, 5).map((c: string) => <span key={c} className="lab-chip">{c}</span>)}
                </div>

                <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {s.skill ? <><span className={`lab-chip ${s.skill.kind === 'hard' ? 'c' : 'p'}`}>{kind?.label}</span>{s.skill.source === 'jd-draft' ? <>AI 自学草案 · 等待第一位专家校正</> : <>已向 {s.skill.expert_name}（{s.skill.expert_location}）学习</>}</> : <span className="lab-chip g">只读过 JD，等待第一位专家</span>}
                  {mk.filter(t => t !== '真实 JD' && t !== '职业探索').slice(0, 4).map(t => <span key={t} className="lab-chip g" style={{ marginLeft: 2 }}>{t}</span>)}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', textAlign: 'center', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                  {[['考验新人', s.stats.rookies], ['解决问题', s.stats.solved], ['服务人次', s.stats.served], ['跨越地点', s.stats.places]].map(([k, v]) => (
                    <div key={k as string}><div className="lab-mono" style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0 }}>{v}</div><div style={{ fontSize: 11, color: 'var(--ink3)' }}>{k}</div></div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && spaces.length > 0 && shown.length === 0 && (
        <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', lineHeight: 2 }}>
          没有符合条件的数字人。<button className="lab-btn sm ghost" style={{ marginLeft: 10 }} onClick={() => { setQ(''); setFam(''); setMarks([]); }}>清空筛选</button>
        </div>
      )}

      <Modal title={null} open={!!pick} onCancel={() => setPick(null)} footer={null} width={860} styles={{ container: { padding: 0, background: '#f5f6ff', borderRadius: 24, overflow: 'hidden' } }}>
        <div className="lab" style={{ minHeight: 0, padding: 'clamp(16px, 3vw, 28px)' }}>
          <div className="lab-mono lab-cap">{pick === 'career' ? 'ANY CAREER' : 'PICK A JD'}</div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 4px' }}>{pick === 'career' ? '输入一个职业，把它变成空间' : '选一份 JD，构建它的技能空间'}</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink3)', marginBottom: 14 }}>{pick === 'career' ? '不需要 JD。适合还没有具体岗位、只想先看看这一行在干什么的人。' : 'JD 来自岗位库，抓取自企业官方招聘站。'}</div>

          {pick === 'jd' && <>
          <div className="lab-glass" style={{ padding: 16, marginBottom: 18, borderColor: 'rgba(106,92,255,.35)' }}>
            <div className="lab-mono lab-cap" style={{ marginBottom: 6 }}>ANY JD · 岗位 AI 自己生成</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink2)', marginBottom: 10, lineHeight: 1.7 }}>在岗位库里任选一条 JD：岗位 AI 读完后自己生成 <b>技能集草案</b>、<b>检验故事线</b>、<b>虚拟操作空间</b> 和场景美术（约 2–4 分钟）。</div>
            <input className="lab-input" value={jobQ} onChange={e => searchJobs(e.target.value)} placeholder="搜企业或岗位名，如：华为 软件 / 比亚迪 工艺 / 字节 运营" style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid var(--line)', fontSize: 14, outline: 'none', background: '#fff' }} />
            {jobsLoading && <div className="lab-mono" style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>SEARCHING<span className="lab-dots" /></div>}
            {!jobsLoading && jobQ.trim().length >= 2 && !jobs.length && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 8 }}>没有找到带职责正文的岗位，换个词试试。</div>}
            {jobs.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginTop: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                {jobs.map(j => (
                  <div key={j.id} className="lab-glass hover" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => buildFromJob(j)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{j.institute_or_company_name}{j.location ? ` · ${j.location}` : ''}{j.program_name ? ` · ${j.program_name}` : ''}</div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{j.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(j.responsibilities || j.overview || '').replace(/\s+/g, ' ').slice(0, 90)}</div>
                    </div>
                    <button className="lab-btn sm">构建空间 →</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="lab-mono lab-cap" style={{ marginBottom: 10 }}>DEMO JDS · 预置示范</div>
          {jdsLoading && <div className="lab-glass lab-scan" style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="lab-mono" style={{ color: 'var(--ink3)' }}>LOADING<span className="lab-dots" /></span></div>}
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
            {jds.map((jd, i) => (
              <div key={jd.slug} className="lab-glass hover lab-in" style={{ padding: 20, animationDelay: `${i * 80}ms`, display: 'flex', flexDirection: 'column' }} onClick={() => build(jd)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18, background: 'linear-gradient(135deg, var(--v), var(--c))' }}>{jd.company.slice(0, 1)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{jd.company} · {jd.company_en}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.35 }}>{jd.title}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 10px' }}>
                  <span className="lab-chip g">职位 ID {jd.job_req_id}</span><span className="lab-chip g">{jd.location}</span><span className="lab-chip g">{jd.program_name}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.75, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-line', flex: 1 }}>{jd.responsibilities}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                  <a href={jd.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 12.5, color: 'var(--v)' }}>官方 JD 原文 ↗</a>
                  <button className={`lab-btn sm${jd.space_id ? ' ghost' : ''}`}>{jd.space_id ? '已构建 · 进入空间' : '构建空间 →'}</button>
                </div>
              </div>
            ))}
          </div>
          </>}

          {pick === 'career' && <>
            <div className="lab-glass" style={{ padding: 18, marginBottom: 16, borderColor: 'rgba(18,181,203,.4)' }}>
              <div style={{ fontSize: 13.5, color: 'var(--ink2)', marginBottom: 12, lineHeight: 1.75 }}>
                只给一个职业名，AI 会先把它结构化成<b>典型岗位 + 技能树 + 生涯地图</b>，再生成和 JD 路径同样的故事线与虚拟工位（约 2–4 分钟）。
                难度比校招题降一档，术语随手解释——没入行的人也能把这个职业最有代表性的一天走完。
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="lab-input" autoFocus value={profession} onChange={e => setProfession(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && profession.trim()) buildFromJob(null, profession.trim()); }} placeholder="输入一个职业，如：无人机飞手 / 临床营养师 / 游戏关卡策划" style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--line)', fontSize: 14, outline: 'none', background: '#fff' }} />
                <button className="lab-btn" disabled={!profession.trim()} onClick={() => buildFromJob(null, profession.trim())}>生成探索空间 →</button>
              </div>
            </div>
            <div className="lab-mono lab-cap" style={{ marginBottom: 10 }}>换一个试试</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['咖啡师', '蛋糕裱花师', '无人机飞手', '临床营养师', '游戏关卡策划', '汽车工艺工程师', '宠物医生', '民航机务维修', '景观设计师', '韣带康复治疗师'].map(t => (
                <button key={t} className="lab-chip c" style={{ cursor: 'pointer', fontSize: 13, padding: '6px 13px' }} onClick={() => setProfession(t)}>{t}</button>
              ))}
            </div>
          </>}
        </div>
      </Modal>
    </>
  );
}
