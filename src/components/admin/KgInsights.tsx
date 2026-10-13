'use client';

/**
 * 职业问答日志上方的热力分析 + 数据任务排产建议。
 *   热力：职业 × 话题（颜色 = 提问 + 缺口×3），点格子筛到下面的日志
 *   话题缺口率、近 14 天趋势、在哪问的
 *   排产建议：一键排补全（后台跑），补不了的（在招岗位 / 标准）给采集工具入口，行业前景类建议转译入问答库
 */
import React from 'react';
import { Button, Card, Col, Empty, Row, Space, Tag, Tooltip, Typography } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { BRAND } from '@/lib/theme';

const { Text } = Typography;
const SURFACE: Record<string, string> = { lab: '体验百业', studio: '百业工厂', admin: '后台试聊' };

function Flywheel({ f }: { f: any }) {
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const steps = [
    { label: '用户提问', value: f.total, sub: `${f.occupations} 个职业`, color: BRAND.primary },
    { label: '平方库答得上', value: f.answered, sub: `覆盖率 ${pct(f.answered, f.total)}`, color: '#16a34a' },
    { label: '知识缺口', value: f.gaps, sub: '上网查 · 注明出处', color: '#ea580c' },
    { label: '人工质检', value: f.reviewed, sub: `合格 ${f.ok + f.ingested} · 不合格 ${f.bad}`, color: '#0ea5e9' },
    { label: '排产补全', value: f.task, sub: 'AI 补齐职业知识', color: '#2f54eb' },
    { label: '平方问答库', value: f.faqs, sub: `已转译 ${f.ingested} 问`, color: '#8b5cf6' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        {steps.map((x, i) => <React.Fragment key={x.label}>
          <div style={{ flex: 1, minWidth: 0, padding: '12px 10px', borderRadius: 10, background: `${x.color}0f`, border: `1px solid ${x.color}33`, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: BRAND.ink2 }}>{x.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: x.color, lineHeight: 1.3 }}>{x.value}</div>
            <div style={{ fontSize: 11, color: BRAND.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.sub}</div>
          </div>
          {i < steps.length - 1 && <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: BRAND.ink4, fontSize: 16 }}>→</div>}
        </React.Fragment>)}
      </div>
      {/* 闭环回流：入了问答库，下次同样的问题直接从平方库答 */}
      <div style={{ position: 'relative', height: 26, margin: '2px 8% 0' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 14, borderLeft: `2px dashed #8b5cf6`, borderRight: `2px dashed #8b5cf6`, borderBottom: `2px dashed #8b5cf6`, borderRadius: '0 0 10px 10px' }} />
        <div style={{ position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', background: '#fff', padding: '0 10px', fontSize: 11.5, color: '#8b5cf6', whiteSpace: 'nowrap' }}>↺ 入库后同类问题直接从平方库答（[F] 编号），覆盖率持续上升</div>
      </div>
    </div>
  );
}

function TopQuestions({ list }: { list: any[] }) {
  if (!list?.length) return <Text type="secondary">—</Text>;
  const max = Math.max(...list.map(q => q.n));
  return <div>{list.map((q, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < list.length - 1 ? `1px solid ${BRAND.borderSoft}` : 0 }}>
    <span style={{ width: 18, color: i < 3 ? '#ea580c' : BRAND.ink3, fontWeight: 700 }}>{i + 1}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.q}</div>
      <div style={{ height: 4, background: '#f0f1f7', borderRadius: 2, marginTop: 4 }}><div style={{ width: `${(q.n / max) * 100}%`, height: 4, borderRadius: 2, background: q.gaps ? '#ea580c' : BRAND.primary }} /></div>
    </div>
    <span style={{ fontSize: 12, color: BRAND.ink3, whiteSpace: 'nowrap' }}>{q.occ}</span>
    <span style={{ fontSize: 12, width: 54, textAlign: 'right' }}>{q.n} 次</span>
    {q.gaps ? <Tag color="orange" style={{ margin: 0 }}>缺口</Tag> : <Tag color="green" style={{ margin: 0 }}>答得上</Tag>}
  </div>)}</div>;
}

