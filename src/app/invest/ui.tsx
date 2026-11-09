'use client';
/** /invest 共用部件：图表、企业表、产业链板、企业 / 机构详情。整页和对话右边的应用区用同一套，点企业、点机构做什么由 ActCtx 决定 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import MAP from '@/data/china-map.json';

const STAGES = [['early', '早期', '种子、天使、Pre-A'], ['growth', '成长期', 'A、B 轮'], ['late', '后期', 'C 轮及以后、Pre-IPO'], ['strategic', '战略并购', '战略投资、并购、增资'], ['public', '上市再融资', 'IPO、定增、可转债']] as const;
const SC = (k: string) => `var(--s-${k})`;
export const fmt = (n: number) => (n || 0).toLocaleString('zh-CN');
export const api = async (params: Record<string, any>) => { const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => [k, String(v)])); const r = await fetch(`/api/invest?${q}`); const j = await r.json(); if (!j.success) throw new Error(j.error || '读取失败'); return j.data; };

export type Act = { company: (id: number, name?: string) => void; investor: (name: string) => void; place: (p: string) => void; canAdmin: boolean };
export const ActCtx = createContext<Act>({ company() {}, investor() {}, place() {}, canAdmin: false });
export const useAct = () => useContext(ActCtx);

type Tip = { x: number; y: number; html: React.ReactNode } | null;
export function useTip() { const [tip, setTip] = useState<Tip>(null); const on = (html: React.ReactNode) => ({ onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, html }), onMouseLeave: () => setTip(null) }); return { tip, on }; }
export const TipBox = ({ tip }: { tip: Tip }) => tip && <div className="iv-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 270), top: tip.y + 14 }}>{tip.html}</div>;
const Legend = () => <div className="iv-legend">{STAGES.map(([k, n, d]) => <span key={k} title={d}><i style={{ background: SC(k) }} />{n}</span>)}</div>;
const stageLines = (st: Record<string, number>) => STAGES.filter(([k]) => st[k]).map(([k, n]) => <div key={k}>{n} {st[k]}</div>);

export function useOverview(chain: string) {
  const [d, setD] = useState<any>(null), [err, setErr] = useState('');
  useEffect(() => { let live = true; setErr(''); api({ view: 'overview', chain }).then(x => live && setD(x)).catch(e => live && setErr(e.message)); return () => { live = false; }; }, [chain]);
  return { d, err };
}
export const ChainChips = ({ chains, chain, setChain }: { chains?: any[]; chain: string; setChain: (c: string) => void }) => <div className="iv-chips"><button className={chain === 'all' ? 'on' : ''} onClick={() => setChain('all')}>全部产业</button>{chains?.map((c: any) => <button key={c.key} className={chain === c.key ? 'on' : ''} onClick={() => setChain(c.key)}>{c.name}<small>{fmt(c.companies)}</small></button>)}</div>;

/** 省级融资地图：边界来自 DataV.GeoAtlas（scripts/invest/build-china-map.mjs）。南海诸岛放右下角小窗。港澳台只记国家这一级，也按地区显示 */
function ChinaMap({ data, on }: { data: any[]; on: any }) {
  const act = useAct(), m = new Map(data.map(p => [p.name, p])), dom = data.filter(p => p.name !== '海外' && p.events > 0), max = Math.max(1, ...dom.map(p => p.events));
  const fill = (v: number) => v ? `color-mix(in srgb, #4B3FD8 ${Math.round(12 + Math.pow(Math.log(1 + v) / Math.log(1 + max), 1.2) * 88)}%, #ECEEFA)` : '#EFF0F6';
  const top = new Set(dom.slice(0, 5).map(p => p.name)), geo = MAP as { w: number; h: number; inset: string; jd: string; provinces: { n: string; d: string; c: [number, number] }[] };
  const paths = (list: typeof geo.provinces) => list.map(p => { const x: any = m.get(p.n), v = x?.events || 0; return <path key={p.n} className="iv-prov" d={p.d} fill={fill(v)} onClick={() => x && act.place(p.n)} {...on(<><b>{p.n}</b><div>融资事件 {v}</div><div>企业 {x?.companies || 0}</div></>)} />; });
  const IW = 150, IH = 206;
  return <><svg viewBox={`0 0 ${geo.w} ${geo.h}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="各省融资事件数地图">
    {paths(geo.provinces)}
    <path d={geo.jd} className="iv-jd" />
    {geo.provinces.filter(p => top.has(p.n)).map(p => <text key={p.n} x={p.c[0]} y={p.c[1]} className="iv-maplb" textAnchor="middle">{p.n} {m.get(p.n)?.events}</text>)}
    <g transform={`translate(${geo.w - IW - 6} ${geo.h - IH - 6})`}><rect width={IW} height={IH} fill="#fff" stroke="var(--ink3)" strokeWidth="1" /><svg width={IW} height={IH} viewBox={geo.inset} preserveAspectRatio="xMidYMid slice">{geo.provinces.filter(p => ['海南', '广东', '广西', '福建', '台湾'].includes(p.n)).map(p => <path key={p.n} d={p.d} fill="#E4E6EF" stroke="#fff" strokeWidth=".8" />)}<path d={geo.jd} className="iv-jd" /></svg><text x={IW / 2} y={IH - 7} textAnchor="middle" fontSize="13" fill="var(--ink2)">南海诸岛</text></g>
  </svg>
  <div className="iv-plist">{dom.slice(0, 8).map(p => <button key={p.name} onClick={() => act.place(p.name)}><span>{p.name}</span><b>{p.events}</b></button>)}</div></>;
}

function YearBars({ years, on }: { years: any[]; on: any }) {
  const W = 620, H = 200, P = { l: 30, r: 6, t: 8, b: 22 }, max = Math.max(1, ...years.map(y => y.total)), bw = (W - P.l - P.r) / years.length, ys = (v: number) => (H - P.b - P.t) * v / max;
  const tickStep = [1, 2, 5, 10, 20, 50, 100, 200, 500].find(s => max / s <= 4) || 1000, ticks = Array.from({ length: Math.floor(max / tickStep) + 1 }, (_, i) => i * tickStep);
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="各年融资事件数，按阶段堆叠">
    {ticks.map(t => <g key={t}><line x1={P.l} x2={W - P.r} y1={H - P.b - ys(t)} y2={H - P.b - ys(t)} stroke="var(--line)" /><text x={P.l - 6} y={H - P.b - ys(t) + 3} textAnchor="end" fontSize="10" fill="var(--ink3)">{t}</text></g>)}
    {years.map((y, i) => { let acc = 0; const x = P.l + i * bw + bw * .17, w = bw * .66, order = [...STAGES.map(s => s[0]), 'other'] as string[], segs = order.filter(k => y.stages[k] > 0); return <g key={y.y} {...on(<><b>{y.y} 年 · {y.total} 起</b>{stageLines(y.stages)}{y.stages.other ? <div>其他 {y.stages.other}</div> : null}</>)}>
      <rect x={P.l + i * bw} y={P.t} width={bw} height={H - P.t - P.b} fill="transparent" />
      {segs.map((k, si) => { const h = Math.max(1, ys(y.stages[k])), yy = H - P.b - acc - h; acc += h + 1.5; return si === segs.length - 1 ? <path key={k} d={`M${x},${yy + h} V${yy + Math.min(3, h)} Q${x},${yy} ${x + 3},${yy} H${x + w - 3} Q${x + w},${yy} ${x + w},${yy + Math.min(3, h)} V${yy + h} Z`} fill={SC(k)} /> : <rect key={k} x={x} y={yy} width={w} height={h} fill={SC(k)} />; })}
      <text x={x + w / 2} y={H - 7} textAnchor="middle" fontSize="10.5" fill="var(--ink2)">{String(y.y).slice(2)}</text>
    </g>; })}
  </svg>;
}

const Stack = ({ st, total, max }: { st: Record<string, number>; total: number; max: number }) => <div className="iv-stack" style={{ width: `${Math.max(4, total / max * 100)}%` }}>{STAGES.filter(([k]) => st[k]).map(([k]) => <i key={k} style={{ width: `${st[k] / total * 100}%`, background: SC(k) }} />)}{st.other ? <i style={{ width: `${st.other / total * 100}%`, background: SC('other') }} /> : null}</div>;

export function InvestorRank({ list, on, wide }: { list: any[]; on: any; wide?: boolean }) {
  const act = useAct(), max = Math.max(1, ...list.map(t => t.total));
  return <>{list.map(t => <button className="iv-rank" style={wide ? { gridTemplateColumns: '150px minmax(0,1fr) 44px' } : undefined} key={t.name} onClick={() => act.investor(t.name)} {...on(<><b>{t.name} · {t.total} 起</b>{stageLines(t.stages)}</>)}><span>{t.name}</span><Stack st={t.stages} total={t.total} max={max} /><b>{t.total}</b></button>)}</>;
}

/** 全景看板：首页和应用区共用 */
export function Overview({ d, on }: { d: any; on: any }) {
  const act = useAct();
  const totalSt = Object.values(d.stageTotals as Record<string, number>).reduce((s, n) => s + n, 0);
  return <>
    <section className="iv-kpis">{[['企业', d.kpi.companies], ['有融资记录', d.kpi.funded], ['融资事件', d.kpi.events], ['投资机构', d.kpi.investors], ['上市公司', d.kpi.listed], ['在招岗位', d.kpi.jobs]].map(([n, v]) => <div className="iv-kpi" key={n as string}><b>{fmt(v as number)}</b><span>{n}</span></div>)}</section>
    <div className="iv-insight">{d.insight.join('')}</div>
    <div className="iv-grid">
      <section className="iv-card s5"><h2>融资流向哪里</h2><p className="iv-sub">颜色越深融资事件越多，点省份看当地企业。海外 {d.provinces.find((p: any) => p.name === '海外')?.events || 0} 起未显示</p><ChinaMap data={d.provinces} on={on} /></section>
      <section className="iv-card s7"><h2>每年融资事件</h2><p className="iv-sub">{totalSt > 0 && <>样本共 {fmt(totalSt)} 起，{STAGES.map(([k, n]) => `${n} ${Math.round(d.stageTotals[k] / totalSt * 100)}%`).join('，')}</>}</p><Legend /><YearBars years={d.years} on={on} /></section>
      <section className="iv-card s5"><h2>谁在出手</h2><p className="iv-sub">按参与事件数排名，点机构看组合和合作伙伴</p><Legend /><InvestorRank list={d.topInvestors} on={on} /></section>
      <section className="iv-card s4"><h2>最新融资</h2><p className="iv-sub">按披露日期</p><div className="iv-list">{d.recent.map((r: any, i: number) => <button key={i} className="iv-row" onClick={() => act.company(r.id, r.name)}><span><strong>{r.name}</strong><small>{[r.round, r.amount, r.investors[0]].filter(Boolean).join(' · ')}</small></span><em>{r.date?.slice(2)}</em></button>)}</div></section>
      <section className="iv-card s3"><h2>谁在招人</h2><p className="iv-sub">融资之外的前瞻信号</p><div className="iv-list">{d.hiring.map((h: any) => <button key={h.id} className="iv-row" onClick={() => act.company(h.id, h.name)}><span><strong>{h.name}</strong>{h.d30 > 0 && <small>30 天内新增 {h.d30}</small>}</span><em>{h.open}</em></button>)}</div></section>
    </div>
  </>;
}

export function CompanyTable({ params, onClear }: { params: Record<string, any>; onClear?: () => void }) {
  const act = useAct();
  const [tab, setTab] = useState(''), [sort, setSort] = useState('latest'), [q, setQ] = useState(''), [kw, setKw] = useState(''), [page, setPage] = useState(1), [d, setD] = useState<any>(null);
  const key = JSON.stringify(params);
  useEffect(() => { setPage(1); }, [key, tab, sort, kw]);
  useEffect(() => { let live = true; api({ view: 'companies', ...params, tab, sort, q: kw, page }).then(x => live && setD(x)).catch(() => live && setD({ total: 0, rows: [], size: 20, page: 1 })); return () => { live = false; }; }, [key, tab, sort, kw, page]);  // eslint-disable-line react-hooks/exhaustive-deps
  const filt = Object.entries(params).filter(([k, v]) => v && ['place', 'investor', 'nodeName'].includes(k));
  return <>
    <div className="iv-tools">
      <div className="iv-seg">{[['', '全部'], ['listed', '上市'], ['funded', '已融资'], ['unfunded', '未见融资']].map(([k, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
      <div className="iv-seg">{[['latest', '最新融资'], ['jobs', '在招岗位'], ['founded', '最新成立']].map(([k, n]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{n}</button>)}</div>
      <input placeholder="搜企业名 / 细分" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && setKw(q.trim())} onBlur={() => setKw(q.trim())} />
      {filt.map(([k, v]) => <span key={k} className="iv-pill">{String(v)}{onClear && <button onClick={onClear} aria-label="清除筛选">×</button>}</span>)}
    </div>
    {!d ? <div className="iv-empty">读取中…</div> : !d.rows.length ? <div className="iv-empty">这个条件下没有企业</div> : <><div className="iv-scroll"><table className="iv-table"><thead><tr><th>企业</th><th>地区</th><th>成立</th><th>最近融资</th><th>投资方</th><th>在招</th></tr></thead><tbody>
      {d.rows.map((r: any) => <tr key={r.id} onClick={() => act.company(r.id, r.name)}><td><strong>{r.name}</strong>{r.listed && <span className="iv-tag">上市</span>}<small>{r.sub || ''}</small></td><td className="n">{r.place || '—'}</td><td className="n">{r.founded || '—'}</td><td className="n">{r.lastRound ? <>{r.lastRound}<small>{r.lastDate || '日期未披露'}</small></> : '—'}</td><td><small style={{ color: 'var(--ink2)' }}>{r.investors.join('、') || '—'}</small></td><td className="n">{r.jobs || '—'}</td></tr>)}
    </tbody></table></div>
    <div className="iv-pager"><span>共 {fmt(d.total)} 家</span><div><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button><button disabled={page * d.size >= d.total} onClick={() => setPage(p => p + 1)}>下一页</button></div></div></>}
  </>;
}

/** 产业链板 + 选中一环看企业 */
export function ChainBoard({ d, on }: { d: any; on: any }) {
  const [node, setNode] = useState<any>(null);
  const all = useMemo(() => d.stages.flatMap((s: any) => s.nodes), [d]);
  const maxRecent = Math.max(1, ...all.map((n: any) => n.recent));
  const hot = useMemo(() => new Set([...all].filter((n: any) => n.recent > 0).sort((a: any, b: any) => b.recent - a.recent).slice(0, 3).map((n: any) => n.key)), [all]);
  const gap = (n: any) => n.companies >= 8 && n.recent <= Math.max(1, n.companies * .06);
  return <>
    <section className="iv-card" style={{ gridColumn: 'auto' }}><div className="iv-chain">{d.stages.map((s: any) => <div className="iv-col" key={s.name}><h3>{s.name}</h3>{s.nodes.map((n: any) => { const t = n.recent ? Math.pow(n.recent / maxRecent, .6) : 0, sel = node?.key === n.key; return <button key={n.key} className={`iv-node${sel ? ' on' : ''}`} style={{ background: `color-mix(in srgb, #5B4FE9 ${Math.round(t * 26)}%, #fff)` }} onClick={() => setNode(sel ? null : n)} {...on(<><b>{n.name}</b><div>企业 {n.companies}，其中有融资 {n.funded}</div><div>融资事件 {n.events}，近三年 {n.recent}</div><div>在招岗位 {n.jobs}</div></>)}><b>{n.name}{hot.has(n.key) ? <span className="iv-tag hot">热门</span> : gap(n) ? <span className="iv-tag gap">待发掘</span> : null}</b><span>{n.companies} 家 · 近三年 {n.recent} 起</span></button>; })}</div>)}</div></section>
    <section className="iv-card" style={{ gridColumn: 'auto' }}><h2>{node ? node.name : `${d.label}全部企业`}</h2><p className="iv-sub">点企业看融资历程和团队</p><CompanyTable params={{ chain: d.chain, node: node?.key, nodeName: node?.name }} onClear={() => setNode(null)} /></section>
  </>;
}

function CoGraph({ name, peers, on }: { name: string; peers: any[]; on: any }) {
  const act = useAct(), S = 420, c = S / 2, R = 150, max = Math.max(1, ...peers.map(p => p.shared));
  return <svg className="iv-graph" viewBox={`0 0 ${S} ${S}`} style={{ width: '100%', maxWidth: 420, display: 'block', margin: '0 auto' }} role="img" aria-label={`${name}的共同投资机构`}>
    {peers.map((p, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / peers.length; return <line key={p.name} x1={c} y1={c} x2={c + R * Math.cos(a)} y2={c + R * Math.sin(a)} strokeWidth={1 + 4 * p.shared / max} />; })}
    <circle cx={c} cy={c} r={46} fill="var(--acc)" /><text x={c} y={c + 4} style={{ fill: '#fff', fontWeight: 600, fontSize: 13 }}>{name.slice(0, 7)}</text>
    {peers.map((p, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / peers.length, x = c + R * Math.cos(a), y = c + R * Math.sin(a), r = 11 + 13 * p.shared / max; return <g key={p.name} className="peer" onClick={() => act.investor(p.name)} {...on(<><b>{p.name}</b><div>一起投过 {p.shared} 家</div><div className="m">{p.companies.join('、')}</div></>)}><circle cx={x} cy={y} r={r} /><text x={x} y={y + r + 13}>{p.name.slice(0, 8)}</text><text x={x} y={y + 4} style={{ fontSize: 11 }}>{p.shared}</text></g>; })}
  </svg>;
}

export function InvestorDetail({ name, on }: { name: string; on: any }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { let live = true; setD(null); api({ view: 'investor', name }).then(x => live && setD(x)).catch(() => live && setD({ error: true })); return () => { live = false; }; }, [name]);
  if (!d) return <div className="iv-empty">读取中…</div>;
  if (d.error || !d.events) return <div className="iv-empty">库里没有这家机构的投资记录</div>;
  const total = Math.max(1, Object.values(d.stages as Record<string, number>).reduce((s, n) => s + n, 0));
  return <>
    <header className="iv-h"><h1>{d.name}</h1><p>库内可见 {d.events} 起投资，覆盖 {d.companies} 家企业{d.sectors.length > 0 && <>；较多落在{d.sectors.slice(0, 3).map((s: any) => s[0]).join('、')}</>}{d.places.length > 0 && <>；地区集中在{d.places.slice(0, 3).map((s: any) => s[0]).join('、')}</>}。</p></header>
    <div className="iv-grid">
      <section className="iv-card s5"><h2>常一起投的机构</h2><p className="iv-sub">线越粗，共同投过的企业越多。点节点切换</p>{d.peers.length ? <CoGraph name={d.name} peers={d.peers} on={on} /> : <div className="iv-empty">没有共同投资记录</div>}</section>
      <section className="iv-card s7"><h2>阶段与节奏</h2><p className="iv-sub">各阶段占比和每年出手次数</p><Legend /><Stack st={d.stages} total={total} max={total} /><div style={{ marginTop: 16 }}><YearBars years={d.years} on={on} /></div></section>
      <section className="iv-card s12"><h2>投过的企业</h2><p className="iv-sub">点企业看详情</p><CompanyTable params={{ chain: 'all', investor: d.name }} /></section>
    </div>
  </>;
}

export function CompanyDetail({ id }: { id: number }) {
  const act = useAct();
  const [d, setD] = useState<any>(null), [err, setErr] = useState('');
  useEffect(() => { setD(null); setErr(''); api({ view: 'company', id }).then(setD).catch(e => setErr(e.message)); }, [id]);
  if (err) return <div className="iv-empty">{err}</div>;
  if (!d) return <div className="iv-empty">读取中…</div>;
  return <div className="iv-co">
    <h2>{d.name}</h2>
    <p className="iv-meta">{[d.chains.join(' / '), d.place, d.founded && `${d.founded} 年成立`, d.capital].filter(Boolean).join(' · ')}{d.listed && <span className="iv-tag">上市{d.stock ? ` ${d.stock}` : ''}</span>}</p>
    {d.intro && <p style={{ margin: '10px 0 0' }}>{d.intro}</p>}
    <p className="iv-meta">{act.canAdmin && <a className="iv-link" href={`/admin/db-company/${d.id}`} target="_blank" rel="noreferrer">完整档案（字段带来源）</a>}{d.site && <>{act.canAdmin && ' · '}<a className="iv-link" href={d.site} target="_blank" rel="noreferrer">官网</a></>}{d.jobs > 0 && <> · 在招 {d.jobs} 个岗位</>}</p>
    <h3>融资历程 · {d.finances.length} 起</h3>
    {d.finances.length ? <div className="iv-tl">{d.finances.map((f: any, i: number) => <div key={i} style={{ '--dot': f.stage === 'other' ? 'var(--ink3)' : SC(f.stage) } as React.CSSProperties}><strong>{f.round}</strong>{f.amount && ` · ${f.amount}`}{f.source && <> · <a className="iv-link" style={{ fontSize: 12 }} href={f.source} target="_blank" rel="noreferrer">来源</a></>}<small>{f.date || '日期未披露'}</small>{f.investors.length > 0 && <small>{f.investors.map((n: string, k: number) => <span key={n}>{k > 0 && '、'}<a className="iv-link" onClick={() => act.investor(n)}>{n}</a></span>)}</small>}</div>)}</div> : <p className="iv-meta">公开资料里没有查到融资。</p>}
    {d.growth && <><h3>增长信号</h3><p className="iv-meta">{d.growth}</p></>}
    {d.tech && <><h3>技术优势</h3><p className="iv-meta">{d.tech}</p></>}
    {d.execs.length > 0 && <><h3>管理团队</h3><p className="iv-meta">{d.execs.map((e: any) => [e.name, e.title].filter(Boolean).join(' · ')).join('；')}</p></>}
    {d.products.length > 0 && <><h3>主要产品</h3><p className="iv-meta">{d.products.map((p: any) => p.name).join('、')}</p></>}
    {d.news.length > 0 && <><h3>近期动态</h3><div className="iv-list">{d.news.map((n: any, i: number) => <a key={i} className="iv-row" href={n.source_url || undefined} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><span style={{ fontSize: 13 }}>{n.description}</span><em>{n.publish_date || ''}</em></a>)}</div></>}
  </div>;
}

/** 关系路径：一串文字卡片，不画图 */
export function PathCards({ paths }: { paths: any[] }) {
  return <div className="iv-paths">{paths.map((p, i) => <section key={i} className="iv-path">
    <h3>{p.depth} 步{p.via_hub && <span className="iv-tag">经共同机构，弱关系</span>}</h3>
    <div className="iv-chainline">{p.nodes.map((n: string, k: number) => <span key={k} className="iv-link-step"><b>{n}</b>{k < p.steps.length && <em>{p.steps[k].relation}</em>}</span>)}</div>
    {p.steps.some((s: any) => s.evidence) && <ul>{p.steps.filter((s: any) => s.evidence).map((s: any, k: number) => <li key={k}><b>{s.from} · {s.to}</b>：{s.evidence}</li>)}</ul>}
  </section>)}<p className="iv-sub">路径来自公开的合作、师承、任职和亲属记录，只说明有过这层关系，不代表现在熟悉。</p></div>;
}

