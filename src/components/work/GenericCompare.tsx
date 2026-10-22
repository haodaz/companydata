'use client';

/**
 * 对比通用模型（2026-10-22，老板：「有垂直和没垂直，出题效果完全不一样」）：
 * 左边：国内用户能直接用的通用模型（千问），只给一句大白话让它出题；右边：平方拿企业库 / 深度画像 / 出题流程出的。
 * 研判（lib/work/compare）对照库里核实过的企业资料标出通用模型的问题，两边压成同样五行左右对齐；原文折叠，展开时问题处标红。
 */
import React, { useState } from 'react';
import { App, Button, Drawer, Tag, Tooltip } from 'antd';

type Row = 'scenario' | 'task' | 'materials' | 'rubric' | 'facts';
type Issue = { quote: string; type: string; why: string; row: Row; by: 'rule' | 'ai' };
type Review = { verdict: string; generic: Record<Row, string>; ours: Record<Row, string>; issues: Issue[] };
type Compare = { prompt: string; text: string; model: string; at: string; review?: Review };

const ROWS: [Row, string][] = [['scenario', '业务场景'], ['task', '要候选人做什么'], ['materials', '给考生的材料'], ['rubric', '评分标准'], ['facts', '用到的企业事实']];
const RED = '#d4380d';

/** 一行文字里把问题引用标红（悬停看为什么） */
function marked(line: string, issues: Issue[]) {
  const hits = issues.filter(i => line.includes(i.quote));
  if (!hits.length) return line;
  const parts: React.ReactNode[] = []; let rest = line, k = 0;
  while (rest) {
    let best: { i: Issue; at: number } | null = null;
    for (const i of hits) { const at = rest.indexOf(i.quote); if (at >= 0 && (!best || at < best.at)) best = { i, at }; }
    if (!best) { parts.push(rest); break; }
    if (best.at) parts.push(rest.slice(0, best.at));
    parts.push(<Tooltip key={k++} title={`${best.i.type}：${best.i.why}`}><mark style={{ background: '#fff1e8', color: RED, borderBottom: `2px solid ${RED}`, padding: '0 1px', cursor: 'help' }}>{best.i.quote}</mark></Tooltip>);
    rest = rest.slice(best.at + best.i.quote.length);
  }
  return parts;
}

/** 大模型回答的轻量渲染：# 标题加粗、去掉 **、表格原样等宽；问题处标红 */
function Plain({ text, issues }: { text: string; issues: Issue[] }) {
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.75, color: '#333' }}>
      {text.replace(/\*\*/g, '').split('\n').map((l, i) => {
        const h = l.match(/^#{1,6}\s+(.*)/);
        if (h) return <div key={i} style={{ fontWeight: 700, fontSize: 14.5, margin: '12px 0 4px', color: '#1a1a2e' }}>{marked(h[1], issues)}</div>;
        if (/^\s*\|/.test(l)) return <div key={i} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, whiteSpace: 'pre', overflowX: 'auto' }}>{marked(l, issues)}</div>;
        if (/^\s*---+\s*$/.test(l)) return <hr key={i} style={{ border: 0, borderTop: '1px solid #eee', margin: '10px 0' }} />;
        return <div key={i} style={{ minHeight: l.trim() ? undefined : 8, whiteSpace: 'pre-wrap' }}>{marked(l, issues)}</div>;
      })}
    </div>
  );
}

const Sub = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.75, color: '#333' }}><div style={{ fontWeight: 700, color: '#6055f5', marginBottom: 4 }}>{t}</div>{children}</div>
);
const Fold = ({ title, children, open }: { title: React.ReactNode; children: React.ReactNode; open?: boolean }) => (
  <details open={open} style={{ marginTop: 6 }}><summary style={{ cursor: 'pointer', color: '#6055f5', fontSize: 12.5 }}>{title}</summary><div style={{ marginTop: 6 }}>{children}</div></details>
);

