'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { App, Drawer, Popconfirm } from 'antd';
import { useModel } from '@/lib/model-context';
import { useUser } from '@/lib/user-context';
import { SimRunner, TraceCompare } from '@/components/lab/SimRunner';
import { traceToText, type Sim, type SimTrace } from '@/lib/skill-sim';
import { INVOCATION_KIND, SKILL_KIND, expertiseLevel, scoreColor, scoreLevel, tzLabel, type InterviewTurn, type RubricItem } from '@/lib/skill-lab';

type Mode = 'test' | 'learn' | 'solve' | 'ledger' | 'jd';

const MODES: { key: Mode; label: string; icon: string }[] = [
  { key: 'test', label: '考验新人', icon: '🎯' },
  { key: 'learn', label: '向专家学习', icon: '🧠' },
  { key: 'solve', label: '解决问题', icon: '⚡' },
  { key: 'ledger', label: '错位时空', icon: '🌐' },
  { key: 'jd', label: 'JD 拆解', icon: '🧬' },
];

/** 打字机：新产出逐字浮现 */
function useTypewriter(text: string, enabled: boolean) {
  const [shown, setShown] = useState(enabled ? '' : text);
  useEffect(() => {
    if (!enabled) { setShown(text); return; }
    setShown('');
    let i = 0;
    const iv = setInterval(() => { i += Math.max(2, Math.round(text.length / 180)); setShown(text.slice(0, i)); if (i >= text.length) clearInterval(iv); }, 16);
    return () => clearInterval(iv);
  }, [text, enabled]);
  return { shown, done: shown.length >= text.length };
}

function ScoreRing({ score, size = 72 }: { score: number | null; size?: number }) {
  const r = size / 2 - 6, c = 2 * Math.PI * r, v = score ?? 0;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(106,92,255,.12)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColor(score)} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.3} fontWeight="800" fill="#171a2e">{score ?? '—'}</text>
    </svg>
  );
}

