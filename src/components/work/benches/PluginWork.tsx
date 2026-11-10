'use client';

/**
 * 真活插件模式的作答页（2026-10-22）：不在页面里做题——给真活码、链到 /work/plugin 关联插件；
 * 显示插件记到了多少、剩余时间；材料在这里下载；交付说明和插件侧边栏是同一份（谁写都存到服务器）；两边都能交卷。
 * 侧边栏那边交了卷，这页轮询到就切到「AI 审计中」。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useL } from '@/lib/work/i18n';

type Material = { id: string; title: string; kind: string; content: string; url?: string; mime?: string; name?: string };

export function PluginWork({ code, task, onSubmitted }: { code: string; task: { task: { title: string; brief: string; time_minutes: number; deliverables: { id: string; title: string; format: string }[] }; materials: Material[]; company_name: string; role: string }; onSubmitted: () => void }) {
  const [st, setSt] = useState<any>(null); const L = useL();
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState<string | null>(null);
  // 最后一问（选填）：如果再给一天，先改哪里；和交付说明一样边写边存
  const [nextStep, setNextStep] = useState<string | null>(null);
  const [nextSaved, setNextSaved] = useState('');
  const nextTimer = useRef<any>(null);
  const nextEditing = useRef(false);   // 侧边栏也能写同一份：没在这边写时，轮询到的覆盖本地
  const timer = useRef<any>(null);
  const editing = useRef(false);

  const poll = useCallback(async () => {
    const j = await fetch(`/api/work/plugin/${code}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    if (!j?.ok) return;
    setSt(j);
    if (j.submitted) { onSubmitted(); return; }
    if (!editing.current) setDraft(j.deliverable || '');
    if (!nextEditing.current) setNextStep(j.next_step || '');
  }, [code, onSubmitted]);
  useEffect(() => { poll(); const a = setInterval(poll, 5000); const b = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(a); clearInterval(b); }; }, [poll]);

  const save = (v: string) => {
    setDraft(v); setSaved(L('保存中…', 'Saving…')); editing.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/work/plugin/${code}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliverable: v }) }).then(x => x.json()).catch(() => ({ ok: false }));
      setSaved(r.ok ? L('已保存（插件侧边栏里也能看到）', 'Saved (also visible in the extension sidebar)') : L('没保存上，检查网络', 'Not saved. Check your connection.')); editing.current = false;
    }, 1200);
  };
  const saveNext = (v: string) => {
    setNextStep(v); setNextSaved(L('保存中…', 'Saving…')); nextEditing.current = true;
    clearTimeout(nextTimer.current);
    nextTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/work/plugin/${code}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ next_step: v }) }).then(x => x.json()).catch(() => ({ ok: false }));
      setNextSaved(r.ok ? L('已保存（插件侧边栏里也能看到）', 'Saved (also visible in the extension sidebar)') : L('没保存上，检查网络', 'Not saved. Check your connection.')); nextEditing.current = false;
    }, 1200);
  };
  const submit = async () => {
    if (!confirm(L('确定结束作答并交卷？交卷后不能再改。', 'Finish and submit? You cannot make changes after submitting.'))) return;
    setBusy(true); setErr('');
    const r = await fetch(`/api/work/plugin/${code}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliverable: draft ?? '' }) }).then(x => x.json()).catch(() => ({ ok: false, error: L('交卷失败，再试一次', 'Submission failed. Please try again.') }));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onSubmitted();
  };
  const download = (m: Material) => {
    const ext = m.kind === 'table' || m.kind === 'data' ? 'csv' : 'md';
    const body = ext === 'csv' ? m.content.replace(/^```\w*\n?|```$/g, '') : m.content;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: ext === 'csv' ? 'text/csv' : 'text/markdown' })); a.download = `${m.id}-${m.title}.${ext}`; a.click();
  };

  const left = st?.deadline ? Math.max(0, new Date(st.deadline).getTime() - now) : null;
  const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const rec = st?.recorded, live = rec?.events > 0;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 60px' }}>
      <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>{L('真活台', 'Work sample')} · {task.company_name} · {L('用自己的工具做（真活插件）', 'Using your own tools (browser extension)')}</div>
      <h1 style={{ fontSize: 24, margin: '6px 0 14px', lineHeight: 1.35 }}>{task.task.title}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <div style={card}>
          <div style={k}>{L('① 关联真活插件', '① Link the extension')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#888' }}>{L('真活码', 'Task code')}</span>
            <b style={{ font: '800 30px/1 ui-monospace, Menlo, monospace', letterSpacing: 5, color: '#6055f5' }}>{code}</b>
            <button style={ghost} onClick={() => navigator.clipboard.writeText(code)}>{L('复制', 'Copy')}</button>
          </div>
          <a href={`/work/plugin?code=${code}`} target="_blank" rel="noreferrer" style={{ ...primary, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>{L('去装插件 / 关联 →', 'Install / link the extension →')}</a>
          <div style={{ fontSize: 13, color: '#666', marginTop: 10, lineHeight: 1.7 }}>{L('没装过插件：那一页有下载和三步安装。装过了：点「关联这次作答」，再在插件侧边栏点「同意并开始记录」。', 'Not installed yet: that page has the download and a three-step setup. Already installed: click "Link this attempt", then click "Agree and start recording" in the extension sidebar.')}</div>
        </div>
        <div style={card}>
          <div style={k}>{L('② 记录状态', '② Recording status')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: live ? '#cf1322' : '#888' }}>
            <i style={{ width: 10, height: 10, borderRadius: '50%', background: live ? '#cf1322' : '#bbb', display: 'inline-block' }} />{live ? L('插件在记录', 'Extension is recording') : L('还没收到插件的记录', 'Nothing received from the extension yet')}
          </div>
          {live && <div style={{ fontSize: 13, color: '#555', marginTop: 6 }}>{L('网页', 'Pages')} {rec.pages} · {L('AI 对话', 'AI chats')} {rec.ai} · {L('事件', 'Events')} {rec.events}</div>}
          {left != null && <div style={{ marginTop: 10 }}><span style={{ font: '800 32px/1 ui-monospace, Menlo, monospace', color: left <= 60_000 ? '#cf1322' : left <= 300_000 ? '#d46b08' : '#1a1a2e' }}>{mmss(left)}</span><span style={{ fontSize: 12.5, color: '#888', marginLeft: 8 }}>{L('剩余 · 到时间自动交卷', 'left · submits automatically when time is up')}</span></div>}
        </div>
      </div>

      <div style={{ ...card, marginTop: 14 }}>
        <div style={k}>{L('③ 任务书与材料', '③ Brief and materials')}</div>
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 14 }}>{task.task.brief}</div>
        <div style={{ marginTop: 10, fontSize: 13.5 }}><b>{L('要交什么：', 'What to submit: ')}</b>{task.task.deliverables.map(d => L(`${d.title}（${d.format}）`, `${d.title} (${d.format})`)).join(L('；', '; '))}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {task.materials.map(m => (
            <span key={m.id} style={{ display: 'inline-flex', gap: 4 }}>
              <button style={ghost} onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? L('收起', 'Hide') : L('看', 'View')} {m.id} {m.title}</button>
              {m.kind === 'file' && m.url ? <a style={{ ...ghost, textDecoration: 'none', color: 'inherit' }} href={m.url} target="_blank" rel="noreferrer" title={L('原文件', 'Original file')}>{L('⬇ 原文件', '⬇ Original file')}</a> : <button style={ghost} onClick={() => download(m)}>⬇</button>}
            </span>
          ))}
        </div>
        {/* 上传的文件（11-05 潜历：附件看不到）：图片直接显示、其他给原文件链接，下面是 AI 抽出的文字 */}
        {open && (() => { const m = task.materials.find(x => x.id === open); return m?.kind === 'file' && m.url ? (/^image\//.test(m.mime || '') ? <a href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt={m.name || m.title} style={{ maxWidth: '100%', display: 'block', marginTop: 10, borderRadius: 8, border: '1px solid #eef0f5' }} /></a> : <a href={m.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, color: '#6055f5', fontWeight: 600 }}>{L('打开原文件：', 'Open original file: ')}{m.name || m.title} ↗</a>) : null; })()}
        {open && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: '#fafbff', border: '1px solid #eef0f5', borderRadius: 8, padding: 10, marginTop: 10 }}>{task.materials.find(m => m.id === open)?.content}</pre>}
      </div>

      <div style={{ ...card, marginTop: 14 }}>
        <div style={k}>{L('④ 交付说明（和插件侧边栏是同一份）', '④ Submission notes (same as in the extension sidebar)')}</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>{L('贴上交付物链接（在线文档 / 设计稿 / 网盘），写清结论、关键数字、口径和假设。', 'Paste links to your deliverables (online docs / design files / cloud storage) and state your conclusions, key numbers, definitions and assumptions.')}</div>
        <textarea value={draft ?? ''} onChange={e => save(e.target.value)} onFocus={() => { editing.current = true; }} onBlur={() => { if (!timer.current) editing.current = false; }} rows={8} placeholder={L('交付物链接：\n结论：\n假设与口径：', 'Deliverable links:\nConclusions:\nAssumptions and definitions:')} style={{ width: '100%', border: '1px solid #d9d9e3', borderRadius: 8, padding: '8px 10px', font: 'inherit', resize: 'vertical' }} />
        {saved && <div style={{ fontSize: 12.5, color: '#888', marginTop: 4 }}>{saved}</div>}
      </div>

      <div style={{ ...card, marginTop: 14, borderStyle: 'dashed' }}>
        <div style={k}>{L('⑤ 最后一问 · 选填', '⑤ One last question · optional')}</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{L('如果再给你一天，你会先改哪里、为什么？', 'If you had one more day, what would you improve first, and why?')}</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>{L('有余力就写，不写不扣分。写清楚交付里哪里还不够可靠、你会先补什么，算进评价。', 'Answer if you have time; skipping it costs nothing. Saying which parts of your work are not yet reliable and what you would shore up first counts toward your assessment.')}</div>
        <textarea value={nextStep ?? ''} onChange={e => saveNext(e.target.value)} rows={3} placeholder={L('比如：第二部分的转化率是 AI 按行业均值估的，我只核了一份材料，会先拉真实漏斗数据再算一遍', 'e.g. The conversion rate in part 2 was an AI estimate from industry averages and I only checked it against one source; I would pull real funnel data and redo it first')} style={{ width: '100%', border: '1px solid #d9d9e3', borderRadius: 8, padding: '8px 10px', font: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
        {nextSaved && <div style={{ fontSize: 12.5, color: '#888', marginTop: 4 }}>{nextSaved}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button style={{ ...primary, background: '#cf1322' }} onClick={submit} disabled={busy}>{busy ? L('交卷中…', 'Submitting…') : L('结束作答（交卷）', 'Finish and submit')}</button>
        {err && <span style={{ color: '#cf1322', fontSize: 13 }}>{err}</span>}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 16px' };
const k: React.CSSProperties = { fontSize: 12, letterSpacing: 1, color: '#6055f5', fontWeight: 700, marginBottom: 8 };
const primary: React.CSSProperties = { border: 0, borderRadius: 10, padding: '10px 18px', background: '#6055f5', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 };
const ghost: React.CSSProperties = { border: '1px solid #e3e1fb', borderRadius: 8, padding: '5px 10px', background: '#f6f5ff', color: '#3f35c4', cursor: 'pointer', fontSize: 13 };
