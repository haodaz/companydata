'use client';

/**
 * 出题等待（2026-10-21）：出题 + AI 基线要 2–3 分钟，别让人干等——一行一行列出平方此刻在做什么。
 * 用真实材料起名：企业名、行业城市、这家企业实际有的深度画像专题、出题人那句话。
 * 节奏：出题阶段铺满约 120 秒、基线阶段约 60 秒；真实结果先回来就把剩下的快速打勾，晚了最后一行一直转着（不假装做完）。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PickedCompany } from '@/components/work/CompanyRolePicker';

type Line = { t: string; d?: string };
const isNeedText = (role: string) => role.trim().length > 14 || /[，,。、]|要一个|能看懂|能把|的人/.test(role);

function genLines(company: string, picked: PickedCompany, role: string, deep: string[], focus?: string, env?: string): Line[] {
  const need = isNeedText(role);
  const L: Line[] = [
    { t: `打开企业实体库：${company}`, d: picked ? [picked.industry, picked.city, picked.completeness != null ? `画像完整度 ${picked.completeness}` : ''].filter(Boolean).join(' · ') : '库里没有，按名字和公开信息起步' },
    { t: '读企业画像：简介、业务、产品领域、技术优势、增长信号、行业位置' },
    { t: '读子实体：核心产品、近期动态、管理团队' },
  ];
  for (const x of deep) L.push({ t: `调取深度画像：${x}`, d: '联网检索的结果，逐条带出处' });
  if (!deep.length) L.push({ t: '检索公开信息补齐企业事实' });
  L.push(
    { t: '对齐平方知识图谱', d: '行业 · 企业 · 岗位 · 职业 · 标准，看这家企业连着什么' },
    need ? { t: `理解你要找的人`, d: `「${role.trim().slice(0, 40)}」` } : { t: `匹配岗位与职业：${role.trim()}`, d: '在招岗位职责 + 职业典型任务' },
    need ? { t: '拆出要考的本事', d: '不套职位名，直接看这个人得会干什么' } : { t: '读职业典型任务：目标、成功标准、常见错误' },
    { t: '检索行业标准与规程', d: '评分标准的依据从这里来' },
    { t: '扫这家企业近 24 个月的动态，找此刻卡着的问题' },
    { t: '锚定一个此刻真实的业务问题', d: '为什么是现在、依据哪几条原文' },
    ...(focus ? [{ t: '对上你写的考察重点', d: focus.slice(0, 40) }] : []),
    { t: `选操作台：${env || '按工作媒介自动选'}`, d: '文档 / 表格 / 代码 / 设计' },
    { t: '撰写任务书', d: '口吻像业务负责人交代活：背景、要你做什么、交给谁、什么时候要' },
    { t: '编写材料包：第 1 份', d: '做这件事真的会拿到的东西' },
    { t: '编写材料包：第 2、3 份' },
    { t: '编一份「有坑」的材料', d: '信息不全或口径不一致，这才是真活' },
    { t: '设计评分标准：条目与权重' },
    { t: '梳理条目之间的依赖', d: '先界定问题 → 再分析 → 再下结论' },
    { t: '给每一条标准写依据', d: '指回企业材料、行业标准或典型任务' },
    { t: '写行为锚定等级 L1–L4', d: '每一级都是能观察到的行为' },
    { t: '交叉检查：材料、任务书和标准对得上' },
    { t: '规则与时间：可以用 AI，材料里没有的要标注假设' },
  );
  return L;
}
const BASE_LINES: Line[] = [
  { t: '题出好了，请 AI 先做一遍', d: '它的分数就是基线：候选人超过它，才说明有自己的判断' },
  { t: 'AI 在读材料、写交付物' },
  { t: '按评分标准逐条打分' },
  { t: '给每一条找答卷里的原文证据' },
  { t: '算出 AI 基线分' },
  { t: '发布这道题，生成参与链接' },
];

const need = (r: string) => r.trim().length > 30 ? r.trim().slice(0, 30) + '…' : r.trim();

export function GenProgress({ phase, company, picked, role, focus, env }: { phase: 'gen' | 'base' | 'done'; company: string; picked: PickedCompany; role: string; focus?: string; env?: string }) {
  const [deep, setDeep] = useState<string[]>([]);
  useEffect(() => {
    if (!picked?.id) return;
    // 这家企业实际有哪些深度画像专题（有就列出来）
    import('@/lib/company-deep-topics').then(({ DEEP_TOPICS, DEEP_TOPICS_VC }) =>
      fetch(`/api/db/companies/${picked.id}/deep-research`).then(r => r.json()).then(j => {
        const label = Object.fromEntries([...DEEP_TOPICS, ...DEEP_TOPICS_VC].map(t => [t.key, t.label]));
        setDeep(Object.keys(j.topics || {}).map(k => label[k] || k));
      })).catch(() => {});
  }, [picked?.id]);
  const gen = useMemo(() => genLines(company, picked, role, deep, focus, env), [company, picked, role, deep, focus, env]);
  const lines = useMemo(() => [...gen, ...BASE_LINES], [gen]);

  // 已经做完的行数：按节奏走；阶段切换时把前一阶段剩下的快速打勾
  const [done, setDone] = useState(0);
  const t0 = useRef(Date.now());
  const phaseAt = useRef(Date.now());
  useEffect(() => { phaseAt.current = Date.now(); }, [phase]);
  useEffect(() => {
    const id = setInterval(() => {
      setDone(d => {
        const genN = gen.length, total = lines.length;
        if (phase === 'done') return Math.min(total, d + 1);
        if (phase === 'base' && d < genN) return d + 1;                     // 出题已经回来：快进
        const [from, to, span, start] = phase === 'gen' ? [0, genN, 120_000, t0.current] : [genN, total, 60_000, phaseAt.current];
        const target = from + Math.floor(((Date.now() - start) / span) * (to - from));
        return Math.min(Math.max(d, Math.min(target, to - 1)), to - 1);    // 本阶段最后一行留着转，直到真的做完
      });
    }, phase === 'gen' && done < gen.length ? 400 : 250);
    return () => clearInterval(id);
  }, [phase, gen.length, lines.length, done]);

  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }); }, [done]);
  const sec = Math.floor((Date.now() - t0.current) / 1000);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(id); }, []);

  return (
    <div className="gp-mask" role="status" aria-live="polite">
    <div className="gp">
      <style>{GP_CSS}</style>
      <div className="gp-head">
        <b>{phase === 'base' ? 'AI 在做基线' : phase === 'done' ? '好了' : '平方在出题'}</b>
        <span>{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')} · 通常 2–3 分钟，别关页面</span>
      </div>
      <div className="gp-bar"><i style={{ width: `${Math.round(Math.min(done + 0.5, lines.length) / lines.length * 100)}%` }} /></div>
      <div className="gp-list" ref={box}>
        {lines.slice(0, done + 1).map((l, i) => (
          <div key={i} className={`gp-row${i < done ? ' ok' : ' on'}`}>
            <span className="gp-ic">{i < done ? '✓' : <i className="gp-spin" />}</span>
            <div><div className="gp-t">{l.t}</div>{l.d && <div className="gp-d">{l.d}</div>}</div>
          </div>
        ))}
      </div>
      <div className="gp-foot">{company} · {need(role)}</div>
    </div>
    </div>
  );
}

const GP_CSS = `
.gp-mask { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(246,245,255,.86); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); animation: gpfade .3s ease both; }
.gp { width: min(620px, 100%); border: 1px solid #e3e1fb; background: #fff; border-radius: 18px; padding: 22px 24px 16px; box-shadow: 0 24px 60px rgba(60,50,180,.16); }
.gp-foot { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ebe9fb; font-size: 12px; color: #9a99b4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@keyframes gpfade { from { opacity: 0; } to { opacity: 1; } }
.gp-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.gp-head b { font-size: 18px; color: #2b2670; }
.gp-head span { font-size: 12.5px; color: #8a89a8; font-variant-numeric: tabular-nums; }
.gp-bar { height: 4px; border-radius: 4px; background: #ebe9fb; margin: 10px 0 8px; overflow: hidden; }
.gp-bar i { display: block; height: 100%; background: linear-gradient(90deg, #6055f5, #12b5cb); transition: width .6s ease; }
.gp-list { max-height: min(56vh, 460px); overflow-y: auto; display: grid; gap: 2px; padding-right: 4px; }
.gp-row { display: flex; gap: 10px; align-items: flex-start; padding: 5px 2px; animation: gpin .35s ease both; }
.gp-ic { width: 18px; flex-shrink: 0; text-align: center; font-size: 12px; color: #12a37a; line-height: 22px; }
.gp-t { font-size: 14.5px; color: #33335a; line-height: 22px; }
.gp-row.on .gp-t { color: #2b2670; font-weight: 600; }
.gp-d { font-size: 12px; color: #9a99b4; line-height: 1.5; }
.gp-spin { display: inline-block; width: 12px; height: 12px; margin-top: 5px; border-radius: 50%; border: 2px solid #6055f5; border-top-color: transparent; animation: gpspin .8s linear infinite; }
@keyframes gpspin { to { transform: rotate(360deg); } }
@keyframes gpin { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .gp-row { animation: none; } .gp-spin { animation-duration: 2s; } }
`;
