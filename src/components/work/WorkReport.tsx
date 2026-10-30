'use client';

/** 真活台 · 报告（参与者页和后台共用）：结果逐条 + 和 AI 基线比 + 过程高光 / 风险 + 六维 */
import React from 'react';
import { Segment } from '@/components/work/AuditPanel';

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const LV: Record<string, string> = { L1: '#c9ccd6', L2: '#ffd166', L3: '#3ddc97', L4: '#12a150' };
const col = (v: number) => (v >= 80 ? '#12a150' : v >= 60 ? '#b7791f' : '#c0392b');

export function WorkReport({ report, participant }: { report: any; participant?: { name?: string } }) {
  if (!report) return null;
  if (report.auditing) return <div style={{ padding: '14px 18px', background: '#f3f2ff', borderRadius: 14, color: '#4c43c9', fontSize: 14 }}>AI 审计中：过程 {report.total} 段，已看 {report.stage} 段{report.audit?.length ? `，到 ${fmt(report.audit[report.audit.length - 1].to)} 为止的过程信号 ${report.audit[report.audit.length - 1].tentative}（暂定）` : ''}。候选人那边做完最后一步就出正式报告。</div>;
  const r = report.result, p = report.process, c = report.compare, u = report.ai_use;
  if (!r) return null;
  return (
    <div style={{ display: 'grid', gap: 16, fontSize: 14, lineHeight: 1.7, color: '#1a1a2e' }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <Card title="结果" style={{ flex: '1 1 200px' }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: col(r.total) }}>{r.total}<span style={{ fontSize: 14, color: '#8c8c8c', fontWeight: 500 }}> / 100</span></div>
          {c && <div style={{ fontSize: 13, color: '#555' }}>AI 基线 {c?.baseline_total} · 你{c?.delta >= 0 ? '高' : '低'} {Math.abs(c?.delta)} 分{c?.delta < 0 && <span style={{ color: '#8c8c8c' }}>（大部分人做不过 AI，差距就是要练的地方）</span>}</div>}
          <div style={{ marginTop: 8, color: '#444' }}>{r.summary}</div>
        </Card>
        {u && <Card title="AI 使用能力" style={{ flex: '1 1 200px' }}>
          {u.score == null ? <div style={{ fontSize: 22, fontWeight: 800, color: '#8c8c8c', margin: '6px 0' }}>没用 AI</div>
            : <div style={{ fontSize: 40, fontWeight: 800, color: col(u.score) }}>{u.score}<span style={{ fontSize: 14, color: '#8c8c8c', fontWeight: 500 }}> / 100</span></div>}
          <div style={{ marginTop: 4, color: '#444' }}>{u.verdict}</div>
        </Card>}
        {!p && <Card title="过程" style={{ flex: '1 1 260px' }}><div style={{ color: '#888', fontSize: 13 }}>{report.who === 'college' ? 'AI 学员做的，没有人工操作过程' : '这次作答没有过程记录'}</div></Card>}
        {p && <Card title="过程" style={{ flex: '1 1 260px' }}>
          <div style={{ color: '#555', fontSize: 13 }}>用时 {fmt(p?.duration_s)} · 问 AI {p?.stats?.ai_asks || 0} 次 · 看了 {p?.stats?.materials_opened || 0}/{p?.stats?.materials_total || 0} 份材料 · 粘贴 {p?.stats?.paste_chars || 0} 字 · 自己敲 {p?.stats?.typed_chars || 0} 字</div>
          <div style={{ marginTop: 8 }}>{p?.delegation}</div>
          {!!p?.phases?.length && <div style={{ display: 'flex', marginTop: 10, height: 10, borderRadius: 5, overflow: 'hidden', background: '#eee' }}>{p?.phases.map((ph: any, i: number) => <div key={i} title={`${ph.label} ${fmt(ph.from)}–${fmt(ph.to)}`} style={{ flex: Math.max(1, ph.to - ph.from), background: ['#6055f5', '#12b5cb', '#3ddc97', '#ffd166', '#fa8c16', '#eb2f96', '#8c8c8c', '#1677ff'][i % 8] }} />)}</div>}
          {!!p?.phases?.length && <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{p?.phases.map((ph: any) => ph.label).join(' → ')}</div>}
        </Card>}
      </div>
      {r.items?.length >= 2 && <Overview items={r.items} cmp={c} />}
      {u?.score != null && <AiUse u={u} />}
      {report.recording && <Card title="录屏回放 · 用自己的软件做的">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
          <video controls preload="metadata" src={report.recording.url} style={{ width: '100%', borderRadius: 10, background: '#000' }} />
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}><div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>时长 {fmt(report.recording.duration || 0)} · 抽帧 {report.recording.frames} 张看图</div>{report.recording.summary}</div>
        </div>
      </Card>}
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
        <Card title="高光时刻" style={{ flex: '1 1 280px' }}>{p?.highlights?.length ? p?.highlights.map((h: any, i: number) => <Moment key={i} m={h} color="#12a150" />) : <span style={{ color: '#999' }}>没有观察到明显的高光</span>}</Card>
        <Card title="风险时刻" style={{ flex: '1 1 280px' }}>{p?.risks?.length ? p?.risks.map((h: any, i: number) => <Moment key={i} m={h} color="#c0392b" />) : <span style={{ color: '#999' }}>没有观察到明显的风险</span>}</Card>
      </div>
      {!!report.audit?.length && <Card title="审计过程（交卷后一段一段看的笔记，总评和它连续）">
        <div style={{ display: 'grid', gap: 10 }}>{report.audit.map((seg: any) => <Segment key={seg.idx} seg={seg} compact />)}</div>
      </Card>}
      <Card title="人机协作六维（观察到的，不是定性）">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {Object.entries(p?.skills || {}).map(([k, v]: any) => <div key={k} style={{ padding: '10px 12px', borderRadius: 10, background: '#fafbff', borderLeft: `4px solid ${LV[v.level]}` }}><div style={{ fontWeight: 700 }}>{k} <span style={{ fontSize: 12, color: '#777' }}>{v.level}</span></div><div style={{ fontSize: 13, color: '#555' }}>{v.note}</div></div>)}
        </div>
      </Card>
      <div style={{ fontSize: 12, color: '#999' }}>{participant?.name ? `${participant.name} · ` : ''}报告生成于 {report.generated_at ? new Date(report.generated_at).toLocaleString('zh-CN') : ''} · 结果按出任务 rubric 逐条核对，过程看工作台事件流；这是练习与预筛信号，不是能力定性。</div>
    </div>
  );
}

