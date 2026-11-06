'use client';

/** 百业工厂管理台共用的小件（工厂首页、单个空间的 tab 都用）：上架状态、作答记录表、样式 */
import React, { useEffect, useState } from 'react';

type Play = { id: string; space_id: string; space: string; chapter: string | null; who: string; type: string; note?: string; score: number | null; ai_score: number | null; human_score: number | null; at: string };
export const LISTING: Record<string, [string, string]> = { draft: ['草稿', 'warn'], listed: ['已上架', 'ok'], unlisted: ['已下架', 'mute'] };
export const when = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const col = (v: number | null) => (v == null ? 'var(--ink3)' : v >= 80 ? '#0d7a52' : v >= 60 ? '#2f6fd6' : '#c0392b');

/** 作答记录：所有空间（或一个空间）的真人作答；点一行看示范评审 */
export function Plays({ space }: { space?: string }) {
  const [plays, setPlays] = useState<Play[] | null>(null); const [kw, setKw] = useState('');
  useEffect(() => { fetch(`/api/lab/factory?view=plays${space ? `&space=${space}` : ''}`, { cache: 'no-store' }).then(r => r.json()).then(j => setPlays(j.ok ? j.plays : [])).catch(() => setPlays([])); }, [space]);
  const list = (plays || []).filter(p => !kw || [p.who, p.space, p.chapter, p.note].some(v => String(v || '').includes(kw)));
  return <>
    <div className="fx-bar"><input className="lab-input fx-in" value={kw} onChange={e => setKw(e.target.value)} placeholder="搜名字 / 空间 / 章节" /><span className="fx-muted" style={{ marginLeft: 'auto' }}>{plays ? `${list.length} 次作答（只算真人）` : ''}</span></div>
    <div className="lab-glass fx-tablewrap">
      <table className="fx-table t-plays">
        <thead><tr><th>谁</th>{!space && <th>空间</th>}<th>章节</th><th>分数</th><th>时间</th><th /></tr></thead>
        <tbody>
          {!plays && <tr><td colSpan={6} className="fx-muted">读取中…</td></tr>}
          {plays && !list.length && <tr><td colSpan={6}><div className="fx-empty">{plays.length ? '没有符合的。' : '还没有人玩过。空间上架后，体验百业里就能被玩到；也可以把预览链接直接发给人。'}</div></td></tr>}
          {list.map(p => <tr key={p.id}>
            <td><b>{p.who}</b>{p.note && <div className="fx-sub">{p.note}</div>}</td>
            {!space && <td style={{ minWidth: 180 }}>{p.space}</td>}
            <td className="fx-muted">{p.chapter || '—'}</td>
            <td><b style={{ color: col(p.score) }}>{p.score ?? '—'}</b>{p.human_score != null && <span className="fx-sub"> 人工改过</span>}</td>
            <td className="fx-muted" style={{ whiteSpace: 'nowrap' }}>{when(p.at)}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><a className="fx-lnk" href={`/lab/studio/review?space=${p.space_id}&s=${p.id}`} target="_blank" rel="noreferrer">看评审 ↗</a></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </>;
}

export const FX_CSS = `
.fx { max-width: 1240px; margin: 0 auto; }
.fx-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.fx-head h1 { font-size: 28px; font-weight: 800; margin: 4px 0 4px; } .fx-head p { margin: 0; color: var(--ink2); font-size: 14px; line-height: 1.75; }
.fx-acts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.fx-note { padding: 10px 14px; border-radius: 12px; background: rgba(255,190,80,.14); color: #8a5a00; font-size: 13px; margin-bottom: 14px; }
.fx-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: 16px; overflow-x: auto; }
.fx-tabs button { border: 0; background: none; padding: 10px 16px 11px; font: inherit; font-size: 15px; font-weight: 700; color: var(--ink3); border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; white-space: nowrap; }
.fx-tabs button.on { color: var(--ink); border-bottom-color: var(--v); }
.fx-tabs button i { font-style: normal; font-size: 12px; margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: rgba(106,92,255,.1); color: var(--v); }
.fx-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.fx-in { width: 260px !important; padding: 8px 12px !important; font-size: 14px !important; border-radius: 10px !important; }
.fx-chip { border: 1px solid var(--line); background: rgba(255,255,255,.7); border-radius: 999px; padding: 5px 13px; font: inherit; font-size: 13px; font-weight: 600; color: var(--ink2); cursor: pointer; }
.fx-chip.on { background: var(--ink); border-color: var(--ink); color: #fff; }
.fx-tablewrap { padding: 0 !important; overflow-x: auto; }
.fx-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.fx-table th { text-align: left; font-size: 12px; font-weight: 700; color: var(--ink3); padding: 12px 14px 9px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.fx-table td { padding: 11px 14px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.fx-table tr.click { cursor: pointer; } .fx-table tr.click:hover td { background: rgba(106,92,255,.04); }
.fx-av { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: rgba(106,92,255,.12); }
.fx-av.ph { display: grid; place-items: center; color: var(--v); font-weight: 800; }
.fx-sub { font-size: 12px; color: var(--ink3); margin-top: 2px; }
.fx-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.fx-muted { color: var(--ink3); font-size: 13px; }
.fx-tag { font-size: 12px; font-weight: 700; border-radius: 6px; padding: 2px 8px; white-space: nowrap; }
.fx-tag.ok { color: #0d7a52; background: #e7f5ee; } .fx-tag.warn { color: #8a5a00; background: #fbf1df; } .fx-tag.mute { color: #6b6f86; background: #efeff4; }
.fx-lnk { border: 0; background: none; color: var(--v); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; margin-left: 12px; text-decoration: none; padding: 0; }
.fx-empty { padding: 32px; text-align: center; color: var(--ink2); line-height: 1.8; }
.fx-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 14px; }
.fx-stat { padding: 16px 18px !important; } .fx-stat b { display: block; font-size: 28px; font-weight: 800; } .fx-stat span { font-size: 13px; color: var(--ink2); font-weight: 600; }
.fx-boxes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); gap: 12px; }
.fx-box { padding: 16px 18px !important; } .fx-box-h { margin-bottom: 8px; } .fx-box-h b { font-size: 15px; } .fx-box-h span { font-size: 12px; color: var(--ink3); margin-left: 8px; }
.fx-row { display: flex; width: 100%; gap: 10px; align-items: center; border: 0; background: none; padding: 7px 0; border-top: 1px solid var(--line); font: inherit; font-size: 13.5px; color: var(--ink); cursor: pointer; text-align: left; }
.fx-row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .fx-row em { font-style: normal; font-size: 12.5px; color: var(--ink3); white-space: nowrap; }
.fx-row:hover span { color: var(--v); }
@media (max-width: 640px) {
  .fx-in { width: 100% !important; }
  .fx-table thead { display: none; } .fx-table, .fx-table tbody { display: block; }
  .fx-table tr { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--line); }
  .fx-table td { display: block; padding: 0; border: 0; } .fx-table td:first-child { flex-basis: 100%; } .fx-table td:last-child { margin-left: auto; }
  .t-spaces td:nth-child(6), .t-spaces td:nth-child(7) { display: none; }
}
`;
