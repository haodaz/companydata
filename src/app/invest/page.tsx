'use client';
/** 产业投资地图首页：一句话问 AI，下面直接是全景看板。不做入口，直接访问 /invest（登录后所有角色可用）。数字全部来自企业库和公开融资事件，不估算 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { ChainChips, Overview, TipBox, useOverview, useTip } from './ui';
import { useChain } from './Shell';

const QUICK = ['半导体哪些环节近三年融资最热', '红杉中国最近投了什么', '上海有哪些未见融资但在大量招人的 AI 公司', '哪些机构常和高瓴一起投'];

export default function InvestHome() {
  const router = useRouter(), { chain, setChain } = useChain(), { d, err } = useOverview(chain), { tip, on } = useTip();
  const [text, setText] = useState('');
  const send = (t: string) => { const q = t.trim(); if (!q) return; try { sessionStorage.setItem('iv-pending', q); } catch {} router.push('/invest/chat'); };
  return <div className="iv-page">
    <div className="iv-home">
      <h1>想了解哪个产业，直接问</h1>
      <div className="iv-ask"><textarea rows={2} value={text} placeholder="企业、融资、投资机构、产业链、人、岗位，都可以问" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} /><div className="iv-ask-bar"><button className="iv-send" aria-label="发送" disabled={!text.trim()} onClick={() => send(text)}><ArrowUp size={17} /></button></div></div>
      <div className="iv-quick">{QUICK.map(q => <button key={q} onClick={() => send(q)}>{q}</button>)}</div>
    </div>
    <ChainChips chains={d?.chains} chain={chain} setChain={setChain} />
    {err ? <div className="iv-empty">{err}</div> : !d ? <div className="iv-empty">正在汇总企业、融资和招聘数据…</div> : <Overview d={d} on={on} />}
    <TipBox tip={tip} />
  </div>;
}
