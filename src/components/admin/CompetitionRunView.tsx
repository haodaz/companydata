'use client';

import React, { useState } from 'react';
import { Button, Card, Space, Spin, Table, Tag, Timeline, Tooltip, Typography } from 'antd';
import { ArrowLeftOutlined, CodeOutlined, EyeOutlined, FileTextOutlined, LinkOutlined, PauseCircleOutlined, RocketOutlined, StopOutlined, SyncOutlined, TrophyOutlined } from '@ant-design/icons';
import { BRAND } from '@/lib/theme';
import { COMPETITION_FIELDS, COMPETITION_KIND_LABELS, COMPETITION_LEVEL_LABELS, COMPETITION_STATUS_LABELS, REWARD_LABELS, SEARCH_REGION_OPTIONS, formatCompetitionValue, hasCompetitionValue } from '@/lib/competition-fields';
import type { PipelineEvent, RadarRow } from '@/lib/competition-radar-client';

const { Text } = Typography;

export const RewardTags = ({ types }: { types?: string[] }) => <Space size={2} wrap>{(types || []).map(t => REWARD_LABELS[t] ? <Tag key={t} color={REWARD_LABELS[t].color} style={{ margin: 0 }}>{REWARD_LABELS[t].emoji} {REWARD_LABELS[t].label}</Tag> : null)}</Space>;

