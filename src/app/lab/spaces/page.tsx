'use client';

/**
 * 百业工厂 · 管理台（2026-11-06 重做，照真活的管理端：生成 / 管理 / 回收 / 分析）。
 * 以前这页是一面空间卡片墙，和「体验百业」差不多；工厂的主轴是管：哪些空间在做、上没上架、有没有人玩、玩得怎么样。
 *   tab：空间（每个一行：状态、章节、作答、平均分、最近作答）｜ 作答（所有空间的作答记录）｜ 分析（总览 + 有人玩 / 没人玩 / 低分的）
 *   右上角：＋ 新建空间（/lab/studio/new，两层：定位 + 生成要求）、素材库。点一行进这个空间（/lab/studio/[id]，里面再分 tab）。
 * 普通用户只看自己生成的，管理员看全部。预览、上下架是每行右边的小动作，不是主轴。
 */
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { App } from 'antd';
import { useUser } from '@/lib/user-context';
import { col, FX_CSS, LISTING, Plays, useLabNav, when } from '@/components/lab/FactoryKit';
import { OPEN_MODULES } from '@/lib/lab-spec';

type Space = { id: string; title: string; name: string | null; role: string; avatar: string | null; kind: string; company: string | null; anchor: any; preset: string | null; listing: 'draft' | 'listed' | 'unlisted'; chapters: { total: number; published: number }; plays: number; avg: number | null; last_play: string | null; created_by: string; created_at: string; form: string | null; open_modules: string[] | null; watch_bench: boolean };
const KIND: Record<string, string> = { career: '职业探索', discipline: '学科体验', research_post: '研究岗', pasted: '粘贴 JD', jd: '真实 JD' };

export default function Page() { return <Suspense><App><Factory /></App></Suspense>; }

function Factory() {
  const router = useRouter(); const sp = useSearchParams();
  const { user, loading: userLoading } = useUser() as any;
  const tab = (sp.get('tab') as 'spaces' | 'plays' | 'stats') || 'spaces';
  const nav = useLabNav();
  const [d, setD] = useState<{ spaces: Space[]; migrated: boolean; role: string } | null>(null); const [err, setErr] = useState('');
  const load = useCallback(() => fetch('/api/lab/factory?view=spaces', { cache: 'no-store' }).then(r => r.json()).then(j => { if (j.ok) setD(j); else setErr(j.error); }).catch(() => setErr('没读到')), []);
  useEffect(() => { if (user) load(); }, [user, load]);
  // 老入口 ?new=career / ?new=jd 统一进新建空间页
  useEffect(() => { if (sp.get('new')) router.replace(nav.newSpace); }, [sp, router, nav.newSpace]);
  if (!userLoading && !user) return <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--ink2)' }}>百业工厂要先登录。<a href={`/lab/login?next=${encodeURIComponent('/lab/spaces')}`} style={{ color: 'var(--v)', fontWeight: 700 }}>去登录</a></div>;
  const setTab = (t: string) => router.replace(t === 'spaces' ? nav.factory : `${nav.factory}?tab=${t}`);
  return (
    <div className="fx">
      <style>{FX_CSS}</style>
      <div className="fx-head">
        <div><div className="lab-mono lab-cap">FACTORY · 百业工厂</div><h1>百业工厂</h1><p>生成职业模拟空间、上架给人体验、看作答、看哪里要改。{d?.role === 'admin' ? '你是管理员，看到的是全部空间。' : '这里只有你自己生成的空间。'}</p></div>
        <div className="fx-acts">
          <button className="lab-btn ghost sm" onClick={() => router.push(nav.assets)}>素材库</button>
          <button className="lab-btn ghost sm" onClick={() => router.push(nav.chat)}>✦ 跟助理说</button>
          <button className="lab-btn sm" onClick={() => router.push(nav.newSpace)}>＋ 新建空间</button>
        </div>
      </div>
      {d && !d.migrated && <div className="fx-note">上架状态还没开通（迁移 065 待跑）：先按「有没有已发布的章节」显示状态，上架 / 下架按钮暂时不能用。</div>}
      <div className="fx-tabs" role="tablist">{([['spaces', '空间'], ['plays', '作答'], ['stats', '分析']] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}{k === 'spaces' && d ? <i>{d.spaces.length}</i> : null}</button>)}</div>
      {err && <div className="lab-glass fx-empty">{err}</div>}
      {tab === 'spaces' && <Spaces d={d} reload={load} />}
      {tab === 'plays' && <Plays />}
      {tab === 'stats' && <Stats spaces={d?.spaces || null} />}
    </div>
  );
}

