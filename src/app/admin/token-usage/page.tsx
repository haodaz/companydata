'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Table, Tag, Select, Space, Typography, Statistic, Row, Col, Button, Tooltip } from 'antd';
import { ReloadOutlined, DollarOutlined, ThunderboltOutlined, FileTextOutlined, RobotOutlined, InfoCircleOutlined, DownloadOutlined, BarChartOutlined } from '@ant-design/icons';
import { exportToCsv } from '@/lib/export-csv';
import { PageHeader } from '@/components/admin/PageHeader';
import { PricingCard } from '@/components/admin/PricingCard';

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
  total_search_calls?: number;
  total_search_cost_usd?: number;
  model_stats: Record<string, { count: number; tokens: number; cost: number }>;
  tool_stats?: Record<string, { count: number; tokens: number; cost_usd: number; cost_cny: number }>;
  /** 按「功能 | 环节」 */
  task_stats?: { key: string; count: number; tokens: number; cost: number }[];
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
  // 只认最新那次请求：统计要翻页拉全量、很慢，切筛选后旧请求晚回来会把新结果盖掉
  const reqSeq = useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++reqSeq.current;
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
      if (seq !== reqSeq.current) return;
      if (data.ok) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setStats(data.stats || null);
      }
    } catch (e) {
      console.error('Failed to fetch token usage:', e);
    }
    if (seq === reqSeq.current) setLoading(false);
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
        <Row gutter={[12, 12]} align="stretch" style={{ marginBottom: 24 }}>
          <Col xs={12} md={4}>
            <Card size="small" style={{ height: '100%', borderRadius: 12, borderTop: '3px solid #6055f5' }}>
              <Statistic
                title={<span style={{ fontSize: 13, color: '#8c8c8c' }}>检索任务数</span>}
                value={stats.total_tasks}
                prefix={<FileTextOutlined style={{ color: '#6055f5' }} />}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}
              />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card size="small" style={{ height: '100%', borderRadius: 12, borderTop: '3px solid #eb2f96' }}>
              <Statistic
                title={<Tooltip title="Gemini 联网 / 阿里云搜索 / OpenAI web search 按次另收费，已算进 AI 模型成本"><span style={{ fontSize: 13, color: '#8c8c8c' }}>联网搜索</span></Tooltip>}
                value={stats.total_search_calls ?? 0}
                suffix={<span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400 }}>次 · {formatCost(stats.total_search_cost_usd || 0, currency)}</span>}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}
              />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card size="small" style={{ height: '100%', borderRadius: 12, borderTop: '3px solid #fa8c16' }}>
              <Statistic
                title={<span style={{ fontSize: 13, color: '#8c8c8c' }}>总 Token 消耗</span>}
                value={formatTokens(stats.total_tokens)}
                prefix={<ThunderboltOutlined style={{ color: '#fa8c16' }} />}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}
              />
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{formatTokens(stats.total_input_tokens)} in / {formatTokens(stats.total_output_tokens)} out</div>
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card size="small" style={{ height: '100%', borderRadius: 12, borderTop: '3px solid #52c41a' }}>
              <Statistic
                title={<span style={{ fontSize: 13, color: '#8c8c8c' }}>AI 模型成本</span>}
                value={formatCost(stats.total_cost_usd, currency)}
                prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}
              />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card size="small" style={{ height: '100%', borderRadius: 12, borderTop: '3px solid #ff4d4f' }}>
              <Statistic
                title={<span style={{ fontSize: 13, color: '#8c8c8c' }}>数据供应链</span>}
                value={formatApiCost(stats.total_api_cost_cny || 0, currency)}
                prefix={<span style={{ color: '#ff4d4f', fontSize: 16 }}>📡</span>}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}
              />
            </Card>
          </Col>
          <Col xs={24} md={4}>
            <Card size="small" style={{ height: '100%', borderRadius: 12, borderTop: '3px solid #1890ff' }}>
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

      {/* 模型分布：明细表 + 饼图（按成本），明细默认只看前 5 */}
      {stats?.model_stats && Object.keys(stats.model_stats).length > 0 && (
        <ModelDistribution modelStats={stats.model_stats} currency={currency} />
      )}

      {/* 功能分布：钱花在哪类活上（2026-10-18 用户：职业画像低频但贵，别让人以为是挖岗位贵） */}
      {stats?.tool_stats && Object.keys(stats.tool_stats).length > 0 && (
        <ToolDistribution toolStats={stats.tool_stats} currency={currency} />
      )}

      {/* 按「功能 | 环节」：钱花在哪个工序（百业的成本在百业后台 /lab/admin，2026-10-12 拆开） */}
      {!!stats?.task_stats?.length && (
        <Card size="small" style={{ marginBottom: 24, borderRadius: 12 }} title={<Text strong style={{ fontSize: 13 }}>🧭 按功能 | 环节（前 15）</Text>}>
          <Table size="small" rowKey="key" pagination={false} dataSource={stats.task_stats.slice(0, 15)}
            columns={[{ title: '功能 | 环节', dataIndex: 'key', render: (k: string) => { const [t, ...rest] = k.split(' | '); return `${TOOL_LABELS[t] || t} | ${taskLabel(rest.join(' | '))}`; } }, { title: '次数', dataIndex: 'count', width: 70 }, { title: 'Token', dataIndex: 'tokens', width: 110, render: (v: number) => formatTokens(v) }, { title: '花费', dataIndex: 'cost', width: 100, render: (v: number) => currency === 'CNY' ? formatCostCny(v * USD_TO_CNY) : formatCostUsd(v) }]} />
        </Card>
      )}

      {/* 价目表（可编辑，记账按它算） */}
      <PricingCard />

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

