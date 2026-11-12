'use client';

/** 真活台 · 报告（参与者页和后台共用）：结果逐条 + 和 AI 基线比 + 过程高光 / 风险 + 六维 */
import React from 'react';
import { Segment } from '@/components/work/AuditPanel';
import { aiItemL, dimL, useL, useLang } from '@/lib/work/i18n';
import { noAiLabel } from '@/lib/work/scale';
import { useWorkScale } from '@/lib/work/scale-client';

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const LV: Record<string, string> = { L1: '#c9ccd6', L2: '#ffd166', L3: '#3ddc97', L4: '#12a150' };
const col = (v: number) => (v >= 80 ? '#12a150' : v >= 60 ? '#b7791f' : '#c0392b');

/** section（11-05 报告分「交了什么 / 怎么做的 / 评得怎样」三栏）：grade 只出评分那几张、process 只出过程那几张；不传 = 整篇（老用法） */
export function WorkReport({ report, participant, section = 'all' }: { report: any; participant?: { name?: string }; section?: 'all' | 'grade' | 'process' }) {
  const G = section !== 'process', Pr = section !== 'grade'; const L = useL(); const lang = useLang();
  const scale = useWorkScale(), ai = scale === 'ai_use';   // 平台选了「AI 使用与交互」：回答质量和过程评价不显示
  if (!report || (!scale && !report.auditing)) return null;
  if (report.auditing) return <div style={{ padding: '14px 18px', background: '#f3f2ff', borderRadius: 14, color: '#4c43c9', fontSize: 14 }}>{L(`AI 审计中：过程 ${report.total ?? ''} 段，已看 ${report.stage ?? ''} 段${report.audit?.length ? `，到 ${fmt(report.audit[report.audit.length - 1].to)} 为止的过程信号 ${report.audit[report.audit.length - 1].tentative}（暂定）` : ''}。候选人那边做完最后一步就出正式报告。`, `AI review in progress: ${report.stage} of ${report.total} process segments reviewed${report.audit?.length ? `; process signal up to ${fmt(report.audit[report.audit.length - 1].to)} is ${report.audit[report.audit.length - 1].tentative} (provisional)` : ''}. The final report is ready once the candidate's side finishes the last step.`)}</div>;
  const r = report.result, p = report.process, c = report.compare, u = report.ai_use;
  if (!r) return null;
  return (
    <div style={{ display: 'grid', gap: 16, fontSize: 14, lineHeight: 1.7, color: '#1a1a2e' }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {G && !ai && <Card title={L('结果', 'Result')} style={{ flex: '1 1 200px' }}>
          {section === 'all' && <div style={{ fontSize: 40, fontWeight: 800, color: col(r.total) }}>{r.total}<span style={{ fontSize: 14, color: '#8c8c8c', fontWeight: 500 }}> / 100</span></div>}
          {c && <div style={{ fontSize: 13, color: '#555' }}>{L(`AI 基线 ${c?.baseline_total ?? ''} · 你${c?.delta >= 0 ? '高' : '低'} ${Math.abs(c?.delta)} 分`, `AI baseline ${c?.baseline_total ?? ''} · you scored ${Math.abs(c?.delta)} ${c?.delta >= 0 ? 'higher' : 'lower'}`)}{c?.delta < 0 && <span style={{ color: '#8c8c8c' }}>{L('（大部分人做不过 AI，差距就是要练的地方）', ' (most people score below the AI; the gap is what to practise)')}</span>}</div>}
          <div style={{ marginTop: 8, color: '#444' }}>{r.summary}</div>
        </Card>}
        {G && u && <Card title={L('AI 使用能力', 'AI use')} style={{ flex: '1 1 200px' }}>
          {u.score == null ? <div style={{ fontSize: 22, fontWeight: 800, color: '#8c8c8c', margin: '6px 0' }}>{noAiLabel(u, L)}</div>
            : section !== 'all' ? null : <div style={{ fontSize: 40, fontWeight: 800, color: col(u.score) }}>{u.score}<span style={{ fontSize: 14, color: '#8c8c8c', fontWeight: 500 }}> / 100</span></div>}
          <div style={{ marginTop: 4, color: '#444' }}>{u.verdict}</div>
        </Card>}
        {Pr && !ai && !p && <Card title={L('过程', 'Process')} style={{ flex: '1 1 260px' }}><div style={{ color: '#888', fontSize: 13 }}>{report.who === 'college' ? L('AI 学员做的，没有人工操作过程', 'Done by an AI trainee; no human work process') : L('这次作答没有过程记录', 'No process was recorded for this attempt')}</div></Card>}
        {Pr && !ai && p && <Card title={L('过程', 'Process')} style={{ flex: '1 1 260px' }}>
          <div style={{ color: '#555', fontSize: 13 }}>{L(`用时 ${fmt(p?.duration_s)} · 问 AI ${p?.stats?.ai_asks || 0} 次 · 看了 ${p?.stats?.materials_opened || 0}/${p?.stats?.materials_total || 0} 份材料 · 粘贴 ${p?.stats?.paste_chars || 0} 字 · 自己敲 ${p?.stats?.typed_chars || 0} 字`, `Time ${fmt(p?.duration_s)} · asked AI ${p?.stats?.ai_asks || 0} times · opened ${p?.stats?.materials_opened || 0}/${p?.stats?.materials_total || 0} materials · pasted ${p?.stats?.paste_chars || 0} chars · typed ${p?.stats?.typed_chars || 0} chars`)}</div>
          <div style={{ marginTop: 8 }}>{p?.delegation}</div>
          {!!p?.phases?.length && <div style={{ display: 'flex', marginTop: 10, height: 10, borderRadius: 5, overflow: 'hidden', background: '#eee' }}>{p?.phases.map((ph: any, i: number) => <div key={i} title={`${ph.label} ${fmt(ph.from)}–${fmt(ph.to)}`} style={{ flex: Math.max(1, ph.to - ph.from), background: ['#6055f5', '#12b5cb', '#3ddc97', '#ffd166', '#fa8c16', '#eb2f96', '#8c8c8c', '#1677ff'][i % 8] }} />)}</div>}
          {!!p?.phases?.length && <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{p?.phases.map((ph: any) => ph.label).join(' → ')}</div>}
        </Card>}
      </div>
      {G && !ai && r.items?.length >= 2 && <Overview items={r.items} cmp={c} />}
      {G && u?.score != null && <AiUse u={u} />}
      {section === 'all' && report.next_step && <Card title={L('如果再给一天，先改哪里（候选人交卷时写的）', 'With one more day, what to improve first (written by the candidate at submission)')}><div style={{ fontSize: 13.5, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{report.next_step}</div></Card>}
      {/* 屏幕记录（11-10 潜历：原始录屏不给招聘方看）：只给 AI 看图写的概述，逐时间点的记录在答题历程里；原图不展示 */}
      {Pr && report.recording && <Card title={L('屏幕记录 · 用自己的软件做的', 'Screen record · work done in own software')}>
        <div style={{ fontSize: 13.5, lineHeight: 1.7 }}><div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>{L(`时长 ${fmt(report.recording.duration || 0)} · AI 看了 ${report.recording.frames ?? ''} 张截图写的概述；为保护候选人隐私，原始截图不展示，逐时间点的记录在答题历程里`, `Duration ${fmt(report.recording.duration || 0)} · summary written by AI from ${report.recording.frames} screenshots; to protect the candidate's privacy the original screenshots are not shown, and the time-stamped log is in the work history`)}</div>{report.recording.summary}</div>
      </Card>}
      {G && !ai && <Card title={L('逐条（每条都有证据；前置没做到的，后置封顶）', 'Item by item (each with evidence; if a prerequisite is missed, later items are capped)')}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ color: '#8c8c8c', textAlign: 'left' }}><th style={th}>{L('条目', 'Item')}</th><th style={th}>{L('等级', 'Level')}</th><th style={th}>{L('得分', 'Score')}</th>{c && <th style={th}>{L('AI 基线', 'AI baseline')}</th>}<th style={th}>{L('证据 / 说明', 'Evidence / notes')}</th></tr></thead>
          <tbody>{r.items.map((i: any) => { const b = c?.items?.find((x: any) => x.id === i.id)?.baseline; return (
            <tr key={i.id} style={{ borderTop: '1px solid #eee', verticalAlign: 'top' }}>
              <td style={td}><b>{i.title}</b><div style={{ color: '#999', fontSize: 12 }}>{L('权重', 'Weight')} {i.weight}{i.blocked_by ? L(` · 被 ${i.blocked_by} 卡住`, ` · blocked by ${i.blocked_by}`) : ''}</div></td>
              <td style={td}><span style={{ background: LV[i.level], color: i.level === 'L1' ? '#555' : '#fff', padding: '1px 8px', borderRadius: 999, fontWeight: 700, fontSize: 12 }}>{i.level}</span></td>
              <td style={{ ...td, fontWeight: 700, color: col(i.score) }}>{i.score}</td>
              {c && <td style={{ ...td, color: '#777' }}>{b ?? '–'}</td>}
              <td style={td}>{i.evidence && <div style={{ color: '#444', fontStyle: 'italic' }}>“{i.evidence}”</div>}<div style={{ color: '#666' }}>{i.note}</div></td>
            </tr>); })}</tbody>
        </table>
        {(r.strengths?.length || r.gaps?.length) ? <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {!!r.strengths?.length && <div style={{ flex: 1 }}><div style={{ color: '#12a150', fontWeight: 700 }}>{L('做得好的', 'Strengths')}</div><ul style={ul}>{r.strengths.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
          {!!r.gaps?.length && <div style={{ flex: 1 }}><div style={{ color: '#c0392b', fontWeight: 700 }}>{L('差的地方', 'Gaps')}</div><ul style={ul}>{r.gaps.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
        </div> : null}
      </Card>}
      {Pr && !ai && <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Card title={L('高光时刻', 'Highlights')} style={{ flex: '1 1 280px' }}>{p?.highlights?.length ? p?.highlights.map((h: any, i: number) => <Moment key={i} m={h} color="#12a150" />) : <span style={{ color: '#999' }}>{L('没有观察到明显的高光', 'No clear highlights observed')}</span>}</Card>
        <Card title={L('风险时刻', 'Risk moments')} style={{ flex: '1 1 280px' }}>{p?.risks?.length ? p?.risks.map((h: any, i: number) => <Moment key={i} m={h} color="#c0392b" />) : <span style={{ color: '#999' }}>{L('没有观察到明显的风险', 'No clear risks observed')}</span>}</Card>
      </div>}
      {Pr && !ai && !!report.audit?.length && <Card title={L('审计过程（交卷后一段一段看的笔记，总评和它连续）', 'Review notes (taken segment by segment after submission; the overall verdict follows from them)')}>
        <div style={{ display: 'grid', gap: 10 }}>{report.audit.map((seg: any) => <Segment key={seg.idx} seg={seg} compact />)}</div>
      </Card>}
      {Pr && !ai && <Card title={L('人机协作六维（观察到的，不是定性）', 'Six dimensions of human-AI collaboration (observed, not a verdict)')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {Object.entries(p?.skills || {}).map(([k, v]: any) => <div key={k} style={{ padding: '10px 12px', borderRadius: 10, background: '#fafbff', borderLeft: `4px solid ${LV[v.level]}` }}><div style={{ fontWeight: 700 }}>{dimL(k, lang)} <span style={{ fontSize: 12, color: '#777' }}>{v.level}</span></div><div style={{ fontSize: 13, color: '#555' }}>{v.note}</div></div>)}
        </div>
      </Card>}
      {G && <div style={{ fontSize: 12, color: '#999' }}>{participant?.name ? `${participant.name} · ` : ''}{L('报告生成于', 'Report generated')} {report.generated_at ? new Date(report.generated_at).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN') : ''} · {L('结果按出任务 rubric 逐条核对，过程看工作台事件流；这是练习与预筛信号，不是能力定性。', 'Results are checked item by item against the task rubric, and the process from the workspace event log. This is a practice and screening signal, not a verdict on ability.')}</div>}
    </div>
  );
}

/** AI 使用能力（2026-10-30）：五个子项 + 证据 + 硬指标 */
export function AiUse({ u }: { u: any }) {
  const st = u.stats || {}; const L = useL(); const lang = useLang();
  const chips: [string, string][] = [[L('问 AI', 'Asked AI'), L(`${st.asks ?? 0} 次`, `${st.asks ?? 0}×`)], [L('追问', 'Follow-ups'), L(`${st.followups ?? 0} 次`, `${st.followups ?? 0}×`)], [L('采纳进交付物', 'Adopted into deliverable'), L(`${st.adopted ?? 0} 次`, `${st.adopted ?? 0}×`)], [L('交付物里原样来自 AI', 'Deliverable verbatim from AI'), `${st.verbatim_ratio ?? 0}%`], ...(st.ai_numbers_carried ? [[L('AI 算出的数字进交付物', 'AI-computed numbers in deliverable'), L(`${st.ai_numbers_carried} 个`, `${st.ai_numbers_carried}`)] as [string, string]] : []), [L('第一次问之前看了材料', 'Materials read before first ask'), `${st.materials_before_first_ask ?? 0}${L(' 份', '')}`]];
  return (
    <Card title={L('AI 使用能力 · 怎么问、怎么核、怎么取舍', 'AI use · how you ask, check and decide')}>
      {u.standard && <div style={{ fontSize: 13, color: '#555', marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: '#fafaff', border: '1px solid #eeeefa' }}>{L('照这家企业、这个岗位的 AI 使用标准评：', "Assessed against this company's AI-use standard for this role: ")}<b>{u.standard.stance}</b>{L('。', '. ')}{u.standard.summary}</div>}
      {!!u.violations?.length && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fff4f2', border: '1px solid #ffd6cf', color: '#b42318', fontSize: 13 }}>
        <b>{u.violations.some((v: any) => v.kind) ? L('负向记录', 'Negative findings') : L('碰了治理红线（每条扣 8 分）', 'Crossed governance red lines (−8 points each)')}</b>{u.violations.map((v: any, k: number) => <div key={k}>{v.kind && <span style={{ fontSize: 11.5, fontWeight: 700, marginRight: 6, padding: '0 6px', borderRadius: 4, background: '#fff', border: '1px solid #ffd6cf' }}>{v.kind === 'veto' ? L('转人工', 'Human review') : v.kind === 'integrity' ? L('诚信 · 封顶 40', 'Integrity · capped at 40') : L('做法 · 压对应子项', 'Conduct · lowers the related item')}</span>}<span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{fmt(v.t)}</span> {v.what}{v.quote ? `：${v.quote}` : ''}</div>)}
      </div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>{chips.map(([k, v]) => <span key={k} style={{ fontSize: 12.5, padding: '3px 10px', borderRadius: 999, background: '#f4f3ff', color: '#4c43c9' }}>{k} <b>{v}</b></span>)}</div>
      {u.low_use && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fff8ec', border: '1px solid #f5dfb8', fontSize: 13, color: '#8a5a12' }}>{L(`几乎没用 AI：站内只问过 ${u.stats?.asks ?? 1} 次，站外也没看到。提问和分工最高 2 档${u.standard && !/传统/.test(u.standard.stance) ? '；这家企业鼓励用 AI，AI 使用分封顶 40' : ''}。`, `Barely used AI: asked the on-page assistant ${u.stats?.asks ?? 1} time and no outside AI was seen. Asking and dividing work are capped at level 2${u.standard && !/传统/.test(u.standard.stance) ? '; this company encourages AI use, so the AI-use score is capped at 40' : ''}.`)}</div>}
      {u.disclosure && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: u.disclosure.match === 'major' ? '#fff4f2' : '#f7f9fc', border: `1px solid ${u.disclosure.match === 'major' ? '#ffd6cf' : '#e8ecf3'}`, fontSize: 13 }}>
        <b>{L('AI 参与说明（交卷时写的）', 'AI involvement statement (written at submission)')}</b> · <span style={{ fontWeight: 700, color: u.disclosure.match === 'consistent' ? '#12a150' : u.disclosure.match === 'major' ? '#b42318' : '#b7791f' }}>{({ consistent: L('与记录一致', 'Matches the record'), minor: L('有些夸大', 'Somewhat overstated'), major: L('与记录严重不符', 'Contradicts the record'), vague: L('太笼统，没法核对', 'Too vague to check') } as Record<string, string>)[u.disclosure.match]}</span>
        <div style={{ color: '#555', marginTop: 4, whiteSpace: 'pre-wrap' }}>「{u.disclosure.text}」</div>{u.disclosure.note && <div style={{ color: '#888', marginTop: 2 }}>{u.disclosure.note}</div>}
      </div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {(u.items || []).map((i: any) => i.score == null ? (
          <div key={i.key} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 12, alignItems: 'start', color: '#8c8c8c' }}>
            <div><b style={{ fontSize: 14 }}>{aiItemL(i.key, i.title, lang)}</b><div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.6 }}>{L('未观测', 'Not observed')}</div></div>
            <div style={{ fontSize: 13, paddingTop: 2 }}>{i.why_na}{L('（不是没做到，是这道题没给机会，不计入分数）', ' (not a weakness: the task gave no chance to show it, so it is left out of the score)')}</div>
          </div>
        ) : (
          <div key={i.key} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 12, alignItems: 'start' }}>
            <div><b style={{ fontSize: 14 }}>{aiItemL(i.key, i.title, lang)}</b><div style={{ fontSize: 20, fontWeight: 800, color: col(i.score), lineHeight: 1.2 }}>{i.score}</div>{i.q != null && <div style={{ fontSize: 11, color: '#999' }}>{L(`第 ${i.q} 档 / 5`, `Level ${i.q} / 5`)}</div>}{u.standard?.weights?.[i.key] != null && <div style={{ fontSize: 11, color: '#999' }}>{L('权重', 'Weight')} {u.standard.weights[i.key]}%</div>}</div>
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
  const L = useL(); const lang = useLang();
  return <div style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0' }}><span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color, fontWeight: 700 }}>{fmt(m.t)}</span> <span style={{ fontSize: 12, color: '#777', marginLeft: 6 }}>{dimL(m.skill, lang)}</span><div>{m.behavior}</div>{m.evidence && <div style={{ fontSize: 12, color: '#777' }}>{L('证据：', 'Evidence: ')}{m.evidence}</div>}</div>;
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
  const short = (t: string) => (t.length > 12 ? t.slice(0, 12) + '…' : t); const L = useL(); const lang = useLang();
  const q = (xs: typeof diffs) => xs.map(x => `"${short(x.title)}"`).join(', ');
  const line = !hasBase ? null
    : lang === 'en' ? (ahead.length && behind.length ? `Stronger than the AI on ${q(ahead)}; the AI did better on ${q(behind)}`
      : ahead.length ? `Clearly stronger than the AI on ${q(ahead)}; on par with the AI elsewhere`
      : behind.length ? `Not ahead of the AI overall; the biggest gap is ${q(behind)}, which is exactly what to practise`
      : 'On par with the AI baseline on every item')
    : ahead.length && behind.length ? `比 AI 强在「${ahead.map(x => short(x.title)).join('」「')}」；「${behind.map(x => short(x.title)).join('」「')}」上 AI 做得更好`
    : ahead.length ? `「${ahead.map(x => short(x.title)).join('」「')}」明显强过 AI，其余和 AI 相当`
    : behind.length ? `整体没有超过 AI，差距最大的是「${behind.map(x => short(x.title)).join('」「')}」——这正是要练的地方`
    : '每一条都和 AI 基线相当';
  const radar = rows.length >= 3 && rows.length <= 10;
  return (
    <Card title={L('一眼看懂', 'At a glance')}>
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
          {hasBase && <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: '#888', marginTop: 2 }}><span><i style={{ display: 'inline-block', width: 10, height: 6, background: '#6055f5', borderRadius: 2, marginRight: 4 }} />{L('这次作答', 'This attempt')}</span><span><i style={{ display: 'inline-block', width: 10, height: 4, background: '#b8bacb', borderRadius: 2, marginRight: 4 }} />{L('AI 基线', 'AI baseline')}</span></div>}
        </div>
      </div>
    </Card>
  );
}
export function Radar({ rows }: { rows: { title: string; score: number; base?: number }[] }) {
  const N = rows.length, R = 92, C = 130, ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / N;
  const pt = (i: number, v: number) => [C + (R * v / 100) * Math.cos(ang(i)), C + (R * v / 100) * Math.sin(ang(i))];
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  const hasBase = rows.every(r => typeof r.base === 'number'); const L = useL();
  return (
    <svg viewBox="-56 0 372 260" style={{ width: "100%", maxWidth: 340 }} role="img" aria-label={L('逐条得分雷达图', 'Radar chart of item scores')}>
      {[25, 50, 75, 100].map(g => <polygon key={g} points={poly(rows.map(() => g))} fill="none" stroke="#e6e7ef" strokeWidth={1} />)}
      {rows.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#eceef4" />; })}
      {hasBase && <polygon points={poly(rows.map(r => r.base as number))} fill="rgba(140,143,166,.12)" stroke="#9a9db0" strokeDasharray="4 3" strokeWidth={1.4} />}
      <polygon points={poly(rows.map(r => r.score))} fill="rgba(96,85,245,.18)" stroke="#6055f5" strokeWidth={2} />
      {rows.map((r, i) => { const [x, y] = pt(i, 118); const t = r.title.length > 7 ? r.title.slice(0, 7) + '…' : r.title; return <text key={i} x={x} y={y} fontSize={10} fill="#6b6f86" textAnchor={Math.abs(x - C) < 8 ? 'middle' : x > C ? 'start' : 'end'} dominantBaseline="middle">{t}</text>; })}
    </svg>
  );
}
