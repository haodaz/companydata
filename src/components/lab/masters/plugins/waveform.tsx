'use client';

/**
 * 母版 A 的插件 waveform：按拍算的数字波形查看器（深色示波器样）。登记在 DesktopStage 的 DESKTOP_PLUGINS。
 *   波形本身由一个命名模型算（WAVE_MODELS，参数是配置里的表达式）；画哪几根线、颜色、哪拍打 ✕、状态行怎么着色、
 *   光标拨哪个控件、标记读哪个值、每拍的解释和整次仿真的小结，全在 props 里（row = 那一拍 / 小结行）。
 *   show 不成立时只画时钟（还没跑过仿真）。验证工作站 chipdesk（lab-chipdesk-desktop.ts）用 valid-ready 模型。
 */
import React, { useMemo } from 'react';
import type { DRow } from '@/lib/masters/desktop';
import type { DCtx, DesktopPluginProps } from '@/components/lab/masters/DesktopStage';

type Tw = { when?: string; text: string };
export interface WaveformProps {
  /** WAVE_MODELS 里的名字 */
  model: string; cycles?: number;
  /** 模型参数：表达式（ui.sim_fix 这类），每次渲染求值 */
  params?: Record<string, number | string>;
  /** 模型常量（反压的忙拍、复位几拍……） */
  consts?: Record<string, unknown>;
  /** 有波形吗（没跑过仿真时只画时钟） */
  show: string;
  /** 光标：点波形拨这个控件（第几拍），也从它读 */
  control: string;
  /** 标记在第几拍（表达式，< 0 = 没标） */
  mark?: string;
  /** 从上到下的信号：key 是模型行里的字段（clk = 画时钟）；level 默认 row.<key> > 0；marks 在那一拍打字（丢帧 ✕） */
  signals: { label: string; key: string; color: string; level?: string; marks?: { when: string; text: string; color?: string }[] }[];
  /** 底下一行状态字：key 是模型行里的文字字段 */
  states?: { key: string; color?: string; colorWhen?: { when: string; color: string }[] };
  /** 光标那一拍的解释（第一个成立的，不写 when 的兜底）；idle 没波形时的字；summary 小结（成立的几段拼起来，row = 模型的 total 行） */
  explain: Tw[]; idle: string; summary?: Tw[];
}

/** 模型：参数 → 每拍一行（字段随便起，配置里按 row.<字段> 读）+ 小结行 */
export type WaveModel = (p: Record<string, number>, c: Record<string, unknown>, n: number) => { rows: DRow[]; total: DRow };

export const WAVE_MODELS: Record<string, WaveModel> = {
  /** valid / ready 握手（教学化简化模型）：variant 0 原始（valid 等 ready、ready 跟上一拍 valid → 互等死锁）、1 valid 只看 pending、
   *  2 ready 恒 1（忙拍冲掉数据）、3 超时强拉（没人接就丢）；bp = 反压（busy 那几拍接收方忙）。
   *  每拍：i、rst、pending、valid、ready、xfer（1 收到 / -1 丢了 / 0）、rx 累计收到、state 文字、sid（0 RST 1 IDLE 2 READY 3 RECV）。小结：rx、lost */
  'valid-ready': (p, c, n) => {
    const reset = Number(c.reset ?? 4), frames = Number(c.frames ?? 4), timeout = Number(c.timeout ?? 30);
    const busy = new Set<number>(p.bp ? (c.busy as number[] | undefined) || [] : []);
    const v = Math.round(p.variant || 0), rows: DRow[] = [];
    let pend = 0, got = 0, sent = 0, gap = 0, prevValid = 0, lost = 0;
    for (let i = 0; i < n; i++) {
      const rst = i < reset;
      if (!rst && !pend && sent < frames && gap <= 0) { pend = 1; sent++; }
      let rdy: number, val: number;
      if (v === 1) { val = pend; rdy = rst ? 0 : busy.has(i) ? 0 : 1; }
      else if (v === 2) { rdy = rst ? 0 : 1; val = pend && rdy ? 1 : 0; }
      else if (v === 3) { rdy = rst ? 0 : busy.has(i) ? 0 : prevValid; val = pend && (rdy || i >= timeout) ? 1 : 0; }
      else { rdy = rst ? 0 : prevValid; val = pend && rdy ? 1 : 0; }
      let x = 0;
      if (val && rdy) { x = 1; pend = 0; gap = 2; got++; }
      else if (v === 2 && val && busy.has(i)) { x = -1; pend = 0; gap = 2; }   // ready 恒 1：接收方忙的那拍数据被冲掉
      else if (v === 3 && val && !rdy) { x = -1; pend = 0; gap = 2; }          // 超时强拉：没人接，丢了
      if (!pend) gap--;
      if (x === -1) lost++;
      const sid = rst ? 0 : x === 1 ? 3 : rdy ? 2 : 1;
      rows.push({ id: i, i, rst: rst ? 1 : 0, pending: rst ? 0 : pend || x ? 1 : 0, valid: val, ready: rdy, xfer: x, rx: got, sid, state: ['RST', 'IDLE', 'READY', 'RECV'][sid] });
      prevValid = val;
    }
    return { rows, total: { id: 0, rx: got, lost } };
  },
};

