'use client';
/** 产业投资地图首页：一句话问 AI + 最新融资滚动 + 七条链 + 全景看板。不做入口，登录后所有角色可用。数字全部来自企业库和公开融资事件，不估算 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { ChainStrip, KPI, Overview, Sk, TipBox, useAct, useOverview, useTip } from './ui';
import { useChain } from './Shell';

const QUICK = ['半导体哪些环节近三年最热', '红杉中国最近投了什么', '上海在大量招人的未融资 AI 公司', '谁常和高瓴一起投'];

export default function InvestHome() {
  const router = useRouter(), act = useAct(), { chain, setChain } = useChain(), { d, err } = useOverview(chain), { tip, on } = useTip();
  const [text, setText] = useState('');
  const send = (t: string) => { const q = t.trim(); if (!q) return; try { sessionStorage.setItem('iv-pending', q); } catch {} router.push('/invest/chat'); };
  const feed = d?.recent || [];
  return <div className="iv-page">
    <section className="iv-hb">
      <div>
        <div className="iv-eb">{d ? `${d.label} · 产业投资地图` : '产业投资地图'}</div>
        <h1>{d ? d.insight[0] : '想了解哪个产业，直接问'}</h1>
        <div className="iv-ask"><textarea rows={2} value={text} placeholder="企业、融资、投资机构、产业链、人和关系，都可以问" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} /><div className="iv-ask-bar"><button className="iv-send" aria-label="发送" disabled={!text.trim()} onClick={() => send(text)}><ArrowUp size={17} /></button></div></div>
        <div className="iv-quick">{QUICK.map(q => <button key={q} onClick={() => send(q)}>{q}</button>)}</div>
      </div>
      <aside className="iv-live"><h2><i />最新融资</h2>{d ? <div className="iv-live-w"><div className="iv-live-t">{[...feed, ...feed].map((r: any, i: number) => <button key={i} onClick={() => act.company(r.id, r.name)}><span>{r.name} · {r.round}</span><em>{r.date?.slice(5)}</em></button>)}</div></div> : <Sk h={150} />}</aside>
    </section>
    <ChainStrip chains={d?.chains} chain={chain} setChain={setChain} />
    {err ? <div className="iv-empty">{err}</div> : !d ? <><Sk h={78} /><div className="iv-grid"><Sk h={480} style={{ gridColumn: 'span 5' }} /><Sk h={480} style={{ gridColumn: 'span 7' }} /></div></> : <><KPI d={d} /><Overview d={d} on={on} kpi={false} /></>}
    <TipBox tip={tip} />
  </div>;
}
