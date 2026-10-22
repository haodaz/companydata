'use client';

/**
 * 对比演示（2026-10-22，老板：「有垂直和没垂直，出题效果完全不一样」）：
 * 左边：国内用户能直接用的通用大模型（千问），只给一句大白话让它出题；右边：平方拿企业库 / 深度画像 / 出题流程出的。并排摆，不替人下结论。
 */
import React, { useState } from 'react';
import { App, Button, Drawer, Tag } from 'antd';

type Compare = { prompt: string; text: string; model: string; at: string };

/** 大模型回答的轻量渲染：# 标题加粗、去掉 **、表格原样等宽 */
function Plain({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.75, color: '#333' }}>
      {text.split('\n').map((l, i) => {
        const h = l.match(/^#{1,6}\s+(.*)/);
        const clean = (x: string) => x.replace(/\*\*/g, '');
        if (h) return <div key={i} style={{ fontWeight: 700, fontSize: 14.5, margin: '12px 0 4px', color: '#1a1a2e' }}>{clean(h[1])}</div>;
        if (/^\s*\|/.test(l)) return <div key={i} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, whiteSpace: 'pre', overflowX: 'auto' }}>{l}</div>;
        if (/^\s*---+\s*$/.test(l)) return <hr key={i} style={{ border: 0, borderTop: '1px solid #eee', margin: '10px 0' }} />;
        return <div key={i} style={{ minHeight: l.trim() ? undefined : 8, whiteSpace: 'pre-wrap' }}>{clean(l)}</div>;
      })}
    </div>
  );
}

export function GenericCompare({ token, ownerKey, task }: { token: string; ownerKey: string; task: any }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [c, setC] = useState<Compare | null>(task.task?.compare || null);
  const ask = async (force = false) => {
    setOpen(true); if (c && !force) return;
    setBusy(true);
    try {
      const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(ownerKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ compare: true, force }) })).json();
      if (!j.ok) throw new Error(j.error); setC(j.compare);
    } catch (e: any) { message.error(e.message); } finally { setBusy(false); }
  };
  const src = task.sources || {};
  const inputs = [
    src.company && '企业画像',
    src.news ? `近期动态 ${src.news} 条` : '',
    src.executives ? `高管 ${src.executives} 位` : '',
    src.products?.length ? `产品 ${src.products.length} 个` : '',
    src.deep?.length ? `深度画像 ${src.deep.length} 个专题` : '',
    src.jobs?.length ? '在招岗位' : '', src.occupation ? '职业画像' : '', src.standards?.length ? '行业标准' : '',
  ].filter(Boolean) as string[];
  const mats = task.materials || [], rub = task.rubric || [];
  return (
    <>
      <Button onClick={() => ask()}>对比通用模型</Button>
      <Drawer open={open} onClose={() => setOpen(false)} width="min(1200px, 100vw)" title="同一个需求，两种出题方式" styles={{ body: { padding: 0, background: '#f6f7fb' } }}
        extra={c && <Button size="small" loading={busy} onClick={() => ask(true)}>重新问一次</Button>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14, padding: 16 }}>
          {/* 左：通用大模型，一句话 */}
          <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, letterSpacing: 2, color: '#888', fontWeight: 700 }}>通用模型</div>
            <div style={{ fontSize: 12.5, color: '#888', margin: '4px 0 10px' }}>输入：一句话</div>
            <div style={{ background: '#f2f3f7', borderRadius: 12, padding: '10px 12px', fontSize: 13.5, color: '#333', marginBottom: 12 }}>{c?.prompt || `我们公司是${task.company_name}，要招人：${task.role}。请你出一道题给应聘者做，并给出评分标准。`}</div>
            {busy && !c ? <div style={{ color: '#888', fontSize: 13, padding: '20px 0' }}>通用模型在出题…（约 30 秒）</div> : c ? <Plain text={c.text} /> : null}
          </div>
          {/* 右：平方出的 */}
          <div style={{ background: '#fff', border: '1px solid #d8d4ff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 6px 24px rgba(96,85,245,.08)' }}>
            <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>平方出的真活</div>
            <div style={{ fontSize: 12.5, color: '#888', margin: '4px 0 10px' }}>平方的数据 + 出题流程</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>{inputs.map(x => <Tag key={x} color="purple" style={{ margin: 0 }}>{x}</Tag>)}</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e', marginBottom: 6 }}>{task.task?.title}</div>
            {task.problem?.statement && <Row k="业务问题">{task.problem.statement}</Row>}
            {task.problem?.why_now && <Row k="为什么是现在">{task.problem.why_now}</Row>}
            {!!task.problem?.evidence?.length && <Row k="依据">{task.problem.evidence.slice(0, 3).map((e: any, i: number) => <div key={i}>「{e.text}」<span style={{ color: '#999' }}> — {e.source}</span></div>)}</Row>}
            {task.task?.brief && <Row k="任务书">{task.task.brief}</Row>}
            <Row k={`材料包 ${mats.length} 份`}>{mats.map((m: any) => <div key={m.id}>{m.id} {m.title}</div>)}</Row>
            <Row k={`评分标准 ${rub.length} 条`}>{rub.map((r: any) => <div key={r.id} style={{ marginBottom: 4 }}><b>{r.title}</b><span style={{ color: '#999' }}> · 权重 {r.weight}{r.depends_on?.length ? ` · 依赖 ${r.depends_on.join('、')}` : ''}</span>{r.basis && <div style={{ fontSize: 12, color: '#888' }}>依据：{r.basis}</div>}</div>)}<div style={{ fontSize: 12, color: '#888' }}>每条有 L1–L4 四级行为锚定</div></Row>
            {task.baseline?.result?.total != null && <Row k="AI 基线">AI 用同一套标准先做一遍：{task.baseline.result.total} 分</Row>}
          </div>
        </div>
      </Drawer>
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 10, padding: '8px 0', borderTop: '1px solid #f0f0f5', fontSize: 13, lineHeight: 1.7, color: '#333' }}><div style={{ color: '#6055f5', fontWeight: 600, fontSize: 12.5 }}>{k}</div><div>{children}</div></div>;
}
