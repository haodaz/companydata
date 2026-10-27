'use client';

/**
 * 真活 · 任务库（明牌，2026-10-27）：出任务的人（登录即可，不必 admin）浏览挑好的任务——只给题，不讲逻辑。
 * 选一道 → 原题直出（去掉原企业，换成你们公司）或仅做参考 → 进填表 / 聊天，只问还不知道的。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, ConfigProvider, Drawer } from 'antd';
import { WorkTopBar } from '@/components/work/WorkTopBar';

type Item = { id: string; industry: string; direction: string; role: string; title: string; scenario: string; deliverables: { title: string; format?: string; module?: string }[]; materials: string[]; time_minutes?: number | null; env?: string };
const MOD: Record<string, string> = { doc: '文档', sheet: '表格', code: '代码', design: '参数草图', canvas: '画布' };
const USES = [
  { k: 'base', t: '原题直出', d: '就用这道任务。原来的企业去掉，背景、材料和数字换成你们公司的。' },
  { k: 'ref', t: '仅做参考', d: '照它的题型和推进方式，给你们公司出一道新的。' },
] as const;

export default function LibraryPage() { return <ConfigProvider theme={{ token: { colorPrimary: '#6055f5' } }}><App><Library /></App></ConfigProvider>; }

function Library() {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState('');
  const [ind, setInd] = useState('全部');
  const [cur, setCur] = useState<Item | null>(null);
  const [use, setUse] = useState<'base' | 'ref'>('base');
  useEffect(() => {
    fetch('/api/work/library', { cache: 'no-store' }).then(async r => {
      if (r.status === 401) { location.href = `/work/login?next=${encodeURIComponent('/work/library')}`; return; }
      const j = await r.json(); if (j.ok) setItems(j.items); else setErr(j.error || '读不到任务库');
    }).catch(e => setErr(String(e?.message || e)));
  }, []);
  const inds = useMemo(() => ['全部', ...Array.from(new Set((items || []).map(x => x.industry)))], [items]);
  const list = (items || []).filter(x => ind === '全部' || x.industry === ind);
  const go = (how: 'form' | 'chat') => { if (!cur) return; router.push(`/work/new${how === 'chat' ? '/chat' : ''}?lib=${encodeURIComponent(cur.id)}&use=${use}`); };

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', color: '#1a1a2e' }}>
      <style>{CSS}</style>
      <WorkTopBar active="library" />
      <div className="wl-wrap">
        <h1>任务库</h1>
        <p className="wl-lead">挑一道现成的好任务：可以原样拿去，换成你们公司来出；也可以只照它的思路，出一道新的。</p>
        <div className="wl-chips">{inds.map(x => <button key={x} className={ind === x ? 'on' : ''} onClick={() => setInd(x)}>{x}{x !== '全部' && <i>{(items || []).filter(y => y.industry === x).length}</i>}</button>)}</div>
        {err && <div className="wl-err">{err}</div>}
        {!items && !err && <div className="wl-mute">读取中…</div>}
        <div className="wl-grid">
          {list.map(x => (
            <button key={x.id} className="wl-card" onClick={() => { setCur(x); setUse('base'); }}>
              <div className="wl-tag">{x.industry} · {x.direction}</div>
              <div className="wl-title">{x.title}</div>
              <div className="wl-role">{x.role}</div>
              <div className="wl-dl">{x.deliverables.slice(0, 3).map((d, i) => <span key={i}><b>{MOD[d.module || ''] || '文档'}</b>{d.title}</span>)}</div>
              <div className="wl-foot">{x.time_minutes ? `建议 ${x.time_minutes} 分钟` : ''}<span>看任务 →</span></div>
            </button>
          ))}
        </div>
      </div>
      <Drawer open={!!cur} onClose={() => setCur(null)} size={Math.min(620, typeof window !== 'undefined' ? window.innerWidth - 24 : 620)} title={cur?.title} styles={{ body: { padding: 0 } }}>
        {cur && <div className="wl-d">
          <div className="wl-d-sec">
            <div className="wl-tag">{cur.industry} · {cur.direction}{cur.time_minutes ? ` · 建议 ${cur.time_minutes} 分钟` : ''}</div>
            <div className="wl-d-role">找的人：{cur.role}</div>
            <p className="wl-d-sc">{cur.scenario}</p>
          </div>
          <div className="wl-d-sec"><div className="wl-d-h">要交什么</div>
            {cur.deliverables.map((d, i) => <div key={i} className="wl-d-row"><b>{MOD[d.module || ''] || '文档'}</b>{d.title}{d.format ? <span>{d.format}</span> : null}</div>)}
          </div>
          {!!cur.materials.length && <div className="wl-d-sec"><div className="wl-d-h">给候选人的材料</div><ul>{cur.materials.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
          <div className="wl-d-sec wl-use"><div className="wl-d-h">怎么用</div>
            {USES.map(u => <label key={u.k} className={use === u.k ? 'on' : ''}><input type="radio" checked={use === u.k} onChange={() => setUse(u.k)} /><div><b>{u.t}</b><span>{u.d}</span></div></label>)}
            <div className="wl-d-note">接下来只问你还没告诉我们的：是哪家企业。要找什么样的人，默认就是上面这位。</div>
            <div className="wl-d-btns"><button className="pri" onClick={() => go('form')}>填表出任务 →</button><button onClick={() => go('chat')}>聊着出任务 →</button></div>
          </div>
        </div>}
      </Drawer>
    </div>
  );
}

const CSS = `
.wl-wrap { max-width: 1180px; margin: 0 auto; padding: 28px clamp(14px, 3vw, 28px) 70px; }
.wl-wrap h1 { font-size: 26px; margin: 0 0 6px; }
.wl-lead { color: #6b6f86; margin: 0 0 18px; font-size: 14.5px; }
.wl-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.wl-chips button { border: 1px solid #e0e0ee; background: #fff; border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 13.5px; color: #3b405a; cursor: pointer; }
.wl-chips button i { font-style: normal; margin-left: 6px; color: #9a9db0; font-size: 12px; }
.wl-chips button.on { background: #6055f5; border-color: #6055f5; color: #fff; } .wl-chips button.on i { color: rgba(255,255,255,.75); }
.wl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.wl-card { text-align: left; background: #fff; border: 1px solid #e8e9f0; border-radius: 16px; padding: 18px 20px 14px; cursor: pointer; font: inherit; color: inherit; display: flex; flex-direction: column; gap: 8px; transition: border-color .15s, box-shadow .15s, transform .15s; }
.wl-card:hover { border-color: #c9c4ff; box-shadow: 0 10px 28px -16px rgba(96,85,245,.45); transform: translateY(-1px); }
.wl-tag { font-size: 12px; color: #6055f5; font-weight: 700; letter-spacing: .02em; }
.wl-title { font-size: 17px; font-weight: 800; line-height: 1.4; }
.wl-role { font-size: 13px; color: #6b6f86; line-height: 1.6; }
.wl-dl { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.wl-dl span { font-size: 12px; background: #f5f5fa; border-radius: 6px; padding: 3px 8px; color: #3b405a; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wl-dl b, .wl-d-row b { font-weight: 700; color: #4c43c9; margin-right: 5px; }
.wl-foot { margin-top: auto; padding-top: 8px; border-top: 1px solid #f0f0f6; display: flex; font-size: 12.5px; color: #9a9db0; } .wl-foot span { margin-left: auto; color: #6055f5; font-weight: 600; }
.wl-err { color: #b42318; margin-bottom: 12px; } .wl-mute { color: #9a9db0; }
.wl-d-sec { padding: 18px 24px; border-bottom: 1px solid #f0f0f6; }
.wl-d-role { margin-top: 8px; font-weight: 700; font-size: 14px; }
.wl-d-sc { margin: 10px 0 0; line-height: 1.85; color: #3b405a; font-size: 14px; }
.wl-d-h { font-size: 12px; font-weight: 700; color: #8a8ea3; letter-spacing: .08em; margin-bottom: 10px; }
.wl-d-row { font-size: 14px; padding: 6px 0; } .wl-d-row span { color: #9a9db0; font-size: 12.5px; margin-left: 8px; }
.wl-d ul { margin: 0; padding-left: 18px; color: #3b405a; font-size: 13.5px; line-height: 1.9; }
.wl-use { background: #fafaff; border-bottom: 0; }
.wl-use label { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px solid #e6e4f8; background: #fff; border-radius: 12px; margin-bottom: 8px; cursor: pointer; }
.wl-use label.on { border-color: #6055f5; box-shadow: 0 0 0 3px rgba(96,85,245,.12); }
.wl-use label input { margin-top: 4px; accent-color: #6055f5; }
.wl-use label b { display: block; font-size: 14px; } .wl-use label span { display: block; font-size: 12.5px; color: #6b6f86; margin-top: 2px; line-height: 1.6; }
.wl-d-note { font-size: 12.5px; color: #8a8ea3; margin: 6px 2px 14px; }
.wl-d-btns { display: flex; gap: 10px; flex-wrap: wrap; }
.wl-d-btns button { flex: 1; min-width: 160px; height: 42px; border-radius: 10px; border: 1px solid #d8d4ff; background: #fff; color: #4c43c9; font: inherit; font-weight: 700; font-size: 14.5px; cursor: pointer; }
.wl-d-btns button.pri { background: #6055f5; border-color: #6055f5; color: #fff; }
`;
