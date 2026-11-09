'use client';
import { useEffect } from 'react';
import { ChainBoard, ChainStrip, Count, Sk, TipBox, useOverview, useTip } from '../ui';
import { useChain } from '../Shell';

export default function ChainPage() {
  const { chain, setChain } = useChain(), { tip, on } = useTip();
  useEffect(() => { if (chain === 'all') setChain('semi'); }, [chain, setChain]);   // 这一页总要看某条链，默认半导体
  const c = chain === 'all' ? 'semi' : chain, { d, err } = useOverview(c);
  const nodes = (d?.stages || []).flatMap((s: any) => s.nodes), hot = [...nodes].sort((a: any, b: any) => b.recent - a.recent)[0];
  return <div className="iv-page">
    <section className="iv-top"><div><div className="iv-eb">产业链</div><h1>{d ? `${d.label}产业链` : '产业链'}</h1><p>颜色越深，近三年融资越多。「待发掘」是企业不少、近三年却很少见融资的环节。</p></div>
      {d && <div className="iv-stats"><div><b><Count v={d.kpi.companies} /></b><span>企业</span></div><div><b><Count v={d.kpi.recent} /></b><span>近三年融资</span></div><div><b><Count v={d.kpi.jobs} /></b><span>在招岗位</span></div>{hot && <div><b style={{ fontSize: 18, lineHeight: '27px' }}>{hot.name}</b><span>最热环节</span></div>}</div>}</section>
    <ChainStrip chains={d?.chains} chain={c} setChain={setChain} all={false} />
    {err ? <div className="iv-empty">{err}</div> : !d ? <Sk h={420} /> : d.stages.length ? <ChainBoard key={c} d={{ ...d, chain: c }} on={on} /> : <Sk h={420} />}
    <TipBox tip={tip} />
  </div>;
}
