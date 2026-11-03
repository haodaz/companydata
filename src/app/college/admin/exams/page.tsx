'use client';

/** 科研测评题（迁移 060）：论文三题的列表——AI 初稿 / 导师已校正、核对疑问几处、导师改了几处；给导师发校正链接（不用注册，只看只改）。 */
import React, { useEffect, useState } from 'react';
import { api, Btn, Card, Empty, PageHead, Pill, useToast } from '../ui';

export default function Exams() {
  const t = useToast();
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState('');
  const load = () => api('/exams').then(j => setRows(j.data)).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const link = async (r: any) => {
    try { const j = await api('/exams', { method: 'POST', json: { id: r.id } }); const url = `${location.origin}/college/review/${j.token}`; await navigator.clipboard.writeText(url).catch(() => {}); t.ok('校正链接已复制，发给导师即可'); load(); }
    catch (e) { t.err(e); }
  };
  return (
    <div>
      <PageHead art="courses" eyebrow="Research Exams" zh="科研测评题" en="Paper-based research exams — AI drafts, mentors correct"
        lead="用刚发表的公开论文出三道有标准答案的题：A 还原研究设计、B 盲测预测、C 找出稿件里埋的错。AI 代导师先出完整初稿、另一个模型对照原文核对；导师拿到校正链接只看只改，每处改动署名留痕。" />
      {err && <div className="ca-note" style={{ color: '#b42318', marginBottom: 14 }}>{err}</div>}
      <Card>
        {!rows ? <div className="ca-mute">读取中…</div> : !rows.length ? <Empty>还没有题。用 scripts/research-exam.mts build 出题。</Empty> : (
          <table className="ca-table"><thead><tr><th>论文</th><th>方向</th><th>状态</th><th className="num">核对疑问</th><th className="num">导师改动</th><th></th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id}>
                <td className="who"><a href={r.url} target="_blank" rel="noreferrer" className="serif">{r.title}</a><div className="ca-mute" style={{ fontSize: 12.5 }}>{r.id} · {r.props} 条论断 · {r.planted} 处埋错 · {r.scope === 'private' ? `私域 · ${r.org || ''}` : '公共课'}</div></td>
                <td>{r.field}</td>
                <td>{r.status === 'mentor_reviewed' ? <Pill tone="ok">导师已校正{r.reviewer?.name ? ` · ${r.reviewer.name}` : ''}</Pill> : <Pill tone="mute">AI 初稿</Pill>}</td>
                <td className="num">{r.doubts || <span className="ca-mute">0</span>}</td>
                <td className="num">{r.corrections || <span className="ca-mute">—</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}><div className="ca-row" style={{ gap: 6 }}>
                  <Btn kind="navy" sm onClick={() => link(r)}>{r.review_token ? '复制校正链接' : '生成校正链接'}</Btn>
                  {r.review_token && <a href={`/college/review/${r.review_token}`} target="_blank" rel="noreferrer"><Btn kind="ghost" sm>打开 ↗</Btn></a>}
                </div></td>
              </tr>))}</tbody></table>)}
      </Card>
    </div>
  );
}
