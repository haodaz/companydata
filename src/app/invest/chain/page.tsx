'use client';
import { ChainBoard, ChainChips, TipBox, fmt, useOverview, useTip } from '../ui';
import { useChain } from '../Shell';

export default function ChainPage() {
  const { chain, setChain } = useChain(), { d, err } = useOverview(chain), { tip, on } = useTip();
  return <div className="iv-page">
    <header className="iv-h"><h1>{d && chain !== 'all' ? `${d.label}产业链` : '产业链'}</h1><p>颜色越深，近三年融资越多。「热门」是近三年融资最多的三环；「待发掘」是企业不少、近三年却很少见融资的环节。</p></header>
    <ChainChips chains={d?.chains} chain={chain} setChain={setChain} />
    {err ? <div className="iv-empty">{err}</div> : !d ? <div className="iv-empty">读取中…</div> : chain === 'all'
      ? <section className="iv-card"><h2>选一条产业链</h2><p className="iv-sub">每一环都连着真实的企业、融资和招聘</p><div className="iv-pick">{d.chains.map((c: any) => <button key={c.key} onClick={() => setChain(c.key)}><b>{c.name}</b><span>{fmt(c.companies)} 家企业</span></button>)}</div></section>
      : <ChainBoard key={chain} d={{ ...d, chain }} on={on} />}
    <TipBox tip={tip} />
  </div>;
}
