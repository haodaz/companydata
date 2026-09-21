'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Select, Space, Typography, Statistic, Row, Col, Button, Tooltip } from 'antd';
import { ReloadOutlined, DollarOutlined, ThunderboltOutlined, FileTextOutlined, RobotOutlined, InfoCircleOutlined, DownloadOutlined, BarChartOutlined } from '@ant-design/icons';
import { exportToCsv } from '@/lib/export-csv';
import { PageHeader } from '@/components/admin/PageHeader';

const { Title, Text } = Typography;

interface TokenLog {
  id: number;
  tool_name: string;
  task_name: string;
  institution: string;
  model_id: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  api_cost_cny: number;
  api_cost_records: any[];
  records: any[];
  model_breakdown: Record<string, any>;
  batch_id?: number;
  batch_task_id?: number;
  duration_ms?: number;
  success: boolean;
  error_message?: string;
  created_at: string;
}

interface Stats {
  total_tasks: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  total_api_cost_cny: number;
  model_stats: Record<string, { count: number; tokens: number; cost: number }>;
  tool_stats?: Record<string, { count: number; tokens: number; cost_usd: number; cost_cny: number }>;
}

const USD_TO_CNY = 7.2; // 汇率
type Currency = 'CNY' | 'USD';

const MODEL_COLORS: Record<string, string> = {
  'gemini-3.8-flash': '#1a73e8',
  'gemini-3.7-flash': '#4285f4',
  'gemini-3.6-flash': '#4285f4',
  'gemini-3.5-flash': '#34a853',
  'gemini-3.5-flash-lite': '#81c995',
  'gemini-3.1-pro': '#e8710a',
  'deepseek-v3': '#7c3aed',
  'deepseek-v3.2-exp': '#8b5cf6',
  'gpt-4o': '#10a37f',
  'gpt-4o-mini': '#6ee7b7',
  'gpt-6-astra': '#ef4444',
  'gpt-5.6-terra': '#f97316',
  'gpt-5.6-luna': '#eab308',
  'qwen-plus': '#ff6a00',
};

