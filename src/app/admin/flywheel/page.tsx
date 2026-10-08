'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Button, Card, Checkbox, Col, Empty, Popconfirm, Row, Segmented, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, FireOutlined, GlobalOutlined, NodeIndexOutlined, ReloadOutlined, ScheduleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { useModel } from '@/lib/model-context';
import { BRAND } from '@/lib/theme';

const { Text, Paragraph } = Typography;

type Dim = 'company' | 'industry' | 'job_function' | 'career_family';
const DIM_LABEL: Record<Dim, string> = { company: '企业', industry: '行业', job_function: '职能', career_family: '职业领域' };
const GROUP_COLOR: Record<string, string> = { internal: 'blue', web: 'volcano', toc: 'green' };

const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const fmtTime = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export default function FlywheelPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { currentModel } = useModel();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dim, setDim] = useState<Dim>('company');
  const [running, setRunning] = useState(false);
  const [scanWeb, setScanWeb] = useState(true);
  const [forceAll, setForceAll] = useState(false);
  const [normalizing, setNormalizing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const j = await (await fetch('/api/flywheel', { cache: 'no-store' })).json();
      if (!j.ok) throw new Error(j.error);
      setData(j);
    } catch (e: any) { message.error(`加载失败：${e.message}`); }
    finally { setLoading(false); }
  }, [message]);
  useEffect(() => { load(); }, [load]);

  // 检测在服务端后台跑，进度写在今天那行的 stats.run 里：跑着的时候每 3 秒刷新一次
  const run = data?.days?.[0]?.day === today() ? data.days[0].stats?.run : null;
  const detecting = run?.status === 'running' && Date.now() - Date.parse(run.startedAt) < 15 * 60_000;
  const wasDetecting = React.useRef(false);
  useEffect(() => {
    if (wasDetecting.current && !detecting && run) {
      if (run.status === 'done') message.success('检测完成，缺口和排产已更新');
      else if (run.status === 'failed') message.error(`检测失败：${run.error || '看下面的过程'}`);
    }
    wasDetecting.current = detecting;
    if (!detecting) return;
    const t = setTimeout(() => load(true), 3000);
    return () => clearTimeout(t);
  }, [detecting, run, load, message]);

  const runNow = async () => {
    setRunning(true);
    try {
      const j = await (await fetch('/api/flywheel/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: currentModel, scanWeb, forceAll }) })).json();
      if (!j.ok && !j.running) throw new Error(j.error);
      message.info(j.running ? j.error : '检测已开始，在后台跑，下面能看到进度');
      await load(true);
    } catch (e: any) { message.error(`检测没能开始：${e.message}`); }
    finally { setRunning(false); }
  };

  const normalizeNow = async () => {
    setNormalizing(true);
    try {
      const j = await (await fetch('/api/flywheel/normalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: currentModel }) })).json();
      if (!j.ok) throw new Error(j.error);
      message.success(`归一 ${j.done} 条信号，新增行业写法 ${j.aliases} 种`);
      load();
    } catch (e: any) { message.error(`归一失败：${e.message}`); }
    finally { setNormalizing(false); }
  };

  const latest = data?.days?.[0];
  const ranToday = latest?.day === today();
  const sources = data?.sources || {};
  const srcTag = (s: string) => <Tag key={s} color={GROUP_COLOR[sources[s]?.group] || 'default'} style={{ marginInlineEnd: 4 }}>{sources[s]?.label || s}</Tag>;

  const rows = useMemo(() => (data?.dims?.[dim] || []) as any[], [data, dim]);
  const maxHeat = Math.max(1, ...rows.map(r => r.heat30));

  const supplyText = (r: any) => {
    const s = r.supply || {};
    if (dim === 'company') return s.inLibrary === false ? <Text type="warning">未入库</Text> : (
      <Space size={4} wrap>
        <Text>{s.openJobs} 个在招</Text>
        {s.staleDays != null && <Text type={s.staleDays > 7 ? 'warning' : 'secondary'}>{s.staleDays} 天前刷新</Text>}
        {!s.campus && !s.careers ? <Text type="danger">无招聘入口</Text> : <Text type="secondary">{s.campus ? '有校招页' : '有招聘页'}</Text>}
        {s.completeness != null && <Text type="secondary">完整度 {s.completeness}</Text>}
      </Space>);
    if (dim === 'industry') return <Text>{s.companies} 家企业 · {s.withLink} 家有招聘入口 · {s.openJobs} 个在招{s.big ? ` · 大企业 ${s.big}` : ''}</Text>;
    if (dim === 'job_function') return <Text>{s.openJobs} 个在招 · 近 14 天刷新 {s.fresh14}</Text>;
    return <Text>{s.spaces} 个职业空间 · {s.professions} 种职业</Text>;
  };

  const actionOf = (r: any) => {
    const s = r.supply || {};
    if (dim === 'company' && s.id) return (
      <Space size={4}>
        <Button size="small" type="link" onClick={() => router.push(`/admin/db-job?jobType=all&companyId=${s.id}&companyName=${encodeURIComponent(r.label)}`)}>看岗位</Button>
        <Button size="small" type="link" onClick={() => router.push(`/admin/tool-company?company=${s.id}&name=${encodeURIComponent(r.label)}`)}>补画像</Button>
      </Space>);
    if (dim === 'career_family') return <Button size="small" type="link" onClick={() => window.open('/lab/spaces', '_blank')}>去 lab</Button>;
    return null;
  };

  const columns: any[] = [
    { title: DIM_LABEL[dim], dataIndex: 'label', width: 220, fixed: 'left' as const,
      render: (v: string, r: any) => <Space size={4} wrap><Text strong>{v}</Text>{(r.tags || []).map((t: string) => <Tag key={t} color="gold">{t}</Tag>)}</Space> },
    { title: '热度（30 天）', dataIndex: 'heat30', width: 170, sorter: (a: any, b: any) => a.heat30 - b.heat30, defaultSortOrder: 'descend' as const,
      render: (v: number, r: any) => (
        <Tooltip title={`${r.signals30} 条信号${r.web30 ? `，其中联网前瞻 ${Math.round(r.web30 * 10) / 10} 分` : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${(v / maxHeat) * 100}%`, height: '100%', background: r.web30 > v / 2 ? '#fa541c' : BRAND.primary }} />
            </div>
            <Text style={{ width: 40, textAlign: 'right' }}>{Math.round(v * 10) / 10}</Text>
          </div>
        </Tooltip>) },
    { title: '近 7 天', dataIndex: 'heat7', width: 100, sorter: (a: any, b: any) => a.heat7 - b.heat7,
      render: (v: number, r: any) => {
        const d = v - r.heatPrev7;
        return <Space size={4}><Text>{Math.round(v * 10) / 10}</Text>{d !== 0 && <Text type={d > 0 ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{d > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}{Math.abs(Math.round(d * 10) / 10)}</Text>}</Space>;
      } },
    { title: '信号来源', dataIndex: 'sources', width: 230,
      render: (v: Record<string, number>) => <div>{Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => srcTag(s))}</div> },
    { title: '库里有什么', key: 'supply', width: 300, render: (_: any, r: any) => supplyText(r) },
    { title: '缺口', dataIndex: 'gap', width: 260, sorter: (a: any, b: any) => a.gap - b.gap,
      render: (v: number, r: any) => v > 0 && r.reasons.length
        ? <div><Tag color={v >= 5 ? 'red' : v >= 2 ? 'orange' : 'default'}>{v}</Tag><Text type="secondary" style={{ fontSize: 12 }}>{r.reasons.join('；')}</Text></div>
        : <Text type="secondary">—</Text> },
    { title: '', key: 'op', width: 140, render: (_: any, r: any) => actionOf(r) },
  ];

  const webDay = latest?.web || {};
  const probeTabs = (data?.probes || []).map((p: any) => ({
    key: p.key,
    label: `${p.label}（${(webDay[p.key] || []).length}）`,
    children: (webDay[p.key] || []).length ? (
      <div style={{ maxHeight: 420, overflow: 'auto' }}>
        {(webDay[p.key] || []).map((it: any, i: number) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <Space size={6} wrap>
              <Text strong>{it.company || it.profession || '—'}</Text>
              {it.school && <Tag>{it.school}</Tag>}
              {it.city && <Tag>{it.city}</Tag>}
              {it.date && <Text type="secondary" style={{ fontSize: 12 }}>{it.date}</Text>}
            </Space>
            <div style={{ fontSize: 13 }}>{it.detail} {it.url && <a href={it.url} target="_blank" rel="noreferrer">出处</a>}</div>
          </div>
        ))}
      </div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={!latest ? '还没检测过' : p.key in webDay ? '这次没扫到' : `这次按间隔没扫（每 ${p.every} 天一次）`} />,
  }));

  const signalCols: any[] = [
    { title: '时间', dataIndex: 'created_at', width: 100, render: fmtTime },
    { title: '来源', dataIndex: 'source', width: 150, render: srcTag },
    { title: '原话', dataIndex: 'query', ellipsis: true, render: (v: string, r: any) => v || r.company_name || '—' },
    { title: '归一到', key: 'n', width: 360, render: (_: any, r: any) => (
      <Space size={2} wrap>
        {r.company_name && <Tag color="gold">{r.company_name}</Tag>}
        {r.industry && <Tag color="blue">{r.industry}</Tag>}
        {r.job_function && <Tag color="purple">{r.job_function}</Tag>}
        {r.career_family && <Tag color="cyan">{r.career_family}</Tag>}
        {r.profession && <Tag>{r.profession}</Tag>}
        {!r.normalized_by && <Tag color="default">待归一</Tag>}
      </Space>) },
  ];

  const t = data?.totals || {};
  const internal = Object.entries(data?.bySource || {}).filter(([s]) => sources[s]?.group === 'internal').reduce((a, [, n]) => a + (n as number), 0);
  const web = Object.entries(data?.bySource || {}).filter(([s]) => sources[s]?.group === 'web').reduce((a, [, n]) => a + (n as number), 0);
  const toc = Object.entries(data?.bySource || {}).filter(([s]) => sources[s]?.group === 'toc').reduce((a, [, n]) => a + (n as number), 0);

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <PageHeader icon={<FireOutlined />} title="需求飞轮"
        description="把后台搜索、lab 提问与浏览、任务、下载，以及联网扫到的前瞻信号（宣讲会、融资、校企合作、扩张、新开校招站、热门职位），归一到企业 / 行业 / 职能 / 职业领域看热度；热但数据薄或旧的地方，检测时排成采集任务。"
        extra={<>
          {latest ? <Tag color={ranToday ? 'green' : 'orange'}>上次检测 {latest.day}{ranToday ? '（今天）' : ''}</Tag> : <Tag color="orange">还没检测过</Tag>}
          <Button icon={<ReloadOutlined />} onClick={() => load()}>刷新</Button>
          <Button icon={<NodeIndexOutlined />} loading={normalizing} disabled={!data?.pending} onClick={normalizeNow}>归一 {data?.pending || 0} 条</Button>
          <Popconfirm title="立即检测" okText="开始" cancelText="取消" onConfirm={runNow}
            description={<div style={{ maxWidth: 300 }}>
              <Paragraph style={{ marginBottom: 8 }}>归一 → 前瞻信号 → 算缺口 → 把缺口排成「飞轮排产」草稿任务（7 天内排过的企业不重复）。</Paragraph>
              <Checkbox checked={scanWeb} onChange={e => setScanWeb(e.target.checked)}>联网扫前瞻信号（按各自间隔，几分钟）</Checkbox>
              <br /><Checkbox checked={forceAll} disabled={!scanWeb} onChange={e => setForceAll(e.target.checked)}>忽略间隔，{(data?.probes || []).length} 个探针全扫</Checkbox>
            </div>}>
            <Button type="primary" icon={<ThunderboltOutlined />} loading={running || detecting}>{detecting ? '检测中…' : '立即检测'}</Button>
          </Popconfirm>
        </>} />

      <StatCards loading={loading} items={[
        { label: '近 30 天信号', value: t.signals30 ?? 0, icon: <FireOutlined />, hint: `站内 ${internal} · 联网 ${web}` },
        { label: '用户使用信号（ToC）', value: toc || '未接入', icon: <FireOutlined />, color: '#52c41a', hint: toc ? '近 30 天' : '预留 /api/flywheel/signal，ToC 上线后接' },
        { label: '加权热度', value: t.heat30 ?? 0, icon: <ThunderboltOutlined />, color: '#fa541c', hint: '按来源权重加总' },
        { label: '待归一', value: data?.pending ?? 0, icon: <NodeIndexOutlined />, color: '#722ed1', hint: '规则对不上的，等模型批量归' },
        { label: '最新缺口', value: latest?.gaps?.length ?? 0, icon: <GlobalOutlined />, color: '#f5222d', hint: latest ? latest.day : '还没检测过' },
        { label: '最新排产', value: latest?.actions?.length ?? 0, icon: <ScheduleOutlined />, color: BRAND.success, hint: latest?.stats?.onboarded ? `新盘进 ${latest.stats.onboarded} 家` : undefined },
      ]} />

      {latest?.actions?.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }} title={`${latest.day} 排产`}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {latest.actions.map((a: any) => (
              <div key={a.task_id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Tag color={a.kind === 'job_task' ? 'blue' : 'purple'}>{a.kind === 'job_task' ? '岗位重抓' : '补画像'}</Tag>
                <Text strong>{a.name}</Text>
                <Text type="secondary">{a.count} {a.kind === 'job_task' ? '个页面' : '家企业'} · {a.reason}</Text>
                <Button size="small" type="link" onClick={() => router.push(a.kind === 'job_task' ? '/admin/tool-job' : '/admin/tool-company')}>去开跑 →</Button>
              </div>
            ))}
          </Space>
        </Card>
      )}

      {run?.log?.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }}
          title={<Space>{detecting ? <Tag color="processing">检测中</Tag> : run.status === 'failed' ? <Tag color="error">失败</Tag> : <Tag color="success">完成</Tag>}今天这次检测的过程</Space>}
          extra={<Text type="secondary" style={{ fontSize: 12 }}>{fmtTime(run.startedAt)} 开始{run.finishedAt ? ` · ${fmtTime(run.finishedAt)} 结束` : ''}</Text>}>
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{run.log.join('\n')}</pre>
        </Card>
      )}

      <Card size="small" style={{ marginBottom: 16 }} loading={loading}
        title={<Segmented value={dim} onChange={v => setDim(v as Dim)} options={(Object.keys(DIM_LABEL) as Dim[]).map(k => ({ value: k, label: `${DIM_LABEL[k]}（${data?.dims?.[k]?.length || 0}）` }))} />}
        extra={<Text type="secondary" style={{ fontSize: 12 }}>热度 = 信号加权和；缺口 = 热度 × 数据薄 / 旧的程度</Text>}>
        <Table rowKey="key" size="small" dataSource={rows} columns={columns} scroll={{ x: 1300 }} pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有信号：跑一下回填脚本，或者用一用后台搜索 / lab" /> }} />
      </Card>

      <Row gutter={16}>
        <Col xs={24} xl={14}>
          <Card size="small" style={{ marginBottom: 16 }} title={<Space><GlobalOutlined />前瞻信号（没开校招胜似校招）</Space>} extra={latest && <Text type="secondary" style={{ fontSize: 12 }}>{latest.day} 扫描</Text>}>
            {probeTabs.length ? <Tabs size="small" items={probeTabs} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card size="small" style={{ marginBottom: 16 }} title="热门职业名（30 天）">
            {(data?.topProfessions || []).length
              ? <div>{data.topProfessions.map((p: any) => <Tag key={p.name} style={{ marginBottom: 6, fontSize: 12 + Math.min(4, p.heat / 2) }}>{p.name} <Text type="secondary" style={{ fontSize: 11 }}>{p.heat}</Text></Tag>)}</div>
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
          <Card size="small" style={{ marginBottom: 16 }} title="检测记录">
            {(data?.days || []).length ? (data.days as any[]).map(d => (
              <div key={d.day} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <Text>{d.day}</Text>
                <Text type="secondary">缺口 {d.gaps?.length || 0} · 排产 {d.actions?.length || 0} · 新盘进 {d.stats?.onboarded || 0}</Text>
              </div>)) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没检测过" />}
          </Card>
        </Col>
      </Row>

      <Card size="small" title="最近信号" loading={loading}>
        <Table rowKey="id" size="small" dataSource={data?.recent || []} columns={signalCols} scroll={{ x: 900 }} pagination={{ pageSize: 15, showSizeChanger: false }} />
      </Card>
    </div>
  );
}
