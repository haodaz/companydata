'use client';

/**
 * 真活台 · 一份作答的报告（2026-11-05 重排）：报告页（报告链接）和出任务的人「看报告」抽屉共用。
 * 以前从上到下一长串（原文 → 文件 → 截图 → 答题历程 → 结果 → 逐条 → 高光 → 审计 → 六维），反馈一条加一块越拉越长；
 * 现在顶上一条概要，下面三栏：交了什么 / 怎么做的 / 评得怎样。出任务的人默认先看交了什么（看答案本身，AI 只是辅助评价），候选人默认看评得怎样。
 */
import React, { useState } from 'react';
import { WorkReport } from '@/components/work/WorkReport';
import { WorkProcess } from '@/components/work/WorkProcess';
import { Md } from '@/components/ws/Md';
import { useL } from '@/lib/work/i18n';
import { noAiLabel } from '@/lib/work/scale';
import { useWorkScale } from '@/lib/work/scale-client';

type Tab = 'deliv' | 'process' | 'grade';
const TABS: [Tab, string, string][] = [['deliv', '交了什么', 'Submission'], ['process', '怎么做的', 'Process'], ['grade', '评得怎样', 'Assessment']];
const fmt = (t: number) => `${Math.floor(t / 60)} 分 ${String(Math.floor(t % 60)).padStart(2, '0')} 秒`;
const fmtEn = (t: number) => `${Math.floor(t / 60)} min ${String(Math.floor(t % 60)).padStart(2, '0')} s`;
const col = (v: number) => (v >= 80 ? '#12a150' : v >= 60 ? '#b7791f' : '#c0392b');

export function ReportView({ report, participant, deliverable, events, aiChat, materials, deliverables, defaultTab = 'grade' }: {
  report: any; participant?: { name?: string };
  deliverable?: string; events?: any[] | null; aiChat?: any[];
  materials?: { id: string; title: string }[]; deliverables?: { id: string; title: string }[];
  defaultTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab); const L = useL(); const scale = useWorkScale();
  if (!report) return null;
  if (report.auditing) return <WorkReport report={report} participant={participant} />;   // 还在审：显示审计进度
  if (!scale) return null;
  const r = report.result, u = report.ai_use, p = report.process;
  const nFiles = (events || []).filter(e => e.type === 'file' && e.url).length;
  const shots = report.recording?.gallery || [];
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* 概要：一眼看到分数、用 AI 怎么样、用了多久 */}
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'baseline', padding: '12px 16px', borderRadius: 12, background: '#fafbff', border: '1px solid #e8e9f0' }}>
        {r && scale !== 'ai_use' && <span><span style={lab}>{L('结果', 'Result')}</span><b style={{ fontSize: 26, color: col(r.total) }}>{r.total}</b><span style={dim}> / 100</span></span>}
        {u && <span><span style={lab}>{L('AI 使用', 'AI use')}</span>{u.score == null ? <b style={{ color: '#8c8c8c' }}>{noAiLabel(u, L)}</b> : <><b style={{ fontSize: 22, color: col(u.score) }}>{u.score}</b><span style={dim}> / 100</span></>}</span>}
        {p?.duration_s != null && <span><span style={lab}>{L('用时', 'Time taken')}</span><b>{L(fmt(p.duration_s), fmtEn(p.duration_s))}</b></span>}
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e8e9f0' }}>
        {TABS.map(([k, t, te]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ border: 0, background: 'none', padding: '8px 14px', fontSize: 14, fontWeight: tab === k ? 700 : 500, color: tab === k ? '#4c43c9' : '#666', borderBottom: `2px solid ${tab === k ? '#6055f5' : 'transparent'}`, marginBottom: -1, cursor: 'pointer' }}>
          {L(t, te)}{k === 'deliv' && nFiles ? <span style={badge}>{L(`${nFiles} 个文件`, `${nFiles} file${nFiles === 1 ? '' : 's'}`)}</span> : k === 'process' && report.recording?.shots ? <span style={badge}>{L(`屏幕记录 ${report.recording.shots} 张`, `${report.recording.shots} screenshots`)}</span> : null}
        </button>)}
      </div>
      {tab === 'deliv' && <div style={{ display: 'grid', gap: 14 }}>
        <div style={box}><div style={head}>{L('交付物原文', 'Submitted text')}</div>
          <div className="wk-deliv" style={{ padding: 12, fontSize: 13.5, lineHeight: 1.75, maxHeight: 560, overflow: 'auto' }}>{deliverable ? <Md text={deliverable} /> : <span style={{ color: '#999' }}>{L('（没有交付物文本）', '(No submitted text)')}</span>}</div>
        </div>
        {events && <WorkProcess part="files" events={events} aiChat={aiChat || []} materials={materials} deliverables={deliverables} />}
        {report.next_step && <div style={box}><div style={head}>{L('最后一问：如果再给一天，先改哪里（候选人写的）', 'Last question: with one more day, what to improve first (written by the candidate)')}</div><div style={{ padding: 12, fontSize: 13.5, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{report.next_step}</div></div>}
      </div>}
      {tab === 'process' && <div style={{ display: 'grid', gap: 14 }}>
        <WorkReport report={report} participant={participant} section="process" />
        {events ? <WorkProcess part="timeline" events={events} aiChat={aiChat || []} materials={materials} deliverables={deliverables} shots={shots} /> : <div style={{ color: '#999', fontSize: 13 }}>{L('读取答题历程…', 'Loading the work history…')}</div>}
      </div>}
      {tab === 'grade' && <WorkReport report={report} participant={participant} section="grade" />}
    </div>
  );
}

const lab: React.CSSProperties = { fontSize: 12, color: '#8c8c8c', marginRight: 6 };
const dim: React.CSSProperties = { fontSize: 12, color: '#8c8c8c' };
const badge: React.CSSProperties = { marginLeft: 6, fontSize: 11, color: '#6055f5', background: '#f1efff', borderRadius: 999, padding: '1px 7px', fontWeight: 600 };
const box: React.CSSProperties = { border: '1px solid #e8e9f0', borderRadius: 10, overflow: 'hidden', background: '#fff' };
const head: React.CSSProperties = { padding: '8px 12px', background: '#fafbff', fontWeight: 700, fontSize: 13 };
