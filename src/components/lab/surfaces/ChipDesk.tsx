'use client';

/**
 * 验证工作站（数字芯片设计的交互故事）：浅色整屏桌面，像真的 EDA 工作站。
 *   左边五个图标：波形查看器、RTL 编辑器、时序报告、定向仿真、交接说明；点开是窗口，底部任务栏切换。
 *   波形是按当前 RTL 版本算出来的 40 拍：没改之前 valid / ready 互等（死锁），改对了四帧一帧不丢；光标点到哪一拍就解释那一拍。
 *   RTL / 约束的改法写进隐藏控件（fix / sta），对错由规格里的变量算；仿真结果（收到几帧、挂没挂）也在规格里。
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { CHIP_APPS, DEADLOCK_CYCLE, RTL_FIXES, STA_FIXES } from '@/lib/lab-chipdesk-spec';

const N = 40;
type Wave = { pending: number[]; valid: number[]; ready: number[]; xfer: number[]; state: string[]; rx: number[] };
/** 按 RTL 版本算 40 拍波形（教学化简化模型） */
function simulate(fix: number, bp: boolean): Wave {
  const pending: number[] = [], valid: number[] = [], ready: number[] = [], xfer: number[] = [], state: string[] = [], rx: number[] = [];
  const busy = new Set(bp ? [8, 9, 15, 16, 22, 23] : []);
  let pend = 0, got = 0, frames = 0, gap = 0, prevValid = 0;
  for (let i = 0; i < N; i++) {
    const rst = i < 4;
    if (!rst) { if (!pend && frames < 4 && gap <= 0) { pend = 1; frames++; } }
    let rdy: number, val: number;
    if (fix === 1) { val = pend; rdy = rst ? 0 : (busy.has(i) ? 0 : 1); }
    else if (fix === 2) { rdy = rst ? 0 : 1; val = pend && rdy ? 1 : 0; }
    else if (fix === 3) { rdy = rst ? 0 : (busy.has(i) ? 0 : prevValid); val = pend && (rdy || i >= 30) ? 1 : 0; }
    else { rdy = rst ? 0 : prevValid; val = pend && rdy ? 1 : 0; }
    let x = 0;
    if (val && rdy) { x = 1; pend = 0; gap = 2; got++; }
    else if (fix === 2 && val && busy.has(i)) { x = -1; pend = 0; gap = 2; }          // ready 恒 1：接收方忙的那拍数据被冲掉
    else if (fix === 3 && val && !rdy) { x = -1; pend = 0; gap = 2; }                 // 超时强拉：没人接，丢了
    if (!pend) gap--;
    pending.push(rst ? 0 : pend || x ? 1 : 0); valid.push(val); ready.push(rdy); xfer.push(x);
    state.push(rst ? 'RST' : x === 1 ? 'RECV' : rdy ? 'READY' : 'IDLE'); rx.push(got);
    prevValid = val;
  }
  return { pending, valid, ready, xfer, state, rx };
}

const EXPERT_NOTE = `交接说明 · Sensor_IF → Filter_Core
1. RTL 提交：sensor_if.v 握手改法——valid 只看 data_pending，不再依赖 ready（原逻辑 valid 等 ready、ready 等 valid，复位释放后第 6 拍起互等挂死）。
2. 约束修订：cfg_en 属 cfg_clk → sample_clk 跨时钟域，加两级同步器；SDC 里只对同步器第一级输入设 false path，原 cfg_en → filter_state 路径不再例外。
3. 回归：定向用例开反压（ready 间歇拉低），4 帧全部收到、无挂死；CDC 检查通过。
4. 请后端关注：同步器两级寄存器不要被优化合并；sample_clk 域内 filter_state 路径仍按正常时序收敛。`;

