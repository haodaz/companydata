'use client';

/**
 * 职业发展图谱：技能树（三层 + 前置箭头，悬停高亮上下游）→ 成长阶梯 → 更资深 / 可转型的岗位（能对回职业库的可点）。
 * 数据见 occupation-fields.ts 的 CareerGraph。不依赖 /lab 的样式（/lab 会拆走）。
 */
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Card, Empty, Tag, Tooltip, Typography } from 'antd';
import { ArrowRightOutlined, RiseOutlined, SwapOutlined } from '@ant-design/icons';
import { BRAND } from '@/lib/theme';
import { SKILL_KIND_LABELS, SKILL_LEVEL_LABELS, type CareerGraph, type CareerSkill } from '@/lib/occupation-fields';

const { Text } = Typography;

export type SkillUses = Record<string, { tools: string[]; tasks: string[] }>;

function SkillTree({ skills, uses }: { skills: CareerSkill[]; uses: SkillUses }) {
  const wrap = useRef<HTMLDivElement>(null);
  const nodes = useRef<Record<string, HTMLDivElement | null>>({});
  const [lines, setLines] = useState<{ from: string; to: string; d: string }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const byLevel = [1, 2, 3].map(l => skills.filter(s => s.level === l));

  // 上游（前置）和下游（依赖它的）：悬停时一起高亮
  const related = useMemo(() => {
    if (!hover) return null;
    const up = new Set<string>(), down = new Set<string>();
    const walkUp = (id: string) => { for (const p of skills.find(s => s.id === id)?.prereq || []) if (!up.has(p)) { up.add(p); walkUp(p); } };
    const walkDown = (id: string) => { for (const s of skills) if ((s.prereq || []).includes(id) && !down.has(s.id)) { down.add(s.id); walkDown(s.id); } };
    walkUp(hover); walkDown(hover);
    return new Set([hover, ...Array.from(up), ...Array.from(down)]);
  }, [hover, skills]);

  useLayoutEffect(() => {
    const draw = () => {
      const box = wrap.current?.getBoundingClientRect();
      if (!box) return;
      setSize({ w: box.width, h: box.height });
      const out: { from: string; to: string; d: string }[] = [];
      for (const s of skills) for (const p of s.prereq || []) {
        const a = nodes.current[p]?.getBoundingClientRect(), b = nodes.current[s.id]?.getBoundingClientRect();
        if (!a || !b) continue;
        if (Math.abs(a.left - b.left) < 4) {
          // 同一层里互为前置：从上一个的底边竖着连到下一个的顶边（或反过来）
          const x = a.left + a.width * 0.85 - box.left;
          const [y1, y2] = a.top < b.top ? [a.bottom - box.top, b.top - box.top - 4] : [a.top - box.top, b.bottom - box.top + 4];
          out.push({ from: p, to: s.id, d: `M${x},${y1} L${x},${y2}` });
          continue;
        }
        const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top, x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
        const mx = (x1 + x2) / 2;
        out.push({ from: p, to: s.id, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 4},${y2}` });
      }
      setLines(out);
    };
    draw();
    const ro = new ResizeObserver(draw);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [skills]);

  return (
    <div ref={wrap} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: size.w && size.w < 760 ? 28 : 56 }}>
      <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
        <defs><marker id="occ-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={BRAND.primary} /></marker></defs>
        {lines.map((l, i) => {
          const on = !related || (related.has(l.from) && related.has(l.to));
          return <path key={i} d={l.d} fill="none" stroke={BRAND.primary} strokeWidth={on && related ? 2 : 1.2} opacity={on ? (related ? 0.9 : 0.35) : 0.08} markerEnd="url(#occ-arrow)" />;
        })}
      </svg>
      {byLevel.map((list, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.ink3, letterSpacing: 1 }}>{['①', '②', '③'][i]} {SKILL_LEVEL_LABELS[i + 1]}</div>
          {list.map(s => {
            const dim = related && !related.has(s.id);
            return (
              <Tooltip key={s.id} title={<div>{s.why && <div>为什么：{s.why}</div>}{s.how_to_build && <div style={{ marginTop: 4 }}>怎么练：{s.how_to_build}</div>}
                {!!uses[s.id]?.tools.length && <div style={{ marginTop: 4 }}>用到：{uses[s.id].tools.join('、')}</div>}
                {!!uses[s.id]?.tasks.length && <div style={{ marginTop: 4 }}>在这些任务里练：{uses[s.id].tasks.join('、')}</div>}</div>}>
                <div ref={el => { nodes.current[s.id] = el; }} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}
                  style={{ position: 'relative', zIndex: 1, background: '#fff', border: `1px solid ${hover === s.id ? BRAND.primary : '#e5e7eb'}`, borderRadius: 8, padding: '8px 10px', opacity: dim ? 0.35 : 1, transition: 'opacity .15s, border-color .15s', cursor: 'default', boxShadow: hover === s.id ? '0 2px 10px rgba(0,0,0,.08)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                    <Tag color={SKILL_KIND_LABELS[s.kind]?.color} style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>{SKILL_KIND_LABELS[s.kind]?.label}</Tag>
                  </div>
                  {s.how_to_build && <div style={{ fontSize: 11, color: BRAND.ink3, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.how_to_build}</div>}
                  {(!!uses[s.id]?.tools.length || !!uses[s.id]?.tasks.length) && <div style={{ fontSize: 11, marginTop: 3, display: 'flex', gap: 8 }}>
                    {!!uses[s.id]?.tools.length && <span style={{ color: '#0e7490' }}>🔧 {uses[s.id].tools.length} 件工具设备</span>}
                    {!!uses[s.id]?.tasks.length && <span style={{ color: '#7c3aed' }}>📋 {uses[s.id].tasks.length} 个典型任务</span>}
                  </div>}
                </div>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function OccupationCareerGraph({ graph, roleLinks, onOpenRole, onQueryRole, uses = {}, readonly = false }: {
  graph: CareerGraph | null | undefined;
  uses?: SkillUses;
  readonly?: boolean;                      // 百业对话页里用：不出现「查询并建档」这类后台操作
  roleLinks: Record<string, number>;
  onOpenRole: (id: number) => void;
  onQueryRole: (name: string) => void;
}) {
  if (!graph?.skills?.length) return <Empty description="还没有发展图谱，点右上角「生成发展图谱」" />;
  const skillName = (id: string) => graph.skills.find(s => s.id === id)?.name || id;
  const promos = graph.next_roles.filter(r => r.type === 'promotion');
  const trans = graph.next_roles.filter(r => r.type === 'transition');
  const roleCard = (r: CareerGraph['next_roles'][number]) => {
    const linked = roleLinks[r.name];
    return (
      <div key={r.name} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          {linked && !readonly ? <a style={{ fontWeight: 600 }} onClick={() => onOpenRole(linked)}>{r.name}</a> : <span style={{ fontWeight: 600 }}>{r.name}</span>}
          {readonly ? null : linked ? <Tag color="green" style={{ margin: 0 }}>职业库已有</Tag> : <a style={{ fontSize: 12 }} onClick={() => onQueryRole(r.name)}>查询并建档</a>}
        </div>
        {r.years && <div style={{ fontSize: 12, color: BRAND.ink3, marginTop: 2 }}>通常 {r.years}</div>}
        <div style={{ fontSize: 13, marginTop: 4 }}>{r.how}</div>
        {!!r.key_skills?.length && <div style={{ marginTop: 6 }}>{r.key_skills.map(k => <Tag key={k} style={{ fontSize: 11, marginBottom: 2 }}>{skillName(k)}</Tag>)}</div>}
      </div>
    );
  };

  return (
    <div>
      {graph.summary && <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16, padding: '10px 14px', background: '#f5f3ff', borderRadius: 8, color: BRAND.ink }}>{graph.summary}</div>}

      <Card size="small" title="技能树" extra={<Text type="secondary" style={{ fontSize: 12 }}>箭头 = 前置关系；悬停看一条技能的上下游、用到的工具设备、在哪些典型任务里练</Text>} style={{ marginBottom: 16 }}>
        <SkillTree skills={graph.skills} uses={uses} />
      </Card>

      <Card size="small" title="成长阶梯" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
          {graph.ladder.map((l, i) => (
            <React.Fragment key={i}>
              <div style={{ minWidth: 190, flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: `rgba(99,102,241,${0.03 + i * 0.03})` }}>
                <div style={{ fontSize: 11, color: BRAND.ink3 }}>{l.stage} · {l.years}</div>
                <div style={{ fontWeight: 700, fontSize: 14, margin: '2px 0 4px' }}>{l.title}</div>
                {l.salary && <div style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>¥ {l.salary} / 月</div>}
                <div style={{ fontSize: 12, marginTop: 6, color: BRAND.ink2 }}>{l.focus}</div>
                {!!l.key_skills?.length && <div style={{ marginTop: 6 }}>{l.key_skills.map(k => <Tag key={k} style={{ fontSize: 10, marginBottom: 2, maxWidth: '100%', whiteSpace: 'normal', lineHeight: '15px' }}>{skillName(k)}</Tag>)}</div>}
              </div>
              {i < graph.ladder.length - 1 && <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: BRAND.ink4 }}><ArrowRightOutlined /></div>}
            </React.Fragment>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card size="small" title={<span><RiseOutlined /> 更资深的岗位（晋升）</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{promos.length ? promos.map(roleCard) : <Text type="secondary">—</Text>}</div>
        </Card>
        <Card size="small" title={<span><SwapOutlined /> 可转型的岗位</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{trans.length ? trans.map(roleCard) : <Text type="secondary">—</Text>}</div>
        </Card>
      </div>

      {!!graph.entry_paths?.length && <Card size="small" title="入行路径" style={{ marginBottom: 16 }}>
        {graph.entry_paths.map((e, i) => <div key={i} style={{ marginBottom: 6 }}><Text strong>{e.path}</Text><Text type="secondary"> — {e.detail}</Text></div>)}
      </Card>}
      {!!graph.sources?.length && <Text type="secondary" style={{ fontSize: 12 }}>参考：{graph.sources.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>[{i + 1}]</a>)}</Text>}
    </div>
  );
}
