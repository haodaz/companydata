'use client';

/**
 * 办公桌台面（数据分析师的交互故事）：一个模拟桌面——浅色、整屏、好读，像游戏里打开大盘 / 银行那一屏。
 *   左边几个图标：大盘明细（BI）、接口日志、运营群、排查简报、便签；点开是窗口，底部任务栏切换。
 *   打开了哪个 app、什么顺序、切了哪张图、筛了什么，都进事件流（过程就是考题）；报告引用了几个关键数字写进隐藏控件。
 *   统计 / 精算 / 财务 / 写代码这类「坐在电脑前」的职业都可以套这个桌面，换 app 就行。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { deskDataset, DESK_CLIENTS, DESK_DIMS, DESK_KEYS, DESK_METRICS, DESK_VIEWS, type DeskRow } from '@/lib/lab-desk-spec';

const APPS = [
  { id: 1, name: '大盘明细', icon: '📊', hint: '订单库 T+1' },
  { id: 2, name: '接口日志', icon: '🧾', hint: '支付网关' },
  { id: 3, name: '运营群', icon: '💬', hint: '12 条未读' },
  { id: 4, name: '排查简报', icon: '📝', hint: '待写' },
  { id: 5, name: '便签', icon: '📌', hint: '明姐留的' },
];
const EXPERT_REPORT = `问题：上周六大盘 GMV 较上上周六下降 18%，群里传是直播出了问题。
发现：按客户端拆，Android 支付成功率从 97% 掉到 61%，iOS / Web 正常；筛到 Android 按版本拆，7.2.1 版本支付成功率只有 38%，7.1.0 / 7.2.0 正常。直播渠道周六 GMV 反而涨了 8%，不是原因。
证据：支付接口错误日志显示 7.2.1 自周六 00:10 起大量 gateway timeout（约 62% 请求超时），与异动时间吻合。
建议：客户端紧急回滚 / 热修 7.2.1 支付模块；运营侧暂停「直播出问题」的口径；对周六 7.2.1 用户补发支付失败挽回券。`;
const CHAT = [
  { who: '运营-小王', t: '08:52', text: '周六大盘掉了 18%！！是不是直播那边出事了，直播间周六换了主播' },
  { who: '业务总监', t: '08:58', text: '@数据组 上午给我一个结论，直播到底有没有问题，要不要停' },
  { who: '明姐', t: '09:05', text: '别急着下结论。先看是哪一段掉的：流量、转化、还是支付。拆开再说。' },
  { who: '运营-小王', t: '09:12', text: '我这边已经让直播间先停了一场…' },
  { who: '明姐', t: '09:20', text: '@你 你来查。看完数据、拿到证据再写简报发群里，别被带节奏。' },
];

export function DeskStage({ st, running, auto, act, setHidden }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
}) {
  const canAct = running && !auto;
  const view = Math.round(st.controls.view || 0), metric = Math.round(st.controls.metric || 0), dim = Math.round(st.controls.dim || 0), client = Math.round(st.controls.client || 0);
  const app = Math.round(st.controls.app || 0), sent = st.controls.send === 1;
  const logSeen = (st.vars.log_seen || 0) >= 1, versionSeen = (st.vars.seen_version || 0) >= 1;
  const cite = st.controls.cite || 0, words = st.controls.words || 0;
  const rows = useMemo(() => deskDataset(42), []);
  const [report, setReport] = useState('');
  const [opened, setOpened] = useState<number[]>([]);
  const dimchgT = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 演示：报告是示范稿；演示脚本打开的 app 也进任务栏
  useEffect(() => { if (auto && words > 0 && !report) setReport(EXPERT_REPORT); }, [auto, words, report]);
  useEffect(() => { if (app && !opened.includes(app)) setOpened(o => [...o, app]); }, [app, opened]);

  const openApp = (id: number) => { if (!canAct) return; act('app', id); };
  const closeApp = (id: number) => { setOpened(o => o.filter(x => x !== id)); if (app === id) act('app', opened.filter(x => x !== id).slice(-1)[0] || 0); };
  const change = (id: string, v: number) => {
    if (!canAct) return;
    act(id, v);
    if (id === 'dim') { setHidden('dimchg', 1); if (dimchgT.current) clearTimeout(dimchgT.current); dimchgT.current = setTimeout(() => setHidden('dimchg', 0), 600); }
  };
  const onReport = (v: string) => {
    setReport(v);
    if (!canAct) return;
    setHidden('words', v.replace(/\s/g, '').length);
    setHidden('cite', DESK_KEYS.filter(k => v.includes(k)).length);
  };
  const fetchLog = () => { if (!canAct) return; if (versionSeen) act('log', 1); };

  // ── 聚合 ──
  const filtered = useMemo(() => client ? rows.filter(r => r.client === DESK_CLIENTS[client]) : rows, [rows, client]);
  const keyOf = (r: DeskRow) => dim === 1 ? r.channel : dim === 2 ? r.client : dim === 3 ? (r.client === 'Android' ? r.version : `${r.client}（无版本）`) : dim === 4 ? r.region : dim === 5 ? (r.gmv % 2 > 1 ? '支付宝' : '微信支付') : '全部';
  const value = (rs: DeskRow[]) => { const o = rs.reduce((a, r) => a + r.orders, 0), p = rs.reduce((a, r) => a + r.paid, 0), g = rs.reduce((a, r) => a + r.gmv, 0); return metric === 0 ? g / 10000 : metric === 1 ? o : metric === 2 ? (o ? o / (o * 2.1) * 100 : 0) : (o ? p / o * 100 : 0); };
  const fmt = (v: number) => metric === 0 ? v.toFixed(1) : metric === 1 ? Math.round(v).toLocaleString() : v.toFixed(1) + '%';
  const days = useMemo(() => [...new Set(rows.map(r => r.day))], [rows]);
  const keys = useMemo(() => [...new Set(filtered.map(keyOf))], [filtered, dim]);   // eslint-disable-line react-hooks/exhaustive-deps
  const series = useMemo(() => keys.map(k => ({ k, pts: days.map(d => value(filtered.filter(r => keyOf(r) === k && r.day === d))) })), [keys, days, filtered, metric, dim]);   // eslint-disable-line react-hooks/exhaustive-deps
  const bars = useMemo(() => keys.map(k => { const a = value(filtered.filter(r => keyOf(r) === k && r.day === '前周周六')), b = value(filtered.filter(r => keyOf(r) === k && r.day === '上周周六')); return { k, a, b, d: a ? (b - a) / a * 100 : 0 }; }), [keys, filtered, metric, dim]);   // eslint-disable-line react-hooks/exhaustive-deps
  const tableRows = useMemo(() => { const out: { day: string; k: string; v: number; o: number; p: number; g: number }[] = []; for (const d of days) for (const k of keys) { const rs = filtered.filter(r => r.day === d && keyOf(r) === k); if (!rs.length) continue; out.push({ day: d, k, v: value(rs), o: rs.reduce((a, r) => a + r.orders, 0), p: rs.reduce((a, r) => a + r.paid, 0), g: rs.reduce((a, r) => a + r.gmv, 0) }); } return out; }, [days, keys, filtered, metric, dim]);   // eslint-disable-line react-hooks/exhaustive-deps
  const COLORS = ['#6a5cff', '#12b5cb', '#ff8a5f', '#12a150', '#e0a800', '#d6336c'];
  const allMax = Math.max(1, ...series.flatMap(s => s.pts));

  const sel = (label: string, id: string, options: string[], cur: number) => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#6b7089', marginBottom: 4, letterSpacing: '.06em' }}>{label}</div>
      <select value={cur} disabled={!canAct} onChange={e => change(id, Number(e.target.value))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(23,26,46,.16)', background: '#f8f9fd', color: '#171a2e', fontSize: 14 }}>
        {options.map((o, i) => <option key={o} value={i}>{o}</option>)}
      </select>
    </label>
  );
  const btnStyle = (on: boolean): React.CSSProperties => ({ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(23,26,46,.12)', background: on ? '#6a5cff' : '#fff', color: on ? '#fff' : '#171a2e', cursor: canAct ? 'pointer' : 'default', fontSize: 13.5, fontWeight: 700 });

  // ── 各个 app 的窗口内容 ──
  const dataApp = (
    <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', height: '100%', minHeight: 0 }}>
      <div style={{ padding: 16, borderRight: '1px solid rgba(23,26,46,.08)', overflow: 'auto' }}>
        {sel('指标', 'metric', DESK_METRICS, metric)}
        {sel('拆分维度', 'dim', DESK_DIMS, dim)}
        {sel('筛选客户端', 'client', DESK_CLIENTS, client)}
        <div style={{ fontSize: 12.5, color: '#6b7089', lineHeight: 1.7 }}>先换一个能说明「为什么」的指标，再按大的维度拆，缩小范围后再下钻。</div>
      </div>
      <div style={{ padding: 18, overflow: 'auto', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: '#6b7089' }}>{DESK_METRICS[metric]} · {DESK_DIMS[dim]}{client ? ` · 仅 ${DESK_CLIENTS[client]}` : ''}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{DESK_VIEWS.map((v, i) => <button key={v} disabled={!canAct} onClick={() => change('view', i)} style={btnStyle(view === i)}>{v}</button>)}</div>
        </div>
        {view === 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, background: '#fff' }}>
            <thead><tr style={{ color: '#6b7089', textAlign: 'left', background: '#f8f9fd' }}>{['日期', DESK_DIMS[dim], '订单数', '支付成功', 'GMV（万）', DESK_METRICS[metric]].map(h => <th key={h} style={{ padding: '9px 10px', borderBottom: '1px solid rgba(23,26,46,.1)', fontWeight: 700 }}>{h}</th>)}</tr></thead>
            <tbody>{tableRows.slice(0, 80).map((r, i) => <tr key={i} style={{ background: r.day === '上周周六' ? 'rgba(255,95,162,.1)' : i % 2 ? 'rgba(23,26,46,.025)' : 'transparent' }}>
              <td style={{ padding: '6px 10px' }}>{r.day}</td><td style={{ padding: '6px 10px' }}>{r.k}</td><td style={{ padding: '6px 10px' }}>{r.o.toLocaleString()}</td><td style={{ padding: '6px 10px' }}>{r.p.toLocaleString()}</td><td style={{ padding: '6px 10px' }}>{(r.g / 10000).toFixed(1)}</td><td style={{ padding: '6px 10px', fontWeight: 700 }}>{fmt(r.v)}</td>
            </tr>)}</tbody>
          </table>
        )}
        {view === 1 && (
          <svg viewBox="0 0 800 420" width="100%" style={{ display: 'block' }}>
            {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1={60} y1={40 + i * 80} x2={780} y2={40 + i * 80} stroke="rgba(23,26,46,.08)" /><text x={52} y={44 + i * 80} textAnchor="end" fill="#6b7089" fontSize={11}>{fmt(allMax * (1 - i / 4))}</text></g>)}
            {days.map((d, i) => <text key={d} x={60 + i * (720 / 13)} y={400} textAnchor="middle" fill={d === '上周周六' ? '#d6336c' : '#6b7089'} fontSize={11}>{d.replace('周', '').slice(0, 3)}</text>)}
            {series.map((s, si) => <g key={s.k}>
              <polyline fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth={3} points={s.pts.map((v, i) => `${60 + i * (720 / 13)},${360 - v / allMax * 320}`).join(' ')} />
              <text x={60 + 13 * (720 / 13) + 6} y={360 - s.pts[13] / allMax * 320 + 4} fill={COLORS[si % COLORS.length]} fontSize={11} fontWeight={700}>{s.k}</text>
            </g>)}
          </svg>
        )}
        {view === 2 && (
          <svg viewBox="0 0 800 420" width="100%" style={{ display: 'block' }}>
            {bars.map((b, i) => { const n = bars.length, w = 720 / n, mx = Math.max(1, ...bars.flatMap(x => [x.a, x.b])); const x = 60 + i * w; return (
              <g key={b.k}>
                <rect x={x + w * 0.15} y={360 - b.a / mx * 300} width={w * 0.3} height={b.a / mx * 300} fill="rgba(23,26,46,.18)" />
                <rect x={x + w * 0.5} y={360 - b.b / mx * 300} width={w * 0.3} height={b.b / mx * 300} fill={b.d < -15 ? '#d6336c' : '#6a5cff'} />
                <text x={x + w / 2} y={385} textAnchor="middle" fill="#171a2e" fontSize={12} fontWeight={700}>{b.k}</text>
                <text x={x + w / 2} y={360 - Math.max(b.a, b.b) / mx * 300 - 8} textAnchor="middle" fill={b.d < -15 ? '#d6336c' : '#12a150'} fontSize={13} fontWeight={800}>{b.d >= 0 ? '+' : ''}{b.d.toFixed(0)}%</text>
                <text x={x + w / 2} y={405} textAnchor="middle" fill="#6b7089" fontSize={10.5}>{fmt(b.a)} → {fmt(b.b)}</text>
              </g>); })}
            <text x={60} y={24} fill="#6b7089" fontSize={12}>灰 = 上上周六 · 彩 = 上周六</text>
          </svg>
        )}
      </div>
    </div>
  );
  const logApp = (
    <div style={{ padding: 18, height: '100%', overflow: 'auto', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, lineHeight: 1.7, color: '#171a2e' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 800, fontFamily: 'inherit' }}>pay-gateway · 错误日志</span>
        <span style={{ color: '#6b7089' }}>范围：{client ? DESK_CLIENTS[client] : '全部客户端'}{dim === 3 ? ' · 按版本' : ''}</span>
        <button disabled={!canAct || logSeen} onClick={fetchLog} style={{ marginLeft: 'auto', ...btnStyle(!logSeen), opacity: logSeen ? 0.6 : 1 }}>{logSeen ? '✓ 已拉取' : '拉取上周六日志'}</button>
      </div>
      {!logSeen ? (
        <div style={{ color: '#6b7089' }}>{versionSeen ? '范围已经缩到 Android · 版本，可以拉取了。' : '日志量过大（1.2 亿行）。请先在「大盘明细」里把范围缩到某个客户端 + 版本，再来拉取。'}</div>
      ) : (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', background: '#171a2e', color: '#d9dcef', padding: 14, borderRadius: 10 }}>{`[上周六] pay-gateway summary
android/7.2.1   req 184,322   timeout 114,280 (62.0%)   ok 69,112 (37.5%)
android/7.2.0   req  92,110   timeout     2,948 ( 3.2%)   ok 96.8%
android/7.1.0   req  60,402   timeout     1,751 ( 2.9%)   ok 97.1%
ios/12.4.0      req 171,900   timeout     4,470 ( 2.6%)   ok 97.4%
web             req  58,210   timeout     1,455 ( 2.5%)   ok 97.5%

首条 timeout：周六 00:10:42  android/7.2.1  POST /pay/confirm  504 upstream timeout (12.0s)
与 7.2.1 灰度放量时间（周五 23:50）一致。`}</pre>
      )}
    </div>
  );
  const canSend = words >= 80 && cite >= 3 && logSeen;
  const chatApp = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
        {CHAT.map((m, i) => <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: m.who === '明姐' ? '#6a5cff' : m.who === '业务总监' ? '#ff8a5f' : '#12b5cb', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0 }}>{m.who.slice(0, 1)}</div>
          <div><div style={{ fontSize: 12, color: '#6b7089' }}>{m.who} · {m.t}</div><div style={{ marginTop: 3, padding: '8px 12px', borderRadius: 12, background: '#fff', border: '1px solid rgba(23,26,46,.08)', fontSize: 14, lineHeight: 1.6, maxWidth: 560 }}>{m.text}</div></div>
        </div>)}
        {sent && <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexDirection: 'row-reverse' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#171a2e', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>我</div>
          <div><div style={{ fontSize: 12, color: '#6b7089', textAlign: 'right' }}>你 · 刚刚</div><div style={{ marginTop: 3, padding: '8px 12px', borderRadius: 12, background: '#e9e6ff', border: '1px solid rgba(106,92,255,.3)', fontSize: 14, lineHeight: 1.6, maxWidth: 560, whiteSpace: 'pre-wrap' }}>{report}</div></div>
        </div>}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid rgba(23,26,46,.08)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: '#6b7089' }}>{sent ? '已发出。' : canSend ? '简报写好了，可以发到群里。' : '简报还没写够（≥ 80 字、引用 ≥ 3 个关键数字、拿到日志证据）。'}</span>
        <button disabled={!canAct || !canSend || sent} onClick={() => act('send', 1)} style={{ marginLeft: 'auto', ...btnStyle(canSend && !sent), opacity: canSend && !sent ? 1 : 0.5 }}>把简报发到群里</button>
      </div>
    </div>
  );
  const docApp = (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>周六 GMV 异动排查简报</div>
      <div style={{ fontSize: 12.5, color: '#6b7089', margin: '4px 0 10px' }}>按「问题 / 发现 / 证据 / 建议」写，引用你看到的数字。已引用 {cite} 个关键数字 · {words} 字</div>
      <textarea value={report} disabled={!canAct && !auto} onChange={e => onReport(e.target.value)} placeholder={'问题：\n发现：\n证据：\n建议：'}
        style={{ flex: 1, minHeight: 0, resize: 'none', padding: 14, borderRadius: 10, border: '1px solid rgba(23,26,46,.16)', background: '#fbfbfe', color: '#171a2e', fontSize: 15, lineHeight: 1.9 }} />
    </div>
  );
  const noteApp = (
    <div style={{ padding: 22, fontSize: 15, lineHeight: 1.9, color: '#5a4a10', background: '#fff6c2', height: '100%' }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>明姐留的：</div>
      1. 别信群里的说法，先看数。<br />2. GMV 掉 = 流量 × 转化 × 支付 里哪一段掉了？换指标看。<br />3. 先拆大的（渠道 / 客户端），再拆小的（版本 / 地区）。<br />4. 缩到范围再拉日志，日志太多等于没看。<br />5. 简报要有数字，没有数字的结论不叫结论。
    </div>
  );
  const content: Record<number, React.ReactNode> = { 1: dataApp, 2: logApp, 3: chatApp, 4: docApp, 5: noteApp };
  const cur = APPS.find(a => a.id === app);

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #eef0fb 0%, #f6f7fc 55%, #eaf4f6 100%)', color: '#171a2e', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif', display: 'grid', gridTemplateRows: 'minmax(0, 1fr) 54px', overflow: 'hidden' }}>
      {/* 桌面：左边图标 + 窗口 */}
      <div style={{ position: 'relative', minHeight: 0 }}>
        <div style={{ position: 'absolute', left: 18, top: 18, display: 'grid', gap: 14, width: 96 }}>
          {APPS.map(a => <button key={a.id} disabled={!canAct} onDoubleClick={() => openApp(a.id)} onClick={() => openApp(a.id)} title={a.hint}
            style={{ border: 0, background: app === a.id ? 'rgba(106,92,255,.12)' : 'transparent', borderRadius: 14, padding: '10px 4px', cursor: canAct ? 'pointer' : 'default', color: '#171a2e', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, margin: '0 auto 6px', borderRadius: 16, background: '#fff', boxShadow: '0 6px 18px rgba(23,26,46,.12)', display: 'grid', placeItems: 'center', fontSize: 28 }}>{a.icon}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{a.name}</div>
            {a.id === 3 && !sent && <div style={{ fontSize: 10, color: '#d6336c', fontWeight: 800 }}>{CHAT.length} 条未读</div>}
          </button>)}
        </div>
        {/* 窗口 */}
        {cur ? (
          <div style={{ position: 'absolute', left: 132, top: 18, right: 18, bottom: 14, borderRadius: 16, background: '#fff', boxShadow: '0 24px 60px rgba(23,26,46,.16)', border: '1px solid rgba(23,26,46,.08)', display: 'grid', gridTemplateRows: '44px minmax(0, 1fr)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: '#f8f9fd', borderBottom: '1px solid rgba(23,26,46,.08)' }}>
              <span style={{ fontSize: 18 }}>{cur.icon}</span><span style={{ fontWeight: 800 }}>{cur.name}</span><span style={{ fontSize: 12, color: '#6b7089' }}>{cur.hint}</span>
              <button onClick={() => closeApp(cur.id)} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#6b7089', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ minHeight: 0, background: cur.id === 5 ? '#fff6c2' : cur.id === 3 ? '#f3f4fa' : '#fff' }}>{content[cur.id]}</div>
          </div>
        ) : (
          <div style={{ position: 'absolute', left: 160, top: '40%', color: '#6b7089', fontSize: 15 }}>点左边的图标打开工具。先看「运营群」和「便签」，再去「大盘明细」。</div>
        )}
      </div>
      {/* 任务栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', background: 'rgba(255,255,255,.85)', borderTop: '1px solid rgba(23,26,46,.08)', backdropFilter: 'blur(8px)' }}>
        <span style={{ fontWeight: 800, fontSize: 13, color: '#6a5cff', marginRight: 8 }}>数判官 · 工作台</span>
        {opened.map(id => { const a = APPS.find(x => x.id === id)!; return <button key={id} onClick={() => canAct && act('app', id)} style={{ ...btnStyle(app === id), display: 'flex', gap: 6, alignItems: 'center' }}><span>{a.icon}</span>{a.name}</button>; })}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#6b7089' }}>周一 09:38 · 置信度 {Math.round(st.vars.confidence || 0)}</span>
      </div>
    </div>
  );
}
