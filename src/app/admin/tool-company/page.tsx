'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Checkbox, Empty, Form, Input, Modal, Popconfirm, Progress, Select, Space, Spin, Table, Tag, Tooltip, Typography, App } from 'antd';
import {
  ArrowLeftOutlined, BankOutlined, CheckCircleOutlined, CloseCircleOutlined, DatabaseOutlined, DeleteOutlined, EditOutlined, EyeOutlined,
  PauseCircleOutlined, PlusOutlined, ReloadOutlined, RocketOutlined, StopOutlined, SyncOutlined,
} from '@ant-design/icons';
import { PageHeader } from '@/components/admin/PageHeader';
import { CompanyPicker, PickedCompany } from '@/components/admin/CompanyPicker';
import { CompanyRunView } from '@/components/admin/CompanyRunView';
import { useModel } from '@/lib/model-context';
import { useUser } from '@/lib/user-context';
import { BRAND } from '@/lib/theme';
import { PROFILE_TOPICS, SEGMENT_LABELS, SEGMENT_OPTIONS } from '@/lib/company-fields';
import { REVIEW_STATUS } from '@/lib/review-status';
import { runCompanyProfile, patchCompanyLog, type PipelineEvent, type RunData } from '@/lib/company-pipeline-client';

const { Text, Title } = Typography;

const STATUS_MAP: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  draft:     { color: 'default',    icon: <EditOutlined />,        label: '草稿' },
  running:   { color: 'processing', icon: <SyncOutlined spin />,   label: '运行中' },
  completed: { color: 'success',    icon: <CheckCircleOutlined />, label: '已完成' },
  failed:    { color: 'error',      icon: <CloseCircleOutlined />, label: '失败' },
};
const ITEM_STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '待处理' }, running: { color: 'processing', label: '处理中' }, success: { color: 'success', label: '成功' }, failed: { color: 'error', label: '失败' },
};
const patchTask = (body: Record<string, any>) => fetch('/api/admin/company-tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** 流水线运行状态（单家 / 批处理共用） */
function useRunner() {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [data, setData] = useState<RunData | null>(null);
  const [rawSearches, setRawSearches] = useState<Record<string, any> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);
  const abortRef = useRef(false);
  const reset = () => { setEvents([]); setMarkdown(''); setData(null); setRawSearches(null); };
  const waitIfPaused = async () => { while (pausedRef.current && !abortRef.current) await new Promise(r => setTimeout(r, 500)); return !abortRef.current; };
  const callbacks = { onEvents: setEvents, onMarkdown: setMarkdown, onData: setData, onRawSearches: setRawSearches, waitIfPaused };
  const pause = () => { pausedRef.current = true; setIsPaused(true); };
  const resume = () => { pausedRef.current = false; setIsPaused(false); };
  const begin = () => { abortRef.current = false; pausedRef.current = false; setIsPaused(false); setIsRunning(true); };
  const end = () => { setIsRunning(false); };
  const abort = () => { abortRef.current = true; pausedRef.current = false; setIsPaused(false); };
  return { events, setEvents, markdown, setMarkdown, data, setData, rawSearches, setRawSearches, isRunning, isPaused, abortRef, reset, callbacks, pause, resume, begin, end, abort };
}

