'use client';

/** 真活台 · 报告（参与者页和后台共用）：结果逐条 + 和 AI 基线比 + 过程高光 / 风险 + 六维 */
import React from 'react';

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const LV: Record<string, string> = { L1: '#c9ccd6', L2: '#ffd166', L3: '#3ddc97', L4: '#12a150' };
const col = (v: number) => (v >= 80 ? '#12a150' : v >= 60 ? '#b7791f' : '#c0392b');

export function WorkReport({ report, participant }: { report: any; participant?: { name?: string } }) {
  if (!report) return null;
  const r = report.result, p = report.process, c = report.compare;
  return (
    <div style={{ display: 'grid', gap: 16, fontSize: 14, lineHeight: 1.7, color: '#1a1a2e' }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <Card title="结果" style={{ flex: '1 1 200px' }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: col(r.total) }}>{r.total}<span style={{ fontSize: 14, color: '#8c8c8c', fontWeight: 500 }}> / 100</span></div>
          {c && <div style={{ fontSize: 13, color: '#555' }}>AI 基线 {c.baseline_total} · 你{c.delta >= 0 ? '高' : '低'} {Math.abs(c.delta)} 分{c.delta < 0 && <span style={{ color: '#8c8c8c' }}>（大部分人做不过 AI，差距就是要练的地方）</span>}</div>}
          <div style={{ marginTop: 8, color: '#444' }}>{r.summary}</div>
        </Card>
        <Card title="过程" style={{ flex: '1 1 260px' }}>
          <div style={{ color: '#555', fontSize: 13 }}>用时 {fmt(p.duration_s)} · 问 AI {p.stats?.ai_asks || 0} 次 · 看了 {p.stats?.materials_opened || 0}/{p.stats?.materials_total || 0} 份材料 · 粘贴 {p.stats?.paste_chars || 0} 字 · 自己敲 {p.stats?.typed_chars || 0} 字</div>
          <div style={{ marginTop: 8 }}>{p.delegation}</div>
          {!!p.phases?.length && <div style={{ display: 'flex', marginTop: 10, height: 10, borderRadius: 5, overflow: 'hidden', background: '#eee' }}>{p.phases.map((ph: any, i: number) => <div key={i} title={`${ph.label} ${fmt(ph.from)}–${fmt(ph.to)}`} style={{ flex: Math.max(1, ph.to - ph.from), background: ['#6055f5', '#12b5cb', '#3ddc97', '#ffd166', '#fa8c16', '#eb2f96', '#8c8c8c', '#1677ff'][i % 8] }} />)}</div>}
          {!!p.phases?.length && <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{p.phases.map((ph: any) => ph.label).join(' → ')}</div>}
        </Card>
      </div>
      <Card title="逐条（每条都有证据；前置没做到的，后置封顶）">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ color: '#8c8c8c', textAlign: 'left' }}><th style={th}>条目</th><th style={th}>等级</th><th style={th}>得分</th>{c && <th style={th}>AI 基线</th>}<th style={th}>证据 / 说明</th></tr></thead>
          <tbody>{r.items.map((i: any) => { const b = c?.items?.find((x: any) => x.id === i.id)?.baseline; return (
            <tr key={i.id} style={{ borderTop: '1px solid #eee', verticalAlign: 'top' }}>
              <td style={td}><b>{i.title}</b><div style={{ color: '#999', fontSize: 12 }}>权重 {i.weight}{i.blocked_by ? ` · 被 ${i.blocked_by} 卡住` : ''}</div></td>
              <td style={td}><span style={{ background: LV[i.level], color: i.level === 'L1' ? '#555' : '#fff', padding: '1px 8px', borderRadius: 999, fontWeight: 700, fontSize: 12 }}>{i.level}</span></td>
              <td style={{ ...td, fontWeight: 700, color: col(i.score) }}>{i.score}</td>
              {c && <td style={{ ...td, color: '#777' }}>{b ?? '–'}</td>}
              <td style={td}>{i.evidence && <div style={{ color: '#444', fontStyle: 'italic' }}>“{i.evidence}”</div>}<div style={{ color: '#666' }}>{i.note}</div></td>
            </tr>); })}</tbody>
        </table>
        {(r.strengths?.length || r.gaps?.length) ? <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {!!r.strengths?.length && <div style={{ flex: 1 }}><div style={{ color: '#12a150', fontWeight: 700 }}>做得好的</div><ul style={ul}>{r.strengths.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
          {!!r.gaps?.length && <div style={{ flex: 1 }}><div style={{ color: '#c0392b', fontWeight: 700 }}>差的地方</div><ul style={ul}>{r.gaps.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
        </div> : null}
      </Card>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Card title="高光时刻" style={{ flex: '1 1 280px' }}>{p.highlights?.length ? p.highlights.map((h: any, i: number) => <Moment key={i} m={h} color="#12a150" />) : <span style={{ color: '#999' }}>没有观察到明显的高光</span>}</Card>
        <Card title="风险时刻" style={{ flex: '1 1 280px' }}>{p.risks?.length ? p.risks.map((h: any, i: number) => <Moment key={i} m={h} color="#c0392b" />) : <span style={{ color: '#999' }}>没有观察到明显的风险</span>}</Card>
      </div>
      <Card title="人机协作六维（观察到的，不是定性）">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {Object.entries(p.skills || {}).map(([k, v]: any) => <div key={k} style={{ padding: '10px 12px', borderRadius: 10, background: '#fafbff', borderLeft: `4px solid ${LV[v.level]}` }}><div style={{ fontWeight: 700 }}>{k} <span style={{ fontSize: 12, color: '#777' }}>{v.level}</span></div><div style={{ fontSize: 13, color: '#555' }}>{v.note}</div></div>)}
        </div>
      </Card>
      <div style={{ fontSize: 12, color: '#999' }}>{participant?.name ? `${participant.name} · ` : ''}报告生成于 {report.generated_at ? new Date(report.generated_at).toLocaleString('zh-CN') : ''} · 结果按出题 rubric 逐条核对，过程看工作台事件流；这是练习与预筛信号，不是能力定性。</div>
    </div>
  );
}

function Card({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px', ...style }}><div style={{ fontSize: 12, letterSpacing: 1, color: '#8c8c8c', marginBottom: 6 }}>{title}</div>{children}</div>;
}
function Moment({ m, color }: { m: any; color: string }) {
  return <div style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0' }}><span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color, fontWeight: 700 }}>{fmt(m.t)}</span> <span style={{ fontSize: 12, color: '#777', marginLeft: 6 }}>{m.skill}</span><div>{m.behavior}</div>{m.evidence && <div style={{ fontSize: 12, color: '#777' }}>证据：{m.evidence}</div>}</div>;
}
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 500 };
const td: React.CSSProperties = { padding: '8px' };
const ul: React.CSSProperties = { margin: '4px 0 0', paddingLeft: 18 };