const PIE_COLORS = ['#6055f5', '#10b981', '#fa8c16', '#eb2f96', '#1677ff', '#13c2c2', '#faad14', '#8c8c8c'];
type PieRow = { model: string; count: number; tokens: number; cost: number };
function ModelDistribution({ modelStats, currency }: { modelStats: Record<string, { count: number; tokens: number; cost: number }>; currency: Currency }) {
  return <CostPie title="模型分布" keyTitle="模型" unit="个模型" rows={Object.entries(modelStats).map(([model, s]) => ({ model, ...s }))} currency={currency} />;
}
/** 功能名 → 中文（tool_name 见 token-logger） */
const TOOL_LABELS: Record<string, string> = {
  finder: '寻源（找招聘入口）', fetcher: '抓页读页', 'structurer-job': '岗位结构化', 'job-tagging': '岗位打标',
  'company-profile': '企业画像', 'company-pipeline': '企业画像流水线', 'company-deep-research': '企业深度尽调',
  'competition-radar': '赛事雷达', 'standard-radar': '行业标准与规程', occupation: '职业画像', flywheel: '需求飞轮',
  'office-chief': '虚拟工厂 · 主管', 'office-chat': '虚拟工厂 · 对话',
  'skill-lab': 'AI 百业 · 空间与章节', 'lab-art': 'AI 百业 · 美术', 'lab-3d': 'AI 百业 · 3D',
  work: '真活台', unattributed: '未归属（兜底记账）', external: '系统外补记',
};
/** 环节名 → 中文（task_name 是代码里的英文记账名；带「·」后缀的只翻前半） */
const TASK_LABELS: Record<string, string> = {
  'Job Lang 1014': '岗位语言归一（10-14 补）', 'Extract Jobs': '从页面提取岗位', 'List Openings': '列出在招岗位', 'Search Job Fields': '补岗位字段（联网）',
  'Evaluate Sub-page': '判断子页面有没有岗位', 'Sub-page Discovery (15 links)': '发现招聘子页面',
  'Campus URLs Search': '找校招入口', 'Recruit Channels Search': '找招聘渠道', 'Generate Finder Report': '寻源报告',
  'Locate Official Pages': '定位官网页面', 'Extract From Official Pages': '从官网提取企业信息', 'Search: 基础与工商': '检索 · 基础与工商', 'Search: 校招与雇主口碑': '检索 · 校招与雇主口碑', 'Search: 管理团队': '检索 · 管理团队', 'Search: 融资历史': '检索 · 融资历史', 'Search: 近期动态与舆情': '检索 · 近期动态与舆情', 'Search: 行业与赛道': '检索 · 行业与赛道', 'Search: 核心产品': '检索 · 核心产品',
  'Company Profile': '企业画像', 'Industry Classify 1014': '行业归类（10-14 补）', 'Logo 识图': 'Logo 识图',
  'FOS + Career Tags': '专业 + 职业标签',
  'Search Standards': '找行业标准', 'Search Standard Detail': '标准条款详情',
  'Occupation Research': '职业基础画像', 'Occupation Career Graph': '职业发展图谱', 'Occupation Salary · CN Regions': '职业薪资 · 中国各地', 'Occupation Salary · Countries': '职业薪资 · 各国', 'Occupation Places & Items': '工作场所与工具', 'Occupation Tasks & Stations': '典型任务与工位', 'Occupation Gaps · Group': '职业缺口归组', 'Occupation Gaps · Verify': '职业缺口核验',
  'Persona Chat': '和我聊 · 回答', 'Persona Chat · Fact Check': '和我聊 · 逐句核查', 'Persona Chat · Web Lookup': '和我聊 · 联网补查', '问答归档': '问答归档',
  'Generate · 出题': '出题', 'Baseline · AI 先做一遍': 'AI 基线', 'Assist · 工作台 AI': '工作台 AI', 'Grade · 结果': '评结果', 'Grade · 过程': '评过程', 'Grade · 报告': '出报告',
  'Search Competitions': '找赛事', 'Extract Competitions From Page': '从页面提取赛事', 'Extract Competition Page': '读赛事详情页', 'Search Competition Detail': '补赛事详情',
  'Plan Master Task': '主管拆任务', 'Normalize · 企业行业': '归一 · 企业行业', 'Normalize · 需求信号': '归一 · 需求信号',
  'Lab Normalize Cast': '人物场景归库', 'Lab Chapter': '生成章节', 'Lab Chapter Rubric': '章节评分标准', 'Lab Day Skeleton': '一天骨架', 'Build · Design Bench': '设计工位', 'Build · Skill Draft': '技能卡草稿', 'Build · Plan Art': '美术规划', 'Generate Task': '生成空间', 'Career · Structure': '职业路径', 'Grade Answer': '考核评分', 'Link Standards': '规则挂标准', 'Ecosystem · Chain': '上下游链', 'Distill Interview': '访谈提炼', 'AI Operate (with skill)': 'AI 代操作', 'Review · Day': '评审一天', 'Lesson · 跟我学': '教案 · 跟我学',
};
const DEEP: Record<string, string> = { strategy: '战略', firm_risks: '机构风险', fund: '基金', network: '关系网', partners: '合伙人', portfolio: '投资组合', campus: '校招', deals: '交易', financials: '财务', listing: '上市', pipeline: '管线', risks: '风险', shareholding: '股权', team: '团队' };
function taskLabel(t: string): string {
  if (TASK_LABELS[t]) return TASK_LABELS[t];
  const deep = /^Deep · (\w+)$/.exec(t); if (deep) return `深度尽调 · ${DEEP[deep[1]] || deep[1]}`;
  const m = /^(.+?) · (.+)$/.exec(t); if (m && TASK_LABELS[m[1]]) return `${TASK_LABELS[m[1]]} · ${m[2]}`;
  return t;
}
/** 功能 → 用户看得懂的「活」（2026-10-18 用户：要一眼看到获取岗位花了多少） */
const TOOL_GROUPS: { label: string; tools: string[] }[] = [
  { label: '获取岗位', tools: ['finder', 'fetcher', 'structurer-job', 'job-tagging'] },
  { label: '企业画像', tools: ['company-profile', 'company-pipeline'] },
  { label: '企业深度尽调', tools: ['company-deep-research'] },
  { label: '职业画像', tools: ['occupation'] },
  { label: '赛事雷达', tools: ['competition-radar'] },
  { label: '行业标准与规程', tools: ['standard-radar'] },
  { label: '虚拟工厂', tools: ['office-chief', 'office-chat'] },
  { label: '需求飞轮', tools: ['flywheel'] },
  { label: '真活台', tools: ['work'] },
  { label: 'AI 百业', tools: ['skill-lab', 'lab-art', 'lab-3d'] },
  { label: '未归属（兜底记账）', tools: ['unattributed'] },
  { label: '系统外补记', tools: ['external'] },
];
function ToolDistribution({ toolStats, currency }: { toolStats: Record<string, { count: number; tokens: number; cost_usd: number; cost_cny: number }>; currency: Currency }) {
  const groupOf = (t: string) => TOOL_GROUPS.find(g => g.tools.includes(t))?.label || TOOL_LABELS[t] || t;
  const acc = new Map<string, PieRow & { parts: string[] }>();
  for (const [t, s] of Object.entries(toolStats)) {
    const g = groupOf(t); const r = acc.get(g) || { model: g, count: 0, tokens: 0, cost: 0, parts: [] };
    r.count += s.count; r.tokens += s.tokens; r.cost += s.cost_usd + (s.cost_cny || 0) / USD_TO_CNY; r.parts.push(TOOL_LABELS[t] || t); acc.set(g, r);
  }
  const rows = [...acc.values()].map(r => ({ ...r, model: r.parts.length > 1 ? `${r.model}（${r.parts.join('、')}）` : r.model }));
  return <CostPie title="功能分布 · 钱花在哪类活上" keyTitle="活" unit="类" rows={rows} currency={currency} />;
}
/** 饼图（按成本占比）+ 明细表；明细默认只显示前 5，展开看全部 */
function CostPie({ title, keyTitle, unit, rows: input, currency }: { title: string; keyTitle: string; unit: string; rows: PieRow[]; currency: Currency }) {
  const [expanded, setExpanded] = useState(false);
  const rows = [...input].sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
  const totalCost = rows.reduce((a, r) => a + r.cost, 0) || 1;
  // 饼图：前 7 个各一块，其余并成「其他」
  const slices = rows.slice(0, 7).map((r, i) => ({ label: r.model, value: r.cost, color: PIE_COLORS[i] }));
  const rest = rows.slice(7).reduce((a, r) => a + r.cost, 0);
  if (rest > 0) slices.push({ label: `其他 ${rows.length - 7} 个`, value: rest, color: PIE_COLORS[7] });
  const colorOf = new Map(slices.map(x => [x.label, x.color]));
  let acc = 0;
  const arc = (from: number, to: number) => {
    const R = 60, C = 70, a0 = from * 2 * Math.PI - Math.PI / 2, a1 = to * 2 * Math.PI - Math.PI / 2;
    if (to - from >= 0.9999) return `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z`;
    return `M ${C} ${C} L ${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A ${R} ${R} 0 ${to - from > 0.5 ? 1 : 0} 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)} Z`;
  };
  const shown = expanded ? rows : rows.slice(0, 5);
  return (
    <Card size="small" style={{ marginBottom: 24, borderRadius: 12 }} title={<Text strong style={{ fontSize: 13 }}>{title}</Text>}
      extra={<Text type="secondary" style={{ fontSize: 12 }}>饼图按成本占比</Text>}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 auto', width: 380, maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <svg width={190} height={190} viewBox="0 0 140 140">
            {slices.map(x => { const from = acc / totalCost; acc += x.value; return <path key={x.label} d={arc(from, acc / totalCost)} fill={x.color} stroke="#fff" strokeWidth={1}><title>{`${x.label}：${formatCost(x.value, currency)}（${(x.value / totalCost * 100).toFixed(1)}%）`}</title></path>; })}
            <circle cx={70} cy={70} r={32} fill="#fff" />
            <text x={70} y={66} textAnchor="middle" fontSize={11} fill="#8c8c8c">总成本</text>
            <text x={70} y={82} textAnchor="middle" fontSize={12} fontWeight={600}>{formatCost(totalCost, currency)}</text>
          </svg>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 2, marginTop: 10, width: '100%' }}>
            {slices.map(x => <span key={x.label} title={x.label} style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: x.color, marginRight: 6 }} />{x.label} {(x.value / totalCost * 100).toFixed(1)}%</span>)}
          </div>
        </div>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <Table size="small" rowKey="model" pagination={false} dataSource={shown}
            columns={[
              { title: keyTitle, dataIndex: 'model', render: (m: string) => <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colorOf.get(m) || PIE_COLORS[7], marginRight: 6 }} />{m}</span> },
              { title: '调用次数', dataIndex: 'count', align: 'right' as const, render: (v: number) => v.toLocaleString() },
              { title: 'Tokens', dataIndex: 'tokens', align: 'right' as const, render: (v: number) => formatTokens(v) },
              { title: '成本', dataIndex: 'cost', align: 'right' as const, render: (v: number) => formatCost(v, currency) },
              { title: '占比', key: 'pct', align: 'right' as const, render: (_: any, r: any) => `${(r.cost / totalCost * 100).toFixed(1)}%` },
            ]} />
          {rows.length > 5 && (
            <Button type="link" size="small" style={{ paddingLeft: 0, marginTop: 4 }} onClick={() => setExpanded(e => !e)}>
              {expanded ? '收起，只看前 5' : `展开全部 ${rows.length} ${unit}`}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
