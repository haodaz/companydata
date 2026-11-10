'use client';

/**
 * 开放模式：用自己的软件做（Excel / CAD / IDE / PS / 本地 AI…）。这里只做三件事：材料下载、整屏定时截图（getDisplayMedia，不装东西）、交付文件上传 + 交付说明。
 * 2026-11-05 潜历反馈「两三个小时录屏太大传不上来」：以前录整段视频（5fps、600kbps，3 小时约 800MB，交卷时一次传，上限 200MB），
 * 改成每 10 秒截一张整屏（缩到 1280 宽的 JPEG，画面没变就跳过），边做边传；计时放在 Worker 里，切去别的软件时后台标签页也不降频。
 * 选「整个屏幕」，本地软件也记得到。过程由截图看图得来（交卷时均匀挑 30 张给会看图的模型）。
 */
import React, { useEffect, useRef, useState } from 'react';
import { removeWorkFile, uploadWorkFile } from '@/lib/work/upload-client';

type Material = { id: string; title: string; kind: string; content: string; url?: string; mime?: string; name?: string };
type Up = { name: string; size: number; url: string };
export type Rec = { url: string; duration: number; shots?: number };
const EVERY = 10;   // 秒
// 后台标签页里主线程的定时器会被降到一分钟一次，Worker 里的不会：用它打拍子
const TICKER = `let iv; onmessage = e => { clearInterval(iv); if (e.data > 0) iv = setInterval(() => postMessage(1), e.data); };`;

