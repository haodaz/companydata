'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChainChips, Count, InvestorDetail, InvestorRank, Sk, StageLegend, TipBox, fmt, useAct, useOverview, useTip } from '../ui';
import { useChain } from '../Shell';

export default function InvestorsPage() {
  const name = useSearchParams().get('name') || '', act = useAct(), { chain, setChain } = useChain(), { d, err } = useOverview(chain), { tip, on } = useTip();
  const top = d?.topInvestors || [];
  return <div className="iv-page">
    {name ? <><Link href="/invest/investors" className="iv-link" style={{ fontSize: 13 }}>← 机构排行</Link><InvestorDetail name={name} on={on} /></> : <>
      <section className="iv-top"><div><div className="iv-eb">投资机构</div><h1>{d ? `${d.label}谁在出手` : '谁在出手'}</h1><p>按参与的融资事件排名，点一家看组合、阶段偏好和常一起投的伙伴。</p></div>{d && <div className="iv-stats"><div><b><Count v={d.kpi.investors} /></b><span>投资机构</span></div><div><b><Count v={d.kpi.events} /></b><span>融资事件</span></div><div><b><Count v={d.kpi.recent} /></b><span>近三年</span></div></div>}</section>
      <ChainChips chains={d?.chains} chain={chain} setChain={setChain} />
      {err ? <div className="iv-empty">{err}</div> : !d ? <Sk h={420} /> : <>
        <div className="iv-pod">{top.slice(0, 3).map((t: any, i: number) => <button key={t.name} className="iv-p" onClick={() => act.investor(t.name)}><u>{i + 1}</u><h3>{t.name}</h3><div className="iv-pr"><div><b>{fmt(t.total)}</b><span>融资事件</span></div><div><b>{fmt(t.companies)}</b><span>投过企业</span></div><div><b>{fmt(t.recent)}</b><span>近三年</span></div></div><InvestorRankBar t={t} /></button>)}</div>
        <section className="iv-card"><StageLegend /><div className="iv-rows2"><div><InvestorRank list={top.slice(3, 9)} on={on} wide max={top[3]?.total} /></div><div><InvestorRank list={top.slice(9)} on={on} wide max={top[3]?.total} /></div></div></section>
        <div className="iv-grid">
          <section className="iv-card s5"><h2>近三年最活跃</h2><p className="iv-sub">前十五家里，按近三年参与的融资事件排</p><div className="iv-list">{[...top].sort((x: any, y: any) => y.recent - x.recent).slice(0, 8).map((t: any) => <button key={t.name} className="iv-row" onClick={() => act.investor(t.name)}><strong>{t.name}</strong><em>{fmt(t.recent)} 起 · 共投 {fmt(t.companies)} 家</em></button>)}</div></section>
          <section className="iv-card s7"><h2>最新融资</h2><p className="iv-sub">看看钱刚刚投到了哪里</p><div className="iv-list">{d.recent.slice(0, 8).map((r: any, i: number) => <button key={i} className="iv-row" onClick={() => act.company(r.id, r.name)}><span><strong>{r.name}</strong><small>{[r.round, r.amount, r.investors.join('、')].filter(Boolean).join(' · ')}</small></span><em>{r.date?.slice(2)}</em></button>)}</div></section>
        </div>
      </>}
    </>}
    <TipBox tip={tip} />
  </div>;
}
const COL: Record<string, string> = { early: 'var(--s-early)', growth: 'var(--s-growth)', late: 'var(--s-late)', strategic: 'var(--s-strategic)', public: 'var(--s-public)', other: 'var(--s-other)' };
const InvestorRankBar = ({ t }: { t: any }) => <div className="iv-stack" style={{ position: 'relative', zIndex: 1 }}>{Object.keys(COL).filter(k => t.stages[k]).map(k => <i key={k} style={{ width: `${t.stages[k] / t.total * 100}%`, background: COL[k] }} />)}</div>;
