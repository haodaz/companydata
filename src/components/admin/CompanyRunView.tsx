'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Empty, Space, Spin, Table, Tabs, Tag, Timeline, Tooltip, Typography } from 'antd';
import { ArrowLeftOutlined, CodeOutlined, FileTextOutlined, LinkOutlined, PauseCircleOutlined, RocketOutlined, SearchOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons';
import { BRAND } from '@/lib/theme';
import { COMPANY_EDIT_FIELDS, FINANCE_ROUND_LABELS, EDUCATION_LABELS, GENDER_LABELS, NEWS_KIND_LABELS, SEGMENT_LABELS, COMPANY_TYPE_LABELS, KIND_LABELS, CONTINENT_LABELS, TYPE_LABEL_LABELS, PRODUCT_KIND_LABELS, PRODUCT_STATUS_LABELS, PIPELINE_FIELDS, hasValue } from '@/lib/company-fields';
import type { PipelineEvent, RunData } from '@/lib/company-pipeline-client';

const { Text } = Typography;
const FIELD_LABEL: Record<string, string> = Object.fromEntries(COMPANY_EDIT_FIELDS.map(f => [f.key, f.label]));

export function formatProfileValue(key: string, v: any): string {
  if (!hasValue(v)) return '';
  if (key === 'segment') return SEGMENT_LABELS[v]?.label || v;
  if (key === 'company_type') return COMPANY_TYPE_LABELS[v] || v;
  if (key === 'kind') return KIND_LABELS[v] || v;
  if (key === 'continent') return CONTINENT_LABELS[v] || v;
  if (key === 'type_label') return (v as string[]).map(x => TYPE_LABEL_LABELS[x] || x).join('、');
  if (Array.isArray(v)) return v.join('、');
  return String(v);
}

/** 三个子实体的表格列（单家视图与企业详情页共用） */
export const FINANCING_COLUMNS = [
  { title: '轮次', width: 130, render: (_: any, r: any) => r.finance_round ? <Tag color="gold">{FINANCE_ROUND_LABELS[r.finance_round]}</Tag> : <Text type="secondary">{r.finance_round_str || '-'}</Text> },
  { title: '金额', dataIndex: 'finance_amount', width: 150, render: (t: string) => t || '-' },
  { title: '投资方', dataIndex: 'finance_enterprise', ellipsis: true, render: (t: string) => t || '-' },
  { title: '日期', width: 110, render: (_: any, r: any) => r.publish_date || r.publish_date_str || '-' },
  { title: '', width: 40, render: (_: any, r: any) => r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer"><LinkOutlined /></a> : null },
];
export const NEWS_COLUMNS = [
  { title: '日期', width: 105, render: (_: any, r: any) => <span style={{ fontSize: 12 }}>{r.publish_date || r.publish_date_str || '-'}</span> },
  { title: '分类', width: 100, render: (_: any, r: any) => r.kind ? <Tag color={NEWS_KIND_LABELS[r.kind]?.color}>{NEWS_KIND_LABELS[r.kind]?.label || r.kind}</Tag> : null },
  { title: '概要', dataIndex: 'description', render: (t: string, r: any) => <span style={{ fontSize: 13 }}>{t}{r.publish_source && <Text type="secondary" style={{ fontSize: 11 }}>（{r.publish_source}）</Text>}</span> },
  { title: '', width: 40, render: (_: any, r: any) => r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer"><LinkOutlined /></a> : null },
];
export const EXECUTIVE_COLUMNS = [
  { title: '姓名', dataIndex: 'name', width: 120, render: (t: string, r: any) => <span><Text strong>{t}</Text>{r.is_founder && <Tag color="purple" style={{ marginLeft: 6 }}>创始人</Tag>}</span> },
  { title: '职务', dataIndex: 'title', width: 160, render: (t: string) => t || '-' },
  { title: '简介', dataIndex: 'description', ellipsis: true, render: (t: string) => <Tooltip title={t}><span style={{ fontSize: 12 }}>{t || '-'}</span></Tooltip> },
  { title: '学历', width: 90, render: (_: any, r: any) => r.education ? EDUCATION_LABELS[r.education] : '-' },
  { title: '性别 / 年龄', width: 90, render: (_: any, r: any) => [r.gender && GENDER_LABELS[r.gender], r.age].filter(Boolean).join(' / ') || '-' },
  { title: '持股', width: 110, render: (_: any, r: any) => [r.share_holding != null ? `${r.share_holding} 万股` : null, r.share_ratio != null ? `${r.share_ratio}%` : null].filter(Boolean).join(' · ') || '-' },
  { title: '任职起始', width: 100, render: (_: any, r: any) => r.start_date || r.start_date_str || '-' },
  { title: '', width: 40, render: (_: any, r: any) => r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer"><LinkOutlined /></a> : null },
];

export const PRODUCT_COLUMNS = [
  { title: '产品', dataIndex: 'name', width: 200, render: (t: string, r: any) => <span>{r.is_flagship && <Tooltip title="拳头产品">⭐ </Tooltip>}<Text strong>{t}</Text></span>, sorter: (a: any, b: any) => String(a.name).localeCompare(String(b.name)) },
  { title: '品类', dataIndex: 'category', width: 130, render: (t: string) => t || '-', sorter: (a: any, b: any) => String(a.category || '').localeCompare(String(b.category || '')) },
  { title: '类型', dataIndex: 'kind', width: 100, render: (k: string) => k ? <Tag color={PRODUCT_KIND_LABELS[k]?.color}>{PRODUCT_KIND_LABELS[k]?.label || k}</Tag> : '-', sorter: (a: any, b: any) => String(a.kind || '').localeCompare(String(b.kind || '')) },
  { title: '状态', dataIndex: 'status', width: 90, render: (s: string) => <Tag color={PRODUCT_STATUS_LABELS[s]?.color}>{PRODUCT_STATUS_LABELS[s]?.label || s || '未知'}</Tag>, sorter: (a: any, b: any) => String(a.status || '').localeCompare(String(b.status || '')) },
  { title: '技术关键词', dataIndex: 'tech_keywords', width: 220, render: (t: string[]) => <Space size={2} wrap>{(t || []).map(k => <Tag key={k} style={{ margin: 0 }}>{k}</Tag>)}</Space> },
  { title: '说明', dataIndex: 'description', ellipsis: true, render: (t: string) => <Tooltip title={t}><span style={{ fontSize: 12 }}>{t || '-'}</span></Tooltip> },
  { title: '', width: 40, render: (_: any, r: any) => r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer"><LinkOutlined /></a> : null },
];

interface Props {
  log: any;                       // company_crawl_logs 行（至少 id / company / company_id）
  events: PipelineEvent[];
  markdown: string;
  data: RunData | null;
  rawSearches?: Record<string, any> | null;
  running?: boolean;
  paused?: boolean;
  onBack: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  backLabel?: string;
}

/** 单家企业画像的三栏视图：左 目标 + 流水日志；中 结构化结果（画像 / 融资 / 动态 / 高管）+ raw；右 AI 摘要 + JSON */
export function CompanyRunView({ log, events, markdown, data, rawSearches, running, paused, onBack, onPause, onResume, onStop, backLabel = '返回' }: Props) {
  const router = useRouter();
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const profileRows = PIPELINE_FIELDS.filter(k => hasValue(data?.profile?.[k])).map(k => ({ key: k, label: FIELD_LABEL[k] || k, value: formatProfileValue(k, data!.profile[k]), source: data?.sources?.[k] }));
  const pagesOk = (log?.pages_fetched || []).filter((p: any) => p.ok).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} type="text">{backLabel}</Button>
        {running && (
          <Space>
            {!paused
              ? <Button size="small" icon={<PauseCircleOutlined />} onClick={onPause}>暂停</Button>
              : <Button size="small" type="primary" icon={<RocketOutlined />} onClick={onResume}>继续</Button>}
            <Button size="small" danger icon={<StopOutlined />} onClick={onStop}>停止</Button>
          </Space>
        )}
      </div>
      <div className="cd-split" style={{ flex: 1, minHeight: 0 }}>
        {/* 左：目标 + 流水日志 */}
        <div style={{ flex: '0 0 380px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <Card title="画像目标" variant="borderless" size="small" style={{ borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <a onClick={() => log?.company_id && router.push(`/admin/db-company/${log.company_id}`)} style={{ fontSize: 16, fontWeight: 700 }}>{log?.company || '—'}</a>
              {log?.status && <Tag color={log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : log.status === 'running' ? 'processing' : 'default'}>{log.status}</Tag>}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontSize: 12, color: BRAND.ink3 }}>
              {log?.task?.name && <span>任务：{log.task.name}</span>}
              {log?.model_id && <span>模型：{log.model_id}</span>}
              {log?.pages_fetched?.length ? <span>官方页面：{pagesOk}/{log.pages_fetched.length}</span> : null}
              {log?.llm_calls ? <span>{log.llm_calls} 次调用 · {(log.token_total || 0).toLocaleString()} tokens · ${Number(log.cost_usd || 0).toFixed(4)}</span> : null}
              {log?.completeness_after != null && <span>完整度 {log.completeness_before ?? '-'} → <b style={{ color: BRAND.primary }}>{log.completeness_after}</b></span>}
            </div>
            {(log?.pages_fetched || []).length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {log.pages_fetched.map((p: any) => <Tag key={p.url} color={p.ok ? 'cyan' : 'default'} style={{ margin: 0 }}><a href={p.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{p.subtype}</a></Tag>)}
              </div>
            )}
          </Card>
          <Card title="流水日志" variant="borderless" size="small" style={{ borderRadius: 12, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {events.length > 0 ? (
              <Timeline items={events.map(ev => ({
                color: ev.color,
                icon: ev.status === 'loading' ? <SyncOutlined spin /> : undefined,
                content: <div style={{ fontWeight: 500, fontSize: 13, wordBreak: 'break-all' }}>{ev.title}</div>,
              }))} />
            ) : <div style={{ color: '#999', fontSize: 13, textAlign: 'center', marginTop: 20 }}>暂无日志记录。</div>}
          </Card>
        </div>

        {/* 中：结构化结果 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Card
            title="结构化结果"
            extra={<Space size={4}>
              {rawSearches && Object.keys(rawSearches).length > 0 && <Button type="text" size="small" icon={<SearchOutlined />} onClick={() => { setShowRaw(v => !v); setShowMarkdown(false); }}>{showRaw ? '隐藏检索原始返回' : '检索原始返回'}</Button>}
              {markdown && <Button type="text" size="small" icon={<FileTextOutlined />} onClick={() => { setShowMarkdown(v => !v); setShowRaw(false); }}>{showMarkdown ? '隐藏 Raw Markdown' : '查看 Raw Markdown'}</Button>}
            </Space>}
            variant="borderless"
            style={{ borderRadius: 12, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 } }}
          >
            {data ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
                <Tabs size="small" items={[
                  { key: 'profile', label: `画像字段（${profileRows.length}）`, children: profileRows.length ? (
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                      <tbody>
                        {profileRows.map((r, idx) => (
                          <tr key={r.key} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fafafa' : '#fff' }}>
                            <td style={{ padding: '6px 12px', fontWeight: 600, color: '#555', width: 150, verticalAlign: 'top' }}>{r.label}</td>
                            <td style={{ padding: '6px 12px', color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {/^https?:\/\//.test(r.value) ? <a href={r.value} target="_blank" rel="noreferrer">{r.value}</a> : r.value}
                              {r.source && <Tooltip title={r.source}><a href={r.source} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: BRAND.ink4 }}><LinkOutlined /></a></Tooltip>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <Empty description="还没有提取到画像字段" /> },
                  { key: 'financings', label: `融资（${data.financings?.length || 0}）`, children: <Table size="small" rowKey={(_, i) => String(i)} dataSource={data.financings || []} columns={FINANCING_COLUMNS} pagination={false} /> },
                  { key: 'news', label: `近期动态（${data.news?.length || 0}）`, children: <Table size="small" rowKey={(_, i) => String(i)} dataSource={data.news || []} columns={NEWS_COLUMNS} pagination={false} /> },
                  { key: 'executives', label: `管理团队（${data.executives?.length || 0}）`, children: <Table size="small" rowKey={(_, i) => String(i)} dataSource={data.executives || []} columns={EXECUTIVE_COLUMNS} pagination={false} scroll={{ x: 900 }} /> },
                  { key: 'products', label: `核心产品（${data.products?.length || 0}）`, children: <Table size="small" rowKey={(_, i) => String(i)} dataSource={data.products || []} columns={PRODUCT_COLUMNS} pagination={false} scroll={{ x: 900 }} /> },
                ]} />
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 13 }}>
                {running ? <Spin size="large" /> : <Space orientation="vertical" align="center"><CodeOutlined style={{ fontSize: 48, opacity: 0.15 }} /><span>暂无结构化结果</span></Space>}
              </div>
            )}
            {showMarkdown && markdown && (
              <div style={{ borderTop: '1px solid #f0f0f0', padding: 16, maxHeight: 320, overflowY: 'auto' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>📄 Raw Markdown（{(markdown.length / 1000).toFixed(0)}k 字符，官方页面原文）</div>
                <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: '#555', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f9f9f9', padding: 12, borderRadius: 6 }}>
                  {markdown.substring(0, 60000)}{markdown.length > 60000 && '\n\n...（已截断）'}
                </pre>
              </div>
            )}
            {showRaw && rawSearches && (
              <div style={{ borderTop: '1px solid #f0f0f0', padding: 16, maxHeight: 320, overflowY: 'auto' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>🔎 每个工序的原始返回（定位 / 提取 / 各主题检索）</div>
                <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: '#555', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f9f9f9', padding: 12, borderRadius: 6 }}>
                  {JSON.stringify(rawSearches, null, 2).substring(0, 80000)}
                </pre>
              </div>
            )}
          </Card>
        </div>

        {/* 右：AI 摘要 + JSON */}
        <div style={{ flex: '0 0 360px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Card title="AI 摘要 + JSON" variant="borderless"
            style={{ borderRadius: 12, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 } }}>
            {!data ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>{running ? <Spin /> : '等待流水线输出...'}</div>
            ) : (
              <>
                {data.summaries?.length > 0 && (
                  <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', background: '#fafafa', fontSize: 13, color: '#555', lineHeight: 1.7, maxHeight: '45%', overflowY: 'auto' }}>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>📋 逐工序摘要</div>
                    {data.summaries.map(s => <p key={s.step} style={{ margin: '0 0 10px' }}><b>【{s.label}】</b>{s.text}</p>)}
                  </div>
                )}
                <div style={{ flex: 1, overflowY: 'auto', background: '#1e1e1e', padding: 16 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>📦 终局 JSON（画像 + 融资 {data.financings?.length || 0} + 动态 {data.news?.length || 0} + 高管 {data.executives?.length || 0} + 产品 {data.products?.length || 0}）</div>
                  <pre style={{ margin: 0, color: '#d4d4d4', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify({ profile: data.profile, financings: data.financings, news: data.news, executives: data.executives, products: data.products, sources: data.sources, topics_run: data.topics_run, topics_skipped: data.topics_skipped }, null, 2)}
                  </pre>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
