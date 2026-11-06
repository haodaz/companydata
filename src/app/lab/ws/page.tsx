'use client';

/**
 * 「AI 百业｜模拟」workspace · 首页（E，11-06）：一句话交给助理（进对话、AI 全包），下面是案头——空间状态、最近的空间、最近有人玩的。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useModel } from '@/lib/model-context';
import { col, FX_CSS, LISTING, when } from '@/components/lab/FactoryKit';

const QUICK = ['给高中生做一个【职业】的生涯体验空间', '帮我看看哪些空间该改、哪些可以上架了', '我那个【空间】的第【几】章太难了', '照这份 JD 做一个空间，给新员工用：'];

export default function LabWsHome() {
  const router = useRouter(); const { currentModel } = useModel();
  const [text, setText] = useState(''); const [d, setD] = useState<any>(null);
  useEffect(() => { fetch('/api/lab/factory?view=spaces', { cache: 'no-store' }).then(r => r.json()).then(j => setD(j.ok ? j : { spaces: [] })).catch(() => setD({ spaces: [] })); }, []);
  const go = () => { const t = text.trim(); if (!t) return; try { sessionStorage.setItem('lws-pending', JSON.stringify({ text: t, model: currentModel })); } catch {} router.push('/lab/ws/chat'); };
  const sp: any[] = d?.spaces || [];
  const plays = sp.reduce((a, s) => a + s.plays, 0);
  const recent = sp.slice(0, 6), played = [...sp].filter(s => s.last_play).sort((a, b) => String(b.last_play).localeCompare(String(a.last_play))).slice(0, 6);
  return (
    <div className="fx" style={{ maxWidth: 1080 }}>
      <style>{FX_CSS + CSS}</style>
      <section className="lh-hero">
        <div className="lab-mono lab-cap">AI 百业｜模拟</div>
        <h1>想做一个什么样的职业模拟？</h1>
        <div className="lh-box">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="说你要做什么：给谁做一个什么职业的体验、改哪个空间、看看哪些该上架……" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); go(); } }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="fx-muted">回车发送，交给助理一路办；也可以 <Link href="/lab/ws/new" style={{ color: 'var(--v)', fontWeight: 700 }}>自己填表新建</Link></span><button className="lab-btn sm" disabled={!text.trim()} onClick={go}>发送</button></div>
        </div>
        <div className="lh-quick">{QUICK.map(q => <button key={q} className="fx-chip" onClick={() => setText(q)}>{q.replace(/【|】/g, '')}</button>)}</div>
      </section>
      <div className="fx-stats">{([['空间', sp.length], ['已上架', sp.filter(s => s.listing === 'listed').length], ['草稿', sp.filter(s => s.listing === 'draft').length], ['真人作答', plays]] as [string, any][]).map(([k, v]) => <div key={k} className="lab-glass fx-stat"><b>{d ? v : '…'}</b><span>{k}</span></div>)}</div>
      <div className="fx-boxes">
        <div className="lab-glass fx-box"><div className="fx-box-h"><b>最近的空间</b><span><Link href="/lab/ws/factory" style={{ color: 'var(--v)' }}>百业工厂 →</Link></span></div>
          {d && !recent.length && <div className="fx-muted">还没有。在上面说一句就能开始。</div>}
          {recent.map(s => <button key={s.id} className="fx-row" onClick={() => router.push(`/lab/ws/space/${s.id}`)}><span>{s.name ? `${s.name} · ${s.role}` : s.role || s.title}</span><em><span className={`fx-tag ${LISTING[s.listing]?.[1]}`}>{LISTING[s.listing]?.[0]}</span> · {s.chapters.published}/{s.chapters.total} 章</em></button>)}
        </div>
        <div className="lab-glass fx-box"><div className="fx-box-h"><b>最近有人玩</b><span><Link href="/lab/ws/usage" style={{ color: 'var(--v)' }}>使用记录 →</Link></span></div>
          {d && !played.length && <div className="fx-muted">还没有人玩过。上架后体验百业里就能被玩到。</div>}
          {played.map(s => <button key={s.id} className="fx-row" onClick={() => router.push(`/lab/ws/space/${s.id}?tab=plays`)}><span>{s.name ? `${s.name} · ${s.role}` : s.role || s.title}</span><em>{s.plays} 次 · 平均 <b style={{ color: col(s.avg) }}>{s.avg ?? '—'}</b> · {when(s.last_play)}</em></button>)}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.lh-hero { margin: 18px 0 22px; }
.lh-hero h1 { font-size: 30px; font-weight: 800; margin: 8px 0 14px; }
.lh-box { background: #fff; border: 1px solid var(--line); border-radius: 18px; padding: 12px 14px; box-shadow: 0 14px 40px -28px rgba(23,26,46,.35); display: grid; gap: 8px; }
.lh-box:focus-within { border-color: var(--v); }
.lh-box textarea { border: 0; outline: 0; resize: none; font: inherit; font-size: 15px; line-height: 1.7; color: var(--ink); background: transparent; }
.lh-quick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
@media (max-width: 640px) { .lh-hero h1 { font-size: 24px; } }
`;
