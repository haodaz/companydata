'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Modal } from 'antd';
import { SKILL_KIND, expertiseLevel } from '@/lib/skill-lab';

const BUILD_STEPS = ['读取岗位 JD', '逐条拆解岗位职责', '对齐能力项', '设计可检验的任务', '生成评分标准', '唤醒岗位 AI 核心'];

const MODES = [
  { k: '01', t: '考验新人', d: '让新兵把任务走一遍，AI 核心按岗位标准逐项评分。' },
  { k: '02', t: '向专家学习', d: '让专家走一遍，AI 核心追问「为什么」，把经验吸收成自己的。' },
  { k: '03', t: '解决问题', d: '把真实问题交给 AI 核心，专家不在场也能按专家的做法解。' },
  { k: '04', t: '错位时空', d: '能力在 A 地 B 时被蒸馏，在 C 地 D 时发挥价值，每次都记账。' },
];

export default function LabHome() {
  const { message } = App.useApp();
  const router = useRouter();

  const [spaces, setSpaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [needMigration, setNeedMigration] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [jds, setJds] = useState<any[]>([]);
  const [jdsLoading, setJdsLoading] = useState(false);
  const [building, setBuilding] = useState<any | null>(null);
  const [buildStep, setBuildStep] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await (await fetch('/api/lab/spaces')).json();
      if (json.ok) { setSpaces(json.data); setNeedMigration(''); }
      else if (json.needMigration) setNeedMigration(json.error);
      else message.error(json.error);
    } finally { setLoading(false); }
  }, [message]);

  useEffect(() => { load(); }, [load]);

  // 构建动画：步骤文案轮播
  useEffect(() => {
    if (!building) return;
    setBuildStep(0);
    const iv = setInterval(() => setBuildStep(s => Math.min(s + 1, BUILD_STEPS.length - 1)), 1500);
    return () => clearInterval(iv);
  }, [building]);

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
    setPickOpen(false);
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
  if (building) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 28 }}>
        <div className="lab-orb busy" style={{ ['--s' as string]: '200px' }}><div className="ring" /><div className="ring r2" /><div className="core" /><div className="sat" /></div>
        <div>
          <div className="lab-mono lab-cap">BUILDING SKILL SPACE</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{building.company} · {building.title}</div>
        </div>
        <div className="lab-glass lab-scan" style={{ padding: '18px 26px', minWidth: 320, textAlign: 'left' }}>
          {BUILD_STEPS.map((s, i) => (
            <div key={s} className="lab-mono" style={{ fontSize: 13, padding: '4px 0', color: i < buildStep ? '#12a150' : i === buildStep ? 'var(--v)' : 'var(--ink3)', fontWeight: i === buildStep ? 700 : 400 }}>
              {i < buildStep ? '✓' : i === buildStep ? '▸' : '·'} {s}{i === buildStep && <span className="lab-dots" />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 开场 */}
      <section className="lab-in" style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap', padding: '18px 0 28px' }}>
        <div style={{ flex: '1 1 480px', minWidth: 0 }}>
          <div className="lab-mono lab-cap">EVERY JD IS A SKILL SPACE</div>
          <h1 style={{ margin: '8px 0 10px', fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, lineHeight: 1.25, letterSpacing: 0.5 }}>
            每一份 JD，都能构建一个<span style={{ background: 'linear-gradient(120deg, var(--v), var(--c))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>虚拟技能空间</span>
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--ink2)', lineHeight: 1.85, maxWidth: 620 }}>
            空间的核心，是一个拥有这份 JD 技能的优秀员工 AI。它等着考验新人，等着向资深从业者学习，等着用自己的能力解决问题。
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
            <button className="lab-btn" disabled={!!needMigration} onClick={() => { setPickOpen(true); loadJds(); }}>＋ 从岗位 JD 构建新空间</button>
          </div>
        </div>
        <div className="lab-orb" style={{ ['--s' as string]: '190px', margin: '0 auto' }}><div className="ring" /><div className="ring r2" /><div className="core lab-mono" style={{ fontSize: 15 }}>JD</div><div className="sat" /></div>
      </section>

      {needMigration && (
        <div className="lab-glass" style={{ padding: '14px 18px', marginBottom: 20, borderColor: '#ffd591', background: 'rgba(255,247,230,.85)' }}>
          <b>还差一步：</b>{needMigration}。执行后刷新本页即可（这份 SQL 同时包含「生产线任务历史」的表）。
        </div>
      )}

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 28 }}>
        {MODES.map((m, i) => (
          <div key={m.k} className="lab-glass lab-in" style={{ padding: '16px 18px', animationDelay: `${i * 70}ms` }}>
            <div className="lab-mono" style={{ fontSize: 12, color: 'var(--v)', fontWeight: 700 }}>{m.k}</div>
            <div style={{ fontSize: 16, fontWeight: 800, margin: '4px 0' }}>{m.t}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.7 }}>{m.d}</div>
          </div>
        ))}
      </section>

      <div className="lab-mono lab-cap" style={{ marginBottom: 10 }}>SPACES · {spaces.length}</div>
      {loading ? (
        <div className="lab-glass lab-scan" style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}><span className="lab-mono">LOADING<span className="lab-dots" /></span></div>
      ) : spaces.length === 0 ? (
        <div className="lab-glass" style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)', lineHeight: 2 }}>
          这里还没有技能空间。<br />点上面的「<b style={{ color: 'var(--v)' }}>从岗位 JD 构建新空间</b>」，选一份 JD，看它被拆解成一个空间。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))' }}>
          {spaces.map((s, i) => {
            const jd = s.jd_snapshot || {};
            const kind = SKILL_KIND[s.skill?.kind];
            const profile = s.profile || {};
            const lv = expertiseLevel(s.skill);
            return (
              <div key={s.id} className="lab-glass hover lab-in" style={{ padding: 22, animationDelay: `${i * 90}ms`, minWidth: 0 }} onClick={() => router.push(`/lab/${s.id}`)}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div className="lab-orb" style={{ ['--s' as string]: '76px' }}><div className="ring" /><div className="core lab-mono" style={{ fontSize: 10 }}>Lv{lv.level}</div><div className="sat" /></div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="lab-mono lab-cap">{profile.codename || 'JD-CORE'}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.35 }}>{jd.company} · {jd.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>{jd.job_req_id ? `职位 ID ${jd.job_req_id} · ` : ''}{jd.location}</div>
                  </div>
                </div>

                {profile.tagline && <div style={{ margin: '14px 0 10px', fontSize: 15, fontWeight: 600, color: 'var(--ink2)' }}>「{profile.tagline}」</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(profile.capabilities || []).slice(0, 5).map((c: string) => <span key={c} className="lab-chip">{c}</span>)}
                </div>

                <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {s.skill ? <><span className={`lab-chip ${s.skill.kind === 'hard' ? 'c' : 'p'}`}>{kind?.label}</span>已向 {s.skill.expert_name}（{s.skill.expert_location}）学习</> : <span className="lab-chip g">只读过 JD，等待第一位专家</span>}
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

      <Modal title={null} open={pickOpen} onCancel={() => setPickOpen(false)} footer={null} width={860} styles={{ container: { padding: 0, background: '#f5f6ff', borderRadius: 24, overflow: 'hidden' } }}>
        <div className="lab" style={{ minHeight: 0, padding: 'clamp(16px, 3vw, 28px)' }}>
          <div className="lab-mono lab-cap">PICK A JD</div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 4px' }}>选一份 JD，构建它的技能空间</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink3)', marginBottom: 18 }}>JD 来自岗位库，抓取自企业官方招聘站。</div>
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
        </div>
      </Modal>
    </>
  );
}
