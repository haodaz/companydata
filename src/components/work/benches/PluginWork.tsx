'use client';

/**
 * 真活插件模式的作答页（2026-10-22）：不在页面里做题——给真活码、链到 /work/plugin 关联插件；
 * 显示插件记到了多少、剩余时间；材料在这里下载；交付说明和插件侧边栏是同一份（谁写都存到服务器）；两边都能交卷。
 * 侧边栏那边交了卷，这页轮询到就切到「AI 审计中」。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

type Material = { id: string; title: string; kind: string; content: string };

export function PluginWork({ code, task, onSubmitted }: { code: string; task: { task: { title: string; brief: string; time_minutes: number; deliverables: { id: string; title: string; format: string }[] }; materials: Material[]; company_name: string; role: string }; onSubmitted: () => void }) {
  const [st, setSt] = useState<any>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<any>(null);
  const editing = useRef(false);

  const poll = useCallback(async () => {
    const j = await fetch(`/api/work/plugin/${code}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    if (!j?.ok) return;
    setSt(j);
    if (j.submitted) { onSubmitted(); return; }
    if (!editing.current) setDraft(j.deliverable || '');
  }, [code, onSubmitted]);
  useEffect(() => { poll(); const a = setInterval(poll, 5000); const b = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(a); clearInterval(b); }; }, [poll]);

  const save = (v: string) => {
    setDraft(v); setSaved('保存中…'); editing.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/work/plugin/${code}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliverable: v }) }).then(x => x.json()).catch(() => ({ ok: false }));
      setSaved(r.ok ? '已保存（插件侧边栏里也能看到）' : '没保存上，检查网络'); editing.current = false;
    }, 1200);
  };
  const submit = async () => {
    if (!confirm('确定结束作答并交卷？交卷后不能再改。')) return;
    setBusy(true); setErr('');
    const r = await fetch(`/api/work/plugin/${code}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliverable: draft ?? '' }) }).then(x => x.json()).catch(() => ({ ok: false, error: '交卷失败，再试一次' }));
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
      <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>真活台 · {task.company_name} · 用自己的工具做（真活插件）</div>
      <h1 style={{ fontSize: 24, margin: '6px 0 14px', lineHeight: 1.35 }}>{task.task.title}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <div style={card}>
          <div style={k}>① 关联真活插件</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#888' }}>真活码</span>
            <b style={{ font: '800 30px/1 ui-monospace, Menlo, monospace', letterSpacing: 5, color: '#6055f5' }}>{code}</b>
            <button style={ghost} onClick={() => navigator.clipboard.writeText(code)}>复制</button>
          </div>
          <a href={`/work/plugin?code=${code}`} target="_blank" rel="noreferrer" style={{ ...primary, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>去装插件 / 关联 →</a>
          <div style={{ fontSize: 13, color: '#666', marginTop: 10, lineHeight: 1.7 }}>没装过插件：那一页有下载和三步安装。装过了：点「关联这次作答」，再在插件侧边栏点「同意并开始记录」。</div>
        </div>
        <div style={card}>
          <div style={k}>② 记录状态</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: live ? '#cf1322' : '#888' }}>
            <i style={{ width: 10, height: 10, borderRadius: '50%', background: live ? '#cf1322' : '#bbb', display: 'inline-block' }} />{live ? '插件在记录' : '还没收到插件的记录'}
          </div>
          {live && <div style={{ fontSize: 13, color: '#555', marginTop: 6 }}>网页 {rec.pages} · AI 对话 {rec.ai} · 事件 {rec.events}</div>}
          {left != null && <div style={{ marginTop: 10 }}><span style={{ font: '800 32px/1 ui-monospace, Menlo, monospace', color: left <= 60_000 ? '#cf1322' : left <= 300_000 ? '#d46b08' : '#1a1a2e' }}>{mmss(left)}</span><span style={{ fontSize: 12.5, color: '#888', marginLeft: 8 }}>剩余 · 到时间自动交卷</span></div>}
        </div>
      </div>

      <div style={{ ...card, marginTop: 14 }}>
        <div style={k}>③ 任务书与材料</div>
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 14 }}>{task.task.brief}</div>
        <div style={{ marginTop: 10, fontSize: 13.5 }}><b>要交什么：</b>{task.task.deliverables.map(d => `${d.title}（${d.format}）`).join('；')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {task.materials.map(m => (
            <span key={m.id} style={{ display: 'inline-flex', gap: 4 }}>
              <button style={ghost} onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? '收起' : '看'} {m.id} {m.title}</button>
              <button style={ghost} onClick={() => download(m)}>⬇</button>
            </span>
          ))}
        </div>
        {open && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: '#fafbff', border: '1px solid #eef0f5', borderRadius: 8, padding: 10, marginTop: 10 }}>{task.materials.find(m => m.id === open)?.content}</pre>}
      </div>

      <div style={{ ...card, marginTop: 14 }}>
        <div style={k}>④ 交付说明（和插件侧边栏是同一份）</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>贴上交付物链接（在线文档 / 设计稿 / 网盘），写清结论、关键数字、口径和假设。</div>
        <textarea value={draft ?? ''} onChange={e => save(e.target.value)} onFocus={() => { editing.current = true; }} onBlur={() => { if (!timer.current) editing.current = false; }} rows={8} placeholder={'交付物链接：\n结论：\n假设与口径：'} style={{ width: '100%', border: '1px solid #d9d9e3', borderRadius: 8, padding: '8px 10px', font: 'inherit', resize: 'vertical' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <button style={{ ...primary, background: '#cf1322' }} onClick={submit} disabled={busy}>{busy ? '交卷中…' : '结束作答（交卷）'}</button>
          <span style={{ fontSize: 12.5, color: '#888' }}>{saved}</span>
          {err && <span style={{ color: '#cf1322', fontSize: 13 }}>{err}</span>}
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 16px' };
const k: React.CSSProperties = { fontSize: 12, letterSpacing: 1, color: '#6055f5', fontWeight: 700, marginBottom: 8 };
const primary: React.CSSProperties = { border: 0, borderRadius: 10, padding: '10px 18px', background: '#6055f5', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 };
const ghost: React.CSSProperties = { border: '1px solid #e3e1fb', borderRadius: 8, padding: '5px 10px', background: '#f6f5ff', color: '#3f35c4', cursor: 'pointer', fontSize: 13 };
