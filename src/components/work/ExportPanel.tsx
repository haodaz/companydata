'use client';

/** 全站管理 · 训练数据：按题导出作答过程数据（JSONL），字段说明在下面（lib/work/export.ts） */
import React, { useEffect, useState } from 'react';
import { EVENT_DICT, RECORD_DICT } from '@/lib/work/export-dict';

export function ExportPanel() {
  const [tasks, setTasks] = useState<{ id: string; title: string; company: string }[]>([]);
  const [task, setTask] = useState(''); const [all, setAll] = useState(false); const [noAi, setNoAi] = useState(false); const [shots, setShots] = useState(true);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  useEffect(() => { fetch('/api/admin/work/tasks', { cache: 'no-store' }).then(r => r.json()).then(j => setTasks((j.tasks || []).map((t: any) => ({ id: t.id, title: t.task?.title || t.role, company: t.company_name })))).catch(() => {}); }, []);
  const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const go = async () => {
    setBusy(true); setMsg('');
    try {
      const q = new URLSearchParams({ ...(task ? { task } : {}), ...(all ? { all: '1' } : {}), ...(noAi ? { noai: '1' } : {}), ...(shots ? {} : { noshots: '1' }) });
      const r = await fetch(`/api/admin/work/export?${q}`, { cache: 'no-store' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `导出失败（${r.status}）`);
      save(await r.blob(), `zhenhuo-sessions-${new Date().toISOString().slice(0, 10)}.jsonl`); setMsg(`导出了 ${r.headers.get('X-Rows') || '?'} 次作答`);
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const readme = async () => { const r = await fetch('/api/admin/work/export?readme=1'); save(await r.blob(), 'README-真活作答数据.md'); };
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 900 }}>
      <p className="wws-muted" style={{ margin: 0 }}>一次作答一行（JSONL）：过程事件、和 AI 的每一轮、稿子快照、交付物、附件、屏幕截图和 AI 对截图的解读、审计笔记、三层评分。候选人的姓名和联系方式不导出，换成化名。</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
        <select className="wws-in" value={task} onChange={e => setTask(e.target.value)} style={{ minWidth: 280 }} aria-label="选题">
          <option value="">全部题目</option>
          {tasks.map(t => <option key={t.id} value={t.id}>{t.title}{t.company ? ` · ${t.company}` : ''}</option>)}
        </select>
        <label><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> 连没交卷的</label>
        <label><input type="checkbox" checked={noAi} onChange={e => setNoAi(e.target.checked)} /> 不要 AI 学员</label>
        <label><input type="checkbox" checked={shots} onChange={e => setShots(e.target.checked)} /> 列出截图地址</label>
        <button className="wws-btn p" disabled={busy} onClick={go}>{busy ? '导出中…' : '下载 JSONL'}</button>
        <button className="wws-btn" onClick={readme}>下载字段说明</button>
        {msg && <span className="wws-muted">{msg}</span>}
      </div>
      <div className="wws-muted" style={{ fontSize: 12.5 }}>截图是原图，可能拍到候选人的个人信息，只在内部训练用。</div>
      <div>
        <b style={{ fontSize: 14 }}>每一行有什么</b>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>{RECORD_DICT.map(([k, v]) => <li key={k}><code>{k}</code>：{v}</li>)}</ul>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <b style={{ fontSize: 14 }}>事件字典（events[].type）</b>
        <table className="wws-table" style={{ marginTop: 6, fontSize: 13 }}>
          <thead><tr><th>type</th><th>含义</th><th>字段</th></tr></thead>
          <tbody>{EVENT_DICT.map(e => <tr key={e.type}><td><code>{e.type}</code></td><td>{e.zh}</td><td className="wws-muted">{e.fields || ''}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
