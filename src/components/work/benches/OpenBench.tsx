'use client';

/**
 * 开放模式：用自己的软件做（Excel / CAD / IDE…）。这里只做三件事：材料下载、浏览器录屏（getDisplayMedia，不装东西）、交付文件上传 + 交付说明。
 * 录屏和文件都传到服务器，过程由录屏抽帧看图得来。
 */
import React, { useEffect, useRef, useState } from 'react';

type Material = { id: string; title: string; kind: string; content: string };
type Up = { name: string; size: number; url: string };

export function OpenBench({ token, sid, materials, deliverables, summary, onSummary, onEvent, uploads, onUploads, recording, onRecording, t0 }: {
  token: string; sid: string; materials: Material[]; deliverables: { id: string; title: string; format: string }[];
  summary: string; onSummary: (v: string) => void; onEvent: (type: string, extra?: Record<string, any>) => void;
  uploads: Up[]; onUploads: (f: (u: Up[]) => Up[]) => void; recording: { url: string; duration: number } | null; onRecording: (r: { url: string; duration: number } | null) => void; t0: number;
}) {
  const [rec, setRec] = useState<'idle' | 'on' | 'uploading'>('idle');
  const [secs, setSecs] = useState(0);
  const mr = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const started = useRef(0);
  const [err, setErr] = useState('');
  useEffect(() => { if (rec !== 'on') return; const iv = setInterval(() => setSecs(Math.round((Date.now() - started.current) / 1000)), 1000); return () => clearInterval(iv); }, [rec]);

  const download = (m: Material) => {
    const ext = m.kind === 'table' || m.kind === 'data' ? 'csv' : 'md';
    const body = ext === 'csv' ? m.content.replace(/^```\w*\n?|```$/g, '') : m.content;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: ext === 'csv' ? 'text/csv' : 'text/markdown' })); a.download = `${m.id}-${m.title}.${ext}`; a.click();
    onEvent('download', { id: m.id });
  };
  const start = async () => {
    setErr('');
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      const r = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm', videoBitsPerSecond: 600_000 });
      chunks.current = []; r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = async () => { stream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); await finish(); };
      stream.getVideoTracks()[0].addEventListener('ended', () => { if (r.state !== 'inactive') r.stop(); });
      r.start(2000); mr.current = r; started.current = Date.now(); setRec('on'); onEvent('rec_start');
    } catch (e: any) { setErr('没开始录屏：' + (e?.message || '浏览器不支持或被拒绝')); }
  };
  const stop = () => { if (mr.current && mr.current.state !== 'inactive') mr.current.stop(); };
  const finish = async () => {
    setRec('uploading');
    const blob = new Blob(chunks.current, { type: 'video/webm' }); const duration = Math.round((Date.now() - started.current) / 1000);
    const fd = new FormData(); fd.append('file', blob, 'recording.webm'); fd.append('kind', 'recording'); fd.append('duration', String(duration)); fd.append('t', String(Math.round((Date.now() - t0) / 1000)));
    try { const j = await (await fetch(`/api/work/${token}/sessions/${sid}/upload`, { method: 'POST', body: fd })).json(); if (!j.ok) throw new Error(j.error); onRecording({ url: j.url, duration }); onEvent('rec_stop', { duration }); }
    catch (e: any) { setErr('录屏上传失败：' + e.message); }
    setRec('idle');
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; setErr('');
    for (const f of Array.from(files)) {
      const fd = new FormData(); fd.append('file', f); fd.append('kind', 'file'); fd.append('t', String(Math.round((Date.now() - t0) / 1000)));
      try { const j = await (await fetch(`/api/work/${token}/sessions/${sid}/upload`, { method: 'POST', body: fd })).json(); if (!j.ok) throw new Error(j.error); onUploads(u => [...u, { name: j.name, size: j.size, url: j.url }]); onEvent('file', { note: j.name }); }
      catch (e: any) { setErr(`${f.name} 上传失败：${e.message}`); }
    }
  };
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* 录屏 */}
      <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: rec === 'on' ? '#e5484d' : '#c9ccd6', boxShadow: rec === 'on' ? '0 0 0 6px rgba(229,72,77,.18)' : 'none' }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontWeight: 700 }}>{rec === 'on' ? `录屏中 ${fmt(secs)}` : recording ? `录屏已上传（${fmt(recording.duration)}）` : '第一步：开始录屏'}</div>
          <div style={{ fontSize: 12.5, color: '#666' }}>{rec === 'on' ? '在你的软件里做题；做完回到这里点停止。' : recording ? '可以再录一段接着做；最后一段为准。' : '选「整个屏幕」。录屏只用于评价过程（你用了什么工具、怎么核验、怎么取舍），不存音频。'}</div>
        </div>
        {rec === 'on' ? <button onClick={stop} style={{ ...btn, background: '#e5484d' }}>■ 停止录屏</button> : <button onClick={start} disabled={rec === 'uploading'} style={btn}>{rec === 'uploading' ? '上传中…' : recording ? '再录一段' : '● 开始录屏'}</button>}
      </div>
      {/* 材料 */}
      <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>第二步：把材料拿走，用你顺手的软件做</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{materials.map(m => <button key={m.id} onClick={() => download(m)} style={chip}>⬇ {m.id} {m.title}.{m.kind === 'table' || m.kind === 'data' ? 'csv' : 'md'}</button>)}</div>
        <div style={{ fontSize: 12.5, color: '#666', marginTop: 8 }}>Excel、CAD、IDE、浏览器、任何 AI 都行——评的是你怎么用。</div>
      </div>
      {/* 交付 */}
      <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>第三步：交付</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>要交：{deliverables.map(d => `${d.title}（${d.format}）`).join('；')}</div>
        <label style={{ ...chip, display: 'inline-block', cursor: 'pointer' }}>⬆ 上传交付文件（表格 / 图纸 / PDF / 截图 / 压缩包）<input type="file" multiple style={{ display: 'none' }} onChange={e => upload(e.target.files)} /></label>
        {!!uploads.length && <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>{uploads.map(u => <li key={u.url}><a href={u.url} target="_blank" rel="noreferrer">{u.name}</a> <span style={{ color: '#999' }}>{Math.round(u.size / 1024)} KB</span></li>)}</ul>}
        <div style={{ fontSize: 12.5, color: '#888', marginTop: 10, marginBottom: 4 }}>交付说明（必填：结论、关键数字、口径和假设、哪些没做完——文件里机器读不了的，这里要写清楚）</div>
        <textarea value={summary} onChange={e => onSummary(e.target.value)} placeholder="例：供需平衡表见 balance.xlsx；口径统一为 GWh，pack 按 75kWh/包折算（假设）；德布勒森 11–12 月缺口 0.4 GWh，建议国内基地海运补……" style={{ width: '100%', minHeight: 160, border: '1px solid #d9dbe6', borderRadius: 10, padding: '10px 12px', fontSize: 14, lineHeight: 1.7, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
      </div>
      {err && <div style={{ color: '#c0392b', fontSize: 13 }}>{err}</div>}
    </div>
  );
}
const btn: React.CSSProperties = { padding: '9px 18px', borderRadius: 999, border: 0, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 };
const chip: React.CSSProperties = { padding: '7px 12px', borderRadius: 999, border: '1px solid #d9dbe6', background: '#fafbff', color: '#333', cursor: 'pointer', fontSize: 13 };
