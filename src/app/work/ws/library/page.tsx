'use client';

/**
 * 真活工作台 · 任务库（PGC）：去了企业名的好任务，挑一道原题直出换成自己的公司，或只做参考。
 * 原来的 /work/library 是独立页面（跳出工作台）；这里搬进来，样子跟工作台一致。?q= 预填搜索（助理 search_library 在右边打开时带上）。
 * 「原题直出 / 参考它出」把一句话放进对话框、空出企业名让人补；「让助理帮我挑」直接问助理。
 */
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { askHref } from '../ask';
import { Empty, Head } from '../ui';

type Item = { id: string; industry: string; direction: string; role: string; title: string; scenario: string; deliverables: { title: string; format?: string; module?: string }[]; materials: string[]; time_minutes?: number | null };
const MOD: Record<string, string> = { doc: '文档', sheet: '表格', code: '代码', canvas: '画布', board: '白板', design: '设计' };

export default function Page() { return <Suspense><Library /></Suspense>; }

function Library() {
  const sp = useSearchParams();
  const [items, setItems] = useState<Item[] | null>(null);
  const [kw, setKw] = useState(sp.get('q') || ''); const [ind, setInd] = useState('全部');
  const [cur, setCur] = useState<Item | null>(null);
  useEffect(() => { fetch('/api/work/library').then(r => r.json()).then(j => setItems(j.ok ? j.items : [])).catch(() => setItems([])); }, []);
  const inds = useMemo(() => { const m: Record<string, number> = {}; for (const x of items || []) m[x.industry] = (m[x.industry] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [items]);
  const kws = kw.split(/[\s,，、/]+/).filter(Boolean);
  const list = (items || []).filter(x => (ind === '全部' || x.industry === ind) && kws.every(k => [x.title, x.industry, x.direction, x.role, x.scenario].join(' ').includes(k)));
  const use = (x: Item, mode: 'base' | 'ref') => askHref(mode === 'base' ? `我想用任务库里的「${x.title}」（编号 ${x.id}），原题直出，换成我们公司：【企业名】。` : `我想用任务库里的「${x.title}」（编号 ${x.id}），只做参考，照它的思路给【企业名】出一道。`, { fill: true });
  return (
    <div className="wws-page">
      <Head eyebrow="LIBRARY" zh="任务库" en="Proven tasks, ready to make your own"
        lead="去了企业名的好任务。挑一道原题直出、换成你们公司，或者只做参考照着出。"
        acts={<Link href={askHref('帮我从任务库里挑一道合适的：我想考【要考的本事，比如把数据理清楚、做投研判断】。', { fill: true })}><button className="wws-btn p">让助理帮我挑</button></Link>} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input className="wws-in" value={kw} onChange={e => setKw(e.target.value)} placeholder="搜标题 / 方向 / 岗位，如 数据分析、投研、品牌" style={{ minWidth: 300 }} />
        {['全部', ...inds.map(x => x[0])].map(x => <button key={x} className={`wws-chip${ind === x ? ' on' : ''}`} onClick={() => setInd(x)}>{x}{x !== '全部' ? ` ${inds.find(y => y[0] === x)?.[1]}` : items ? ` ${items.length}` : ''}</button>)}
      </div>
      {items == null && <div className="wws-muted">读取中…</div>}
      {items && !list.length && <div className="wws-card"><Empty>没有符合的。换个说法，或者让助理按你要考的本事帮你挑。</Empty></div>}
      <div className="lib-grid">
        {list.map(x => <button key={x.id} className="wws-card lined lib-card" onClick={() => setCur(x)}>
          <div className="wws-eyebrow" style={{ letterSpacing: '.12em' }}>{x.industry} · {x.direction}</div>
          <div className="lib-t">{x.title}</div>
          <div className="lib-sc">{x.scenario}</div>
          <div className="lib-f">{x.role}{x.time_minutes ? ` · ${x.time_minutes} 分钟` : ''} · 交 {x.deliverables.length} 样</div>
        </button>)}
      </div>
      {cur && <div onClick={() => setCur(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(27,29,54,.26)', zIndex: 50 }}>
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(640px, 100%)', background: 'var(--paper)', boxShadow: '-10px 0 34px rgba(27,29,54,.14)', overflowY: 'auto', padding: '26px 28px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}><div className="wws-eyebrow">{cur.industry} · {cur.direction}{cur.time_minutes ? ` · ${cur.time_minutes} MIN` : ''}</div><button className="wws-btn" style={{ marginLeft: 'auto' }} onClick={() => setCur(null)}>关闭</button></div>
          <h2 style={{ font: '900 24px/1.35 var(--serif)', letterSpacing: '.02em', margin: '8px 0 6px' }}>{cur.title}</h2>
          <div className="wws-muted" style={{ marginBottom: 14 }}>要找的人：{cur.role}</div>
          <p style={{ fontSize: 14.5, lineHeight: 1.9, color: 'var(--ink)', margin: '0 0 18px' }}>{cur.scenario}</p>
          <div className="wws-card-h"><h3 className="wws-h2" style={{ fontSize: 16 }}>要交什么<small>Deliverables</small></h3></div>
          <ol style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 1.9, fontSize: 14 }}>{cur.deliverables.map((d, i) => <li key={i}>{d.title}{d.module && MOD[d.module] ? <span className="wws-muted">（{MOD[d.module]}）</span> : d.format ? <span className="wws-muted">（{d.format}）</span> : null}</li>)}</ol>
          {cur.materials?.length > 0 && <><div className="wws-card-h"><h3 className="wws-h2" style={{ fontSize: 16 }}>材料包<small>Materials</small></h3></div>
            <ul style={{ margin: '0 0 18px', paddingLeft: 20, lineHeight: 1.9, fontSize: 14, color: 'var(--ink2)' }}>{cur.materials.map((m, i) => <li key={i}>{m}</li>)}</ul></>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <Link href={use(cur, 'base')}><button className="wws-btn p">原题直出，换成我们公司</button></Link>
            <Link href={use(cur, 'ref')}><button className="wws-btn">只做参考，照它的思路出</button></Link>
          </div>
          <p className="wws-muted" style={{ marginTop: 10, lineHeight: 1.8 }}>点了会进对话，补一句企业名就能出；没说的助理会问。</p>
        </div>
      </div>}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.lib-card { text-align: left; padding: 18px 20px 16px; cursor: pointer; font: inherit; color: inherit; display: flex; flex-direction: column; gap: 6px; }
.lib-card:hover { border-color: var(--acc); }
.lib-t { font: 800 16.5px/1.45 var(--serif); letter-spacing: .02em; }
.lib-sc { font-size: 13px; color: var(--ink2); line-height: 1.75; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.lib-f { font-size: 12px; color: var(--ink3); margin-top: auto; padding-top: 4px; }
`;