export function KgInsights({ d, onCell, onFill, busyKey }: { d: any; onCell: (occ: number, topic: string) => void; onFill: (s: any) => void; busyKey: string | null }) {
  if (!d) return null;
  if (!d.occupations?.length) return <Empty style={{ margin: '12px 0 20px' }} description="还没有足够的提问做分析" />;
  const cell = (occ: number, topic: string) => d.matrix.find((c: any) => c.occ === occ && c.topic === topic);
  const heat = (c: any) => (c ? c.n + c.gaps * 3 : 0);
  const max = Math.max(1, ...d.matrix.map(heat));
  const tmax = Math.max(1, ...d.trend.map((t: any) => t.n));
  const sTotal = Object.values(d.surfaces as Record<string, number>).reduce((a, b) => a + b, 0) || 1;
  return (
    <div style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col xs={24} xl={15}>
          <Card size="small" title="热力 · 职业 × 话题" extra={<Text type="secondary" style={{ fontSize: 12 }}>颜色越深 = 问得越多、缺口越多；点格子看对应问题</Text>} style={{ marginBottom: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: 12, width: '100%' }}>
                <thead><tr><th style={{ textAlign: 'left', fontWeight: 500, color: BRAND.ink3, minWidth: 110 }} />
                  {d.topics.map((t: any) => <th key={t.key} style={{ fontWeight: 500, color: BRAND.ink2, padding: '2px 4px', whiteSpace: 'nowrap' }}>{t.label}</th>)}</tr></thead>
                <tbody>{d.occupations.map((o: any) => <tr key={o.id}>
                  <td style={{ whiteSpace: 'nowrap', paddingRight: 6, color: BRAND.ink }}>{o.name}<span style={{ color: BRAND.ink3 }}> · {o.n}</span></td>
                  {d.topics.map((t: any) => { const c = cell(o.id, t.key); const v = heat(c) / max;
                    return <td key={t.key} onClick={() => c && onCell(o.id, t.key)} style={{ height: 30, minWidth: 54, textAlign: 'center', borderRadius: 5, cursor: c ? 'pointer' : 'default',
                      background: c ? (c.gaps ? `rgba(234,88,12,${0.15 + v * 0.75})` : `rgba(96,85,245,${0.1 + v * 0.7})`) : '#f6f7fb', color: v > 0.5 ? '#fff' : BRAND.ink }}>
                      {c ? <Tooltip title={`${o.name} · ${t.label}：被问 ${c.n} 次${c.gaps ? `，${c.gaps} 次平方答不上` : ''}${c.bad ? `，${c.bad} 次不合格` : ''}`}><span>{c.n}{c.gaps ? <sup> ⚠{c.gaps}</sup> : null}</span></Tooltip> : ''}
                    </td>; })}
                </tr>)}</tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: BRAND.ink3, marginTop: 6 }}><span style={{ color: '#ea580c' }}>■</span> 有知识缺口　<span style={{ color: BRAND.primary }}>■</span> 平方库答得上</div>
          </Card>
          <Card size="small" title="数据飞轮 · 闭环" extra={<Text type="secondary" style={{ fontSize: 12 }}>用户关心什么 → 补什么、核什么 → 入库</Text>} style={{ marginBottom: 16 }}>
            {d.flywheel && <Flywheel f={d.flywheel} />}
          </Card>

        </Col>
        <Col xs={24} xl={9}>
          <Card size="small" title="话题 · 缺口率" style={{ marginBottom: 16 }}>
            {d.topics.sort((a: any, b: any) => b.n - a.n).map((t: any) => <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
              <span style={{ width: 92 }}>{t.label}</span>
              <div style={{ flex: 1, height: 10, background: '#f0f1f7', borderRadius: 4, position: 'relative' }}>
                <div style={{ width: `${(t.n / d.topics[0].n) * 100}%`, height: 10, background: BRAND.primarySoft, borderRadius: 4, position: 'absolute' }} />
                <div style={{ width: `${(t.gaps / d.topics[0].n) * 100}%`, height: 10, background: '#ea580c', borderRadius: 4, position: 'absolute' }} />
              </div>
              <span style={{ width: 86, textAlign: 'right', color: BRAND.ink2 }}>{t.n} 问 · {Math.round((t.gaps / t.n) * 100)}% 缺</span>
            </div>)}
          </Card>
          <Card size="small" title="近 14 天" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64 }}>
              {d.trend.map((t: any) => <Tooltip key={t.day} title={`${t.day}：${t.n} 问${t.gaps ? `，${t.gaps} 缺口` : ''}`}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{ height: `${(t.gaps / tmax) * 100}%`, background: '#ea580c', borderRadius: '2px 2px 0 0' }} />
                  <div style={{ height: `${((t.n - t.gaps) / tmax) * 100}%`, minHeight: t.n ? 2 : 0, background: BRAND.primary, opacity: .55 }} />
                </div>
              </Tooltip>)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: BRAND.ink3, marginTop: 4 }}><span>{d.trend[0]?.day.slice(5)}</span><span>今天</span></div>
            <div style={{ marginTop: 8 }}>{Object.entries(d.surfaces).map(([k, n]: any) => <Tag key={k}>{SURFACE[k] || k} {Math.round((n / sTotal) * 100)}%</Tag>)}</div>
          </Card>
          <Card size="small" title="热门问题" style={{ marginBottom: 16 }}>
            <TopQuestions list={d.topQuestions} />
          </Card>
        </Col>
      </Row>
      <Card size="small" title={<span><ThunderboltOutlined style={{ color: '#d97706' }} /> 数据任务排产建议</span>} extra={<Text type="secondary" style={{ fontSize: 12 }}>按「提问 + 缺口×3 + 不合格×2 + 这块还空着×2」排序</Text>}>
        {!d.suggestions.length && <Text type="secondary">暂时没有需要排产的</Text>}
        {d.suggestions.map((s: any, i: number) => {
          const key = `${s.occupation_id}|${s.part}`;
          return <div key={`${s.occupation_id}-${s.topic}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < d.suggestions.length - 1 ? `1px solid ${BRAND.borderSoft}` : 0 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: i < 3 ? '#fff7ed' : '#f6f7fb', color: i < 3 ? '#ea580c' : BRAND.ink3, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div><b>{s.occupation}</b> · {s.topicLabel}<Tag style={{ marginLeft: 8 }}>热度 {s.score}</Tag></div>
              <div style={{ fontSize: 12, color: BRAND.ink3 }}>{s.reasons.join('，')}</div>
            </div>
            <Space>
              <a style={{ fontSize: 12 }} onClick={() => onCell(s.occupation_id, s.topic)}>看问题</a>
              {s.action === 'fill' && <Button size="small" type="primary" loading={busyKey === key} onClick={() => onFill(s)}>补「{s.partLabel}」</Button>}
              {s.tool && <Button size="small" href={s.tool.path}>去{s.tool.label}</Button>}
              {s.action === 'faq' && <Tag color="purple">建议：质检后转译入问答库</Tag>}
            </Space>
          </div>;
        })}
      </Card>
    </div>
  );
}