export function OpenBench({ token, sid, materials, deliverables, summary, onSummary, onEvent, uploads, onUploads, recording, onRecording, t0 }: {
  token: string; sid: string; materials: Material[]; deliverables: { id: string; title: string; format: string }[];
  summary: string; onSummary: (v: string) => void; onEvent: (type: string, extra?: Record<string, any>) => void;
  uploads: Up[]; onUploads: (f: (u: Up[]) => Up[]) => void; recording: Rec | null; onRecording: (r: Rec | null) => void; t0: number;
}) {
  const [rec, setRec] = useState<'idle' | 'on'>('idle');
  const [secs, setSecs] = useState(0); const [shots, setShots] = useState(recording?.shots || 0); const [pending, setPending] = useState(0);
  const started = useRef(0); const stream = useRef<MediaStream | null>(null); const worker = useRef<Worker | null>(null);
  const video = useRef<HTMLVideoElement | null>(null); const last = useRef<string>(''); const nShots = useRef(recording?.shots || 0);
  // 离开页面 / 交卷时停掉
  useEffect(() => () => { worker.current?.terminate(); stream.current?.getTracks().forEach(t => t.stop()); }, []);
  const [err, setErr] = useState('');
  useEffect(() => { if (rec !== 'on') return; const iv = setInterval(() => setSecs(Math.round((Date.now() - started.current) / 1000)), 1000); return () => clearInterval(iv); }, [rec]);

  const download = (m: Material) => {
    if (m.kind === 'file' && m.url) { window.open(m.url, '_blank'); onEvent('download', { id: m.id }); return; }   // 上传的文件给原文件，不给抽出的文字（11-05）
    const ext = m.kind === 'table' || m.kind === 'data' ? 'csv' : 'md';
    const body = ext === 'csv' ? m.content.replace(/^```\w*\n?|```$/g, '') : m.content;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: ext === 'csv' ? 'text/csv' : 'text/markdown' })); a.download = `${m.id}-${m.title}.${ext}`; a.click();
    onEvent('download', { id: m.id });
  };
  /** 截一张：从屏幕流里取当前画面 → 缩到 1280 宽 → JPEG；和上一张几乎一样就跳过（省流量） */
  const grab = async () => {
    // Chrome 有 ImageCapture：直接从屏幕流取一帧（后台标签页里 video 元素可能不刷新画面）；没有就从 video 元素画
    const track = stream.current?.getVideoTracks()[0]; let src: CanvasImageSource | null = null, sw = 0, sh = 0;
    try { if (track && (window as any).ImageCapture) { const bm: ImageBitmap = await new (window as any).ImageCapture(track).grabFrame(); src = bm; sw = bm.width; sh = bm.height; } } catch { /* 退回 video */ }
    if (!src) { const v = video.current; if (!v || !v.videoWidth) return; src = v; sw = v.videoWidth; sh = v.videoHeight; }
    const w = Math.min(1280, sw), h = Math.round(sh * w / sw);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(src, 0, 0, w, h);
    const tiny = document.createElement('canvas'); tiny.width = 32; tiny.height = 18; tiny.getContext('2d')!.drawImage(c, 0, 0, 32, 18);
    const px = tiny.getContext('2d')!.getImageData(0, 0, 32, 18).data; let sig = ''; for (let i = 0; i < px.length; i += 4) sig += String.fromCharCode(48 + ((px[i] + px[i + 1] + px[i + 2]) / 48 | 0));
    if (sig === last.current) return; last.current = sig;
    const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.6)); if (!blob) return;
    const t = Math.round((Date.now() - t0) / 1000);
    const fd = new FormData(); fd.append('file', blob, `shot-${t}.jpg`); fd.append('kind', 'shot'); fd.append('t', String(t));
    setPending(p => p + 1);
    for (let k = 0; k < 3; k++) {
      try { const j = await (await fetch(`/api/work/${token}/sessions/${sid}/upload`, { method: 'POST', body: fd })).json(); if (!j.ok) throw new Error(j.error);
        nShots.current += 1; setShots(nShots.current); onRecording({ url: '', duration: Math.round((Date.now() - started.current) / 1000), shots: nShots.current }); break; }
      catch (e: any) { if (k === 2) setErr('有一张截图没传上去：' + e.message); else await new Promise(r => setTimeout(r, 2000)); }
    }
    setPending(p => p - 1);
  };
  const start = async () => {
    setErr('');
    try {
      const st: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: { frameRate: 1 }, audio: false });
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = st; await v.play(); video.current = v;
      stream.current = st; st.getVideoTracks()[0].addEventListener('ended', () => stop());
      const wk = new Worker(URL.createObjectURL(new Blob([TICKER], { type: 'text/javascript' }))); wk.onmessage = () => { grab(); }; wk.postMessage(EVERY * 1000); worker.current = wk;
      started.current = Date.now(); last.current = ''; setRec('on'); onEvent('rec_start'); setTimeout(grab, 1500);
    } catch (e: any) { setErr('没开始截屏：' + (e?.message || '浏览器不支持或被拒绝')); }
  };
  const stop = () => {
    worker.current?.postMessage(0); worker.current?.terminate(); worker.current = null;
    stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; video.current = null;
    if (rec === 'on' || started.current) onEvent('rec_stop', { duration: Math.round((Date.now() - started.current) / 1000) });
    setRec('idle');
  };
  // 直传存储（大文件不再卡在 4.5MB）；一个一个传，哪个失败就说哪个（11-10）
  const [upBusy, setUpBusy] = useState('');
  const upload = async (files: File[]) => {
    if (!files.length) return; setErr('');
    for (const f of files) {
      setUpBusy(`${f.name} 上传中…`);
      try { const j = await uploadWorkFile(token, sid, f, { t: Math.round((Date.now() - t0) / 1000) }); onUploads(u => [...u, j]); onEvent('file', { note: j.name }); }
      catch (e: any) { setErr(`${f.name} 没传上去：${e.message}`); }
    }
    setUpBusy('');
  };
  const remove = async (u: Up) => {
    if (!confirm(`删掉「${u.name}」？交卷时就不算这个文件了。`)) return;
    try { await removeWorkFile(token, sid, u.url, Math.round((Date.now() - t0) / 1000)); onUploads(x => x.filter(y => y.url !== u.url)); onEvent('file_remove', { note: u.name }); }
    catch (e: any) { setErr(`没删掉：${e.message}`); }
  };
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* 录屏 */}
      <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: rec === 'on' ? '#e5484d' : '#c9ccd6', boxShadow: rec === 'on' ? '0 0 0 6px rgba(229,72,77,.18)' : 'none' }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontWeight: 700 }}>{rec === 'on' ? `记录中 ${fmt(secs)} · 已存 ${shots} 张${pending ? `（${pending} 张在传）` : ''}` : shots ? `已存 ${shots} 张截图` : '第一步：开始记录屏幕'}</div>
          <div style={{ fontSize: 12.5, color: '#666' }}>{rec === 'on' ? '去你的软件里做题，这个页面别关（可以切走）；做完回来交卷，交卷时自动停止。要输密码、看私人消息时先点「暂停记录」，弄完回来点「继续记录」。' : shots ? '可以接着记录，截图会续在后面。' : `选「整个屏幕」：本地软件（PS、Excel、本地 AI）也记得到。每 ${EVERY} 秒存一张截图、边做边传，几个小时也不怕传不上去；不录视频、不录声音，只用于评价过程（你用了什么工具、怎么核验、怎么取舍）。`}</div>
        </div>
        {rec === 'on' ? <button onClick={stop} title="输密码、看私人消息前先暂停" style={{ ...btn, background: '#e5484d' }}>⏸ 暂停记录</button> : <button onClick={start} style={btn}>{shots ? '继续记录' : '● 开始记录'}</button>}
      </div>
      {/* 材料 */}
      <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>第二步：把材料拿走，用你顺手的软件做</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{materials.map(m => <button key={m.id} onClick={() => download(m)} style={chip}>⬇ {m.id} {m.kind === 'file' && m.url ? (m.name || m.title) : `${m.title}.${m.kind === 'table' || m.kind === 'data' ? 'csv' : 'md'}`}</button>)}</div>
        <div style={{ fontSize: 12.5, color: '#666', marginTop: 8 }}>Excel、CAD、IDE、浏览器、任何 AI 都行——评的是你怎么用。</div>
      </div>
      {/* 交付 */}
      <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>第三步：交付</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>要交：{deliverables.map(d => `${d.title}（${d.format}）`).join('；')}</div>
        <label style={{ ...chip, display: 'inline-block', cursor: 'pointer' }}>⬆ 上传交付文件（表格 / 图纸 / PDF / 截图 / 压缩包）<input type="file" multiple style={{ display: 'none' }} disabled={!!upBusy} onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; upload(fs); }} /></label>
        {upBusy && <span style={{ marginLeft: 10, fontSize: 13, color: '#6055f5' }}>{upBusy}</span>}
        <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>可以一次选多个，单个 200MB 以内；传错了点「删除」。在线文档 / 智能体里的内容，平台不一定打得开链接（要登录或动态加载的读不到正文），请导出成 PDF / Word / 图片一起传上来。</div>
        {!!uploads.length && <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>{uploads.map(u => <li key={u.url}><a href={u.url} target="_blank" rel="noreferrer">{u.name}</a> <span style={{ color: '#999' }}>{Math.round(u.size / 1024)} KB</span> <a onClick={() => remove(u)} style={{ color: '#c0392b', cursor: 'pointer', marginLeft: 6 }}>删除</a></li>)}</ul>}
        <div style={{ fontSize: 12.5, color: '#888', marginTop: 10, marginBottom: 4 }}>交付说明（必填：结论、关键数字、口径和假设、哪些没做完——文件里机器读不了的，这里要写清楚）</div>
        <textarea value={summary} onChange={e => onSummary(e.target.value)} placeholder="例：供需平衡表见 balance.xlsx；口径统一为 GWh，pack 按 75kWh/包折算（假设）；德布勒森 11–12 月缺口 0.4 GWh，建议国内基地海运补……" style={{ width: '100%', minHeight: 160, border: '1px solid #d9dbe6', borderRadius: 10, padding: '10px 12px', fontSize: 14, lineHeight: 1.7, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
      </div>
      {err && <div style={{ color: '#c0392b', fontSize: 13 }}>{err}</div>}
    </div>
  );
}
const btn: React.CSSProperties = { padding: '9px 18px', borderRadius: 999, border: 0, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 };
const chip: React.CSSProperties = { padding: '7px 12px', borderRadius: 999, border: '1px solid #d9dbe6', background: '#fafbff', color: '#333', cursor: 'pointer', fontSize: 13 };
