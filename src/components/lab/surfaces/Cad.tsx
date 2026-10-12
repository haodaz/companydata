'use client';

/**
 * CAD 工程图（机械设计的交互故事）：浅色整屏，像真的二维 CAD 出图界面。
 *   左边工具条：尺寸 / 基准 / 公差 / 干涉检查 / 出图检查；中间是电机座的三视图画布（主视、俯视、左视）+ 右上角的草图缩略；
 *   右边属性栏：当前工具对应的候选（尺寸值、基准面、公差值、整改方案）和检查结果。
 *   画布上缺尺寸的地方是虚线标注（点一下在右栏选值），基准面点高亮，干涉处在极限位置画红色重叠。
 */
import React, { useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { CAD_DATUMS, CAD_DIMS, CAD_FIXES, CAD_TOLS } from '@/lib/lab-cad-spec';

const TOOLS = [{ v: 1, label: '尺寸', icon: '↔' }, { v: 2, label: '基准', icon: '▲' }, { v: 3, label: '公差', icon: '⌀' }, { v: 4, label: '干涉检查', icon: '⚠' }, { v: 5, label: '出图检查', icon: '✓' }];

export function CadStage({ st, running, auto, act, setHidden }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
}) {
  const canAct = running && !auto;
  const c = st.controls, v = st.vars;
  const tool = Math.round(c.tool || 0), fixSel = Math.round(v.fix_sel || 0), checked = (v.checked || 0) >= 1, recheck = (v.recheck_ok || 0) >= 1, reviewed = (v.reviewed || 0) >= 1, released = (v.released || 0) >= 1;
  const errors = Math.round(v.errors ?? 6), dimsOk = Math.round(v.dims_ok || 0), datOk = Math.round(v.dat_ok || 0), tolOk = Math.round(v.tol_ok || 0);
  const [sel, setSel] = useState<string | null>(null);
  const [showSketch, setShowSketch] = useState(false);
  const pick = (id: string, idx: number) => { if (!canAct) return; setHidden(id, idx); };
  const dimVal = (d: typeof CAD_DIMS[number]) => { const i = Math.round(c[d.id] || 0); return i ? d.options[i - 1] : null; };
  const datVal = (d: typeof CAD_DATUMS[number]) => { const i = Math.round(c['dat' + d.id] || 0); return i ? d.options[i - 1] : null; };
  const tolVal = (t: typeof CAD_TOLS[number]) => { const i = Math.round(c['tol_' + t.id] || 0); return i ? t.options[i - 1] : null; };
  const btn = (on: boolean, color = '#6a5cff'): React.CSSProperties => ({ border: `1px solid ${on ? color : 'rgba(23,26,46,.14)'}`, background: on ? color : '#fff', color: on ? '#fff' : '#171a2e', borderRadius: 10, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: canAct ? 'pointer' : 'default', textAlign: 'left' });
  const dimLabel = (d: typeof CAD_DIMS[number]) => { const val = dimVal(d); const ok = val === d.answer; return { text: val === null ? '?' : `${val}`, color: val === null ? '#d6336c' : ok ? '#12a150' : '#e0a800' }; };

  // 右栏内容
  const panel = () => {
    if (tool === 1) return <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>缺失尺寸 · 对照草图</div>
      {CAD_DIMS.map(d => { const val = dimVal(d); return <div key={d.id} style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: sel === d.id ? '#efeeff' : '#f6f7fb', border: sel === d.id ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.08)' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{d.label}{val !== null && <span style={{ marginLeft: 8, color: val === d.answer ? '#12a150' : '#e0a800' }}>{val} {d.unit}</span>}</div>
        <div style={{ fontSize: 11.5, color: '#6b7089', margin: '4px 0 6px' }}>{showSketch ? d.hint : '点右上角「看草图」核对'}</div>
        <div style={{ display: 'flex', gap: 6 }}>{d.options.map((o, i) => <button key={o} disabled={!canAct} onClick={() => pick(d.id, i + 1)} style={{ ...btn(val === o), padding: '5px 10px' }}>{o}</button>)}</div>
      </div>; })}
    </div>;
    if (tool === 2) return <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>基准 · 标在能定位的面上</div>
      {CAD_DATUMS.map(d => { const val = datVal(d); return <div key={d.id} style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: '#f6f7fb', border: '1px solid rgba(23,26,46,.08)' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{d.label}{val && <span style={{ marginLeft: 8, color: val === d.answer ? '#12a150' : '#e0a800' }}>{val}</span>}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{d.options.map((o, i) => <button key={o} disabled={!canAct} onClick={() => pick('dat' + d.id, i + 1)} style={{ ...btn(val === o), padding: '5px 10px' }}>{o}</button>)}</div>
      </div>; })}
      <div style={{ fontSize: 12, color: '#6b7089' }}>张工：基准要能让车间夹得住、量得到——底面、销孔、轴端面。</div>
    </div>;
    if (tool === 3) return <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>公差 · 车间检得出来</div>
      {CAD_TOLS.map(t => { const val = tolVal(t); return <div key={t.id} style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: '#f6f7fb', border: '1px solid rgba(23,26,46,.08)' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{t.label}{val && <span style={{ marginLeft: 8, color: val === t.answer ? '#12a150' : '#e0a800' }}>{val}</span>}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>{t.options.map((o, i) => <button key={o} disabled={!canAct} onClick={() => pick('tol_' + t.id, i + 1)} style={{ ...btn(val === o), padding: '5px 10px' }}>{o}</button>)}</div>
        {val && val !== t.answer && <div style={{ fontSize: 11.5, color: '#d6336c', marginTop: 6 }}>{t.note}</div>}
      </div>; })}
    </div>;
    if (tool === 4) return <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>装配干涉检查 · 极限位置</div>
      <button disabled={!canAct} onClick={() => act('check', 1)} style={{ ...btn(true, '#12a150'), width: '100%', textAlign: 'center' }}>▶ 跑干涉检查</button>
      {checked && <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: recheck ? '#e3f7ec' : '#ffe3ea', fontSize: 13 }}>{recheck ? '✓ 极限位置无干涉，最小间隙 2.0 mm' : '✗ 推杆滑块到 118 mm 时，电机座与护罩干涉 1.2 mm'}</div>}
      {checked && <div style={{ marginTop: 12, fontWeight: 800 }}>整改方案</div>}
      {checked && CAD_FIXES.map(f => <button key={f.v} disabled={!canAct} onClick={() => pick('fix', f.v)} style={{ ...btn(fixSel === f.v, f.good ? '#6a5cff' : '#8a2d3b'), width: '100%', marginTop: 6 }}>{f.label}{fixSel === f.v && <div style={{ fontSize: 11.5, opacity: .85, marginTop: 4 }}>{f.note}</div>}</button>)}
      {fixSel > 0 && !recheck && <div style={{ fontSize: 12, color: '#6b7089', marginTop: 8 }}>改完再跑一次检查。</div>}
    </div>;
    if (tool === 5) return <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>出图检查 · B.0 版</div>
      <button disabled={!canAct} onClick={() => act('review', 1)} style={{ ...btn(true, '#12b5cb'), width: '100%', textAlign: 'center' }}>▶ 跑出图检查</button>
      {reviewed && <div style={{ marginTop: 10, fontSize: 13 }}>
        {[['尺寸补齐', dimsOk === 3], ['基准 A/B/C', datOk === 3], ['公差', tolOk === 2], ['干涉已闭环', recheck]].map(([k, ok]) => <div key={String(k)} style={{ padding: '6px 10px', borderRadius: 8, marginBottom: 6, background: ok ? '#e3f7ec' : '#ffe3ea', color: ok ? '#12a150' : '#a61e4d', fontWeight: 700 }}>{ok ? '✓' : '✗'} {String(k)}</div>)}
        <div style={{ fontWeight: 800, marginTop: 6 }}>{errors === 0 ? '0 项错误，可以发布' : `${errors} 项待改`}</div>
      </div>}
      <button disabled={!canAct || released} onClick={() => act('release', 1)} style={{ ...btn(reviewed && errors === 0 && !released, '#ff8a5f'), width: '100%', textAlign: 'center', marginTop: 10, opacity: released ? .6 : 1 }}>{released ? '已发布 B.0' : '发布 B.0 版（受控图纸）'}</button>
    </div>;
    return <div style={{ color: '#6b7089', fontSize: 13.5, lineHeight: 1.8 }}>先点右上角「看草图」，再从左边工具条开始：尺寸 → 基准 → 公差 → 干涉检查 → 出图检查。</div>;
  };

  const d1 = dimLabel(CAD_DIMS[0]), d2 = dimLabel(CAD_DIMS[1]), d3 = dimLabel(CAD_DIMS[2]);
  const datA = datVal(CAD_DATUMS[0]), datB = datVal(CAD_DATUMS[1]), datC = datVal(CAD_DATUMS[2]);
  const tolPar = tolVal(CAD_TOLS[0]), tolRa = tolVal(CAD_TOLS[1]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#eef0f6', color: '#171a2e', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif', display: 'grid', gridTemplateRows: '44px minmax(0, 1fr)', gridTemplateColumns: '88px minmax(0, 1fr) 330px', overflow: 'hidden' }}>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', background: '#fff', borderBottom: '1px solid rgba(23,26,46,.1)' }}>
        <span style={{ fontWeight: 800 }}>电机座 · 工程图 · {released ? 'B.0' : 'A.3 → B.0（编辑中）'}</span>
        <span style={{ fontSize: 12.5, color: '#6b7089' }}>传送模组 · 图号 CM-0412</span>
        <button disabled={!canAct && !auto} onClick={() => setShowSketch(s => !s)} style={{ marginLeft: 'auto', ...btn(showSketch, '#171a2e') }}>{showSketch ? '收起草图' : '看草图'}</button>
        <span style={{ fontSize: 12.5, color: errors === 0 ? '#12a150' : '#6b7089', fontWeight: 700 }}>出图检查：{reviewed ? `${errors} 项` : '未跑'}</span>
      </div>
      {/* 工具条 */}
      <div style={{ background: '#fff', borderRight: '1px solid rgba(23,26,46,.08)', padding: 10, display: 'grid', gap: 8, alignContent: 'start' }}>
        {TOOLS.map(t => <button key={t.v} disabled={!canAct} onClick={() => act('tool', t.v)} style={{ border: 0, borderRadius: 12, padding: '10px 4px', background: tool === t.v ? '#6a5cff' : '#f3f4fa', color: tool === t.v ? '#fff' : '#171a2e', cursor: canAct ? 'pointer' : 'default', textAlign: 'center' }}>
          <div style={{ fontSize: 20 }}>{t.icon}</div><div style={{ fontSize: 11.5, fontWeight: 700 }}>{t.label}</div>
        </button>)}
      </div>
      {/* 画布 */}
      <div style={{ position: 'relative', minHeight: 0, background: '#fafbff', backgroundImage: 'linear-gradient(rgba(23,26,46,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(23,26,46,.05) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
        <svg viewBox="0 0 1000 620" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', fontFamily: 'ui-monospace, Menlo, monospace' }}>
          {/* 主视图 */}
          <g transform="translate(80 60)">
            <text x={0} y={-12} fontSize={12} fill="#6b7089">主视图</text>
            <rect x={0} y={60} width={300} height={150} fill="#fff" stroke="#171a2e" strokeWidth={2} />
            <rect x={60} y={0} width={180} height={60} fill="#fff" stroke="#171a2e" strokeWidth={2} />
            <line x1={0} y1={210} x2={300} y2={210} stroke={datA === '安装底面' ? '#12a150' : datA ? '#e0a800' : '#171a2e'} strokeWidth={datA ? 5 : 2} />
            <line x1={60} y1={60} x2={240} y2={60} stroke={tolPar ? (tolPar === '0.02' ? '#12a150' : '#e0a800') : '#171a2e'} strokeWidth={tolPar ? 5 : 2} />
            <text x={150} y={48} textAnchor="middle" fontSize={11} fill="#6b7089">安装面{tolRa ? ` ${tolRa}` : ''}{tolPar ? ` ∥ ${tolPar} A` : ''}</text>
            {datA && <g><path d="M 150 210 L 142 226 L 158 226 Z" fill={datA === '安装底面' ? '#12a150' : '#e0a800'} /><rect x={140} y={226} width={20} height={16} fill="#fff" stroke="#171a2e" /><text x={150} y={239} textAnchor="middle" fontSize={11} fontWeight={800}>A</text></g>}
            {/* 高度尺寸 d2 */}
            <line x1={330} y1={60} x2={330} y2={210} stroke={d2.color} strokeWidth={1.5} strokeDasharray={d2.text === '?' ? '5 4' : undefined} />
            <line x1={300} y1={60} x2={336} y2={60} stroke="#171a2e" strokeWidth={1} /><line x1={300} y1={210} x2={336} y2={210} stroke="#171a2e" strokeWidth={1} />
            <text x={346} y={140} fontSize={13} fontWeight={800} fill={d2.color}>{d2.text}{d2.text !== '?' ? ' ±0.05' : ''}</text>
            {/* 轴端面 C */}
            <line x1={300} y1={60} x2={300} y2={210} stroke={datC === '轴端面' ? '#12a150' : datC ? '#e0a800' : '#171a2e'} strokeWidth={datC ? 5 : 2} />
            {datC && <g><path d="M 300 135 L 316 127 L 316 143 Z" fill={datC === '轴端面' ? '#12a150' : '#e0a800'} /><rect x={316} y={127} width={20} height={16} fill="#fff" stroke="#171a2e" /><text x={326} y={140} textAnchor="middle" fontSize={11} fontWeight={800}>C</text></g>}
          </g>
          {/* 俯视图 */}
          <g transform="translate(80 330)">
            <text x={0} y={-12} fontSize={12} fill="#6b7089">俯视图</text>
            <rect x={0} y={0} width={300} height={180} fill="#fff" stroke="#171a2e" strokeWidth={2} />
            {[[75, 90], [225, 90]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r={14} fill="none" stroke={datB === '定位销孔' ? '#12a150' : datB ? '#e0a800' : '#171a2e'} strokeWidth={datB ? 4 : 2} /><circle cx={x} cy={y} r={9} fill="none" stroke="#171a2e" strokeWidth={1} strokeDasharray="4 3" /></g>)}
            {[[30, 30], [270, 30], [30, 150], [270, 150]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={8} fill="none" stroke="#171a2e" strokeWidth={1.5} />)}
            {datB && <g><path d="M 75 104 L 67 120 L 83 120 Z" fill={datB === '定位销孔' ? '#12a150' : '#e0a800'} /><rect x={65} y={120} width={20} height={16} fill="#fff" stroke="#171a2e" /><text x={75} y={133} textAnchor="middle" fontSize={11} fontWeight={800}>B</text></g>}
            {/* 中心距 d3 */}
            <line x1={75} y1={200} x2={225} y2={200} stroke={d3.color} strokeWidth={1.5} strokeDasharray={d3.text === '?' ? '5 4' : undefined} />
            <line x1={75} y1={104} x2={75} y2={206} stroke="#171a2e" strokeWidth={.8} /><line x1={225} y1={104} x2={225} y2={206} stroke="#171a2e" strokeWidth={.8} />
            <text x={150} y={216} textAnchor="middle" fontSize={13} fontWeight={800} fill={d3.color}>{d3.text}</text>
          </g>
          {/* 左视图（带销孔深度 d1） */}
          <g transform="translate(470 60)">
            <text x={0} y={-12} fontSize={12} fill="#6b7089">左视图</text>
            <rect x={0} y={60} width={180} height={150} fill="#fff" stroke="#171a2e" strokeWidth={2} />
            <rect x={30} y={0} width={120} height={60} fill="#fff" stroke="#171a2e" strokeWidth={2} />
            <line x1={75} y1={210} x2={75} y2={210 - (d1.text === '?' ? 60 : Number(d1.text) * 4)} stroke="#171a2e" strokeWidth={1} strokeDasharray="6 4" />
            <line x1={105} y1={210} x2={105} y2={210 - (d1.text === '?' ? 60 : Number(d1.text) * 4)} stroke="#171a2e" strokeWidth={1} strokeDasharray="6 4" />
            <line x1={210} y1={210} x2={210} y2={210 - (d1.text === '?' ? 60 : Number(d1.text) * 4)} stroke={d1.color} strokeWidth={1.5} strokeDasharray={d1.text === '?' ? '5 4' : undefined} />
            <text x={220} y={190} fontSize={13} fontWeight={800} fill={d1.color}>{d1.text === '?' ? '深 ?' : `深 ${d1.text}`}</text>
            <text x={90} y={236} textAnchor="middle" fontSize={11} fill="#6b7089">φ6 H7 销孔</text>
          </g>
          {/* 装配极限位置 · 干涉 */}
          <g transform="translate(470 330)">
            <text x={0} y={-12} fontSize={12} fill="#6b7089">装配 · 极限位置（滑块 118 mm）</text>
            <rect x={0} y={60} width={200} height={100} fill="#fff" stroke="#171a2e" strokeWidth={2} /><text x={100} y={115} textAnchor="middle" fontSize={11} fill="#6b7089">电机座</text>
            <rect x={recheck ? 212 : 188} y={20} width={160} height={120} fill="rgba(18,181,203,.12)" stroke="#12b5cb" strokeWidth={2} /><text x={recheck ? 292 : 268} y={14} textAnchor="middle" fontSize={11} fill="#12b5cb">护罩</text>
            {checked && !recheck && <rect x={188} y={60} width={12} height={80} fill="rgba(214,51,108,.8)"><animate attributeName="opacity" values="1;.4;1" dur=".8s" repeatCount="indefinite" /></rect>}
            {checked && !recheck && <text x={194} y={176} textAnchor="middle" fontSize={11} fontWeight={800} fill="#d6336c">干涉 1.2</text>}
            {recheck && <g><rect x={20} y={70} width={60} height={14} rx={7} fill="none" stroke="#12a150" strokeWidth={2} /><text x={50} y={100} textAnchor="middle" fontSize={10.5} fill="#12a150">长圆孔</text><text x={206} y={176} textAnchor="middle" fontSize={11} fontWeight={800} fill="#12a150">间隙 2.0</text></g>}
            {fixSel === 2 && <rect x={0} y={160} width={200} height={6} fill="#e0a800" />}
          </g>
          {/* 标题栏 */}
          <g transform="translate(700 540)">
            <rect x={0} y={0} width={280} height={60} fill="#fff" stroke="#171a2e" strokeWidth={1.5} />
            <text x={10} y={20} fontSize={11}>电机座 CM-0412 · {released ? 'B.0 受控' : 'A.3 → B.0'}</text>
            <text x={10} y={38} fontSize={11}>设计：你 · 审核：张工 · 材料 HT250</text>
            <text x={10} y={54} fontSize={11} fill={errors === 0 && reviewed ? '#12a150' : '#6b7089'}>{reviewed ? `出图检查 ${errors} 项` : '出图检查未跑'}</text>
          </g>
          {/* 草图缩略 */}
          {showSketch && <g transform="translate(700 20)">
            <rect x={0} y={0} width={280} height={200} rx={8} fill="#fffdf3" stroke="#c9a24a" strokeWidth={2} />
            <text x={12} y={22} fontSize={12} fontWeight={800} fill="#5a4a10">资深工程师草图</text>
            <text x={12} y={48} fontSize={11.5} fill="#5a4a10">· 销孔 φ6H7 深 15，底部不通</text>
            <text x={12} y={70} fontSize={11.5} fill="#5a4a10">· 安装面高 45 ±0.05（对底面）</text>
            <text x={12} y={92} fontSize={11.5} fill="#5a4a10">· 两销孔中心距 85（同电机法兰）</text>
            <text x={12} y={114} fontSize={11.5} fill="#5a4a10">· 基准：底面定位、销孔定向、轴端面</text>
            <text x={12} y={136} fontSize={11.5} fill="#5a4a10">· 安装面要平、要光：装电机的面</text>
            <text x={12} y={158} fontSize={11.5} fill="#5a4a10">· 试装：滑块到头时护罩有点顶</text>
            <text x={12} y={186} fontSize={10.5} fill="#9a7b1a">（手写，有涂改）</text>
          </g>}
        </svg>
      </div>
      {/* 属性栏 */}
      <div style={{ background: '#fff', borderLeft: '1px solid rgba(23,26,46,.08)', padding: 14, overflow: 'auto', fontSize: 13 }}>{panel()}</div>
    </div>
  );
}
