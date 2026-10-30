'use client';

/**
 * 真活后台 · 法规清单（2026-10-30）：每道真活生成「AI 使用标准」时，治理红线只能从这里挑（src/lib/work/ai-policy.ts 的 GOVERNANCE）。
 * 只收逐条核实过的法规 / 行业规范，只写名称和大意、不写条款号；按行业 / 岗位关键词匹配到具体真活。
 */
import React, { useEffect, useState } from 'react';
import { Empty, Input, Segmented, Tag, Tooltip, Typography } from 'antd';

const { Text } = Typography;
type Item = { id: string; name: string; point: string; url: string | null; scope: string; all: boolean; cited: number; tasks: { id: string; company: string; role: string }[] };

export function GovernancePanel() {
  const [d, setD] = useState<{ items: Item[]; policies: number } | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'general' | 'industry'>('all');
  useEffect(() => { fetch('/api/admin/work/governance', { cache: 'no-store' }).then(r => r.json()).then(j => (j.ok ? setD(j) : setErr(j.error))).catch(e => setErr(String(e?.message || e))); }, []);
  if (err) return <div style={{ padding: 16, color: '#b42318' }}>{err}</div>;
  if (!d) return <div style={{ padding: 16, color: '#999' }}>读取中…</div>;
  const items = d.items.filter(x => (kind === 'all' || (kind === 'general' ? x.all : !x.all)) && (!q.trim() || `${x.name}${x.point}${x.scope}`.includes(q.trim())));
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 13, color: '#666', lineHeight: 1.75 }}>
        每道真活生成「AI 使用标准」时，治理红线只能从这份清单里挑（挑清单以外的会被丢掉，不让模型编法规）。
        只收逐条核实过的法规和行业规范，只写名称和大意，不写条款号；通用的人人适用，行业的按企业行业和岗位关键词匹配。
        目前共 <b>{d.items.length}</b> 条，已有 <b>{d.policies}</b> 道真活生成了 AI 使用标准。
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Segmented value={kind} onChange={v => setKind(v as any)} options={[{ label: `全部 ${d.items.length}`, value: 'all' }, { label: `通用 ${d.items.filter(x => x.all).length}`, value: 'general' }, { label: `行业 / 岗位 ${d.items.filter(x => !x.all).length}`, value: 'industry' }]} />
        <Input.Search allowClear placeholder="搜名称、要点、适用岗位（如 医疗、审计）" value={q} onChange={e => setQ(e.target.value)} style={{ width: 340 }} />
      </div>
      {!items.length ? <Empty description="没有匹配的" /> : <div style={{ display: 'grid', gap: 10 }}>
        {items.map(x => (
          <div key={x.id} style={{ padding: '14px 16px', border: '1px solid #e8e9f0', borderRadius: 12, background: '#fff', display: 'grid', gridTemplateColumns: '1fr 150px', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 15 }}>{x.name}</b>
                {x.all ? <Tag color="purple">通用</Tag> : <Tag color="blue">行业 / 岗位</Tag>}
                {x.url && <a href={x.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>核实来源 ↗</a>}
              </div>
              <div style={{ fontSize: 13.5, color: '#333', marginTop: 4, lineHeight: 1.7 }}>{x.point}</div>
              <div style={{ fontSize: 12.5, color: '#888', marginTop: 4 }}>适用：{x.scope}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: x.cited ? '#6055f5' : '#ccc', lineHeight: 1.1 }}>{x.cited}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>道真活引用</Text>
              {!!x.tasks.length && <Tooltip title={x.tasks.map(t => `${t.company} · ${t.role}`).join('\n')} overlayInnerStyle={{ whiteSpace: 'pre-line' }}><div style={{ fontSize: 12, color: '#6055f5', cursor: 'help', marginTop: 2 }}>看是哪几道</div></Tooltip>}
            </div>
          </div>
        ))}
      </div>}
      <Text type="secondary" style={{ fontSize: 12 }}>要新增一条：先核实名称、发布机关和年份，再加进 src/lib/work/ai-policy.ts 的 GOVERNANCE（带适用关键词和核实来源）。</Text>
    </div>
  );
}