function ToolCompanyInner() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useSearchParams();
  const { currentModel } = useModel();
  const { user } = useUser();
  const runner = useRunner();

  const [activeLog, setActiveLog] = useState<any>(null);   // 正在看的日志（任务里的一家）
  const deepLinkHandled = useRef<string | null>(null);

  // ── 批处理 ──
  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPicked, setAddPicked] = useState<PickedCompany | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [pickRows, setPickRows] = useState<any[]>([]);
  const [pickLoading, setPickLoading] = useState(false);
  const [pickedKeys, setPickedKeys] = useState<React.Key[]>([]);
  const [pickSegment, setPickSegment] = useState('');
  const [pickSearch, setPickSearch] = useState('');
  const [pickOnlyUncrawled, setPickOnlyUncrawled] = useState(true);
  const runningTaskIdRef = useRef<string | null>(null);
  const currentLogIdRef = useRef<number | null>(null);
  const [currentLogId, setCurrentLogId] = useState<number | null>(null);
  const setCurrent = (id: number | null) => { currentLogIdRef.current = id; setCurrentLogId(id); };

  const fetchTasks = useCallback(async () => {
    try {
      const json = await (await fetch('/api/admin/company-tasks')).json();
      if (json.ok) setTasks(json.tasks || []); else message.error(json.error || '任务列表加载失败');
    } catch (e) { console.error(e); }
    finally { setTasksLoading(false); }
  }, []);
  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  // 任务在别的窗口 / 别人的浏览器里跑时，这里每 8 秒拉一次进度
  useEffect(() => {
    if (runner.isRunning || !tasks.some(t => t.status === 'running')) return;
    const timer = setInterval(fetchTasks, 8000);
    return () => clearInterval(timer);
  }, [runner.isRunning, tasks, fetchTasks]);

  // 从企业列表 / 详情 / 健康看板带 ?company=ID&name= 或 ?companies=1,2,3 进来：自动建好任务并打开（单家 = 只放一家）
  useEffect(() => {
    const single = parseInt(params.get('company') || '');
    const many = (params.get('companies') || '').split(',').map(x => parseInt(x)).filter(Number.isInteger);
    const ids = single ? [single] : many;
    const key = ids.join(',');
    if (!ids.length || deepLinkHandled.current === key) return;
    deepLinkHandled.current = key;
    (async () => {
      try {
        const name = single ? `单家画像 · ${params.get('name') || `企业 #${single}`}` : `画像 · ${ids.length} 家（${new Date().toLocaleDateString('zh-CN')}）`;
        const created = await (await fetch('/api/admin/company-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, topics: PROFILE_TOPICS.map(t => t.key), skip_filled: false, model_id: currentModel, created_by: user?.email || '' }) })).json();
        if (!created.ok) throw new Error(created.error);
        await fetch('/api/admin/company-tasks/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: created.task.id, companyIds: ids }) });
        await fetchTasks();
        setActiveTaskId(created.task.id);
        router.replace('/admin/tool-company');
      } catch (e: any) { message.error(`建任务失败: ${e.message}`); }
    })();
  }, [params, currentModel, user?.email, fetchTasks, router]);

  // ── 查看某条日志（已跑过的） ──
  const openLogView = async (record: any) => {
    if (runner.isRunning && currentLogIdRef.current === record.id) { setActiveLog(record); return; }
    if (runner.isRunning) { message.info('流水线运行中，结束后可查看其他企业的结果'); return; }
    runner.reset();
    setActiveLog(record);
    try {
      const json = await (await fetch(`/api/admin/journal-company?logId=${record.id}`)).json();
      const log = json.ok && json.log ? json.log : record;
      const saved = log.structured_json?.pipeline_log;
      runner.setEvents(saved?.length ? saved : [{ key: 'done', title: log.error_message ? `❌ ${log.error_message}` : (log.status === 'pending' ? '尚未运行' : '✅ 已完成'), status: log.error_message ? 'error' : 'success', color: log.error_message ? 'red' : 'green' }]);
      runner.setMarkdown(log.raw_markdown || '');
      runner.setData(log.structured_json || null);
      runner.setRawSearches(log.raw_searches || null);
      setActiveLog(log);
    } catch { runner.setEvents([{ key: 'done', title: '日志加载失败', status: 'error', color: 'red' }]); }
  };

  const runOne = async (log: any, opts: { topics: string[]; skipFilled: boolean }) => {
    runner.reset();
    setCurrent(log.id);
    setActiveLog({ ...log, status: 'running', model_id: currentModel });
    const result = await runCompanyProfile(log, { model: currentModel, topics: opts.topics, skipFilled: opts.skipFilled }, runner.callbacks);
    // 拉一次最新日志，把成本 / 完整度带到左栏
    try { const json = await (await fetch(`/api/admin/journal-company?logId=${log.id}`)).json(); if (json.ok) setActiveLog(json.log); } catch { /* ignore */ }
    return result;
  };

  // ── 批处理运行 ──
  const handleRunTask = async () => {
    const task = tasks.find(t => t.id === activeTaskId);
    if (!task) return;
    const pending = (task.items || []).filter((l: any) => l.status !== 'success');
    if (!pending.length) { message.warning('没有待处理的企业'); return; }
    runner.begin();
    runningTaskIdRef.current = task.id;
    await patchTask({ id: task.id, status: 'running' });
    await fetchTasks();
    let ok = 0, bad = 0;
    for (let i = 0; i < pending.length; i++) {
      if (!(await runner.callbacks.waitIfPaused())) break;
      const r = await runOne(pending[i], { topics: task.topics || [], skipFilled: !!task.skip_filled });
      if (r.status === 'success') ok++; else if (r.status === 'failed') bad++; else break;
      await fetchTasks();
    }
    const aborted = runner.abortRef.current;
    await patchTask({ id: task.id, status: aborted ? 'draft' : (bad === pending.length ? 'failed' : 'completed') });
    runner.end();
    runningTaskIdRef.current = null;
    setCurrent(null);
    await fetchTasks();
    if (aborted) message.info('任务已停止');
    else message.success(`任务完成！成功 ${ok}/${pending.length}，失败 ${bad}`);
  };

  const resetLog = (id: number) => patchCompanyLog({ id, status: 'pending', error_message: null });
  const handleStop = async () => {
    runner.abort();
    const taskId = runningTaskIdRef.current || activeTaskId;
    if (taskId) {
      await patchTask({ id: taskId, status: 'draft' });
      const task = tasks.find(t => t.id === taskId);
      await Promise.all((task?.items || []).filter((l: any) => l.status === 'running').map((l: any) => resetLog(l.id)));
      if (!runner.isRunning) { await fetchTasks(); message.info('任务已停止'); }
    }
  };

  const handleCreateTask = async () => {
    try {
      const v = await createForm.validateFields();
      const json = await (await fetch('/api/admin/company-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: v.name, notes: v.notes || '', topics: v.topics || [], skip_filled: !!v.skip_filled, model_id: currentModel, created_by: user?.email || '' }) })).json();
      if (!json.ok) throw new Error(json.error);
      message.success('任务创建成功');
      setCreateOpen(false); createForm.resetFields();
      await fetchTasks();
      if (json.task?.id) setActiveTaskId(json.task.id);
    } catch (e: any) { if (e?.message) message.error(e.message); }
  };
  const addCompanies = async (body: { companyIds?: number[]; names?: string[] }) => {
    const json = await (await fetch('/api/admin/company-tasks/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: activeTaskId, ...body }) })).json();
    if (!json.ok) { message.error(json.error); return false; }
    message.success(`已添加 ${json.added} 家${json.skipped ? `，跳过 ${json.skipped} 家（重复）` : ''}`);
    fetchTasks();
    return true;
  };
  const loadPick = async (segment = pickSegment, search = pickSearch) => {
    setPickLoading(true);
    try {
      const qs = new URLSearchParams({ pageSize: '500', search, segment });
      const json = await (await fetch(`/api/db/companies?${qs}`)).json();
      setPickRows(json.success ? json.data : []);
    } catch { setPickRows([]); }
    finally { setPickLoading(false); }
  };
  const handleDeleteTask = async (id: string) => {
    const json = await (await fetch(`/api/admin/company-tasks?id=${id}`, { method: 'DELETE' })).json();
    if (json.ok) { message.success('任务已删除（已入库的画像保留）'); setActiveTaskId(null); fetchTasks(); }
  };
  const handleRemoveItem = async (logId: number) => {
    const json = await (await fetch(`/api/admin/company-tasks/companies?logId=${logId}`, { method: 'DELETE' })).json();
    if (json.ok) { message.success('已移除'); fetchTasks(); }
  };

  const activeTask = tasks.find(t => t.id === activeTaskId);

  // ══════════════ 三栏视图 ══════════════
  if (activeLog) {
    return (
      <CompanyRunView
        log={activeLog} events={runner.events} markdown={runner.markdown} data={runner.data} rawSearches={runner.rawSearches}
        running={runner.isRunning} paused={runner.isPaused}
        onBack={() => setActiveLog(null)} onPause={runner.pause} onResume={runner.resume} onStop={handleStop}
        backLabel="返回任务详情"
      />
    );
  }

  const header = (
    <PageHeader
      icon={<BankOutlined />}
      title="企业画像工具"
      description="独立于岗位提取：定位官方页面 → 抓取原文 → 提取 → 分主题联网检索（工商 / 融资 / 动态舆情 / 管理团队 / 行业 / 校招口碑）→ 只填空写入企业库与子实体。单家 = 任务里只放一家企业。"
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建画像任务</Button>}
    />
  );

  // ══════════════ 批处理：任务详情 ══════════════
  if (activeTaskId && activeTask) {
    const { progress, items } = activeTask;
    const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
    const taskBusy = runner.isRunning || activeTask.status === 'running';
    const canRun = !taskBusy && (items || []).some((l: any) => l.status !== 'success');
    const topicLabels = (activeTask.topics?.length ? PROFILE_TOPICS.filter(t => activeTask.topics.includes(t.key)) : PROFILE_TOPICS).map(t => t.label).join(' / ');

    const columns = [
      { title: '#', width: 50, render: (_: any, __: any, i: number) => i + 1 },
      { title: '企业', dataIndex: 'company', width: 220, render: (t: string, r: any) => <a onClick={() => r.company_id && router.push(`/admin/db-company/${r.company_id}`)} style={{ fontWeight: 600 }}>{t}</a> },
      { title: '完整度', width: 110, render: (_: any, r: any) => r.completeness_after != null ? <span>{r.completeness_before ?? '-'} → <b style={{ color: BRAND.primary }}>{r.completeness_after}</b></span> : '-' },
      { title: '新增字段', width: 90, align: 'center' as const, render: (_: any, r: any) => r.status === 'success' ? <Text strong style={{ color: (r.fields_filled || []).length ? BRAND.success : BRAND.ink4 }}>{(r.fields_filled || []).length}</Text> : '-' },
      { title: '融资 / 动态 / 高管', width: 140, align: 'center' as const, render: (_: any, r: any) => r.status === 'success' ? `${r.financings_saved} / ${r.news_saved} / ${r.executives_saved}` : '-' },
      { title: '成本', width: 110, render: (_: any, r: any) => r.llm_calls ? <Tooltip title={`${r.llm_calls} 次调用 · ${(r.token_total || 0).toLocaleString()} tokens`}>${Number(r.cost_usd).toFixed(4)}</Tooltip> : '-' },
      { title: '状态', width: 90, render: (_: any, r: any) => <Tooltip title={r.error_message}><Tag color={ITEM_STATUS[r.status]?.color}>{ITEM_STATUS[r.status]?.label || r.status}</Tag></Tooltip> },
      { title: '操作', width: 120, render: (_: any, r: any) => (
        <Space size="small">
          {!taskBusy && r.status !== 'success' && <Popconfirm title="从任务移除？" onConfirm={() => handleRemoveItem(r.id)} okText="移除" cancelText="取消"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
          {!taskBusy && r.status !== 'pending' && <Tooltip title="重置为待处理（重跑）"><Button type="text" size="small" icon={<ReloadOutlined />} style={{ color: '#fa8c16' }} onClick={async () => { await resetLog(r.id); fetchTasks(); }} /></Tooltip>}
          {r.status !== 'pending' && <Tooltip title="查看结果与日志"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openLogView(r)} /></Tooltip>}
        </Space>
      ) },
    ];

    return (
      <div style={{ maxWidth: 1480, margin: '0 auto' }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setActiveTaskId(null)} type="text">返回任务列表</Button>
          {!taskBusy && (
            <Popconfirm title="删除这个任务？" description="画像日志会一起删除，已入库的画像与子实体保留。" onConfirm={() => handleDeleteTask(activeTask.id)} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
              <Button type="text" danger icon={<DeleteOutlined />}>删除任务</Button>
            </Popconfirm>
          )}
        </div>
        <Card variant="borderless" style={{ marginBottom: 16, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <Title level={4} style={{ margin: 0 }}>
                {activeTask.name}
                <Tag color={STATUS_MAP[activeTask.status]?.color || 'default'} style={{ marginLeft: 12 }}>{STATUS_MAP[activeTask.status]?.icon} {STATUS_MAP[activeTask.status]?.label || activeTask.status}</Tag>
                {activeTask.skip_filled && <Tag color="cyan">只跑缺的</Tag>}
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>主题：{topicLabels}{activeTask.notes ? ` · ${activeTask.notes}` : ''}</Text>
            </div>
            <Space>
              {[{ v: progress.total, l: '企业数', c: '#2f54eb', bg: '#f0f5ff' }, { v: activeTask.fields_total, l: '新增字段', c: '#52c41a', bg: '#f6ffed' }, { v: activeTask.entities_total, l: '子实体', c: '#722ed1', bg: '#f9f0ff' }, { v: `$${activeTask.cost_usd.toFixed(3)}`, l: '成本', c: '#fa8c16', bg: '#fff7e6' }].map(m => (
                <div key={m.l} style={{ textAlign: 'center', padding: '4px 14px', background: m.bg, borderRadius: 8 }}><div style={{ fontSize: 18, fontWeight: 700, color: m.c }}>{m.v}</div><div style={{ fontSize: 10, color: '#999' }}>{m.l}</div></div>
              ))}
            </Space>
          </div>
          {progress.total > 0 && <Progress style={{ marginTop: 16 }} percent={pct} status={taskBusy ? 'active' : (activeTask.status === 'failed' ? 'exception' : undefined)} format={() => `${progress.completed}/${progress.total} 完成${progress.failed ? ` · ${progress.failed} 失败` : ''}`} />}
        </Card>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {!taskBusy && (<>
            <Button icon={<DatabaseOutlined />} onClick={() => { setPickOpen(true); setPickedKeys([]); loadPick(); }}>从企业库选择</Button>
            <Button icon={<PlusOutlined />} onClick={() => { setAddOpen(true); setAddName(''); setAddPicked(null); }}>添加一家</Button>
            <Button icon={<EditOutlined />} onClick={() => { setPasteOpen(true); setPasteText(''); }}>粘贴名单</Button>
            {(items || []).length > 0 && <Popconfirm title="重置所有企业并重跑？" onConfirm={async () => { await Promise.all(items.map((l: any) => resetLog(l.id))); fetchTasks(); }} okText="确认" cancelText="取消"><Button icon={<ReloadOutlined />} style={{ color: '#fa8c16' }}>全任务重跑</Button></Popconfirm>}
          </>)}
          {canRun && <Button type="primary" icon={<RocketOutlined />} onClick={handleRunTask}>启动画像</Button>}
          {runner.isRunning && !runner.isPaused && <Button icon={<PauseCircleOutlined />} onClick={runner.pause} style={{ color: '#fa8c16', borderColor: '#fa8c16' }}>暂停</Button>}
          {runner.isRunning && runner.isPaused && <Button type="primary" icon={<RocketOutlined />} onClick={runner.resume} style={{ background: '#52c41a', borderColor: '#52c41a' }}>继续</Button>}
          {taskBusy && <Button danger icon={<StopOutlined />} onClick={handleStop}>{runner.isRunning ? '停止' : '重置运行状态'}</Button>}
          {runner.isRunning && currentLogId && <Button onClick={() => { const l = items.find((x: any) => x.id === currentLogId); if (l) setActiveLog({ ...l, status: 'running' }); }}>看实时流水 →</Button>}
          {progress.completed > 0 && <Button onClick={() => router.push('/admin/health-company')}>看画像健康 →</Button>}
        </div>

        <Card variant="borderless" style={{ borderRadius: 12 }}>
          <Table dataSource={items || []} columns={columns} rowKey="id" pagination={false} size="small" scroll={{ x: 900 }}
            rowClassName={(r: any) => runner.isRunning && r.id === currentLogId ? 'ant-table-row-selected' : ''}
            locale={{ emptyText: <Empty description="还没有企业。从企业库选择、粘贴名单或添加一家。" /> }} />
        </Card>

        <Modal title="添加一家企业" open={addOpen} onCancel={() => setAddOpen(false)} okText="添加" destroyOnHidden
          onOk={async () => { const ok = await addCompanies(addPicked ? { companyIds: [addPicked.id] } : { names: [addName] }); if (ok) setAddOpen(false); }}>
          <CompanyPicker size="middle" value={addName} onChange={setAddName} picked={addPicked} onPick={setAddPicked} />
          <div style={{ fontSize: 12, color: BRAND.ink4, marginTop: 6 }}>库里没有的企业会自动建档。</div>
        </Modal>

        <Modal title="粘贴企业名单" open={pasteOpen} onCancel={() => setPasteOpen(false)} okText="添加" destroyOnHidden
          onOk={async () => { const names = pasteText.split(/[\n,，;；]/).map(s => s.trim()).filter(Boolean); if (!names.length) { message.warning('名单为空'); return; } const ok = await addCompanies({ names }); if (ok) setPasteOpen(false); }}>
          <Input.TextArea rows={10} value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder={'一行一家，或用逗号分隔：\n宁德时代\n比亚迪\nUnilever'} />
          <div style={{ fontSize: 12, color: BRAND.ink4, marginTop: 6 }}>库里没有的自动建档；同名企业按名称 / 英文名 / 别名匹配。</div>
        </Modal>

        <Modal title="从企业库选择" open={pickOpen} onCancel={() => setPickOpen(false)} width={960}
          okText={`添加 ${pickedKeys.length} 家`} okButtonProps={{ disabled: pickedKeys.length === 0 }}
          onOk={async () => { if (await addCompanies({ companyIds: pickedKeys as number[] })) { setPickOpen(false); setPickedKeys([]); } }}>
          <Space style={{ marginBottom: 12 }} wrap>
            <Select value={pickSegment} style={{ width: 150 }} onChange={v => { setPickSegment(v); loadPick(v, pickSearch); }} options={[{ value: '', label: '全部分类' }, ...SEGMENT_OPTIONS, { value: 'none', label: '未分类' }]} />
            <Input.Search placeholder="搜索企业 / 英文名 / 行业" allowClear style={{ width: 300 }} onSearch={v => { setPickSearch(v); loadPick(pickSegment, v); }} />
            <Checkbox checked={pickOnlyUncrawled} onChange={e => setPickOnlyUncrawled(e.target.checked)}>只看没跑过画像流水线的</Checkbox>
            <Button size="small" onClick={() => setPickedKeys(pickRows.filter(r => !pickOnlyUncrawled || !r.profile_crawled_at).map(r => r.id))}>全选筛选结果</Button>
          </Space>
          <Table size="small" loading={pickLoading} dataSource={pickRows.filter(r => !pickOnlyUncrawled || !r.profile_crawled_at)} rowKey="id"
            rowSelection={{ selectedRowKeys: pickedKeys, onChange: keys => setPickedKeys(keys) }}
            pagination={{ pageSize: 10, size: 'small', showSizeChanger: false, showTotal: t => `共 ${t} 家` }}
            columns={[
              { title: '企业', dataIndex: 'name', width: 220, render: (t: string, r: any) => <div><Text strong style={{ fontSize: 12 }}>{t}</Text>{r.name_en && r.name_en !== t && <div style={{ fontSize: 11, color: BRAND.ink3 }}>{r.name_en}</div>}</div> },
              { title: '分类', dataIndex: 'segment', width: 100, render: (s: string) => s ? <Tag color={SEGMENT_LABELS[s]?.color}>{SEGMENT_LABELS[s]?.label}</Tag> : <Text type="secondary">未分类</Text> },
              { title: '行业', dataIndex: 'industry', width: 120, render: (t: string) => t || '-' },
              { title: '完整度', dataIndex: 'completeness_score', width: 90, render: (n: number) => n != null ? <Progress percent={n} size="small" style={{ width: 70 }} /> : '-' },
              { title: '审核', dataIndex: 'human_review_status', width: 90, render: (s: string) => s ? <Tag color={REVIEW_STATUS[s]?.color}>{REVIEW_STATUS[s]?.label}</Tag> : <Tag>未审核</Tag> },
              { title: '上次画像', dataIndex: 'profile_crawled_at', width: 110, render: (t: string) => t ? new Date(t).toLocaleDateString('zh-CN') : <Text type="secondary">未跑过</Text> },
            ]} />
        </Modal>
      </div>
    );
  }

  // ══════════════ 批处理：任务列表 ══════════════
  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      {header}
      {tasksLoading ? <div style={{ textAlign: 'center', marginTop: 80 }}><Spin size="large" /></div>
        : tasks.length === 0 ? <Empty description="暂无任务。新建一个任务，再从企业库挑企业或粘贴名单；只放一家就是单家画像。" style={{ marginTop: 80 }} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tasks.map(task => {
              const status = STATUS_MAP[task.status] || STATUS_MAP.draft;
              const p = task.progress;
              const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
              return (
                <Card key={task.id} hoverable onClick={() => setActiveTaskId(task.id)} style={{ borderRadius: 12, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <Text strong style={{ fontSize: 15 }}>{task.name}</Text>
                        <Tag color={status.color}>{status.icon} {status.label}</Tag>
                        {task.skip_filled && <Tag color="cyan">只跑缺的</Tag>}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{[task.notes, task.created_by, new Date(task.created_at).toLocaleString('zh-CN')].filter(Boolean).join(' · ')}</Text>
                      {p.total > 0 && <Progress percent={pct} size="small" style={{ marginTop: 8, maxWidth: 300 }} format={() => `${p.completed}/${p.total}`} />}
                    </div>
                    <div style={{ display: 'flex', gap: 24 }}>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: BRAND.primary }}>{p.total}</div><div style={{ fontSize: 11, color: '#999' }}>企业数</div></div>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: BRAND.success }}>{task.fields_total}</div><div style={{ fontSize: 11, color: '#999' }}>新增字段</div></div>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#722ed1' }}>{task.entities_total}</div><div style={{ fontSize: 11, color: '#999' }}>子实体</div></div>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#fa8c16' }}>${task.cost_usd.toFixed(2)}</div><div style={{ fontSize: 11, color: '#999' }}>成本</div></div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      <Modal title="新建画像任务" open={createOpen} onOk={handleCreateTask} onCancel={() => setCreateOpen(false)} okText="创建" destroyOnHidden>
        <Form form={createForm} layout="vertical" initialValues={{ topics: PROFILE_TOPICS.map(t => t.key), skip_filled: false }}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}><Input placeholder="例如：产品方名单 · 第一批 200 家 / 单家画像 · 宁德时代" /></Form.Item>
          <Form.Item name="topics" label="检索主题（官方页面定位 / 抓取 / 提取始终执行）">
            <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PROFILE_TOPICS.map(t => <Checkbox key={t.key} value={t.key}><b>{t.label}</b><span style={{ color: BRAND.ink4, fontSize: 12 }}> · {t.desc}</span></Checkbox>)}
            </Checkbox.Group>
          </Form.Item>
          <Form.Item name="skip_filled" valuePropName="checked"><Checkbox>只跑缺的（目标字段已齐、子实体已有的主题跳过，省钱）</Checkbox></Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea placeholder="可选" rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function ToolCompanyPage() {
  return <Suspense><ToolCompanyInner /></Suspense>;
}