const fmt = (iso: string, tz?: number | null) => {
  const d = new Date(new Date(iso).getTime() + (tz ?? 8) * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const hhmm = (iso: string, tz?: number | null) => fmt(iso, tz).slice(11);

function SolveOutput({ text, fresh }: { text: string; fresh: boolean }) {
  const { shown, done } = useTypewriter(text, fresh);
  return <div className={`lab-pre${done ? '' : ' lab-caret'}`}>{shown}</div>;
}

export default function SpacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const { currentModel } = useModel();
  const { user } = useUser();

  const [space, setSpace] = useState<any>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [invs, setInvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('test');
  const [busy, setBusy] = useState('');             // 正在做什么（AI 核心进入 busy 动效）
  const [openSub, setOpenSub] = useState<any>(null);
  const [freshId, setFreshId] = useState('');

  // 考验新人
  const [rookie, setRookie] = useState({ name: '', note: '', location: '', answer: '' });
  const [answering, setAnswering] = useState(false);
  // 向专家学习
  const [expert, setExpert] = useState({ name: '', title: '', location: '' });
  const [walk, setWalk] = useState('');
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [reply, setReply] = useState('');
  const [learnStep, setLearnStep] = useState<0 | 1 | 2>(0); // 0 档案 · 1 走一遍 · 2 追问
  const [enough, setEnough] = useState(false);
  const [expertTrace, setExpertTrace] = useState<SimTrace | null>(null);
  // 解决问题
  const [prob, setProb] = useState({ actor: '', location: '', context: '', problem: '' });
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const json = await (await fetch(`/api/lab/spaces/${id}`)).json();
      if (!json.ok) throw new Error(json.error);
      setSpace(json.space); setSubs(json.submissions); setInvs(json.invocations);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [id, message]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [turns]);

  const post = async (path: string, body: Record<string, unknown>) => {
    const json = await (await fetch(`/api/lab/spaces/${id}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, model: currentModel, tz: -new Date().getTimezoneOffset() / 60 }) })).json();
    if (!json.ok) throw new Error(json.error);
    return json;
  };

  const skill = space?.skill;
  const profile = space?.profile || {};
  const jd = space?.jd_snapshot || {};
  const lv = expertiseLevel(skill);
  const rubric: RubricItem[] = space?.rubric || [];
  const sim: Sim | null = space?.sim?.steps?.length ? space.sim : null;
  const ranked = useMemo(() => [...subs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [subs]);
  const aiBare = subs.filter(s => s.candidate_type === 'ai' && !s.with_skill_id).slice(-1)[0];
  const aiSkill = subs.filter(s => s.candidate_type === 'ai' && s.with_skill_id).slice(-1)[0];
  const solves = invs.filter(i => i.kind === 'solve').reverse();

  // ── 动作 ──
  const submit = async (m: 'human' | 'ai', withSkill = false, trace?: SimTrace) => {
    if (m === 'human' && !trace && rookie.answer.trim().length < 20) { message.warning('先把任务走一遍，至少写几句'); return; }
    setBusy(m === 'ai' ? (withSkill ? 'AI 核心正在亲自走一遍' : '未装配技能的通用模型正在走一遍') : 'AI 核心正在按岗位标准评分');
    try {
      const json = await post('submit', m === 'ai' ? { mode: 'ai', withSkill } : { mode: 'human', ...rookie, trace });
      setFreshId(json.submission.id);
      await load();
      setOpenSub(json.submission);
      if (m === 'human') { setAnswering(false); setRookie(r => ({ ...r, answer: '' })); }
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const askNext = async (nextTurns: InterviewTurn[]) => {
    setBusy('AI 核心正在想下一个问题');
    try {
      const json = await post('interview', { turns: nextTurns, walkthrough: walk });
      setTurns([...nextTurns, { role: 'ai', content: json.question }]);
      setEnough(json.enough || nextTurns.filter(t => t.role === 'expert').length >= 5);
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const startInterview = async () => {
    if (walk.trim().length < 30) { message.warning('请专家先把任务走一遍'); return; }
    setLearnStep(2);
    await askNext([]);
  };

  /** 专家在操作台上走完：轨迹被 AI 核心记录下来，接着围绕轨迹追问 */
  const expertFinished = async (trace: SimTrace) => {
    if (!sim) return;
    const transcript = traceToText(sim, trace);
    setExpertTrace(trace); setWalk(transcript); setLearnStep(2);
    setBusy('AI 核心正在回看专家的每一步操作');
    try {
      const json = await post('interview', { turns: [], walkthrough: transcript });
      setTurns([{ role: 'ai', content: json.question }]);
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const answerTurn = async () => {
    if (!reply.trim()) return;
    const next: InterviewTurn[] = [...turns, { role: 'expert', content: reply.trim() }];
    setTurns(next); setReply('');
    await askNext(next);
  };

  const distill = async () => {
    setBusy('AI 核心正在吸收专家的经验');
    try {
      // 专家走的这一遍也留痕（同一套标准评分，作为参考答案）
      await post('submit', { mode: 'expert', name: expert.name, note: expert.title, location: expert.location, answer: walk, trace: expertTrace }).catch(() => null);
      await post('distill', { turns: turns.filter((t, i) => !(i === turns.length - 1 && t.role === 'ai')), walkthrough: walk, trace: expertTrace, expert: { ...expert, tz: -new Date().getTimezoneOffset() / 60 }, createdBy: user?.email });
      message.success('吸收完成，专业度提升');
      setLearnStep(0); setTurns([]); setWalk(''); setEnough(false); setExpertTrace(null);
      await load();
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const solve = async () => {
    if (prob.problem.trim().length < 10) { message.warning('把问题说具体一点'); return; }
    setBusy('AI 核心正在用学到的能力解决问题');
    try {
      const json = await post('solve', prob);
      setFreshId(json.invocation.id);
      setProb(p => ({ ...p, problem: '' }));
      await load();
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const remove = async () => {
    const json = await (await fetch(`/api/lab/spaces/${id}`, { method: 'DELETE' })).json();
    if (json.ok) router.push('/lab'); else message.error(json.error);
  };

  if (loading) return <div className="lab-glass lab-scan" style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="lab-mono" style={{ color: 'var(--ink3)' }}>ENTERING SPACE<span className="lab-dots" /></span></div>;
  if (!space) return <div className="lab-glass" style={{ padding: 48, textAlign: 'center' }}>空间不存在</div>;

  const Label = ({ children }: { children: React.ReactNode }) => <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>{children}</div>;
  const field = (v: string, on: (s: string) => void, ph: string) => <input className="lab-input" style={{ padding: '9px 12px', fontSize: 14 }} value={v} onChange={e => on(e.target.value)} placeholder={ph} />;

  // 账本指标
  const origin = skill?.distilled_at;
  const spanDays = origin && invs.length ? Math.max(0, Math.round((new Date(invs[invs.length - 1].occurred_at).getTime() - new Date(origin).getTime()) / 86400_000)) : 0;
  const places = new Set(invs.map(i => i.actor_location).filter(Boolean)).size;
  const served = invs.reduce((a, i) => a + (i.volume || 1), 0);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <button className="lab-btn ghost sm" onClick={() => router.push('/lab')}>← 全部空间</button>
        <Popconfirm title="删除这个技能空间？" description="作答、账本和蒸馏出的技能会一起删除。" onConfirm={remove} okText="删除" okButtonProps={{ danger: true }} cancelText="取消"><button className="lab-btn ghost sm">删除空间</button></Popconfirm>
      </div>

      {/* ══════ AI 核心 + 档案 ══════ */}
      <section className={`lab-glass lab-in${busy ? ' lab-scan' : ''}`} style={{ padding: 'clamp(18px, 3vw, 30px)', display: 'flex', gap: 'clamp(18px, 3vw, 36px)', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flex: '0 0 auto', margin: '0 auto' }}>
          <div className={`lab-orb${busy ? ' busy' : ''}`} style={{ ['--s' as string]: '172px' }}>
            <div className="ring" /><div className="ring r2" /><div className="core lab-mono" style={{ fontSize: 13 }}>{profile.codename || 'JD-CORE'}</div><div className="sat" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map(n => <span key={n} style={{ width: 22, height: 5, borderRadius: 3, background: n <= lv.level ? 'linear-gradient(90deg, var(--v), var(--c))' : 'rgba(106,92,255,.14)' }} />)}
            </div>
            <div className="lab-mono lab-cap" style={{ marginTop: 6 }}>专业度 LV.{lv.level}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{lv.label}</div>
          </div>
        </div>

        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <div className="lab-mono lab-cap">AI CORE PROFILE</div>
          <h1 style={{ margin: '4px 0 2px', fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 800, lineHeight: 1.3 }}>{jd.company} · {jd.title}</h1>
          <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
            {jd.job_req_id && <>职位 ID {jd.job_req_id} · </>}{jd.location}
            {jd.url && <> · <a href={jd.url} target="_blank" rel="noreferrer" style={{ color: 'var(--v)' }}>官方 JD 原文 ↗</a></>}
          </div>
          <div style={{ margin: '14px 0', fontSize: 16, fontWeight: 600, color: 'var(--ink2)', minHeight: 26 }}>
            {busy ? <span style={{ color: 'var(--v)' }}>{busy}<span className="lab-dots" /></span> : profile.tagline ? `「${profile.tagline}」` : '我是拥有这份 JD 技能的员工 AI。'}
          </div>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div>
              <Label>我会什么</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{(profile.capabilities || []).map((c: string) => <span key={c} className="lab-chip">{c}</span>)}</div>
              {skill && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.7 }}>
                <span className={`lab-chip ${skill.kind === 'hard' ? 'c' : 'p'}`} style={{ marginRight: 6 }}>{SKILL_KIND[skill.kind]?.label}</span>
                「{skill.name}」学自 <b style={{ color: 'var(--ink2)' }}>{skill.expert_name}</b>（{skill.expert_location}）
              </div>}
            </div>
            <div>
              <Label>我能解决什么问题</Label>
              {(profile.can_solve?.length ? profile.can_solve : skill?.card?.scenarios || []).slice(0, 4).map((q: string) => (
                <div key={q} onClick={() => { setMode('solve'); setProb(p => ({ ...p, problem: q.replace(/[「」]/g, '') })); }} style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.9, cursor: 'pointer' }}>▸ {q}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════ 模式 ══════ */}
      <div className="lab-tabs" style={{ margin: '20px 0 16px' }}>
        {MODES.map(m => <div key={m.key} className={`lab-tab${mode === m.key ? ' on' : ''}`} onClick={() => setMode(m.key)}><span>{m.icon}</span>{m.label}</div>)}
      </div>

      {/* ── 考验新人 ── */}
      {mode === 'test' && answering && sim && (
        <div className="lab-in">
          <div className="lab-glass" style={{ padding: '14px 18px', marginBottom: 14, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {field(rookie.name, v => setRookie(r => ({ ...r, name: v })), '新兵姓名')}
            {field(rookie.note, v => setRookie(r => ({ ...r, note: v })), '背景（学校 / 专业）')}
            {field(rookie.location, v => setRookie(r => ({ ...r, location: v })), '所在地（如 伦敦）')}
          </div>
          <SimRunner sim={sim} role="rookie" busy={!!busy} onCancel={() => setAnswering(false)} onFinish={trace => submit('human', false, trace)} />
        </div>
      )}

      {mode === 'test' && !(answering && sim) && (
        <div className="lab-in" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', alignItems: 'start' }}>
          <div className="lab-glass" style={{ padding: 22, minWidth: 0 }}>
            <Label>THE TASK · {space.time_limit_min} MIN</Label>
            <h2 style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 800, lineHeight: 1.4 }}>{space.title}</h2>
            <div className="lab-pre">{space.brief}</div>
            {space.materials && <div className="lab-mono" style={{ marginTop: 14, padding: 14, borderRadius: 14, background: 'rgba(23,26,46,.04)', fontSize: 12.5, lineHeight: 1.9, whiteSpace: 'pre-wrap', letterSpacing: 0, overflowX: 'auto', color: 'var(--ink2)' }}>{space.materials}</div>}
            {space.deliverable && <div style={{ marginTop: 14, fontSize: 13.5 }}><b>交付物：</b>{space.deliverable}</div>}

            {!answering ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                <button className="lab-btn" disabled={!!busy} onClick={() => setAnswering(true)}>🎯 {sim ? '让新兵上操作台走一遍' : '让新兵走一遍'}</button>
                <button className="lab-btn ghost" disabled={!!busy} onClick={() => submit('ai', false)}>让通用 AI {sim ? '上台操作' : '裸答'}</button>
                <button className="lab-btn ghost" disabled={!!busy || !skill} title={skill ? '' : '先让专家来教一遍'} onClick={() => submit('ai', true)}>让 AI 核心亲自{sim ? '操作' : '答'}</button>
              </div>
            ) : (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  {field(rookie.name, v => setRookie(r => ({ ...r, name: v })), '新兵姓名')}
                  {field(rookie.note, v => setRookie(r => ({ ...r, note: v })), '背景（学校 / 专业）')}
                  {field(rookie.location, v => setRookie(r => ({ ...r, location: v })), '所在地（如 伦敦）')}
                </div>
                <textarea className="lab-input" rows={9} value={rookie.answer} onChange={e => setRookie(r => ({ ...r, answer: e.target.value }))} placeholder="在这里完成任务……" />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="lab-btn" disabled={!!busy} onClick={() => submit('human')}>{busy ? <>评分中<span className="lab-dots" /></> : '提交，请 AI 核心评分'}</button>
                  <button className="lab-btn ghost" disabled={!!busy} onClick={() => setAnswering(false)}>取消</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {(aiBare || aiSkill) && (
              <div className="lab-glass" style={{ padding: 20 }}>
                <Label>SAME MODEL · BEFORE / AFTER LEARNING</Label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 12, textAlign: 'center' }}>
                  <div onClick={() => aiBare && setOpenSub(aiBare)} style={{ cursor: aiBare ? 'pointer' : 'default' }}><ScoreRing score={aiBare?.score ?? null} size={84} /><div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>通用 AI 裸答</div></div>
                  <div className="lab-mono" style={{ fontSize: 22, color: 'var(--v)', fontWeight: 800 }}>{aiBare && aiSkill ? `+${Math.round(aiSkill.score - aiBare.score)}` : '→'}</div>
                  <div onClick={() => aiSkill && setOpenSub(aiSkill)} style={{ cursor: aiSkill ? 'pointer' : 'default' }}><ScoreRing score={aiSkill?.score ?? null} size={84} /><div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>学过专家之后</div></div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', marginTop: 10 }}>同一个模型、同一道题。差的不是知识，是专家的判断纪律。</div>
              </div>
            )}

            <div className="lab-glass" style={{ padding: 20 }}>
              <Label>LEADERBOARD · {subs.length}</Label>
              {ranked.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13, padding: '12px 0' }}>还没有人走过这道题。</div>}
              {ranked.map((s, i) => (
                <div key={s.id} onClick={() => setOpenSub(s)} className={s.id === freshId ? 'lab-in' : ''} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}>
                  <span className="lab-mono" style={{ width: 22, color: 'var(--ink3)', fontSize: 12 }}>{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.candidate_name} {s.candidate_type === 'ai' && <span className="lab-chip c" style={{ marginLeft: 4, fontSize: 10.5, padding: '1px 7px' }}>AI</span>}{s.candidate_type === 'expert' && <span className="lab-chip p" style={{ marginLeft: 4, fontSize: 10.5, padding: '1px 7px' }}>专家</span>}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[s.candidate_location, s.candidate_note].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="lab-mono" style={{ fontSize: 20, fontWeight: 800, color: scoreColor(s.score), letterSpacing: 0 }}>{s.score}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{scoreLevel(s.score)}{typeof s.match === 'number' ? ` · 与专家操作吻合 ${s.match}%` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 向专家学习 ── */}
      {mode === 'learn' && (
        <div className="lab-in" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', alignItems: 'start' }}>
          <div className="lab-glass" style={{ padding: 22, minWidth: 0 }}>
            <Label>LEARN FROM AN EXPERT</Label>
            <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800 }}>请一位资深从业者，把这道题走一遍</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--ink3)', lineHeight: 1.8 }}>我会围绕「你为什么这么做」来追问，把你的判断方式吸收成我的能力。{skill ? '我已经学过一位专家，新的经验会叠加上去。' : ''}</p>

            {learnStep === 0 && <>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                {field(expert.name, v => setExpert(e => ({ ...e, name: v })), '专家姓名 / 化名')}
                {field(expert.title, v => setExpert(e => ({ ...e, title: v })), '资历（如 前品牌总监 · 12 年）')}
                {field(expert.location, v => setExpert(e => ({ ...e, location: v })), '所在地')}
              </div>
              <button className="lab-btn" style={{ marginTop: 14 }} onClick={() => { if (!expert.name.trim()) { message.warning('请填写专家姓名'); return; } setLearnStep(1); }}>开始 →</button>
            </>}

            {learnStep === 1 && sim && <div style={{ fontSize: 13.5, color: 'var(--v)', fontWeight: 600 }}>操作台已在下方打开 ↓</div>}
            {learnStep === 1 && !sim && <>
              <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 8 }}><b>{expert.name}</b>，请像平时工作那样完成这道题：<b>{space.title}</b>（题目见「考验新人」）</div>
              <textarea className="lab-input" rows={10} value={walk} onChange={e => setWalk(e.target.value)} placeholder="专家的作答……" />
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button className="lab-btn" disabled={!!busy} onClick={startInterview}>走完了，接受追问 →</button>
                <button className="lab-btn ghost" onClick={() => setLearnStep(0)}>返回</button>
              </div>
            </>}

            {learnStep === 2 && <>
              <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
                {turns.map((t, i) => (
                  <div key={i} className="lab-in" style={{ alignSelf: t.role === 'ai' ? 'flex-start' : 'flex-end', maxWidth: '88%', padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.75,
                    background: t.role === 'ai' ? 'rgba(106,92,255,.09)' : 'linear-gradient(120deg, var(--v), #8f7bff)', color: t.role === 'ai' ? 'var(--ink)' : '#fff' }}>{t.content}</div>
                ))}
                {busy && <div className="lab-mono" style={{ fontSize: 12, color: 'var(--v)' }}>{busy}<span className="lab-dots" /></div>}
                <div ref={chatEnd} />
              </div>
              <textarea className="lab-input" style={{ marginTop: 12 }} rows={3} value={reply} onChange={e => setReply(e.target.value)} placeholder="专家的回答……（Ctrl / ⌘ + Enter 发送）"
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') answerTurn(); }} />
              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="lab-btn" disabled={!!busy || !reply.trim()} onClick={answerTurn}>回答</button>
                <button className={`lab-btn${enough ? '' : ' ghost'}`} disabled={!!busy || turns.filter(t => t.role === 'expert').length < 2} onClick={distill}>🧠 让 AI 核心吸收{enough ? '（信息已足够）' : ''}</button>
              </div>
            </>}
          </div>

          <div className="lab-glass" style={{ padding: 22, minWidth: 0, display: learnStep === 1 && sim ? 'none' : undefined }}>
            <Label>WHAT I HAVE LEARNED</Label>
            {!skill ? <div style={{ color: 'var(--ink3)', fontSize: 14, lineHeight: 1.9 }}>我现在只读过 JD，还没有向任何专家学过。<br />没有专家经验之前，我只能按通用标准评分，也无法解决问题。</div> : <>
              <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 800 }}>{skill.name}</h2>
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{skill.expert_name} · {skill.expert_title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>{skill.expert_location} · {fmt(skill.distilled_at, skill.tz_offset)}{skill.expert_note ? ` · ${skill.expert_note}` : ''}</div>
              <p style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 1.8 }}>{skill.summary}</p>

              <Label>做法</Label>
              {(skill.card.steps || []).map((s: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <span className="lab-mono" style={{ color: 'var(--v)', fontWeight: 700, fontSize: 12, paddingTop: 3 }}>{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ fontSize: 13.5, lineHeight: 1.75 }}><b>{s.title}</b><span style={{ color: 'var(--ink3)' }}> —— {s.detail}</span></div>
                </div>
              ))}
              <div style={{ height: 8 }} /><Label>专家的判断规则</Label>
              {(skill.card.rules || []).map((r: string, i: number) => <div key={i} style={{ fontSize: 13.5, lineHeight: 1.75, padding: '7px 12px', marginBottom: 6, borderRadius: 10, borderLeft: '3px solid var(--p)', background: 'rgba(255,95,162,.06)' }}>{r}</div>)}
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 12 }}>
                <div style={{ padding: 12, borderRadius: 12, background: 'rgba(18,161,80,.07)', fontSize: 12.5, lineHeight: 1.75 }}><b style={{ color: '#12a150' }}>好的样子</b><br />{skill.card.good_example}</div>
                <div style={{ padding: 12, borderRadius: 12, background: 'rgba(220,38,38,.06)', fontSize: 12.5, lineHeight: 1.75 }}><b style={{ color: '#dc2626' }}>差的样子</b><br />{skill.card.bad_example}</div>
              </div>
              {sim && skill.expert_trace && (
                <details style={{ marginTop: 14 }} open>
                  <summary className="lab-mono lab-cap" style={{ cursor: 'pointer', marginBottom: 10 }}>我记录下来的专家操作轨迹</summary>
                  <TraceCompare sim={sim} trace={skill.expert_trace} expertTrace={skill.expert_trace} expertName={skill.expert_name} />
                </details>
              )}
              {(skill.interview || []).length > 0 && (
                <details style={{ marginTop: 14 }}>
                  <summary className="lab-mono lab-cap" style={{ cursor: 'pointer' }}>访谈原文 · {(skill.interview || []).length} 轮</summary>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {skill.interview.map((t: InterviewTurn, i: number) => <div key={i} style={{ fontSize: 13, lineHeight: 1.75, color: t.role === 'ai' ? 'var(--v)' : 'var(--ink2)' }}><b>{t.role === 'ai' ? 'AI 核心：' : '专家：'}</b>{t.content}</div>)}
                  </div>
                </details>
              )}
            </>}
          </div>
        </div>
      )}

      {mode === 'learn' && learnStep === 1 && sim && (
        <div className="lab-in" style={{ marginTop: 18 }}>
          <SimRunner sim={sim} role="expert" busy={!!busy} onCancel={() => setLearnStep(0)} onFinish={expertFinished} />
        </div>
      )}

      {/* ── 解决问题 ── */}
      {mode === 'solve' && (
        <div className="lab-in" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', alignItems: 'start' }}>
          <div className={`lab-glass${busy ? ' lab-scan' : ''}`} style={{ padding: 22, minWidth: 0 }}>
            <Label>BRING ME A PROBLEM</Label>
            <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800 }}>把真实问题交给我</h2>
            <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--ink3)', lineHeight: 1.8 }}>{skill ? `${skill.expert_name} 此刻不在场${skill.expert_note ? `（${skill.expert_note}）` : ''}。我会按从他 / 她那里学到的做法来帮你。` : '我还没有向专家学过，暂时解决不了问题。先去「向专家学习」。'}</p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 10 }}>
              {field(prob.actor, v => setProb(p => ({ ...p, actor: v })), '你是谁（如 某小程序运营）')}
              {field(prob.location, v => setProb(p => ({ ...p, location: v })), '你在哪（如 成都）')}
            </div>
            <textarea className="lab-input" rows={6} value={prob.problem} onChange={e => setProb(p => ({ ...p, problem: e.target.value }))} placeholder="你遇到了什么问题？越具体越好。" />
            <button className="lab-btn" style={{ marginTop: 12 }} disabled={!!busy || !skill} onClick={solve}>{busy ? <>解决中<span className="lab-dots" /></> : '⚡ 交给 AI 核心'}</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {solves.length === 0 && <div className="lab-glass" style={{ padding: 28, color: 'var(--ink3)', textAlign: 'center' }}>还没有人带问题来。</div>}
            {solves.map(s => (
              <div key={s.id} className="lab-glass lab-in" style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                  <span className="lab-chip p">{s.actor}</span>
                  <span className="lab-chip g">{s.actor_location} · {fmt(s.occurred_at, s.tz_offset)}</span>
                </div>
                {s.context && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>{s.context}</div>}
                <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(23,26,46,.045)', fontSize: 14, lineHeight: 1.75, marginBottom: 12 }}><b>问：</b>{s.input}</div>
                <SolveOutput text={s.output || ''} fresh={s.id === freshId} />
                {s.output_summary && <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--v)', fontWeight: 600 }}>✓ {s.output_summary}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 错位时空 ── */}
      {mode === 'ledger' && (
        <div className="lab-in">
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 18 }}>
            {[['跨越天数', spanDays, 'DAYS'], ['跨越地点', places, 'PLACES'], ['调用次数', invs.length, 'CALLS'], ['服务人次', served, 'PEOPLE']].map(([k, v, en]) => (
              <div key={k as string} className="lab-glass" style={{ padding: '16px 18px' }}>
                <div className="lab-mono lab-cap">{en}</div>
                <div className="lab-mono" style={{ fontSize: 34, fontWeight: 800, letterSpacing: 0, background: 'linear-gradient(120deg, var(--v), var(--c))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{v}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{k}</div>
              </div>
            ))}
          </div>

          <div className="lab-glass" style={{ padding: 'clamp(16px, 3vw, 26px)' }}>
            {!skill ? <div style={{ color: 'var(--ink3)' }}>还没有蒸馏出技能，账本是空的。</div> : (
              <div style={{ position: 'relative', paddingLeft: 26 }}>
                <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: 'linear-gradient(180deg, var(--v), var(--c), var(--p))', opacity: .5 }} />
                <div style={{ position: 'relative', marginBottom: 22 }}>
                  <span style={{ position: 'absolute', left: -26, top: 3, width: 16, height: 16, borderRadius: 8, background: 'var(--v)', boxShadow: '0 0 0 5px rgba(106,92,255,.18)' }} />
                  <div className="lab-mono lab-cap">ORIGIN · {fmt(skill.distilled_at, skill.tz_offset)} · {skill.expert_location} {tzLabel(skill.tz_offset)}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{skill.expert_name} 的「{skill.name}」在这里被蒸馏</div>
                  <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{skill.expert_title}{skill.expert_note ? ` · 现状：${skill.expert_note}` : ''}</div>
                </div>
                {invs.map((v, i) => {
                  const days = Math.round((new Date(v.occurred_at).getTime() - new Date(skill.distilled_at).getTime()) / 86400_000);
                  const k = INVOCATION_KIND[v.kind] || { label: v.kind };
                  return (
                    <div key={v.id} className="lab-in" style={{ position: 'relative', marginBottom: 18, animationDelay: `${i * 60}ms` }}>
                      <span style={{ position: 'absolute', left: -24, top: 5, width: 12, height: 12, borderRadius: 6, background: '#fff', border: '3px solid var(--c)' }} />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="lab-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--v)' }}>+{days} 天</span>
                        <span className={`lab-chip ${v.kind === 'solve' ? 'p' : v.kind === 'batch' ? 'c' : ''}`}>{k.label}{v.volume > 1 ? ` × ${v.volume}` : ''}</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{v.actor}</span>
                      </div>
                      <div className="lab-mono" style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '4px 0', letterSpacing: '.02em' }}>
                        {v.actor_location || '—'} 当地 {hhmm(v.occurred_at, v.tz_offset)} {tzLabel(v.tz_offset)} ｜ 此刻专家所在的 {skill.expert_location} 是 {hhmm(v.occurred_at, skill.tz_offset)}
                      </div>
                      {v.context && <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.7 }}>{v.context}</div>}
                      <div style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.75 }}>→ {v.output_summary}</div>
                    </div>
                  );
                })}
                {invs.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>还没有调用记录。去「考验新人」或「解决问题」用一次，这里就会多一笔。</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── JD 拆解 ── */}
      {mode === 'jd' && (
        <div className="lab-in" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', alignItems: 'start' }}>
          <div className="lab-glass" style={{ padding: 22, minWidth: 0 }}>
            <Label>SOURCE JD{jd.fetched_at ? ` · 抓取于 ${jd.fetched_at}` : ''}</Label>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>{jd.company} · {jd.title}</h2>
            {jd.url && <a href={jd.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--v)', wordBreak: 'break-all' }}>{jd.url}</a>}
            <div style={{ marginTop: 14 }}><Label>岗位职责</Label><div className="lab-pre" style={{ fontSize: 13.5 }}>{jd.responsibilities}</div></div>
            <div style={{ marginTop: 14 }}><Label>任职要求</Label><div className="lab-pre" style={{ fontSize: 13.5 }}>{jd.qualifications}</div></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            <div className="lab-glass" style={{ padding: 22 }}>
              <Label>BREAKDOWN · 职责原句 → 能力 → 可检验的任务</Label>
              {(space.jd_breakdown || []).map((b: any, i: number) => (
                <div key={i} style={{ padding: '12px 14px', marginBottom: 10, borderRadius: 14, border: b.chosen ? '1.5px solid rgba(106,92,255,.5)' : '1px solid var(--line)', background: b.chosen ? 'rgba(106,92,255,.06)' : 'transparent' }}>
                  <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.7 }}>「{b.duty}」</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                    <span className="lab-chip">{b.capability}</span>
                    <span style={{ fontSize: 13.5, color: 'var(--ink2)' }}>→ {b.task_idea}</span>
                    {b.chosen && <span className="lab-chip p">本空间检验这一条</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="lab-glass" style={{ padding: 22 }}>
              <Label>RUBRIC · 评分标准</Label>
              {rubric.map(r => (
                <div key={r.key} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="lab-mono" style={{ width: 34, fontWeight: 800, color: 'var(--v)', letterSpacing: 0 }}>{r.weight}</span>
                  <div style={{ fontSize: 13.5, lineHeight: 1.7 }}><b>{r.name}</b><div style={{ color: 'var(--ink3)', fontSize: 12.5 }}>{r.description}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════ 评分报告 ══════ */}
      <Drawer open={!!openSub} onClose={() => setOpenSub(null)} size={Math.min(760, typeof window !== 'undefined' ? window.innerWidth : 760)} title={null} closable={false} styles={{ body: { padding: 0, background: '#f5f6ff' } }}>
        {openSub && (
          <div className="lab" style={{ minHeight: '100%', padding: 22 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <ScoreRing score={openSub.human_score ?? openSub.score} size={92} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lab-mono lab-cap">COMPETENCY REPORT</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{openSub.candidate_name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{[openSub.candidate_location, openSub.candidate_note, fmt(openSub.submitted_at)].filter(Boolean).join(' · ')}</div>
                <span className="lab-chip" style={{ marginTop: 6, color: scoreColor(openSub.score) }}>{scoreLevel(openSub.score)}</span>
              </div>
              <button className="lab-btn ghost sm" onClick={() => setOpenSub(null)}>关闭</button>
            </div>
            {openSub.grading?.summary && <div className="lab-glass" style={{ padding: 16, marginTop: 16, fontSize: 14, lineHeight: 1.8 }}>{openSub.grading.summary}</div>}

            <div className="lab-glass" style={{ padding: 18, marginTop: 14 }}>
              {(openSub.grading?.dimensions || []).map((d: any) => {
                const r = rubric.find(x => x.key === d.key);
                const pct = r ? (d.score / r.weight) * 100 : 0;
                return (
                  <div key={d.key} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}><span>{r?.name || d.key}</span><span className="lab-mono" style={{ letterSpacing: 0 }}>{d.score} / {r?.weight}</span></div>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(106,92,255,.12)', margin: '6px 0 8px', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: scoreColor(pct), transition: 'width .9s cubic-bezier(.2,.8,.2,1)' }} /></div>
                    <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.7, borderLeft: '3px solid var(--line)', paddingLeft: 10 }}>{d.evidence}</div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.75, marginTop: 4 }}>{d.comment}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 14 }}>
              {openSub.grading?.gaps?.length > 0 && <div className="lab-glass" style={{ padding: 16 }}><div className="lab-mono lab-cap" style={{ marginBottom: 6 }}>离胜任还差</div>{openSub.grading.gaps.map((g: string) => <div key={g} style={{ fontSize: 13.5, lineHeight: 1.9 }}>· {g}</div>)}</div>}
              {openSub.grading?.suggestions?.length > 0 && <div className="lab-glass" style={{ padding: 16 }}><div className="lab-mono lab-cap" style={{ marginBottom: 6 }}>下一步怎么练</div>{openSub.grading.suggestions.map((g: string) => <div key={g} style={{ fontSize: 13.5, lineHeight: 1.9 }}>→ {g}</div>)}</div>}
            </div>

            {sim && openSub.trace ? <>
              <div className="lab-glass" style={{ padding: 18, marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                  <span className="lab-mono lab-cap">操作回放 · 对照专家</span>
                  {typeof openSub.match === 'number' && <span className="lab-mono" style={{ fontSize: 13, fontWeight: 800, color: 'var(--v)', letterSpacing: 0 }}>吻合度 {openSub.match}%</span>}
                </div>
                <TraceCompare sim={sim} trace={openSub.trace} expertTrace={skill?.expert_trace} expertName={skill?.expert_name} />
              </div>
              {openSub.trace.final && <div className="lab-glass" style={{ padding: 18, marginTop: 14 }}><div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>最后的结论</div><div className="lab-pre">{openSub.trace.final}</div></div>}
            </> : (
              <div className="lab-glass" style={{ padding: 18, marginTop: 14 }}>
                <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>作答原文</div>
                <div className="lab-pre">{openSub.answer}</div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
