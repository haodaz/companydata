'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChainChips, InvestorDetail, InvestorRank, TipBox, useOverview, useTip } from '../ui';
import { useChain } from '../Shell';

export default function InvestorsPage() {
  const name = useSearchParams().get('name') || '', { chain, setChain } = useChain(), { d, err } = useOverview(chain), { tip, on } = useTip();
  return <div className="iv-page">
    {name ? <><Link href="/invest/investors" className="iv-link" style={{ fontSize: 13 }}>← 机构排行</Link><InvestorDetail name={name} on={on} /></> : <>
      <header className="iv-h"><h1>投资机构</h1><p>按参与的融资事件数排名。点一家看组合、阶段偏好和常一起投的伙伴。</p></header>
      <ChainChips chains={d?.chains} chain={chain} setChain={setChain} />
      {err ? <div className="iv-empty">{err}</div> : !d ? <div className="iv-empty">读取中…</div> : <section className="iv-card"><InvestorRank list={d.topInvestors} on={on} wide /></section>}
    </>}
    <TipBox tip={tip} />
  </div>;
}