export function ChipDeskStage({ st, running, auto, act, setHidden }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
}) {
  const canAct = running && !auto;
  const app = Math.round(st.controls.app || 0), cursor = Math.round(st.controls.cursor || 0), bp = st.controls.bp === 1, sent = st.controls.send === 1;
  const fixSel = Math.round(st.vars.fix_sel || 0), staSel = Math.round(st.vars.sta_sel || 0), ran = (st.vars.ran || 0) >= 1, markAt = Math.round(st.vars.mark_at ?? -1);
  const rxCount = Math.round(st.vars.rx || 0), hang = (st.vars.hang || 0) >= 1, words = st.controls.words || 0;
  // 波形按「最近一次跑仿真时」的 RTL 版本算：改了代码要重跑才会变
  // st.events 是原地追加的同一个数组，依赖要用长度，不然永远算不到新事件
  const lastRun = useMemo(() => { const ev = [...st.events].reverse().find(e => e.kind === 'control' && e.control === 'run'); return ev ? ev.t : -1; }, [st.events.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [simOf, setSimOf] = useState<{ fix: number; bp: boolean } | null>(null);
  useEffect(() => { if (lastRun >= 0) setSimOf({ fix: fixSel, bp }); }, [lastRun]);   // eslint-disable-line react-hooks/exhaustive-deps
  const wave = useMemo(() => simOf ? simulate(simOf.fix, simOf.bp) : null, [simOf]);
  const [opened, setOpened] = useState<number[]>([]);
  const [note, setNote] = useState('');
  useEffect(() => { if (app && !opened.includes(app)) setOpened(o => [...o, app]); }, [app, opened]);
  useEffect(() => { if (auto && words > 0 && !note) setNote(EXPERT_NOTE); }, [auto, words, note]);

  const openApp = (id: number) => { if (!canAct) return; act('app', id); };
  const closeApp = (id: number) => { setOpened(o => o.filter(x => x !== id)); if (app === id) act('app', opened.filter(x => x !== id).slice(-1)[0] || 0); };
  const btnStyle = (on: boolean): React.CSSProperties => ({ border: '1px solid rgba(23,26,46,.14)', background: on ? '#6a5cff' : '#fff', color: on ? '#fff' : '#171a2e', borderRadius: 10, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: canAct ? 'pointer' : 'default' });

  // ── 波形 ──
  const SIGS: [string, keyof Wave | 'clk'][] = [['clk', 'clk'], ['data_pending', 'pending'], ['valid', 'valid'], ['ready', 'ready'], ['xfer', 'xfer']];
  const explain = (i: number) => {
    if (!wave) return '';
    if (i < 4) return `第 ${i} 拍：复位中，所有信号为 0。`;
    const p = wave.pending[i], v = wave.valid[i], r = wave.ready[i], x = wave.xfer[i];
    if (x === 1) return `第 ${i} 拍：valid=1 且 ready=1，一拍握手成功，Filter_Core 收下一帧（累计 ${wave.rx[i]}）。`;
    if (x === -1) return `第 ${i} 拍：发送方以为对方收了，其实接收方正忙——这一帧丢了。`;
    if (p && !v && !r) return `第 ${i} 拍：有数据（pending=1）但 valid=0、ready=0——发送方在等 ready，接收方在等 valid，互相等：死锁。`;
    if (p && v && !r) return `第 ${i} 拍：valid=1 等待，ready=0（接收方忙 / 反压），数据保持住——这是正常的等待。`;
    if (!p) return `第 ${i} 拍：没有待发数据。`;
    return `第 ${i} 拍：valid=${v} ready=${r}`;
  };
  const waveApp = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(23,26,46,.08)', flexWrap: 'wrap' }}>
        <button disabled={!canAct} onClick={() => act('run', 1)} style={btnStyle(!ran)}>▶ 跑仿真{ran ? '（重跑）' : ''}</button>
        <span style={{ fontSize: 12.5, color: '#6b7089' }}>{wave ? `RTL 版本：${simOf?.fix ? RTL_FIXES[simOf.fix - 1].label.split('：')[0] : '原始（有 bug）'} · 反压 ${simOf?.bp ? '开' : '关'}` : '还没跑过仿真，波形是空的。'}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#6b7089' }}>光标：第 {cursor} 拍</span>
        <button disabled={!canAct || !wave} onClick={() => act('mark', 1)} style={{ ...btnStyle(markAt < 0), opacity: wave ? 1 : .5 }}>{markAt >= 0 ? `已标记：第 ${markAt} 拍` : '标记：死锁从这一拍开始'}</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
        <svg viewBox={`0 0 ${120 + N * 22} ${SIGS.length * 44 + 40}`} width="100%" style={{ display: 'block', background: '#0f1224', borderRadius: 12 }}
          onPointerDown={e => { if (!canAct || !wave) return; const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * (120 + N * 22); const i = Math.max(0, Math.min(N - 1, Math.floor((x - 120) / 22))); act('cursor', i); }}>
          {Array.from({ length: N }, (_, i) => <g key={i}>
            <line x1={120 + i * 22} y1={0} x2={120 + i * 22} y2={SIGS.length * 44 + 20} stroke="rgba(255,255,255,.06)" />
            {i % 5 === 0 && <text x={120 + i * 22 + 11} y={SIGS.length * 44 + 34} textAnchor="middle" fill="#9aa0b8" fontSize={10}>{i}</text>}
          </g>)}
          {markAt >= 0 && <rect x={120 + markAt * 22} y={0} width={22} height={SIGS.length * 44 + 20} fill="rgba(255,95,162,.25)" />}
          {wave && <rect x={120 + cursor * 22} y={0} width={22} height={SIGS.length * 44 + 20} fill="rgba(106,92,255,.3)" />}
          {SIGS.map(([name, key], si) => {
            const y0 = 8 + si * 44, hi = y0 + 6, lo = y0 + 32;
            let d = '';
            for (let i = 0; i < N; i++) {
              const x = 120 + i * 22;
              if (key === 'clk') { d += `M ${x} ${lo} L ${x} ${hi} L ${x + 11} ${hi} L ${x + 11} ${lo} L ${x + 22} ${lo} `; continue; }
              if (!wave) continue;
              const v = key === 'xfer' ? (wave.xfer[i] === 1 ? 1 : 0) : (wave[key] as number[])[i];
              const prev = i ? (key === 'xfer' ? (wave.xfer[i - 1] === 1 ? 1 : 0) : (wave[key] as number[])[i - 1]) : 0;
              const yy = v ? hi : lo, yp = prev ? hi : lo;
              d += `${i === 0 ? 'M' : 'L'} ${x} ${yp} L ${x} ${yy} L ${x + 22} ${yy} `;
            }
            const color = key === 'clk' ? '#9aa0b8' : key === 'valid' ? '#ffb86b' : key === 'ready' ? '#7cc8ff' : key === 'xfer' ? '#3ddc97' : '#c7cbe6';
            return <g key={name}>
              <text x={8} y={y0 + 24} fill={color} fontSize={12} fontFamily="ui-monospace, Menlo, monospace">{name}</text>
              <path d={d} fill="none" stroke={color} strokeWidth={2} />
              {key === 'xfer' && wave && wave.xfer.map((x, i) => x === -1 ? <text key={i} x={120 + i * 22 + 11} y={y0 + 26} textAnchor="middle" fill="#ff5fa2" fontSize={14} fontWeight={800}>✕</text> : null)}
            </g>;
          })}
          {wave && wave.state.map((s, i) => <text key={i} x={120 + i * 22 + 11} y={SIGS.length * 44 + 14} textAnchor="middle" fill={s === 'RECV' ? '#3ddc97' : s === 'IDLE' && i >= DEADLOCK_CYCLE && wave.pending[i] ? '#ff5fa2' : '#6b7089'} fontSize={7.5}>{s}</text>)}
        </svg>
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: '#f3f4fa', fontSize: 13.5, lineHeight: 1.6 }}>{wave ? explain(cursor) : '点「跑仿真」，然后在波形上点一拍看解释。'}</div>
        {wave && <div style={{ marginTop: 8, fontSize: 12.5, color: '#6b7089' }}>这次仿真：收到 {wave.rx[N - 1]} / 4 帧{wave.xfer.includes(-1) ? ` · 丢 ${wave.xfer.filter(x => x === -1).length} 帧` : ''}{wave.rx[N - 1] === 0 ? ' · 总线挂死' : ''}</div>}
      </div>
    </div>
  );

  // ── RTL ──
  const rtlApp = (
    <div style={{ padding: 16, height: '100%', overflow: 'auto', fontSize: 13.5 }}>
      <pre style={{ margin: 0, background: '#0f1224', color: '#d9dcef', padding: 14, borderRadius: 10, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre' }}>{`// sensor_if.v · 发送侧握手
always @(posedge sample_clk or negedge rst_n)
  if (!rst_n) data_pending <= 1'b0;
  else if (frame_in)  data_pending <= 1'b1;
  else if (valid && ready) data_pending <= 1'b0;

`}<span style={{ background: fixSel === 1 ? 'rgba(61,220,151,.25)' : 'rgba(255,95,162,.3)', display: 'inline-block', width: '100%' }}>{fixSel === 1 ? `assign valid = data_pending;                 // 改后：valid 只看自己` : `assign valid = ready && data_pending;        // ← 可疑：valid 依赖 ready`}</span>{`

// filter_core.v · 接收侧
assign ready = valid_q;                      // ready 跟着上一拍的 valid
always @(posedge sample_clk) valid_q <= valid;`}</pre>
      <div style={{ marginTop: 14, fontWeight: 800 }}>怎么改？</div>
      {RTL_FIXES.map(f => <button key={f.v} disabled={!canAct || fixSel === f.v} onClick={() => setHidden('fix', f.v)} style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 8, padding: '10px 12px', borderRadius: 10, border: fixSel === f.v ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.12)', background: '#fff', cursor: canAct ? 'pointer' : 'default', fontSize: 13.5, color: '#171a2e' }}>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{f.label}</span>
        {fixSel === f.v && <div style={{ marginTop: 6, fontSize: 12.5, color: f.good ? '#12a150' : '#d6336c' }}>{f.note}</div>}
      </button>)}
      <div style={{ marginTop: 10, fontSize: 12.5, color: '#6b7089' }}>{fixSel ? '改完要去「定向仿真」重跑才算数。' : '先把波形看明白再改——没看波形就改，等于猜。'}</div>
    </div>
  );

  // ── STA ──
  const paths = [
    { from: 'cfg_en (cfg_clk)', to: 'filter_state (sample_clk)', slack: staSel === 1 ? 0.58 : staSel === 2 ? null : staSel === 3 ? 0.31 : -0.42, cdc: true },
    { from: 'data_pending', to: 'valid', slack: 1.12, cdc: false },
    { from: 'valid_q', to: 'ready', slack: 0.87, cdc: false },
    { from: 'sample_cnt[7]', to: 'frame_done', slack: 0.24, cdc: false },
  ];
  const staApp = (
    <div style={{ padding: 16, height: '100%', overflow: 'auto', fontSize: 13.5 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>sta.rpt · setup 检查 · {paths.filter(p => p.slack !== null && p.slack < 0).length} 条违例{staSel === 2 ? '（例外已屏蔽 1 条）' : ''}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}>
        <thead><tr style={{ color: '#6b7089', textAlign: 'left', background: '#f8f9fd' }}>{['起点', '终点', 'slack (ns)', '备注'].map(h => <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid rgba(23,26,46,.1)' }}>{h}</th>)}</tr></thead>
        <tbody>{paths.map((p, i) => <tr key={i} style={{ background: p.slack !== null && p.slack < 0 ? 'rgba(255,95,162,.12)' : 'transparent' }}>
          <td style={{ padding: '7px 10px' }}>{p.from}</td><td style={{ padding: '7px 10px' }}>{p.to}</td>
          <td style={{ padding: '7px 10px', fontWeight: 800, color: p.slack === null ? '#6b7089' : p.slack < 0 ? '#d6336c' : '#12a150' }}>{p.slack === null ? 'false path' : p.slack.toFixed(2)}</td>
          <td style={{ padding: '7px 10px', color: '#6b7089' }}>{p.cdc ? (staSel === 1 ? '经两级同步器 · 例外只在同步器输入' : 'cfg_clk → sample_clk 跨时钟域') : ''}</td>
        </tr>)}</tbody>
      </table>
      <div style={{ marginTop: 14, fontWeight: 800 }}>这条违例怎么处理？</div>
      {STA_FIXES.map(f => <button key={f.v} disabled={!canAct || staSel === f.v} onClick={() => setHidden('sta', f.v)} style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 8, padding: '10px 12px', borderRadius: 10, border: staSel === f.v ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.12)', background: '#fff', cursor: canAct ? 'pointer' : 'default', fontSize: 13.5, color: '#171a2e' }}>
        {f.label}
        {staSel === f.v && <div style={{ marginTop: 6, fontSize: 12.5, color: f.good ? '#12a150' : '#d6336c' }}>{f.note}</div>}
      </button>)}
    </div>
  );

  // ── 定向仿真 ──
  const simApp = (
    <div style={{ padding: 16, height: '100%', overflow: 'auto', fontSize: 13.5 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800 }}>tb_sensor_if · 4 帧突发</span>
        <button disabled={!canAct} onClick={() => act('bp', bp ? 0 : 1)} style={btnStyle(bp)}>反压注入 {bp ? '开' : '关'}</button>
        <button disabled={!canAct} onClick={() => act('run', 1)} style={{ ...btnStyle(true), background: '#12a150', borderColor: '#12a150' }}>▶ 跑定向仿真</button>
        <span style={{ fontSize: 12.5, color: '#6b7089' }}>RTL：{fixSel ? RTL_FIXES[fixSel - 1].label.split('：')[0] : '原始'}</span>
      </div>
      {ran && lastRun >= 0 && <div style={{ marginTop: 14, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {[['收到帧', `${rxCount} / 4`, rxCount === 4 ? '#12a150' : '#d6336c'], ['总线', hang ? '挂死' : '正常', hang ? '#d6336c' : '#12a150'], ['反压', bp ? '已注入' : '未注入', bp ? '#12a150' : '#e0a800']].map(([k, v, c]) => <div key={k} style={{ padding: '12px 14px', borderRadius: 12, background: '#f3f4fa' }}><div style={{ fontSize: 12, color: '#6b7089' }}>{k}</div><div style={{ fontSize: 22, fontWeight: 800, color: c as string }}>{v}</div></div>)}
      </div>}
      <div style={{ marginTop: 14, fontSize: 12.5, color: '#6b7089', lineHeight: 1.7 }}>
        {ran && lastRun >= 0 ? (rxCount === 4 && !hang ? (bp ? '✓ 带反压 4 帧全收、不挂死。可以去写交接说明了。' : '4 帧全收，但反压没开——接收方忙的场景没测到，开了再跑一次。') : hang ? '✗ 总线挂死：波形里看 valid / ready 是不是还在互等。' : `✗ 丢了 ${4 - rxCount} 帧：这种改法在接收方忙的时候会冲掉数据。`) : '没跑过。开反压再跑，才测得到接收方忙的场景。'}
      </div>
    </div>
  );

  // ── 交接说明 ──
  const canSend = words >= 80 && fixSel === 1 && (st.vars.regress_ok || 0) >= 1;
  const noteApp = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '10px 14px', fontSize: 12.5, color: '#6b7089', borderBottom: '1px solid rgba(23,26,46,.08)' }}>给后端的交接说明要写清：RTL 改了什么、SDC 怎么修订、例外盖在哪、回归结论、还要后端关注什么。</div>
      <textarea value={note} disabled={!canAct || sent} onChange={e => { setNote(e.target.value); if (canAct) setHidden('words', e.target.value.replace(/\s/g, '').length); }} placeholder="交接说明 · Sensor_IF → Filter_Core" style={{ flex: 1, minHeight: 0, border: 0, outline: 'none', resize: 'none', padding: 16, fontSize: 14, lineHeight: 1.75, fontFamily: 'inherit', background: '#fffdf5', color: '#171a2e' }} />
      <div style={{ padding: 12, borderTop: '1px solid rgba(23,26,46,.08)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: '#6b7089' }}>{sent ? '已发给后端。' : `${Math.round(words)} 字${canSend ? ' · 可以发了' : ' · 要 ≥ 80 字，且握手已改对、带反压回归已通过'}`}</span>
        <button disabled={!canAct || !canSend || sent} onClick={() => act('send', 1)} style={{ marginLeft: 'auto', ...btnStyle(canSend && !sent), opacity: canSend && !sent ? 1 : .5 }}>发给后端</button>
      </div>
    </div>
  );

  const content: Record<number, React.ReactNode> = { 1: waveApp, 2: rtlApp, 3: staApp, 4: simApp, 5: noteApp };
  const cur = CHIP_APPS.find(a => a.id === app);
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #eef0fb 0%, #f6f7fc 55%, #eaf4f6 100%)', color: '#171a2e', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif', display: 'grid', gridTemplateRows: 'minmax(0, 1fr) 54px', overflow: 'hidden' }}>
      <div style={{ position: 'relative', minHeight: 0 }}>
        <div style={{ position: 'absolute', left: 18, top: 18, display: 'grid', gap: 14, width: 96 }}>
          {CHIP_APPS.map(a => <button key={a.id} disabled={!canAct} onClick={() => openApp(a.id)} title={a.hint}
            style={{ border: 0, background: app === a.id ? 'rgba(106,92,255,.12)' : 'transparent', borderRadius: 14, padding: '10px 4px', cursor: canAct ? 'pointer' : 'default', color: '#171a2e', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, margin: '0 auto 6px', borderRadius: 16, background: '#fff', boxShadow: '0 6px 18px rgba(23,26,46,.12)', display: 'grid', placeItems: 'center', fontSize: 28 }}>{a.icon}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{a.name}</div>
            {a.id === 3 && staSel === 0 && <div style={{ fontSize: 10, color: '#d6336c', fontWeight: 800 }}>1 条违例</div>}
            {a.id === 4 && hang && <div style={{ fontSize: 10, color: '#d6336c', fontWeight: 800 }}>红灯</div>}
          </button>)}
        </div>
        {cur ? (
          <div style={{ position: 'absolute', left: 132, top: 18, right: 18, bottom: 14, borderRadius: 16, background: '#fff', boxShadow: '0 24px 60px rgba(23,26,46,.16)', border: '1px solid rgba(23,26,46,.08)', display: 'grid', gridTemplateRows: '44px minmax(0, 1fr)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: '#f8f9fd', borderBottom: '1px solid rgba(23,26,46,.08)' }}>
              <span style={{ fontSize: 18 }}>{cur.icon}</span><span style={{ fontWeight: 800 }}>{cur.name}</span><span style={{ fontSize: 12, color: '#6b7089' }}>{cur.hint}</span>
              <button onClick={() => closeApp(cur.id)} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#6b7089', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ minHeight: 0 }}>{content[cur.id]}</div>
          </div>
        ) : (
          <div style={{ position: 'absolute', left: 160, top: '40%', color: '#6b7089', fontSize: 15, lineHeight: 1.8 }}>回归红了：Sensor_IF → Filter_Core 一帧都没收到。<br />先开「波形查看器」跑仿真，把死锁看明白，再动代码。</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', background: 'rgba(255,255,255,.85)', borderTop: '1px solid rgba(23,26,46,.08)', backdropFilter: 'blur(8px)' }}>
        <span style={{ fontWeight: 800, fontSize: 13, color: '#6a5cff', marginRight: 8 }}>验证工作站</span>
        {opened.map(id => { const a = CHIP_APPS.find(x => x.id === id)!; return <button key={id} onClick={() => canAct && act('app', id)} style={{ ...btnStyle(app === id), display: 'flex', gap: 6, alignItems: 'center' }}><span>{a.icon}</span>{a.name}</button>; })}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#6b7089' }}>10:3{Math.floor(st.t / 60) % 10} · 回归 {hang ? '红' : rxCount === 4 ? '绿' : '待跑'}</span>
      </div>
    </div>
  );
}