/** AI 使用能力（2026-10-30）：五个子项 + 证据 + 硬指标 */
export function AiUse({ u }: { u: any }) {
  const st = u.stats || {};
  const chips: [string, string][] = [['问 AI', `${st.asks ?? 0} 次`], ['追问', `${st.followups ?? 0} 次`], ['采纳进交付物', `${st.adopted ?? 0} 次`], ['交付物里原样来自 AI', `${st.verbatim_ratio ?? 0}%`], ['第一次问之前看了材料', `${st.materials_before_first_ask ?? 0} 份`]];
  return (
    <Card title="AI 使用能力 · 怎么问、怎么核、怎么取舍">
      {u.standard && <div style={{ fontSize: 13, color: '#555', marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: '#fafaff', border: '1px solid #eeeefa' }}>照这家企业、这个岗位的 AI 使用标准评：<b>{u.standard.stance}</b>。{u.standard.summary}</div>}
      {!!u.violations?.length && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fff4f2', border: '1px solid #ffd6cf', color: '#b42318', fontSize: 13 }}>
        <b>碰了治理红线（每条扣 8 分）</b>{u.violations.map((v: any, k: number) => <div key={k}><span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{fmt(v.t)}</span> {v.what}{v.quote ? `：${v.quote}` : ''}</div>)}
      </div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>{chips.map(([k, v]) => <span key={k} style={{ fontSize: 12.5, padding: '3px 10px', borderRadius: 999, background: '#f4f3ff', color: '#4c43c9' }}>{k} <b>{v}</b></span>)}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {(u.items || []).map((i: any) => (
          <div key={i.key} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 12, alignItems: 'start' }}>
            <div><b style={{ fontSize: 14 }}>{i.title}</b><div style={{ fontSize: 20, fontWeight: 800, color: col(i.score), lineHeight: 1.2 }}>{i.score}</div>{u.standard?.weights?.[i.key] != null && <div style={{ fontSize: 11, color: '#999' }}>权重 {u.standard.weights[i.key]}%</div>}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ height: 6, borderRadius: 3, background: '#eef0f5', overflow: 'hidden', margin: '6px 0 6px' }}><div style={{ width: `${i.score}%`, height: '100%', background: col(i.score) }} /></div>
              <div style={{ fontSize: 13.5, color: '#333' }}>{i.note}</div>
              {(i.evidence || []).map((e: any, k: number) => <div key={k} style={{ fontSize: 12.5, color: '#777', marginTop: 2 }}><span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: '#6055f5' }}>{fmt(e.t)}</span> {e.quote}</div>)}
            </div>
          </div>
        ))}
      </div>
    </Card>
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

/**
 * 一眼看懂（2026-10-28）：雷达图（逐条得分，叠 AI 基线）+ 逐条对照条 + 一句话结论。
 * 雷达只在 3–10 条时画；条目太少或太多就只留对照条。
 */
