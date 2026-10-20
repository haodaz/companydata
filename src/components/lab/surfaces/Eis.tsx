'use client';

/**
 * 原位 EIS 分析台（固态电池界面阻抗的交互故事）：浅色整屏，像电化学工作站自带的分析软件。
 *   左：三只电池 + 测量设置（激励幅值）+ 测量；中：Nyquist 图（五个时间点叠在一起，可切电池，可放大高频区看掉到实轴下面那截）；
 *   右：等效电路四选一 + 剔除感抗点 + 拟合 → 参数表、R_int 对 √t 的走势（三只一起）→ 加压复测 → 一句话结论交给 PI。
 *   谱和拟合由 lab-eis-spec 的纯函数算；对错（幅值、剔点、电路、复测、结论）都在规格变量里。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { EIS_CELLS, EIS_CIRCUITS, EIS_TIMES, EIS_VERDICTS, fitResult, rInt, spectrum, type EisCellId } from '@/lib/lab-eis-spec';

const INK = '#171a2e', MUTED = '#6b7089', LINE = 'rgba(23,26,46,.1)', ACCENT = '#6a5cff';
const TCOL = ['#3d8bff', '#12b5cb', '#3ddc97', '#f0a429', '#ff5f7a'];
const CELL_COL: Record<EisCellId, string> = { rest: '#3d8bff', low: '#3ddc97', high: '#ff5f7a' };

export function EisStage({ st, running, auto, act }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
}) {
  const canAct = running && !auto;
  const c = st.controls, v = st.vars;
  const amp = c.amp ?? 25, cut = c.cut === 1, circuit = Math.round(c.circuit || 0), verdict = Math.round(c.verdict || 0);
  const measured = (v.measured || 0) >= 1, ampAt = v.amp_at || 10, fitted = (v.fitted || 0) >= 1, fitC = Math.round(v.fit_circuit || 0), fitCut = (v.fit_cut || 0) >= 1;
  const repressed = (v.repressed || 0) >= 1, submitted = (v.submitted || 0) >= 1;
  const [cell, setCell] = useState<EisCellId>('high');
  const [zoom, setZoom] = useState(false);
  // 测量动画：按下之后 2.4 秒内谱一段一段画出来
  const [drawn, setDrawn] = useState(0);
  const raf = useRef<any>(null);
  useEffect(() => {
    if (!measured) { setDrawn(0); return; }
    const t0 = performance.now();
    const loop = () => { const p = Math.min(1, (performance.now() - t0) / 2400); setDrawn(p); if (p < 1) raf.current = requestAnimationFrame(loop); };
    loop(); return () => cancelAnimationFrame(raf.current);
  }, [measured]);

  const specs = useMemo(() => measured ? EIS_TIMES.map(t => spectrum(cell, t, { amp: ampAt })) : [], [measured, cell, ampAt]);
  const reSpec = useMemo(() => measured && repressed && cell === 'high' ? spectrum('high', 200, { amp: ampAt, repressed: true }) : null, [measured, repressed, cell, ampAt]);

  // ── Nyquist ──
  const W = 640, H = zoom ? 420 : 400, PAD = 46;
  const maxRe = zoom ? 70 : 520, minRe = zoom ? 10 : 0, maxIm = zoom ? 20 : 260, minIm = zoom ? -6 : -30;
  const sx = (re: number) => PAD + (re - minRe) / (maxRe - minRe) * (W - PAD - 14);
  const sy = (nim: number) => H - PAD - (nim - minIm) / (maxIm - minIm) * (H - PAD - 14);
  const path = (pts: { re: number; im: number }[], frac: number) => {
    const n = Math.max(2, Math.floor(pts.length * frac)); const keep = pts.slice(0, n).filter(p => !(cut && p.im > 0));
    return keep.map((p, i) => `${i ? 'L' : 'M'} ${sx(p.re).toFixed(1)} ${sy(-p.im).toFixed(1)}`).join(' ');
  };
  const nyq = (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', background: '#fff', borderRadius: 12, border: `1px solid ${LINE}` }}>
      {/* 网格 */}
      {Array.from({ length: 6 }, (_, i) => { const x = PAD + i * (W - PAD - 14) / 5; const val = minRe + i * (maxRe - minRe) / 5; return <g key={i}><line x1={x} y1={14} x2={x} y2={H - PAD} stroke={LINE} /><text x={x} y={H - PAD + 18} textAnchor="middle" fontSize={11} fill={MUTED}>{val.toFixed(0)}</text></g>; })}
      {Array.from({ length: 5 }, (_, i) => { const val = minIm + i * (maxIm - minIm) / 4; const y = sy(val); return <g key={i}><line x1={PAD} y1={y} x2={W - 14} y2={y} stroke={LINE} /><text x={PAD - 6} y={y + 4} textAnchor="end" fontSize={11} fill={MUTED}>{val.toFixed(0)}</text></g>; })}
      <line x1={PAD} y1={sy(0)} x2={W - 14} y2={sy(0)} stroke="#9aa0b8" strokeWidth={1.2} />
      <text x={W - 16} y={H - 8} textAnchor="end" fontSize={12} fill={MUTED}>Z′ / Ω</text>
      <text x={10} y={22} fontSize={12} fill={MUTED}>−Z″ / Ω</text>
      {!measured && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={15} fill={MUTED}>还没测量。左边设好激励幅值，点「测量」。</text>}
      {specs.map((pts, i) => <g key={i}>
        <path d={path(pts, drawn)} fill="none" stroke={TCOL[i]} strokeWidth={2.2} />
        {pts.slice(0, Math.floor(pts.length * drawn)).map((p, k) => (cut && p.im > 0) ? null : <circle key={k} cx={sx(p.re)} cy={sy(-p.im)} r={p.im > 0 ? 3.6 : 2.2} fill={p.im > 0 ? '#ff2f4f' : TCOL[i]} />)}
      </g>)}
      {reSpec && <g><path d={path(reSpec, 1)} fill="none" stroke="#171a2e" strokeWidth={2.2} strokeDasharray="6 4" /><text x={sx(reSpec[30].re) + 8} y={sy(-reSpec[30].im) - 8} fontSize={12} fill={INK} fontWeight={700}>200 h · 加压到 10 MPa 后</text></g>}
      {measured && !cut && drawn >= 1 && !zoom && <g><rect x={sx(14)} y={sy(2) - 6} width={70} height={22} rx={6} fill="none" stroke="#ff2f4f" strokeDasharray="4 3" /><text x={sx(14) + 76} y={sy(2) + 9} fontSize={11.5} fill="#ff2f4f">高频这几个点掉到实轴下面了</text></g>}
    </svg>
  );

  // ── R_int 对 √t ──
  const tW = 300, tH = 200, tP = 36, maxR = 320;
  const tx = (t: number) => tP + Math.sqrt(t) / Math.sqrt(200) * (tW - tP - 10), ty = (r: number) => tH - tP - r / maxR * (tH - tP - 10);
  const trend = fitted ? (
    <svg viewBox={`0 0 ${tW} ${tH}`} width="100%" style={{ display: 'block', background: '#fff', borderRadius: 12, border: `1px solid ${LINE}` }}>
      {[0, 25, 50, 100, 200].map(t => <g key={t}><line x1={tx(t)} y1={10} x2={tx(t)} y2={tH - tP} stroke={LINE} /><text x={tx(t)} y={tH - tP + 14} textAnchor="middle" fontSize={10} fill={MUTED}>{t}</text></g>)}
      {[0, 100, 200, 300].map(r => <g key={r}><line x1={tP} y1={ty(r)} x2={tW - 10} y2={ty(r)} stroke={LINE} /><text x={tP - 4} y={ty(r) + 3} textAnchor="end" fontSize={10} fill={MUTED}>{r}</text></g>)}
      <text x={tW - 10} y={tH - 6} textAnchor="end" fontSize={10.5} fill={MUTED}>小时（按 √t 排）</text>
      <text x={6} y={12} fontSize={10.5} fill={MUTED}>R_int / Ω</text>
      {EIS_CELLS.map(cc => {
        const pts = EIS_TIMES.map(t => ({ t, r: fitResult(cc.id, t, fitC, fitCut).ri }));
        return <g key={cc.id}>
          <path d={pts.map((p, i) => `${i ? 'L' : 'M'} ${tx(p.t)} ${ty(p.r)}`).join(' ')} fill="none" stroke={CELL_COL[cc.id]} strokeWidth={2} />
          {pts.map(p => <circle key={p.t} cx={tx(p.t)} cy={ty(p.r)} r={3.5} fill={CELL_COL[cc.id]} />)}
        </g>;
      })}
      {/* 静置那只的 √t 直线外推：C 偏离多少一眼就看出来 */}
      <line x1={tx(0)} y1={ty(30)} x2={tx(200)} y2={ty(30 + 9.3 * Math.sqrt(200))} stroke="#9aa0b8" strokeDasharray="4 3" />
      {repressed && <g><circle cx={tx(200)} cy={ty(fitResult('high', 200, fitC, fitCut, true).ri)} r={5} fill="none" stroke={INK} strokeWidth={2} /><text x={tx(200) - 8} y={ty(fitResult('high', 200, fitC, fitCut, true).ri) + 16} textAnchor="end" fontSize={10.5} fill={INK} fontWeight={700}>加压后</text></g>}
    </svg>
  ) : <div style={{ padding: 18, fontSize: 13, color: MUTED, border: `1px dashed ${LINE}`, borderRadius: 12 }}>拟合之后，这里画三只电池的 R_int 随时间（按 √t 排）的走势。</div>;

  const btn = (on: boolean, primary = false): React.CSSProperties => ({ border: `1px solid ${on || primary ? ACCENT : 'rgba(23,26,46,.14)'}`, background: primary ? ACCENT : on ? 'rgba(106,92,255,.08)' : '#fff', color: primary ? '#fff' : INK, borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: canAct ? 'pointer' : 'default', textAlign: 'left' });
  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 14 };
  const h: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: '.04em', marginBottom: 8 };
  const fr = fitted ? fitResult(cell, 200, fitC, fitCut) : null;

  return (
    <div style={{ position: 'absolute', inset: '30px 0 0 0', background: '#f3f4f8', color: INK, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: `1px solid ${LINE}`, background: '#fff' }}>
        <span style={{ display: 'flex', gap: 6 }}>{['#ff5f57', '#febc2e', '#28c840'].map(c2 => <i key={c2} style={{ width: 11, height: 11, borderRadius: 6, background: c2, display: 'inline-block' }} />)}</span>
        <b style={{ fontSize: 14 }}>EIS Analyzer</b><span style={{ fontSize: 12.5, color: MUTED }}>Li | Li₆PS₅Cl | Li 对称电池 · 原位阻抗 · 1 MHz → 0.1 Hz</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: MUTED }}>教学化简化模型 · 数值非真实数据</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr) 330px', gap: 12, padding: 12, overflow: 'hidden' }}>
        {/* 左：电池 + 测量 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'auto' }}>
          <div style={card}>
            <div style={h}>电池</div>
            {EIS_CELLS.map(cc => (
              <button key={cc.id} onClick={() => setCell(cc.id)} style={{ ...btn(cell === cc.id), width: '100%', marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                <i style={{ width: 10, height: 10, borderRadius: 5, background: CELL_COL[cc.id], flexShrink: 0 }} />
                <span><span style={{ display: 'block' }}>{cc.name}</span><span style={{ fontSize: 11.5, color: MUTED, fontWeight: 500 }}>{cc.note}</span></span>
              </button>
            ))}
          </div>
          <div style={card}>
            <div style={h}>测量设置</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>激励幅值 <b style={{ color: amp > 30 ? '#ff2f4f' : amp >= 5 && amp <= 15 ? '#12a06b' : INK }}>{amp} mV</b></div>
            <input type="range" min={1} max={50} value={amp} disabled={!canAct} onChange={e => act('amp', Number(e.target.value))} style={{ width: '100%' }} />
            <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5, margin: '4px 0 10px' }}>阻抗谱要求体系在扰动下近似线性：幅值越小越线性，太小噪声大。</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 10 }}>频率 1 MHz → 0.1 Hz · 每十倍频 8 点<br />时间点 0 / 25 / 50 / 100 / 200 h</div>
            <button disabled={!canAct} onClick={() => act('measure', 1)} style={{ ...btn(false, true), width: '100%', textAlign: 'center' }}>{measured ? `重测（上次 ${ampAt} mV）` : '▶ 测量三只电池'}</button>
          </div>
          <div style={{ ...card, fontSize: 12.5, lineHeight: 1.6, color: MUTED }}>
            <b style={{ color: INK }}>PI 要的</b><br />一句话：界面阻抗涨，是化学分解界面相在长，还是锂和电解质的接触在失效？证据要能站住。
          </div>
        </div>
        {/* 中：Nyquist */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14 }}>Nyquist · {EIS_CELLS.find(x => x.id === cell)!.name}</b>
            <span style={{ display: 'flex', gap: 10, fontSize: 12, color: MUTED }}>{EIS_TIMES.map((t, i) => <span key={t}><i style={{ display: 'inline-block', width: 10, height: 3, background: TCOL[i], verticalAlign: 'middle', marginRight: 4 }} />{t} h</span>)}</span>
            <button onClick={() => setZoom(z => !z)} style={{ ...btn(zoom), marginLeft: 'auto', padding: '5px 10px' }}>{zoom ? '看全谱' : '放大高频区'}</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-start' }}>{nyq}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, fontSize: 12, lineHeight: 1.55, color: MUTED }}>
            {[['高频截距 = R_b', '体相（电解质片本身）的电阻；片子没变，它就不该动'], ['半圆直径 = R_int', '锂 / 电解质界面的电阻；界面层变厚或接触变差，它都会涨'], ['低频斜线 = 扩散', '离子在界面附近的扩散；斜率看的是传质，不是界面层']].map(([k, d]) => (
              <div key={k} style={{ background: '#f6f7fb', borderRadius: 10, padding: '8px 10px' }}><b style={{ color: INK, display: 'block', fontSize: 12.5 }}>{k}</b>{d}</div>
            ))}
          </div>
          {fr && <div style={{ display: 'flex', gap: 18, fontSize: 13, flexWrap: 'wrap' }}>
            <span>200 h 拟合：</span><span>R_b <b>{fr.rb.toFixed(1)} Ω</b></span><span>R_int <b>{fr.ri.toFixed(0)} Ω</b></span>{fr.extra !== null && <span>R₂ <b>{fr.extra.toFixed(0)} Ω</b></span>}<span>χ² <b style={{ color: fr.chi > 2e-3 ? '#ff2f4f' : '#12a06b' }}>{fr.chi.toExponential(1)}</b></span>
          </div>}
        </div>
        {/* 右：拟合 → 走势 → 复测 → 结论 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'auto' }}>
          <div style={card}>
            <div style={h}>拟合</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 10, cursor: canAct ? 'pointer' : 'default' }}>
              <input type="checkbox" checked={cut} disabled={!canAct} onChange={() => act('cut', cut ? 0 : 1)} />剔除高频掉到实轴下面的点（−Z″ &lt; 0）
            </label>
            <div style={{ display: 'grid', gap: 6 }}>
              {EIS_CIRCUITS.map(cc => <button key={cc.id} disabled={!canAct} onClick={() => act('circuit', cc.id)} style={btn(circuit === cc.id)}><span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}>{cc.label}</span><span style={{ display: 'block', fontSize: 11.5, color: MUTED, fontWeight: 500 }}>{cc.note}</span></button>)}
            </div>
            <button disabled={!canAct || !measured || !circuit} onClick={() => act('fit', 1)} style={{ ...btn(false, true), width: '100%', textAlign: 'center', marginTop: 10, opacity: measured && circuit ? 1 : .5 }}>{fitted ? '重新拟合' : '拟合全部谱'}</button>
          </div>
          <div style={card}>
            <div style={h}>R_int 随时间 · 三只电池</div>
            {trend}
            {fitted && <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.55, marginTop: 8 }}>虚线 = 静置那只的 √t 直线。<span style={{ color: CELL_COL.high, fontWeight: 700 }}>C</span> 在 100 h 之后拐上去了。</div>}
            <button disabled={!canAct || !fitted} onClick={() => act('repress', 1)} style={{ ...btn(repressed), width: '100%', textAlign: 'center', marginTop: 10, opacity: fitted ? 1 : .5 }}>{repressed ? `C 加压复测：R_int ${rInt('high', 200).total.toFixed(0)} → ${rInt('high', 200, true).total.toFixed(0)} Ω` : 'C 电池堆叠压力加到 10 MPa，复测一次'}</button>
          </div>
          <div style={card}>
            <div style={h}>给 PI 的一句话</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {EIS_VERDICTS.map(vv => <button key={vv.id} disabled={!canAct || submitted} onClick={() => act('verdict', vv.id)} style={{ ...btn(verdict === vv.id), fontWeight: 600, lineHeight: 1.45 }}>{vv.label}</button>)}
            </div>
            <button disabled={!canAct || !verdict || submitted} onClick={() => act('submit', 1)} style={{ ...btn(false, true), width: '100%', textAlign: 'center', marginTop: 10, opacity: verdict && !submitted ? 1 : .5 }}>{submitted ? '已发给 PI' : '发给 PI'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
