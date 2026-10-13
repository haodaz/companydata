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
