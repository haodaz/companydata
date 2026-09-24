'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Select } from 'antd';
import { ModelProvider, useModel, MODEL_OPTIONS, ModelBadge } from '@/lib/model-context';
import { UserProvider } from '@/lib/user-context';

/**
 * 数字技能空间（实验）独立外壳：浅色科技感，和数据后台 / 虚拟工厂刻意长得不一样。
 * 设计语言：流动的渐变光斑 + 细网格 + 玻璃卡片 + 等宽小标签 + 会呼吸的 AI 核心。
 */
const LAB_CSS = `
.lab { --v: #6a5cff; --c: #12b5cb; --p: #ff5fa2; --ink: #171a2e; --ink2: #4a4f6a; --ink3: #8389a6; --line: rgba(106,92,255,.16);
  min-height: 100dvh; position: relative; color: var(--ink); background: #f5f6ff; overflow-x: hidden;
  font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.lab-mono { font-family: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }

/* 背景：三团缓慢漂移的光斑 + 细网格 */
.lab-bg { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.lab-blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: .55; animation: lab-drift 22s ease-in-out infinite alternate; }
.lab-blob.b1 { width: 620px; height: 620px; left: -160px; top: -200px; background: radial-gradient(circle, #cfc8ff, transparent 65%); }
.lab-blob.b2 { width: 560px; height: 560px; right: -140px; top: 8%; background: radial-gradient(circle, #bdf0f6, transparent 65%); animation-duration: 28s; animation-delay: -6s; }
.lab-blob.b3 { width: 520px; height: 520px; left: 32%; bottom: -260px; background: radial-gradient(circle, #ffd3e6, transparent 65%); animation-duration: 34s; animation-delay: -12s; }
.lab-grid { position: absolute; inset: 0; background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 44px 44px; mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, #000 20%, transparent 80%); -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, #000 20%, transparent 80%); opacity: .55; }
@keyframes lab-drift { to { transform: translate(60px, 40px) scale(1.12); } }

/* 玻璃卡片 */
.lab-glass { position: relative; background: rgba(255,255,255,.72); backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
  border: 1px solid rgba(255,255,255,.9); border-radius: 22px; box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 12px 40px rgba(88,76,220,.10), 0 0 0 1px var(--line); }
.lab-glass.hover { transition: transform .25s, box-shadow .25s; cursor: pointer; }
.lab-glass.hover:hover { transform: translateY(-3px); box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 22px 60px rgba(88,76,220,.18), 0 0 0 1px rgba(106,92,255,.35); }
.lab-cap { font-size: 10.5px; color: var(--ink3); text-transform: uppercase; }
.lab-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; color: var(--v); background: rgba(106,92,255,.09); border: 1px solid rgba(106,92,255,.18); white-space: nowrap; }
.lab-chip.c { color: #0a8fa3; background: rgba(18,181,203,.10); border-color: rgba(18,181,203,.25); }
.lab-chip.p { color: #d6336c; background: rgba(255,95,162,.10); border-color: rgba(255,95,162,.25); }
.lab-chip.g { color: var(--ink2); background: rgba(23,26,46,.05); border-color: rgba(23,26,46,.08); font-weight: 500; }

/* 按钮 */
.lab-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 42px; padding: 0 20px; border-radius: 14px; border: 0; cursor: pointer; font-size: 14px; font-weight: 700;
  color: #fff; background: linear-gradient(120deg, var(--v), #8f7bff 45%, var(--c)); background-size: 180% 100%; box-shadow: 0 8px 24px rgba(106,92,255,.30); transition: background-position .4s, transform .15s, box-shadow .25s; }
.lab-btn:hover { background-position: 100% 0; transform: translateY(-1px); box-shadow: 0 12px 30px rgba(106,92,255,.38); }
.lab-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.lab-btn.ghost { color: var(--ink2); background: rgba(255,255,255,.8); box-shadow: 0 0 0 1px var(--line); }
.lab-btn.ghost:hover { color: var(--v); box-shadow: 0 0 0 1px rgba(106,92,255,.45); }
.lab-btn.sm { height: 34px; padding: 0 14px; font-size: 13px; border-radius: 11px; }

/* AI 核心：旋转光环 + 呼吸球体 + 轨道卫星 */
.lab-orb { position: relative; width: var(--s, 160px); height: var(--s, 160px); flex-shrink: 0; }
.lab-orb .ring { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 0deg, var(--v), var(--c), var(--p), var(--v)); animation: lab-spin 9s linear infinite;
  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px)); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px)); }
.lab-orb .ring.r2 { inset: 11%; animation-duration: 14s; animation-direction: reverse; opacity: .45; }
.lab-orb .core { position: absolute; inset: 22%; border-radius: 50%; background: radial-gradient(circle at 32% 28%, #fff 0%, #d9d4ff 28%, #8d7dff 62%, #4f43d6 100%);
  box-shadow: 0 0 40px rgba(106,92,255,.55), inset 0 -8px 20px rgba(40,30,160,.35); animation: lab-breathe 3.6s ease-in-out infinite; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; }
.lab-orb .sat { position: absolute; inset: 0; animation: lab-spin 6s linear infinite; }
.lab-orb .sat::after { content: ''; position: absolute; top: -3px; left: 50%; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: #ffc53d; box-shadow: 0 0 12px #ffc53d; }
.lab-orb.busy .ring { animation-duration: 1.6s; } .lab-orb.busy .core { animation-duration: 1s; } .lab-orb.busy .sat { animation-duration: 1.2s; }
@keyframes lab-spin { to { transform: rotate(360deg); } }
@keyframes lab-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); box-shadow: 0 0 60px rgba(106,92,255,.7), inset 0 -8px 20px rgba(40,30,160,.35); } }

/* 扫描中：一条光带从上往下扫 */
.lab-scan { position: relative; overflow: hidden; }
.lab-scan::after { content: ''; position: absolute; left: 0; right: 0; height: 90px; top: -90px; background: linear-gradient(180deg, transparent, rgba(106,92,255,.16), transparent); animation: lab-scanline 1.8s linear infinite; pointer-events: none; }
@keyframes lab-scanline { to { top: 100%; } }
.lab-dots::after { content: ''; animation: lab-dots 1.4s steps(4, end) infinite; }
@keyframes lab-dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
.lab-in { animation: lab-in .5s cubic-bezier(.2,.8,.2,1) both; }
@keyframes lab-in { from { opacity: 0; transform: translateY(14px); } }
.lab-caret::after { content: '▍'; color: var(--v); animation: lab-blink 1s steps(2) infinite; margin-left: 2px; }
@keyframes lab-blink { 50% { opacity: 0; } }

/* 模式切换 */
.lab-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.lab-tab { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 14px; cursor: pointer; font-size: 14px; font-weight: 600; color: var(--ink2); background: rgba(255,255,255,.6); box-shadow: 0 0 0 1px var(--line); transition: all .2s; white-space: nowrap; }
.lab-tab:hover { color: var(--v); }
.lab-tab.on { color: #fff; background: linear-gradient(120deg, var(--v), #8f7bff); box-shadow: 0 8px 22px rgba(106,92,255,.32); }

.lab-input { width: 100%; border: 1px solid var(--line); background: rgba(255,255,255,.85); border-radius: 14px; padding: 12px 14px; font-size: 15px; color: var(--ink); outline: none; resize: vertical; font-family: inherit; line-height: 1.7; transition: box-shadow .2s, border-color .2s; }
.lab-input:focus { border-color: rgba(106,92,255,.55); box-shadow: 0 0 0 4px rgba(106,92,255,.12); }
.lab-stage { position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; background: #f0f1ff radial-gradient(1200px 600px at 10% -10%, rgba(106,92,255,.18), transparent 60%), radial-gradient(900px 500px at 100% 100%, rgba(18,181,203,.16), transparent 60%); }
.lab-stage-bar { display: flex; align-items: center; gap: 12px; padding: 10px clamp(12px, 2.5vw, 28px); background: rgba(255,255,255,.72); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid var(--line); }
.lab-stage-body { flex: 1; min-height: 0; overflow: auto; padding: clamp(12px, 2vw, 24px) clamp(12px, 3vw, 40px) 40px; }
.lab-stage-body > * { max-width: 1480px; margin: 0 auto; }
.lab-stage-fields { display: flex; gap: 8px; justify-content: flex-end; }
.lab-stage-fields .lab-input { width: 160px; padding: 6px 10px; font-size: 13px; border-radius: 10px; }
.bench-split { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, 1fr); gap: 16px; align-items: start; }
@media (max-width: 900px) { .bench-split { grid-template-columns: 1fr; } .lab-stage-fields { display: none; } }
.lab-pre { white-space: pre-wrap; word-break: break-word; line-height: 1.85; font-size: 14px; color: var(--ink2); }
.lab-wrap { position: relative; z-index: 1; max-width: 1280px; margin: 0 auto; padding: 24px 28px 64px; }
@media (max-width: 768px) { .lab-wrap { padding: 14px 12px 40px; } .lab-glass { border-radius: 18px; } .lab-tab { padding: 8px 12px; font-size: 13px; } }
`;

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { currentModel, setCurrentModel } = useModel();
  return (
    <div className="lab">
      <style>{LAB_CSS}</style>
      <div className="lab-bg"><div className="lab-blob b1" /><div className="lab-blob b2" /><div className="lab-blob b3" /><div className="lab-grid" /></div>

      <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 28px', background: 'rgba(245,246,255,.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(106,92,255,.12)' }}>
        <div onClick={() => router.push('/lab')} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', minWidth: 0 }}>
          <div className="lab-orb" style={{ ['--s' as string]: '34px' }}><div className="ring" /><div className="core" /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>数字技能空间</div>
            <div className="lab-mono lab-cap">SKILL SPACE · EXPERIMENTAL</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Select size="small" variant="filled" value={currentModel} onChange={setCurrentModel} style={{ width: 170 }} popupMatchSelectWidth={250}
          options={MODEL_OPTIONS.map(m => ({ value: m.id, label: <span>{m.label}<ModelBadge text={m.badge} /></span> }))} />
        <button className="lab-btn ghost sm" onClick={() => router.push('/admin/db-company')}>数据后台</button>
      </header>

      <div className="lab-wrap">{children}</div>
    </div>
  );
}

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <UserProvider><ModelProvider><Shell>{children}</Shell></ModelProvider></UserProvider>;
}