interface Props {
  item: any;                 // competition_searches 行
  events: PipelineEvent[];
  rows: RadarRow[];
  summary: string;
  running?: boolean;
  paused?: boolean;
  onBack: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

/** 单条检索的三栏视图：左 配置 + 流水日志；中 候选赛事表（可展开全字段、看官方页原文）；右 AI 摘要 + JSON */
export function CompetitionRunView({ item, events, rows, summary, running, paused, onBack, onPause, onResume, onStop }: Props) {
  const [showRaw, setShowRaw] = useState<string | null>(null);
  const rawRow = rows.find(r => r.key === showRaw);
  const doneRows = rows.filter(r => r.fields);

  const columns = [
    { title: '赛事', render: (_: any, r: RadarRow) => {
      const f = r.fields || r.candidate;
      return <div>
        <div style={{ fontWeight: 600 }}>{f.name}{f.official_url && <a href={f.official_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, fontSize: 12 }}><LinkOutlined /></a>}</div>
        <div style={{ fontSize: 12, color: BRAND.ink3 }}>{[f.organizer, f.level && COMPETITION_LEVEL_LABELS[f.level]?.label, f.format && formatCompetitionValue('format', f.format)].filter(Boolean).join(' · ')}</div>
        {f.brief && !r.fields && <div style={{ fontSize: 12, color: BRAND.ink4, marginTop: 2 }}>{f.brief}</div>}
      </div>;
    } },
    { title: '类型', width: 110, render: (_: any, r: RadarRow) => { const k = (r.fields || r.candidate).kind; return k ? <Tag color={COMPETITION_KIND_LABELS[k]?.color}>{COMPETITION_KIND_LABELS[k]?.label || k}</Tag> : '-'; } },
    { title: '奖励', width: 170, render: (_: any, r: RadarRow) => <RewardTags types={(r.fields || r.candidate).reward_types} /> },
    { title: '报名截止', width: 105, render: (_: any, r: RadarRow) => <span style={{ fontSize: 12 }}>{(r.fields || r.candidate).registration_deadline_str || '-'}</span> },
    { title: '状态', width: 88, render: (_: any, r: RadarRow) => { const s = (r.fields || r.candidate).status; return s && COMPETITION_STATUS_LABELS[s] ? <Tag color={COMPETITION_STATUS_LABELS[s].color}>{COMPETITION_STATUS_LABELS[s].label}</Tag> : '-'; } },
    { title: '详情', width: 80, align: 'center' as const, render: (_: any, r: RadarRow) => r.state === 'running' ? <SyncOutlined spin style={{ color: BRAND.primary }} /> : r.state === 'done' ? <Tooltip title={r.mode === 'page' ? '官方页提取' : '联网补全'}><Tag color={r.mode === 'page' ? 'success' : 'processing'} style={{ margin: 0 }}>{r.fields ? Object.values(r.fields).filter(hasCompetitionValue).length : 0} 字段</Tag></Tooltip> : r.state === 'failed' ? <Tooltip title={r.error}><Tag color="error" style={{ margin: 0 }}>失败</Tag></Tooltip> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text> },
    { title: '', width: 40, render: (_: any, r: RadarRow) => r.page?.ok ? <Tooltip title="官方页 Raw Markdown"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setShowRaw(showRaw === r.key ? null : r.key)} /></Tooltip> : null },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} type="text">返回任务详情</Button>
        {running && (
          <Space>
            {!paused ? <Button size="small" icon={<PauseCircleOutlined />} onClick={onPause}>暂停</Button> : <Button size="small" type="primary" icon={<RocketOutlined />} onClick={onResume}>继续</Button>}
            <Button size="small" danger icon={<StopOutlined />} onClick={onStop}>停止</Button>
          </Space>
        )}
      </div>
      <div className="cd-split" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ flex: '0 0 380px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <Card title="检索配置" variant="borderless" size="small" style={{ borderRadius: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{[item?.company, item?.query].filter(Boolean).join(' · ') || '—'}</div>
            <div style={{ marginTop: 8 }}><RewardTags types={item?.rewards} /></div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: BRAND.ink3 }}>
              <span>类型：{(item?.kinds || []).length ? item.kinds.map((k: string) => COMPETITION_KIND_LABELS[k]?.label || k).join(' / ') : '全部'}</span>
              <span>地域：{SEARCH_REGION_OPTIONS.find(o => o.value === item?.region)?.label || '全球 + 国内'}</span>
              <span>{item?.only_open === false ? '含已结束' : '只要可报名'}</span>
              <span>候选 ≤ {item?.count || 12}</span>
              <span>{item?.enrich === false ? '不抓官方页' : '抓官方页补全'}</span>
              {item?.model_id && <span>模型：{item.model_id}</span>}
              {item?.llm_calls ? <span>{item.llm_calls} 次调用 · ${Number(item.cost_usd || 0).toFixed(4)}</span> : null}
            </div>
          </Card>
          <Card title="流水日志" variant="borderless" size="small" style={{ borderRadius: 12, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {events.length ? <Timeline items={events.map(ev => ({ color: ev.color, icon: ev.status === 'loading' ? <SyncOutlined spin /> : undefined, content: <div style={{ fontWeight: 500, fontSize: 13, wordBreak: 'break-all' }}>{ev.title}</div> }))} />
              : <div style={{ color: '#999', fontSize: 13, textAlign: 'center', marginTop: 20 }}>暂无日志记录。</div>}
          </Card>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Card title={`候选赛事${rows.length ? `（${rows.length}）` : ''}`} variant="borderless"
            style={{ borderRadius: 12, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 } }}>
            {rows.length ? (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <Table size="small" rowKey="key" dataSource={rows} columns={columns} pagination={false}
                  expandable={{ rowExpandable: () => true, expandedRowRender: (r: RadarRow) => r.fields ? (
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}><tbody>
                      {COMPETITION_FIELDS.filter(f => !['name', 'tags', 'note'].includes(f.key) && hasCompetitionValue(r.fields![f.key])).map((f, i) => (
                        <tr key={f.key} style={{ background: i % 2 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '4px 10px', fontWeight: 600, color: '#555', width: 120, verticalAlign: 'top' }}>{f.label}</td>
                          <td style={{ padding: '4px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.kind === 'url' ? <a href={r.fields![f.key]} target="_blank" rel="noreferrer">{r.fields![f.key]}</a> : formatCompetitionValue(f.key, r.fields![f.key])}{r.sources?.[f.key] && <a href={r.sources[f.key]} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: BRAND.ink4 }}><LinkOutlined /></a>}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  ) : <Text type="secondary">尚未提取详情（候选摘要：{r.candidate.brief || '—'}）</Text> }} />
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 13 }}>
                {running ? <Spin size="large" /> : <Space orientation="vertical" align="center"><TrophyOutlined style={{ fontSize: 48, opacity: 0.15 }} /><span>暂无候选</span></Space>}
              </div>
            )}
            {rawRow?.page?.ok && (
              <div style={{ borderTop: '1px solid #f0f0f0', padding: 16, maxHeight: 300, overflowY: 'auto' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}><FileTextOutlined /> Raw Markdown · {rawRow.page.url}（{(rawRow.page.len / 1000).toFixed(0)}k 字符）</div>
                <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: '#555', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f9f9f9', padding: 12, borderRadius: 6 }}>{String(rawRow.page.markdown || '').slice(0, 40000)}</pre>
              </div>
            )}
          </Card>
        </div>

        <div style={{ flex: '0 0 340px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Card title="AI 摘要 + JSON" variant="borderless" style={{ borderRadius: 12, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 } }}>
            {!summary && !doneRows.length ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>{running ? <Spin /> : <Space orientation="vertical" align="center"><CodeOutlined style={{ fontSize: 40, opacity: 0.15 }} /><span>等待检索输出...</span></Space>}</div>
            ) : (
              <>
                <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', background: '#fafafa', fontSize: 13, color: '#555', lineHeight: 1.7, maxHeight: '45%', overflowY: 'auto' }}>
                  {summary && <p style={{ margin: '0 0 10px' }}><b>【检索】</b>{summary}</p>}
                  {doneRows.filter(r => r.summary).map(r => <p key={r.key} style={{ margin: '0 0 10px' }}><b>【{r.fields?.name}】</b>{r.summary}</p>)}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', background: '#1e1e1e', padding: 16 }}>
                  <pre style={{ margin: 0, color: '#d4d4d4', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{JSON.stringify(rows.map(r => r.fields || r.candidate), null, 2)}</pre>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