function Overview({ items, cmp }: { items: any[]; cmp: any }) {
  const rows = items.map((i: any) => ({ id: i.id, title: String(i.title || i.id), score: Number(i.score) || 0, base: cmp?.items?.find((x: any) => x.id === i.id)?.baseline as number | undefined }));
  const hasBase = rows.some(x => typeof x.base === 'number');
  const diffs = rows.filter(x => typeof x.base === 'number').map(x => ({ ...x, d: x.score - (x.base as number) }));
  const ahead = diffs.filter(x => x.d >= 8).sort((a, b) => b.d - a.d).slice(0, 2), behind = diffs.filter(x => x.d <= -8).sort((a, b) => a.d - b.d).slice(0, 2);
  const short = (t: string) => (t.length > 12 ? t.slice(0, 12) + '…' : t);
  const line = !hasBase ? null
    : ahead.length && behind.length ? `比 AI 强在「${ahead.map(x => short(x.title)).join('」「')}」；「${behind.map(x => short(x.title)).join('」「')}」上 AI 做得更好`
    : ahead.length ? `「${ahead.map(x => short(x.title)).join('」「')}」明显强过 AI，其余和 AI 相当`
    : behind.length ? `整体没有超过 AI，差距最大的是「${behind.map(x => short(x.title)).join('」「')}」——这正是要练的地方`
    : '每一条都和 AI 基线相当';
  const radar = rows.length >= 3 && rows.length <= 10;
  return (
    <Card title="一眼看懂">
      {line && <div style={{ fontSize: 15, fontWeight: 700, color: '#2b2670', marginBottom: 10 }}>{line}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: radar ? 'minmax(240px, 340px) minmax(0, 1fr)' : '1fr', gap: 18, alignItems: 'center' }}>
        {radar && <Radar rows={rows} />}
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map(x => (
            <div key={x.id}>
              <div style={{ display: 'flex', fontSize: 12.5, color: '#3b405a', marginBottom: 2 }}><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.title}>{x.title}</span><b style={{ color: col(x.score), marginLeft: 8 }}>{x.score}</b>{typeof x.base === 'number' && <span style={{ color: '#999', marginLeft: 6 }}>AI {x.base}</span>}</div>
              <div style={{ height: 7, borderRadius: 4, background: '#f0f0f6', overflow: 'hidden' }}><div style={{ width: `${Math.max(2, x.score)}%`, height: '100%', background: '#6055f5', borderRadius: 4 }} /></div>
              {typeof x.base === 'number' && <div style={{ height: 4, borderRadius: 3, background: '#f5f5f8', overflow: 'hidden', marginTop: 2 }}><div style={{ width: `${Math.max(2, x.base)}%`, height: '100%', background: '#b8bacb', borderRadius: 3 }} /></div>}
            </div>
          ))}
          {hasBase && <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: '#888', marginTop: 2 }}><span><i style={{ display: 'inline-block', width: 10, height: 6, background: '#6055f5', borderRadius: 2, marginRight: 4 }} />这次作答</span><span><i style={{ display: 'inline-block', width: 10, height: 4, background: '#b8bacb', borderRadius: 2, marginRight: 4 }} />AI 基线</span></div>}
        </div>
      </div>
    </Card>
  );
}
export function Radar({ rows }: { rows: { title: string; score: number; base?: number }[] }) {
  const N = rows.length, R = 92, C = 130, ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / N;
  const pt = (i: number, v: number) => [C + (R * v / 100) * Math.cos(ang(i)), C + (R * v / 100) * Math.sin(ang(i))];
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  const hasBase = rows.every(r => typeof r.base === 'number');
  return (
    <svg viewBox="-56 0 372 260" style={{ width: "100%", maxWidth: 340 }} role="img" aria-label="逐条得分雷达图">
      {[25, 50, 75, 100].map(g => <polygon key={g} points={poly(rows.map(() => g))} fill="none" stroke="#e6e7ef" strokeWidth={1} />)}
      {rows.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#eceef4" />; })}
      {hasBase && <polygon points={poly(rows.map(r => r.base as number))} fill="rgba(140,143,166,.12)" stroke="#9a9db0" strokeDasharray="4 3" strokeWidth={1.4} />}
      <polygon points={poly(rows.map(r => r.score))} fill="rgba(96,85,245,.18)" stroke="#6055f5" strokeWidth={2} />
      {rows.map((r, i) => { const [x, y] = pt(i, 118); const t = r.title.length > 7 ? r.title.slice(0, 7) + '…' : r.title; return <text key={i} x={x} y={y} fontSize={10} fill="#6b6f86" textAnchor={Math.abs(x - C) < 8 ? 'middle' : x > C ? 'start' : 'end'} dominantBaseline="middle">{t}</text>; })}
    </svg>
  );
}
