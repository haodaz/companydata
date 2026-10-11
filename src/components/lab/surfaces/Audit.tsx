'use client';

/**
 * 审计底稿（审计师的交互故事）：浅色整屏。左：银行对账单；中：银行日记账；右：凭证夹 + 标记 + 底稿。
 *   各点一行再按「勾对」——金额 / 方向对得上就划掉，对不上记一次勾错；对不上的行点「看凭证」再打标记（未达 / 疑点 / 正常）。
 *   56,000 那笔两边都有，勾对了也能标疑点——金额对得上不等于没问题。
 */
import React, { useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { BANK, LEDGER, MARKS, VOUCHERS, type Line } from '@/lib/lab-audit-spec';

const fmt = (n: number) => n.toLocaleString();

export function AuditStage({ st, running, auto, act, setHidden }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
}) {
  const canAct = running && !auto;
  const pb = Math.round(st.controls.pb || 0), pl = Math.round(st.controls.pl || 0), mark = Math.round(st.controls.mark || 0);
  const [matched, setMatched] = useState<number[]>([]);
  const [marks, setMarks] = useState<Record<string, number>>({});   // 'b10' / 'l11' / 'l9' → mark
  const [voucher, setVoucher] = useState<string>('');
  const [paper, setPaper] = useState('');
  const [note, setNote] = useState('');
  const say = (m: string) => { setNote(m); setTimeout(() => setNote(''), 2600); };
  // 演示：把脚本勾对的行划掉
  const demoMatched = auto ? st.events.filter(e => e.kind === 'control' && e.control === 'matched').map(e => e.value as number) : [];
  const isMatched = (id: number) => matched.includes(id) || demoMatched.includes(id);

  const doMatch = () => {
    if (!canAct || !pb || !pl) return;
    act('match', 1);
    const b = BANK.find(x => x.id === pb)!, l = LEDGER.find(x => x.id === pl)!;
    if (b && l && b.id === l.id && b.amt === l.amt && b.dir === l.dir) { if (!matched.includes(b.id)) { setMatched(m => [...m, b.id]); setHidden('matched', b.id); } act('pb', 0); act('pl', 0); }
    else { setHidden('wrong', (st.controls.wrong || 0) + 1); say('对不上：金额 / 日期 / 方向有一样不一致'); }
  };
  const view = () => {
    if (!canAct) return;
    const key = pl ? pl : pb;   // 优先看日记账那边的凭证；对账单 10（结息）看银行结息单
    if (!key) { say('先选一行'); return; }
    act('view', 1);
    const v = VOUCHERS[key] || '凭证齐全：发票 / 合同 / 入库或验收单与付款金额一致。';
    setVoucher(`${pl ? '日记账' : '对账单'} 第 ${key} 行 · ${v}`);
    if (pl === 9 || pb === 9) setHidden('viewed9', 1);
  };
  const applyMark = () => {
    if (!canAct || !mark) return;
    const key = pl ? `l${pl}` : pb ? `b${pb}` : ''; if (!key) { say('先选一行'); return; }
    act('apply', 1); setMarks(m => ({ ...m, [key]: mark }));
    if (key === 'b10' && mark === 1) setHidden('u1', 1);
    else if (key === 'l11' && mark === 2) setHidden('u2', 1);
    else if ((key === 'l9' || key === 'b9') && mark === 3) setHidden('flag', 1);
    else if (mark !== 4) setHidden('false_flag', (st.controls.false_flag || 0) + 1);
  };
  const onPaper = (v: string) => { setPaper(v); if (canAct) setHidden('words', v.replace(/\s/g, '').length); };

  const row = (side: 'b' | 'l', x: Line) => {
    const sel = side === 'b' ? pb === x.id : pl === x.id, done = isMatched(x.id), mk = marks[`${side}${x.id}`];
    return (
      <tr key={x.id} onClick={() => canAct && act(side === 'b' ? 'pb' : 'pl', sel ? 0 : x.id)} style={{ cursor: canAct ? 'pointer' : 'default', background: sel ? '#efedff' : done ? '#f1f9f4' : 'transparent', color: done ? '#8a93a6' : '#171a2e', textDecoration: done ? 'line-through' : 'none' }}>
        <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(23,26,46,.06)', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}>{x.date}</td>
        <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(23,26,46,.06)', fontSize: 13 }}>{x.memo}</td>
        <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(23,26,46,.06)', textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, fontWeight: 700, color: done ? '#8a93a6' : x.dir === '收' ? '#12a150' : '#171a2e' }}>{x.dir === '收' ? '+' : '−'}{fmt(x.amt)}</td>
        <td style={{ padding: '7px 6px', borderBottom: '1px solid rgba(23,26,46,.06)', fontSize: 11, color: mk === 3 ? '#d6336c' : '#6b7089', whiteSpace: 'nowrap' }}>{mk ? MARKS[mk].replace(/：.*/, '') : ''}</td>
      </tr>
    );
  };
  const table = (title: string, side: 'b' | 'l', rows: Line[]) => (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(23,26,46,.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 12px', fontWeight: 800, borderBottom: '1px solid rgba(23,26,46,.08)', background: '#f8f9fd', fontSize: 13.5 }}>{title}</div>
      <div style={{ overflow: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{rows.map(x => row(side, x))}</tbody></table></div>
    </div>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#f3f5fa', color: '#171a2e', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif', display: 'grid', gridTemplateRows: '52px minmax(0, 1fr)', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 340px', gap: '0 12px', padding: '0 12px 12px', overflow: 'hidden' }}>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, margin: '0 -12px', padding: '0 18px', background: '#fff', borderBottom: '1px solid rgba(23,26,46,.1)' }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>审计底稿 · 货币资金 · 银行存款 12 月对账</span>
        <span style={{ fontSize: 12.5, color: '#6b7089' }}>被审单位：恒基实业 · 工行基本户</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button disabled={!canAct || !pb || !pl} onClick={doMatch} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: pb && pl ? '#6a5cff' : '#c9cbe0', color: '#fff', fontWeight: 800, cursor: canAct && pb && pl ? 'pointer' : 'default' }}>勾对 ✓</button>
          <button disabled={!canAct || (!pb && !pl)} onClick={view} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(23,26,46,.15)', background: '#fff', color: '#171a2e', fontWeight: 700, cursor: canAct ? 'pointer' : 'default' }}>看凭证</button>
        </div>
        {note && <span style={{ padding: '5px 12px', borderRadius: 999, background: '#ffe3ec', color: '#d6336c', fontSize: 13, fontWeight: 700 }}>{note}</span>}
      </div>
      <div style={{ paddingTop: 12, minHeight: 0, display: 'flex' }}>{table('银行对账单（银行给的）', 'b', BANK)}</div>
      <div style={{ paddingTop: 12, minHeight: 0, display: 'flex' }}>{table('银行日记账（企业记的）', 'l', LEDGER)}</div>
      <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        <div style={{ background: '#fff6c2', borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 1.65, color: '#5a4a10', minHeight: 90 }}>{voucher || '凭证夹：选一行，点「看凭证」。对不上的要看，对得上的也未必不用看。'}</div>
        <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid rgba(23,26,46,.08)' }}>
          <div style={{ fontSize: 12, color: '#6b7089', marginBottom: 6 }}>给选中的行打标记</div>
          <select value={mark} disabled={!canAct} onChange={e => act('mark', Number(e.target.value))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(23,26,46,.16)', background: '#f8f9fd', color: '#171a2e', fontSize: 13.5 }}>{MARKS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
          <button disabled={!canAct || !mark || (!pb && !pl)} onClick={applyMark} style={{ marginTop: 8, width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', background: mark && (pb || pl) ? '#171a2e' : '#c9cbe0', color: '#fff', fontWeight: 800, cursor: canAct ? 'pointer' : 'default' }}>打标记</button>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid rgba(23,26,46,.08)', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 12, color: '#6b7089', marginBottom: 6 }}>底稿结论 · {st.controls.words || 0} 字</div>
          <textarea value={paper} disabled={!canAct && !auto} onChange={e => onPaper(e.target.value)} placeholder={'未达账项：\n疑点：\n下一步程序：'} style={{ flex: 1, minHeight: 100, resize: 'none', padding: 10, borderRadius: 8, border: '1px solid rgba(23,26,46,.16)', background: '#fbfbfe', color: '#171a2e', fontSize: 13, lineHeight: 1.7 }} />
        </div>
      </div>
    </div>
  );
}
