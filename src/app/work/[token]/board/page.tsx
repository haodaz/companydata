'use client';

/**
 * 真活公开排行榜（11-24，任务开了 public_board 才有）：像 Kaggle 的 leaderboard——同一个任务的候选人按同题对比的顺序排，
 * 只给名次、打码的名字和提交时间，不给分数和联系方式。
 *   /work/<token>/board
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { WorkLogo } from '@/components/work/WorkLogo';
import { pick, type Lang } from '@/lib/work/i18n';

type Board = { title: string; company: string; lang?: Lang; open_until: string | null; rows: { rank: number; name: string; submitted_at: string }[] };

export default function BoardPage() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<Board | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`/api/work/${token}/board`).then(r => r.json()).then(j => (j.ok ? setD(j) : setErr(j.error || '打不开'))).catch(() => setErr('打不开'));
  }, [token]);
  const L = (zh: string, en: string) => pick(d?.lang, zh, en);
  const when = (iso: string) => new Date(iso).toLocaleString(d?.lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const closed = d?.open_until ? Date.now() >= new Date(d.open_until).getTime() : false;
  return (
    <div style={{ minHeight: '100vh', background: '#f7f7fb', color: '#1a1a2e', fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px 60px' }}>
        <div style={{ marginBottom: 18 }}><WorkLogo /></div>
        {err && <div style={{ padding: 24, background: '#fff', borderRadius: 14, color: '#888' }}>{err}</div>}
        {!d && !err && <div style={{ color: '#888' }}>加载中…</div>}
        {d && <>
          <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>{L('真活 · 排行榜', 'Work sample · Leaderboard')}</div>
          <h1 style={{ fontSize: 22, margin: '6px 0 4px' }}>{d.title}</h1>
          <div style={{ color: '#666', fontSize: 14, marginBottom: 6 }}>{d.company}</div>
          <div style={{ color: '#888', fontSize: 13, marginBottom: 18 }}>
            {L('按同一个任务里两两比较「谁把这件事做得更好」排出的名次，新提交的几分钟内排进去。', 'Ranked by comparing submissions on this task head to head ("who did the job better"); new submissions appear within a few minutes. ')}
            {d.open_until && (closed ? L(`已于 ${when(d.open_until)} 截止。`, `Closed on ${when(d.open_until)}.`) : L(`开放到 ${when(d.open_until)}。`, `Open until ${when(d.open_until)}.`))}
          </div>
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ecebf5', overflow: 'hidden' }}>
            {!d.rows.length && <div style={{ padding: 24, color: '#888' }}>{L('还没有人提交', 'No submissions yet')}</div>}
            {d.rows.map(r => (
              <div key={r.rank} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderTop: r.rank > 1 ? '1px solid #f0eff7' : 'none' }}>
                <b style={{ width: 32, textAlign: 'right', fontSize: r.rank <= 3 ? 18 : 15, color: r.rank <= 3 ? '#6055f5' : '#888' }}>{r.rank}</b>
                <span style={{ flex: 1, fontWeight: 600 }}>{r.name}</span>
                <span style={{ color: '#999', fontSize: 13 }}>{when(r.submitted_at)}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, fontSize: 13 }}><a href={`/work/${token}`} style={{ color: '#6055f5' }}>{closed ? L('看任务 →', 'View the task →') : L('去做这个任务 →', 'Take on this task →')}</a></div>
        </>}
      </div>
    </div>
  );
}