const DAYS_OPTIONS = [
  { label: '最近 7 天', value: 7 },
  { label: '最近 30 天', value: 30 },
  { label: '最近 90 天', value: 90 },
  { label: '全部', value: 0 },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatCostUsd(usd: number): string {
  if (usd >= 1) return '$' + usd.toFixed(2);
  if (usd >= 0.01) return '$' + usd.toFixed(3);
  if (usd >= 0.001) return '$' + usd.toFixed(4);
  return '$' + usd.toFixed(6);
}

function formatCostCny(cny: number): string {
  if (cny >= 1) return '¥' + cny.toFixed(2);
  if (cny >= 0.01) return '¥' + cny.toFixed(3);
  return '¥' + cny.toFixed(4);
}

/** 统一成本格式化：根据币种显示 */
function formatCost(usd: number, currency: Currency): string {
  if (currency === 'CNY') return formatCostCny(usd * USD_TO_CNY);
  return formatCostUsd(usd);
}

/** AMiner 数据成本格式化 */
function formatApiCost(cny: number, currency: Currency): string {
  if (currency === 'USD') return formatCostUsd(cny / USD_TO_CNY);
  return formatCostCny(cny);
}

/** 综合总成本（AI + 数据），统一到一个币种 */
function formatTotalCost(aiUsd: number, apiCny: number, currency: Currency): string {
  if (currency === 'CNY') {
    const total = aiUsd * USD_TO_CNY + apiCny;
    return formatCostCny(total);
  }
  const total = aiUsd + apiCny / USD_TO_CNY;
  return formatCostUsd(total);
}

export default function TokenUsagePage() {
  const [logs, setLogs] = useState<TokenLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [daysFilter, setDaysFilter] = useState(30);
  const [modelFilter, setModelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [currency, setCurrency] = useState<Currency>('CNY');
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(daysFilter > 0 ? { days: String(daysFilter) } : {}),
        ...(modelFilter ? { model: modelFilter } : {}),
      });
      const res = await fetch(`/api/admin/token-usage?${params}`);
      const data = await res.json();
      if (data.ok) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setStats(data.stats || null);
      }
    } catch (e) {
      console.error('Failed to fetch token usage:', e);
    }
    setLoading(false);
  }, [page, daysFilter, modelFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 提取所有出现过的模型
  const modelOptions = stats?.model_stats ? Object.keys(stats.model_stats) : [];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* 标题栏 */}
      <PageHeader
        icon={<BarChartOutlined />}
        title="Token 用量"
        description="追踪 URL 检索、页面抓取与结构化提取的 AI 调用量与成本"
        extra={<Space>
          <Select
            value={daysFilter}
            onChange={v => { setDaysFilter(v); setPage(1); }}
            options={DAYS_OPTIONS}
            style={{ width: 140 }}
            size="small"
          />
          <Select
            value={modelFilter}
            onChange={v => { setModelFilter(v); setPage(1); }}
            allowClear
            placeholder="全部模型"
            style={{ width: 160 }}
            size="small"
          >
            {modelOptions.map(m => (
              <Select.Option key={m} value={m}>{m}</Select.Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} size="small" onClick={fetchData} loading={loading}>刷新</Button>
          <Button
            icon={<DownloadOutlined />}
            size="small"
            disabled={logs.length === 0}
            onClick={() => exportToCsv(logs, [
              { key: 'created_at', header: '时间', formatter: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '' },
              { key: 'tool_name', header: '功能' },
              { key: 'task_name', header: '检索对象' },
              { key: 'institution', header: '企业' },
              { key: 'model_id', header: '模型' },
              { key: 'total_input_tokens', header: '输入Token' },
              { key: 'total_output_tokens', header: '输出Token' },
              { key: 'total_tokens', header: '总Token' },
              { key: 'total_cost_usd', header: 'AI成本(USD)', formatter: (v: number) => v != null ? v.toFixed(6) : '' },
              { key: 'api_cost_cny', header: '数据成本(CNY)', formatter: (v: number) => v != null ? v.toFixed(4) : '' },
              { key: 'batch_id', header: '批次ID' },
              { key: 'success', header: '是否成功', formatter: (v: boolean) => v ? '是' : '否' },
            ], 'Token用量')}
          >
            导出CSV
          </Button>
          <Button
            size="small"
            onClick={() => setCurrency(c => c === 'CNY' ? 'USD' : 'CNY')}
            style={{ fontWeight: 600, minWidth: 50 }}
          >
            {currency === 'CNY' ? '¥ CNY' : '$ USD'}
          </Button>
        </Space>}
      />

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={12} style={{ marginBottom: 24 }}>
          <Col span={4}>
            <Card size="small" style={{ borderRadius: 12, borderTop: '3px solid #6055f5' }}>
              <Statistic
                title={<span style={{ fontSize: 13, color: '#8c8c8c' }}>检索任务数</span>}
                value={stats.total_tasks}
                prefix={<FileTextOutlined style={{ color: '#6055f5' }} />}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ borderRadius: 12, borderTop: '3px solid #fa8c16' }}>
              <Statistic
                title={<span style={{ fontSize: 13, color: '#8c8c8c' }}>总 Token 消耗</span>}
                value={formatTokens(stats.total_tokens)}
                prefix={<ThunderboltOutlined style={{ color: '#fa8c16' }} />}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}
                suffix={<span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400 }}>
                  ({formatTokens(stats.total_input_tokens)} in / {formatTokens(stats.total_output_tokens)} out)
                </span>}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small" style={{ borderRadius: 12, borderTop: '3px solid #52c41a' }}>
              <Statistic
                title={<span style={{ fontSize: 13, color: '#8c8c8c' }}>AI 模型成本</span>}
                value={formatCost(stats.total_cost_usd, currency)}
                prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small" style={{ borderRadius: 12, borderTop: '3px solid #ff4d4f' }}>
              <Statistic
                title={<span style={{ fontSize: 13, color: '#8c8c8c' }}>数据供应链</span>}
                value={formatApiCost(stats.total_api_cost_cny || 0, currency)}
                prefix={<span style={{ color: '#ff4d4f', fontSize: 16 }}>📡</span>}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small" style={{ borderRadius: 12, borderTop: '3px solid #1890ff' }}>
              <Statistic
                title={<span style={{ fontSize: 13, color: '#8c8c8c' }}>综合总成本</span>}
                value={formatTotalCost(stats.total_cost_usd, stats.total_api_cost_cny || 0, currency)}
                prefix={<RobotOutlined style={{ color: '#1890ff' }} />}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 模型分布 */}
      {stats?.model_stats && Object.keys(stats.model_stats).length > 0 && (
        <Card size="small" style={{ marginBottom: 24, borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <Text strong style={{ fontSize: 13 }}>模型分布:</Text>
            {Object.entries(stats.model_stats).map(([model, s]) => (
              <div key={model} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag color={MODEL_COLORS[model] || '#666'} style={{ margin: 0, borderRadius: 6 }}>{model}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {s.count} 次 · {formatTokens(s.tokens)} tokens · {formatCost(s.cost, currency)}
                </Text>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 功能分类统计 */}
      {stats?.tool_stats && Object.keys(stats.tool_stats).length > 0 && (
        <Card size="small" style={{ marginBottom: 24, borderRadius: 12 }}>
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 13 }}>📋 功能分类统计</Text>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {Object.entries(stats.tool_stats)
              .sort(([, a], [, b]) => b.tokens - a.tokens)
              .map(([tool, s]) => {
                const TOOL_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
                  'talent-web-search': { label: '🔍 人才检索', icon: '🔍', color: '#6055f5' },
                  'translate': { label: '📋 结构化转译', icon: '📋', color: '#10b981' },
                  'batch-web-search': { label: '📦 批量检索', icon: '📦', color: '#fa8c16' },
                  'graph-search': { label: '🕸️ 图谱检索', icon: '🕸️', color: '#eb2f96' },
                };
                const config = TOOL_CONFIG[tool] || { label: tool, icon: '⚙️', color: '#8c8c8c' };
                const totalCost = currency === 'CNY'
                  ? s.cost_usd * USD_TO_CNY + (s.cost_cny || 0)
                  : s.cost_usd + (s.cost_cny || 0) / USD_TO_CNY;
                return (
                  <div
                    key={tool}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', background: '#fafbff', borderRadius: 10,
                      border: `1px solid ${config.color}22`,
                      borderLeft: `4px solid ${config.color}`,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', marginBottom: 4 }}>
                        {config.label}
                      </div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666' }}>
                        <span>{s.count} 次</span>
                        <span>{formatTokens(s.tokens)} tokens</span>
                        <span style={{ fontWeight: 600, color: config.color }}>
                          {currency === 'CNY' ? formatCostCny(totalCost) : formatCostUsd(totalCost)}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: `${config.color}15`, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 20,
                    }}>
                      {config.icon}
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* 模型价格参考 */}
      <Card
        size="small"
        style={{ marginBottom: 24, borderRadius: 12, background: '#fafafa' }}
        title={<span style={{ fontSize: 13 }}><InfoCircleOutlined style={{ color: '#8c8c8c', marginRight: 6 }} />模型定价参考 <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>（USD / 1M tokens · 2026 Q3）</Text></span>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { model: 'Gemini 3.8 Flash', input: 0.75, output: 3.75, tag: '最新', color: '#1a73e8' },
            { model: 'Gemini 3.6 Flash', input: 0.75, output: 3.75, tag: '', color: '#4285f4' },
            { model: 'Gemini 3.5 Flash', input: 0.75, output: 3.75, tag: '', color: '#34a853' },
            { model: 'Gemini 3.1 Pro', input: 2.00, output: 12.00, tag: '旗舰', color: '#e8710a' },
            { model: 'GPT-6 Astra', input: 10.00, output: 30.00, tag: '旗舰', color: '#ef4444' },
            { model: 'GPT-5.6 Terra', input: 2.50, output: 10.00, tag: '平衡', color: '#f97316' },
            { model: 'GPT-5.6 Luna', input: 0.50, output: 2.00, tag: '性价比', color: '#eab308' },
            { model: 'DeepSeek V3', input: 0.27, output: 1.10, tag: '最划算', color: '#7c3aed' },
            { model: 'GPT-4o', input: 2.50, output: 10.00, tag: '', color: '#10a37f' },
            { model: 'Qwen Plus', input: 0.80, output: 2.00, tag: '搜索引擎', color: '#ff6a00' },
          ].map(item => (
            <div key={item.model} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0' }}>
              <div style={{ width: 4, height: 28, borderRadius: 2, background: item.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a2e' }}>
                  {item.model}
                  {item.tag && <Tag style={{ marginLeft: 6, fontSize: 10, lineHeight: '16px', padding: '0 4px', borderRadius: 4 }} color={item.color}>{item.tag}</Tag>}
                </div>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                  入 ${item.input.toFixed(2)} / 出 ${item.output.toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 详细日志表格 */}
      <Card
        title="用量明细"
        size="small"
        style={{ borderRadius: 12 }}
        extra={<Text type="secondary" style={{ fontSize: 12 }}>共 {total} 条记录</Text>}
      >
        <Table
          dataSource={logs}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p) => setPage(p),
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
          }}
          columns={[
            {
              title: '时间',
              dataIndex: 'created_at',
              width: 160,
              render: (t: string) => (
                <Text style={{ fontSize: 12 }}>
                  {new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </Text>
              ),
            },
            {
              title: '功能',
              dataIndex: 'tool_name',
              width: 100,
              render: (tool: string) => {
                const cfg: Record<string, { label: string; color: string }> = {
                  'talent-web-search': { label: '人才检索', color: '#6055f5' },
                  'translate': { label: '结构化转译', color: '#10b981' },
                  'batch-web-search': { label: '批量检索', color: '#fa8c16' },
                  'graph-search': { label: '图谱检索', color: '#eb2f96' },
                };
                const c = cfg[tool] || { label: tool || '-', color: '#8c8c8c' };
                return <Tag style={{ borderRadius: 6, fontSize: 11, margin: 0 }} color={c.color}>{c.label}</Tag>;
              },
            },
            {
              title: '检索对象',
              dataIndex: 'task_name',
              width: 120,
              ellipsis: true,
              render: (name: string) => <Text strong>{name}</Text>,
            },
            {
              title: '机构',
              dataIndex: 'institution',
              width: 140,
              ellipsis: true,
              render: (v: string) => v || <Text type="secondary">-</Text>,
            },
            {
              title: '模型',
              dataIndex: 'model_id',
              width: 140,
              render: (m: string) => m ? (
                <Tag color={MODEL_COLORS[m] || '#666'} style={{ borderRadius: 6, fontSize: 11 }}>{m}</Tag>
              ) : <Text type="secondary">-</Text>,
            },
            {
              title: '输入',
              dataIndex: 'total_input_tokens',
              width: 90,
              align: 'right' as const,
              render: (n: number) => <Text style={{ fontSize: 12 }}>{formatTokens(n)}</Text>,
            },
            {
              title: '输出',
              dataIndex: 'total_output_tokens',
              width: 90,
              align: 'right' as const,
              render: (n: number) => <Text style={{ fontSize: 12 }}>{formatTokens(n)}</Text>,
            },
            {
              title: '总 Token',
              dataIndex: 'total_tokens',
              width: 100,
              align: 'right' as const,
              sorter: (a: TokenLog, b: TokenLog) => a.total_tokens - b.total_tokens,
              render: (n: number) => <Text strong style={{ fontSize: 12 }}>{formatTokens(n)}</Text>,
            },
            {
              title: `AI成本`,
              dataIndex: 'total_cost_usd',
              width: 90,
              align: 'right' as const,
              sorter: (a: TokenLog, b: TokenLog) => a.total_cost_usd - b.total_cost_usd,
              render: (v: number) => <Text style={{ fontSize: 12, color: '#52c41a' }}>{formatCost(v, currency)}</Text>,
            },
            {
              title: '数据成本',
              dataIndex: 'api_cost_cny',
              width: 90,
              align: 'right' as const,
              sorter: (a: TokenLog, b: TokenLog) => (a.api_cost_cny || 0) - (b.api_cost_cny || 0),
              render: (v: number, record: TokenLog) => {
                const cost = v || 0;
                if (cost === 0) return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
                const apiRecords = record.api_cost_records || [];
                return apiRecords.length > 0 ? (
                  <Tooltip title={
                    <div style={{ fontSize: 11 }}>
                      {apiRecords.map((r: any, i: number) => (
                        <div key={i} style={{ marginBottom: 2 }}>
                          <strong>{r.provider}</strong> {r.endpoint}: {formatCostCny(r.cost_cny)}
                        </div>
                      ))}
                    </div>
                  }>
                    <Text style={{ fontSize: 12, color: '#ff4d4f', cursor: 'pointer' }}>{formatApiCost(cost, currency)}</Text>
                  </Tooltip>
                ) : (
                  <Text style={{ fontSize: 12, color: '#ff4d4f' }}>{formatApiCost(cost, currency)}</Text>
                );
              },
            },
            {
              title: '总成本',
              key: 'total_combined',
              width: 90,
              align: 'right' as const,
              sorter: (a: TokenLog, b: TokenLog) => {
                const totalA = a.total_cost_usd + (a.api_cost_cny || 0) / USD_TO_CNY;
                const totalB = b.total_cost_usd + (b.api_cost_cny || 0) / USD_TO_CNY;
                return totalA - totalB;
              },
              render: (_: any, record: TokenLog) => (
                <Text strong style={{ fontSize: 12, color: '#1890ff' }}>
                  {formatTotalCost(record.total_cost_usd, record.api_cost_cny || 0, currency)}
                </Text>
              ),
            },
            {
              title: '批次',
              dataIndex: 'batch_id',
              width: 55,
              align: 'center' as const,
              render: (id: number | null) => id ? <Tag style={{ fontSize: 11, borderRadius: 4 }}>#{id}</Tag> : '-',
            },
            {
              title: '明细',
              key: 'detail',
              width: 80,
              align: 'center' as const,
              render: (_: any, record: TokenLog) => {
                const stages = (record.records || []).length;
                return stages > 0 ? (
                  <Tooltip
                    title={
                      <div style={{ fontSize: 11 }}>
                        {(record.records || []).map((r: any, i: number) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <strong>{r.stage}</strong>: {formatTokens(r.total_tokens)} ({r.model})
                          </div>
                        ))}
                      </div>
                    }
                  >
                    <Tag color="blue" style={{ cursor: 'pointer', borderRadius: 4, fontSize: 11 }}>{stages} 阶段</Tag>
                  </Tooltip>
                ) : '-';
              },
            },
          ]}
        />
      </Card>
    </div>
  );
}