export function GenericCompare({ token, ownerKey, task }: { token: string; ownerKey: string; task: any }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [c, setC] = useState<Compare | null>(task.task?.compare || null);
  const ask = async (force = false) => {
    setOpen(true); if (c?.review && !force) return;
    setBusy(true);
    try {
      const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(ownerKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ compare: true, force }) })).json();
      if (!j.ok) throw new Error(j.error); setC(j.compare);
    } catch (e: any) { message.error(e.message); } finally { setBusy(false); }
  };
  const rv = c?.review, issues = rv?.issues || [];
  const mats = task.materials || [], rub = task.rubric || [];
  const prompt = c?.prompt || `我们公司是${task.company_name}，要招人：${task.role}。请你出一道题给应聘者做，并给出评分标准。`;
  const cell: React.CSSProperties = { padding: '12px 14px', borderTop: '1px solid #eef0f5', fontSize: 13.5, lineHeight: 1.7, color: '#333' };
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr) minmax(0, 1fr)' };
  return (
    <>
      <Button onClick={() => ask()}>对比通用模型</Button>
      <Drawer open={open} onClose={() => setOpen(false)} width="min(1200px, 100vw)" title="同一个需求，两种出题方式" styles={{ body: { padding: 16, background: '#f6f7fb' } }}
        extra={c && <Button size="small" loading={busy} onClick={() => ask(true)}>重新问一次</Button>}>
        <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#888', fontWeight: 700, letterSpacing: 1 }}>给通用模型的一句话</span>
          <span style={{ fontSize: 14, color: '#333' }}>{prompt}</span>
        </div>
        {busy && !rv && <div style={{ background: '#fff', borderRadius: 14, padding: 24, color: '#888', textAlign: 'center' }}>{c ? '在对照这家企业的真实资料研判…（约 40 秒）' : '通用模型在出题，出完对照企业资料研判…（约 1 分钟）'}</div>}
        {rv && (
          <>
            {rv.verdict && <div style={{ background: '#fffaf0', border: '1px solid #ffd8a8', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 14, color: '#7a4a00' }}><b>研判 · </b>{rv.verdict}{issues.length ? `（通用模型这边标出 ${issues.length} 处问题）` : ''}</div>}
            {/* 同一把尺子：五行左右对齐 */}
            <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ ...grid, background: '#fafbff' }}>
                <div />
                <div style={{ padding: '10px 14px', fontSize: 12, letterSpacing: 2, color: '#888', fontWeight: 700 }}>通用模型 · 一句话</div>
                <div style={{ padding: '10px 14px', fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700, background: '#f6f4ff' }}>平方出的真活</div>
              </div>
              {ROWS.map(([k, label]) => {
                const iss = issues.filter(i => i.row === k);
                return (
                  <div key={k} style={grid}>
                    <div style={{ ...cell, color: '#6055f5', fontWeight: 600, fontSize: 13 }}>{label}</div>
                    <div style={cell}>
                      {rv.generic[k] || '—'}
                      {iss.map((i, n) => <div key={n} style={{ marginTop: 6, fontSize: 12.5, color: RED }}><Tag color="volcano" style={{ marginRight: 6 }}>{i.type}</Tag>「{i.quote}」<span style={{ color: '#a8071a' }}> {i.why}</span></div>)}
                    </div>
                    <div style={{ ...cell, background: '#fcfbff' }}>
                      {rv.ours[k] || '—'}
                      {k === 'materials' && mats.map((m: any) => <Fold key={m.id} title={`${m.id} ${m.title}`}><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, background: '#fafbff', border: '1px solid #eef0f5', padding: 10, borderRadius: 8, margin: 0 }}>{m.content}</pre></Fold>)}
                      {k === 'rubric' && <Fold title={`看 ${rub.length} 条评分标准与依据`}>{rub.map((r: any) => <div key={r.id} style={{ marginBottom: 8, fontSize: 12.5 }}><b>{r.title}</b><span style={{ color: '#999' }}> · 权重 {r.weight}{r.depends_on?.length ? ` · 依赖 ${r.depends_on.join('、')}` : ''}</span>{r.basis && <div style={{ color: '#777' }}>依据：{r.basis}</div>}{r.levels?.L4 && <div style={{ color: '#777' }}>L4：{r.levels.L4}</div>}</div>)}</Fold>}
                      {k === 'scenario' && !!task.problem?.evidence?.length && <Fold title="依据（企业库原文）">{task.problem.evidence.map((e: any, i: number) => <div key={i} style={{ fontSize: 12.5, marginBottom: 4 }}>「{e.text}」<span style={{ color: '#999' }}> — {e.source}</span></div>)}</Fold>}
                    </div>
                  </div>
                );
              })}
              {task.baseline?.result?.total != null && (
                <div style={grid}>
                  <div style={{ ...cell, color: '#6055f5', fontWeight: 600, fontSize: 13 }}>AI 基线</div>
                  <div style={{ ...cell, color: '#999' }}>—</div>
                  <div style={{ ...cell, background: '#fcfbff' }}>AI 用同一套标准先做一遍：{task.baseline.result.total} 分，候选人超过它才算有自己的判断</div>
                </div>
              )}
            </div>
          </>
        )}
        {c && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, marginTop: 12 }}>
            <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '10px 16px' }}>
              <Fold title={`通用模型原文（${c.text.length} 字${issues.length ? '，标红处是问题，悬停看原因' : ''}）`} open><Plain text={c.text} issues={issues} /></Fold>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '10px 16px' }}>
              <Fold title={`平方出的完整题目（任务书 + ${mats.length} 份材料 + ${rub.length} 条评分标准）`} open>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{task.task?.title}</div>
                {task.problem?.statement && <p style={{ fontSize: 13, lineHeight: 1.75 }}><b>业务问题 · </b>{task.problem.statement}</p>}
                {task.problem?.why_now && <p style={{ fontSize: 13, lineHeight: 1.75 }}><b>为什么是现在 · </b>{task.problem.why_now}</p>}
                {task.task?.brief && <p style={{ fontSize: 13, lineHeight: 1.75 }}><b>任务书 · </b>{task.task.brief}</p>}
                {!!task.problem?.evidence?.length && <Sub t="依据（企业库原文）">{task.problem.evidence.map((e: any, i: number) => <div key={i}>「{e.text}」<span style={{ color: '#999' }}> — {e.source}</span></div>)}</Sub>}
                {!!task.task?.deliverables?.length && <Sub t="交付物">{task.task.deliverables.map((d: any) => <div key={d.id}>{d.id} {d.title}<span style={{ color: '#999' }}> · {d.format}</span></div>)}</Sub>}
                {!!task.task?.rules?.length && <Sub t="规则">{task.task.rules.map((r: string, i: number) => <div key={i}>· {r}</div>)}</Sub>}
                <Sub t={`材料包 ${mats.length} 份（考生拿到的原样）`}>{mats.map((m: any) => <div key={m.id} style={{ marginBottom: 10 }}><b>{m.id} {m.title}</b><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, background: '#fafbff', border: '1px solid #eef0f5', padding: 10, borderRadius: 8, margin: '4px 0 0' }}>{m.content}</pre></div>)}</Sub>
                <Sub t={`评分标准 ${rub.length} 条（每条 L1–L4 行为锚定）`}>{rub.map((r: any) => <div key={r.id} style={{ marginBottom: 10 }}><b>{r.id} {r.title}</b><span style={{ color: '#999' }}> · 权重 {r.weight}{r.depends_on?.length ? ` · 依赖 ${r.depends_on.join('、')}` : ''}</span>{r.desc && <div>{r.desc}</div>}{r.basis && <div style={{ color: '#777' }}>依据：{r.basis}</div>}{r.levels && ['L1', 'L2', 'L3', 'L4'].map(l => r.levels[l] && <div key={l} style={{ color: '#555' }}><b>{l}</b> {r.levels[l]}</div>)}</div>)}</Sub>
                {task.baseline?.result?.total != null && <Sub t="AI 基线">AI 用同一套标准先做一遍：{task.baseline.result.total} 分。{task.baseline.result.summary}</Sub>}
              </Fold>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