function Spaces({ d, reload }: { d: { spaces: Space[]; migrated: boolean; role: string } | null; reload: () => void }) {
  const router = useRouter(); const { message } = App.useApp(); const nav = useLabNav();
  const [kw, setKw] = useState(''); const [st, setSt] = useState('all');
  // 批量配置（11-10）：复选未上架的空间，定开放哪些模块、工位是否只观摩
  const [pick, setPick] = useState<string[]>([]); const [mods, setMods] = useState<string[]>(OPEN_MODULES.map(m => m.key)); const [watch, setWatch] = useState(false); const [saving, setSaving] = useState(false);
  const toggle = (s: Space, on: boolean) => { if (on && !pick.length) { setMods(s.open_modules || OPEN_MODULES.map(m => m.key)); setWatch(s.watch_bench); } setPick(x => on ? [...x, s.id] : x.filter(y => y !== s.id)); };
  const applyBatch = async () => {
    setSaving(true);
    const j = await (await fetch('/api/lab/factory', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: pick, open_modules: mods, watch_bench: watch }) })).json().catch(() => ({ ok: false, error: '网络错误' }));
    setSaving(false);
    if (!j.ok) { message.error(j.error); return; }
    message.success(`已配置 ${j.done} 个空间${j.skipped ? `，跳过 ${j.skipped} 个（已上架或没有权限）` : ''}`); setPick([]); reload();
  };
  const list = useMemo(() => (d?.spaces || []).filter(s => (st === 'all' || s.listing === st) && (!kw || [s.title, s.name, s.role, s.company, s.anchor?.label].some(v => String(v || '').includes(kw)))), [d, kw, st]);
  const n = (k: string) => (d?.spaces || []).filter(s => k === 'all' || s.listing === k).length;
  const setListing = async (s: Space, listing: string) => {
    const j = await (await fetch('/api/lab/factory', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, listing }) })).json().catch(() => ({ ok: false, error: '网络错误' }));
    if (!j.ok) { message.error(j.error); return; }
    message.success(listing === 'listed' ? '已上架：体验百业里能看到了' : listing === 'unlisted' ? '已下架：体验百业里不再显示' : '已退回草稿'); reload();
  };
  return <>
    <div className="fx-bar">
      <input className="lab-input fx-in" value={kw} onChange={e => setKw(e.target.value)} placeholder="搜职业 / 岗位 / 名字" />
      {[['all', '全部'], ['draft', '草稿'], ['listed', '已上架'], ['unlisted', '已下架']].map(([k, t]) => <button key={k} className={`fx-chip${st === k ? ' on' : ''}`} onClick={() => setSt(k)}>{t} {d ? n(k) : ''}</button>)}
    </div>
    {pick.length > 0 && <div className="lab-glass" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', padding: '10px 14px', marginBottom: 12, fontSize: 13.5 }}>
      <b>已选 {pick.length} 个</b>
      <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>开放：{OPEN_MODULES.map(m => <label key={m.key} style={{ cursor: 'pointer' }}><input type="checkbox" checked={mods.includes(m.key)} onChange={e => setMods(x => e.target.checked ? [...x, m.key] : x.filter(y => y !== m.key))} /> {m.label}</label>)}</span>
      <label style={{ cursor: 'pointer' }} title="师傅把工位操作做一遍，体验者看完继续，不用动手"><input type="checkbox" checked={watch} onChange={e => setWatch(e.target.checked)} /> 工位只观摩</label>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}><button className="lab-btn sm" disabled={saving || !mods.length} onClick={applyBatch}>{saving ? '保存中…' : '应用'}</button><button className="lab-btn ghost sm" onClick={() => setPick([])}>取消</button></span>
    </div>}
    <div className="lab-glass fx-tablewrap">
      <table className="fx-table t-spaces">
        <thead><tr><th style={{ width: 30 }} /><th>空间</th><th>状态</th><th>章节</th><th>作答</th><th>平均分</th><th>最近作答</th>{d?.role === 'admin' && <th>谁生成的</th>}<th /></tr></thead>
        <tbody>
          {!d && <tr><td colSpan={9} className="fx-muted">读取中…</td></tr>}
          {d && !list.length && <tr><td colSpan={9}><div className="fx-empty">{d.spaces.length ? '没有符合的。' : '还没有空间。点右上「＋ 新建空间」，先定位做哪一个，再说给谁看、要多深。'}</div></td></tr>}
          {list.map(s => <tr key={s.id} className="click" onClick={() => router.push(nav.space(s.id))}>
            <td onClick={e => e.stopPropagation()}>{s.listing !== 'listed' && <input type="checkbox" checked={pick.includes(s.id)} onChange={e => toggle(s, e.target.checked)} aria-label="选这个空间" />}</td>
            <td style={{ minWidth: 240 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {s.avatar ? <img src={s.avatar} alt="" className="fx-av" /> : <span className="fx-av ph">{(s.role || s.title).slice(0, 1)}</span>}
                <div style={{ minWidth: 0 }}><b>{s.name ? `${s.name} · ${s.role}` : s.role || s.title}</b><div className="fx-sub">{[KIND[s.kind] || s.kind, s.company, s.preset, s.watch_bench ? '工位只观摩' : null, s.open_modules ? `开放 ${s.open_modules.length} 个模块` : null].filter(Boolean).join(' · ')}</div></div>
              </div>
            </td>
            <td><span className={`fx-tag ${LISTING[s.listing]?.[1]}`}>{LISTING[s.listing]?.[0]}</span></td>
            <td className="fx-num">{s.chapters.published} / {s.chapters.total}</td>
            <td className="fx-num">{s.plays || <span className="fx-muted">0</span>}</td>
            <td><b style={{ color: col(s.avg) }}>{s.avg ?? '—'}</b></td>
            <td className="fx-muted" style={{ whiteSpace: 'nowrap' }}>{when(s.last_play)}</td>
            {d?.role === 'admin' && <td className="fx-muted" style={{ whiteSpace: 'nowrap' }}>{s.created_by || '—'}</td>}
            <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
              <a className="fx-lnk" href={`/lab/${s.id}?m=test`} target="_blank" rel="noreferrer">预览 ↗</a>
              {d?.migrated && (s.listing === 'listed' ? <button className="fx-lnk" onClick={() => setListing(s, 'unlisted')}>下架</button> : <button className="fx-lnk" onClick={() => setListing(s, 'listed')}>上架</button>)}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </>;
}

function Stats({ spaces }: { spaces: Space[] | null }) {
  const router = useRouter(); const nav = useLabNav();
  if (!spaces) return <div className="fx-muted">读取中…</div>;
  const listed = spaces.filter(s => s.listing === 'listed'), plays = spaces.reduce((a, s) => a + s.plays, 0);
  const scored = spaces.filter(s => s.avg != null), avg = scored.length ? Math.round(scored.reduce((a, s) => a + (s.avg || 0) * s.plays, 0) / Math.max(1, scored.reduce((a, s) => a + s.plays, 0))) : null;
  const hot = [...spaces].filter(s => s.plays).sort((a, b) => b.plays - a.plays).slice(0, 8);
  const cold = listed.filter(s => !s.plays).slice(0, 8);
  const low = scored.filter(s => (s.avg || 0) < 60 && s.plays >= 3).sort((a, b) => (a.avg || 0) - (b.avg || 0)).slice(0, 8);
  const half = spaces.filter(s => s.chapters.total && s.chapters.published < s.chapters.total).slice(0, 8);
  const Box = ({ t, sub, rows, show }: { t: string; sub: string; rows: Space[]; show: (s: Space) => React.ReactNode }) => (
    <div className="lab-glass fx-box"><div className="fx-box-h"><b>{t}</b><span>{sub}</span></div>
      {!rows.length ? <div className="fx-muted" style={{ padding: '6px 0' }}>没有。</div> : rows.map(s => <button key={s.id} className="fx-row" onClick={() => router.push(nav.space(s.id))}><span>{s.name ? `${s.name} · ${s.role}` : s.role || s.title}</span><em>{show(s)}</em></button>)}
    </div>
  );
  return <>
    <div className="fx-stats">{([['空间', spaces.length], ['已上架', listed.length], ['草稿', spaces.filter(s => s.listing === 'draft').length], ['真人作答', plays], ['平均分', avg ?? '—']] as [string, any][]).map(([k, v]) => <div key={k} className="lab-glass fx-stat"><b>{v}</b><span>{k}</span></div>)}</div>
    <div className="fx-boxes">
      <Box t="玩得最多" sub="真人作答次数" rows={hot} show={s => `${s.plays} 次 · 平均 ${s.avg ?? '—'}`} />
      <Box t="分数偏低" sub="至少 3 次作答、平均不到 60：可能太难，或题意不清" rows={low} show={s => `平均 ${s.avg} · ${s.plays} 次`} />
      <Box t="上架了还没人玩" sub="把预览链接发出去，或者换个更吸引人的开头" rows={cold} show={() => '0 次'} />
      <Box t="一天还没做完" sub="有章节还是草稿" rows={half} show={s => `${s.chapters.published} / ${s.chapters.total} 章已发布`} />
    </div>
  </>;
}