const X0 = 120, CW = 22, ROW = 44;

export function WaveformPlugin({ block, st, canAct, num, fill, run }: DesktopPluginProps) {
  const P = (block.props || {}) as unknown as WaveformProps;
  const N = P.cycles || 40;
  const show = !!num(P.show);
  const params: Record<string, number> = {};
  for (const [k, e] of Object.entries(P.params || {})) params[k] = typeof e === 'number' ? e : num(e);
  const pkey = JSON.stringify(params);
  const wave = useMemo(() => show && WAVE_MODELS[P.model] ? WAVE_MODELS[P.model](params, P.consts || {}, N) : null, [show, pkey, P.model, N]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cursor = Math.max(0, Math.min(N - 1, Math.round(st.controls[P.control] || 0)));
  const markAt = P.mark ? Math.round(num(P.mark)) : -1;
  const ok = (e: string | undefined, ctx: DCtx) => !e || !!num(e, ctx);
  const first = (list: Tw[] | undefined, ctx: DCtx) => { const hit = list?.find(x => ok(x.when, ctx)); return hit ? fill(hit.text, ctx) : ''; };

  const W = X0 + N * CW, H = P.signals.length * ROW;
  const level = (s: WaveformProps['signals'][number], row: DRow) => s.level ? !!num(s.level, { row }) : Number(row[s.key]) > 0;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 40}`} width="100%" style={{ display: 'block', background: '#0f1224', borderRadius: 12 }}
        onPointerDown={e => {
          if (!canAct || !wave) return;
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
          run({ set: [{ control: P.control, value: Math.max(0, Math.min(N - 1, Math.floor((x - X0) / CW))) }] });
        }}>
        {Array.from({ length: N }, (_, i) => <g key={i}>
          <line x1={X0 + i * CW} y1={0} x2={X0 + i * CW} y2={H + 20} stroke="rgba(255,255,255,.06)" />
          {i % 5 === 0 && <text x={X0 + i * CW + 11} y={H + 34} textAnchor="middle" fill="#9aa0b8" fontSize={10}>{i}</text>}
        </g>)}
        {markAt >= 0 && <rect x={X0 + markAt * CW} y={0} width={CW} height={H + 20} fill="rgba(255,95,162,.25)" />}
        {wave && <rect x={X0 + cursor * CW} y={0} width={CW} height={H + 20} fill="rgba(106,92,255,.3)" />}
        {P.signals.map((s, si) => {
          const y0 = 8 + si * ROW, hi = y0 + 6, lo = y0 + 32;
          let d = '';
          for (let i = 0; i < N; i++) {
            const x = X0 + i * CW;
            if (s.key === 'clk') { d += `M ${x} ${lo} L ${x} ${hi} L ${x + 11} ${hi} L ${x + 11} ${lo} L ${x + CW} ${lo} `; continue; }
            if (!wave) continue;
            const yy = level(s, wave.rows[i]) ? hi : lo, yp = i && level(s, wave.rows[i - 1]) ? hi : lo;
            d += `${i === 0 ? 'M' : 'L'} ${x} ${yp} L ${x} ${yy} L ${x + CW} ${yy} `;
          }
          return <g key={s.label}>
            <text x={8} y={y0 + 24} fill={s.color} fontSize={12} fontFamily="ui-monospace, Menlo, monospace">{s.label}</text>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
            {wave && s.marks && wave.rows.map((row, i) => { const m = s.marks!.find(x => ok(x.when, { row })); return m ? <text key={i} x={X0 + i * CW + 11} y={y0 + 26} textAnchor="middle" fill={m.color || '#ff5fa2'} fontSize={14} fontWeight={800}>{m.text}</text> : null; })}
          </g>;
        })}
        {wave && P.states && wave.rows.map((row, i) => {
          const S = P.states!, hit = S.colorWhen?.find(x => ok(x.when, { row }));
          return <text key={i} x={X0 + i * CW + 11} y={H + 14} textAnchor="middle" fill={hit ? hit.color : S.color || '#6b7089'} fontSize={7.5}>{String(row[S.key] ?? '')}</text>;
        })}
      </svg>
      <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: '#f3f4fa', fontSize: 13.5, lineHeight: 1.6 }}>{wave ? first(P.explain, { row: wave.rows[cursor] }) : fill(P.idle)}</div>
      {wave && P.summary && <div style={{ marginTop: 8, fontSize: 12.5, color: '#6b7089' }}>{P.summary.filter(x => ok(x.when, { row: wave.total })).map(x => fill(x.text, { row: wave.total })).join('')}</div>}
    </div>
  );
}
