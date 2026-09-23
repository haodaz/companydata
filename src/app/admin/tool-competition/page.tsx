'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Checkbox, Empty, Form, Input, InputNumber, Modal, Popconfirm, Progress, Select, Space, Spin, Switch, Table, Tag, Tooltip, Typography, App } from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, DatabaseOutlined, DeleteOutlined, EditOutlined, EyeOutlined,
  PauseCircleOutlined, PlusOutlined, ReloadOutlined, RocketOutlined, StopOutlined, SyncOutlined, TrophyOutlined,
} from '@ant-design/icons';
import { PageHeader } from '@/components/admin/PageHeader';
import { CompanyPicker, PickedCompany } from '@/components/admin/CompanyPicker';
import { CompetitionRunView, RewardTags } from '@/components/admin/CompetitionRunView';
import { useModel } from '@/lib/model-context';
import { useUser } from '@/lib/user-context';
import { BRAND } from '@/lib/theme';
import { SEGMENT_LABELS, SEGMENT_OPTIONS } from '@/lib/company-fields';
import { COMPETITION_KIND_LABELS, REWARD_KEYS, REWARD_LABELS, SEARCH_REGION_OPTIONS } from '@/lib/competition-fields';
import { runCompetitionSearch, patchSearch, type PipelineEvent, type RadarRow } from '@/lib/competition-radar-client';

const { Text, Title } = Typography;

const STATUS_MAP: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  draft: { color: 'default', icon: <EditOutlined />, label: '草稿' }, running: { color: 'processing', icon: <SyncOutlined spin />, label: '运行中' },
  completed: { color: 'success', icon: <CheckCircleOutlined />, label: '已完成' }, failed: { color: 'error', icon: <CloseCircleOutlined />, label: '失败' },
};
const ITEM_STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '待处理' }, running: { color: 'processing', label: '处理中' }, success: { color: 'success', label: '成功' }, failed: { color: 'error', label: '失败' },
};
const DEFAULT_CFG = { kinds: [] as string[], region: 'all', rewards: ['hardware', 'cash', 'internship', 'offer'], onlyOpen: true, count: 12, enrich: true };
const patchTask = (body: any) => fetch('/api/admin/competition-tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** 检索配置表单（新增一条 / 从企业库批量 / 粘贴主题 共用） */
function ConfigFields({ withTarget, company, setCompany, picked, setPicked }: { withTarget?: boolean; company?: string; setCompany?: (v: string) => void; picked?: PickedCompany | null; setPicked?: (c: PickedCompany | null) => void }) {
  return (
    <>
      {withTarget && (
        <>
          <Form.Item name="query" label="检索主题"><Input.TextArea rows={2} placeholder="例如：AI 黑客松 送笔记本 / Web coding 大赛 / 大学生商业案例赛（可空，只按主办企业查）" /></Form.Item>
          <Form.Item label="主办企业（可选）"><CompanyPicker size="middle" value={company || ''} onChange={setCompany!} picked={picked} onPick={setPicked} placeholder="只查这家企业办的比赛，如 华为 / 阿里云 / 联合利华" /></Form.Item>
        </>
      )}
      <Form.Item name="rewards" label="奔着什么奖励去 🎁">
        <Checkbox.Group style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
          {REWARD_KEYS.map(k => <Checkbox key={k} value={k}><Tooltip title={REWARD_LABELS[k].hint}>{REWARD_LABELS[k].emoji} {REWARD_LABELS[k].label}</Tooltip></Checkbox>)}
        </Checkbox.Group>
      </Form.Item>
      <Form.Item name="kinds" label="赛事类型（不选 = 全部）">
        <Checkbox.Group style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
          {Object.entries(COMPETITION_KIND_LABELS).filter(([k]) => k !== 'other').map(([k, m]) => <Checkbox key={k} value={k}>{m.label}</Checkbox>)}
        </Checkbox.Group>
      </Form.Item>
      <Space wrap>
        <Form.Item name="region" label="地域"><Select options={SEARCH_REGION_OPTIONS} style={{ width: 150 }} /></Form.Item>
        <Form.Item name="count" label="候选数"><InputNumber min={3} max={30} /></Form.Item>
        <Form.Item name="onlyOpen" label="只要可报名" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="enrich" label="抓官方页补全" valuePropName="checked"><Switch /></Form.Item>
      </Space>
    </>
  );
}

function ToolCompetitionInner() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useSearchParams();
  const { currentModel } = useModel();
  const { user } = useUser();

  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [addCompany, setAddCompany] = useState('');
  const [addPicked, setAddPicked] = useState<PickedCompany | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickForm] = Form.useForm();
  const [pickRows, setPickRows] = useState<any[]>([]);
  const [pickLoading, setPickLoading] = useState(false);
  const [pickedKeys, setPickedKeys] = useState<React.Key[]>([]);
  const [pickSegment, setPickSegment] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteForm] = Form.useForm();
  const deepLinkHandled = useRef<string | null>(null);

  // 运行状态
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);
  const abortRef = useRef(false);
  const runningTaskIdRef = useRef<string | null>(null);
  const [currentItemId, setCurrentItemId] = useState<number | null>(null);
  const currentItemIdRef = useRef<number | null>(null);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [rows, setRows] = useState<RadarRow[]>([]);
  const [summary, setSummary] = useState('');
  const waitIfPaused = async () => { while (pausedRef.current && !abortRef.current) await new Promise(r => setTimeout(r, 500)); return !abortRef.current; };
  const setCurrent = (id: number | null) => { currentItemIdRef.current = id; setCurrentItemId(id); };

  const fetchTasks = useCallback(async () => {
    try { const j = await (await fetch('/api/admin/competition-tasks')).json(); if (j.ok) setTasks(j.tasks || []); else message.error(j.error || '任务列表加载失败'); }
    catch (e) { console.error(e); } finally { setTasksLoading(false); }
  }, []);
  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  // 任务在别的窗口 / 别人的浏览器里跑时，这里每 8 秒拉一次进度
  useEffect(() => {
    if (isRunning || !tasks.some(t => t.status === 'running')) return;
    const timer = setInterval(fetchTasks, 8000);
    return () => clearInterval(timer);
  }, [isRunning, tasks, fetchTasks]);

  // 从企业详情带 ?company=&companyId= 进来：建一个只查这家企业的任务
  useEffect(() => {
    const name = params.get('company'); const cid = parseInt(params.get('companyId') || '');
    if (!name || deepLinkHandled.current === name) return;
    deepLinkHandled.current = name;
    (async () => {
      try {
        const created = await (await fetch('/api/admin/competition-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `赛事 · ${name}`, model_id: currentModel, created_by: user?.email || '' }) })).json();
        if (!created.ok) throw new Error(created.error);
        await fetch('/api/admin/competition-tasks/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: created.task.id, items: [{ query: '', company: name, companyId: cid || undefined, ...DEFAULT_CFG }] }) });
        await fetchTasks(); setActiveTaskId(created.task.id); router.replace('/admin/tool-competition');
      } catch (e: any) { message.error(`建任务失败: ${e.message}`); }
    })();
  }, [params, currentModel, user?.email, fetchTasks, router]);

  const openItemView = async (it: any) => {
    if (isRunning && currentItemIdRef.current === it.id) { setActiveItem(it); return; }
    if (isRunning) { message.info('任务运行中，结束后可查看其他条目'); return; }
    setEvents([]); setRows([]); setSummary(''); setActiveItem(it);
    try {
      const j = await (await fetch(`/api/admin/competition-searches?id=${it.id}`)).json();
      const sr = j.ok ? j.search : it;
      setEvents(sr.structured_json?.pipeline_log?.length ? sr.structured_json.pipeline_log : [{ key: 'h', title: sr.error_message ? `❌ ${sr.error_message}` : sr.status === 'pending' ? '尚未运行' : '✅ 已完成', status: sr.error_message ? 'error' : 'success', color: sr.error_message ? 'red' : 'green' }]);
      setSummary(sr.structured_json?.ai_summary || '');
      const comps: any[] = sr.structured_json?.competitions || [];
      const pages: any[] = sr.raw_pages || [];
      setRows(comps.map((c, i) => ({ key: `${i}-${c.name}`, candidate: c, fields: c, sources: {}, summary: null, page: pages.find(p => p.url && (p.url === c.official_url || p.url === c.registration_url)) || null, state: 'done' })));
      setActiveItem(sr);
    } catch { setEvents([{ key: 'e', title: '记录加载失败', status: 'error', color: 'red' }]); }
  };

  const runOne = async (it: any) => {
    setEvents([]); setRows([]); setSummary('');
    setCurrent(it.id);
    setActiveItem({ ...it, status: 'running', model_id: currentModel });
    const r = await runCompetitionSearch(it, currentModel, { onEvents: setEvents, onRows: setRows, onSummary: setSummary, waitIfPaused });
    try { const j = await (await fetch(`/api/admin/competition-searches?id=${it.id}`)).json(); if (j.ok) setActiveItem(j.search); } catch { /* ignore */ }
    return r;
  };

  const handleRunTask = async () => {
    const task = tasks.find(t => t.id === activeTaskId);
    if (!task) return;
    const pending = (task.items || []).filter((i: any) => i.status !== 'success');
    if (!pending.length) { message.warning('没有待处理的检索'); return; }
    setIsRunning(true); setIsPaused(false); pausedRef.current = false; abortRef.current = false; runningTaskIdRef.current = task.id;
    await patchTask({ id: task.id, status: 'running' }); await fetchTasks();
    let ok = 0, bad = 0, found = 0, saved = 0;
    for (const it of pending) {
      if (!(await waitIfPaused())) break;
      const r = await runOne(it);
      if (r.status === 'success') { ok++; found += r.found; saved += (r.saved?.inserted || 0) + (r.saved?.updated || 0); } else if (r.status === 'failed') bad++; else break;
      await fetchTasks();
    }
    const aborted = abortRef.current;
    await patchTask({ id: task.id, status: aborted ? 'draft' : (bad === pending.length ? 'failed' : 'completed') });
    setIsRunning(false); runningTaskIdRef.current = null; setCurrent(null); await fetchTasks();
    if (aborted) message.info('任务已停止'); else message.success(`任务完成！成功 ${ok}/${pending.length}，失败 ${bad}，候选 ${found} 个，入库 ${saved} 条`);
  };
  const resetItem = (id: number) => patchSearch({ id, status: 'pending', error_message: null });
  const handleStop = async () => {
    abortRef.current = true; pausedRef.current = false; setIsPaused(false);
    const taskId = runningTaskIdRef.current || activeTaskId;
    if (!taskId) return;
    await patchTask({ id: taskId, status: 'draft' });
    const task = tasks.find(t => t.id === taskId);
    await Promise.all((task?.items || []).filter((i: any) => i.status === 'running').map((i: any) => resetItem(i.id)));
    if (!isRunning) { await fetchTasks(); message.info('任务已停止'); }
  };

  const handleCreateTask = async () => {
    try {
      const v = await createForm.validateFields();
      const j = await (await fetch('/api/admin/competition-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: v.name, notes: v.notes || '', model_id: currentModel, created_by: user?.email || '' }) })).json();
      if (!j.ok) throw new Error(j.error);
      message.success('任务创建成功'); setCreateOpen(false); createForm.resetFields(); await fetchTasks(); if (j.task?.id) setActiveTaskId(j.task.id);
    } catch (e: any) { if (e?.message) message.error(e.message); }
  };
  const addItems = async (items: any[]) => {
    const j = await (await fetch('/api/admin/competition-tasks/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: activeTaskId, items }) })).json();
    if (!j.ok) { message.error(j.error); return false; }
    message.success(`已添加 ${j.added} 条${j.skipped ? `，跳过 ${j.skipped} 条（重复或为空）` : ''}`); fetchTasks(); return true;
  };
  const loadPick = async (segment = pickSegment, search = '') => {
    setPickLoading(true);
    try { const j = await (await fetch(`/api/db/companies?${new URLSearchParams({ pageSize: '500', search, segment })}`)).json(); setPickRows(j.success ? j.data : []); } catch { setPickRows([]); } finally { setPickLoading(false); }
  };
  const handleDeleteTask = async (id: string) => {
    const j = await (await fetch(`/api/admin/competition-tasks?id=${id}`, { method: 'DELETE' })).json();
    if (j.ok) { message.success('任务已删除（已入库的赛事保留）'); setActiveTaskId(null); fetchTasks(); }
  };
  const handleRemoveItem = async (id: number) => {
    const j = await (await fetch(`/api/admin/competition-tasks/items?id=${id}`, { method: 'DELETE' })).json();
    if (j.ok) { message.success('已移除'); fetchTasks(); }
  };

  const activeTask = tasks.find(t => t.id === activeTaskId);

  // ══════════════ 单条三栏视图 ══════════════
  if (activeItem) {
    return <CompetitionRunView item={activeItem} events={events} rows={rows} summary={summary} running={isRunning} paused={isPaused}
      onBack={() => setActiveItem(null)} onPause={() => { pausedRef.current = true; setIsPaused(true); }} onResume={() => { pausedRef.current = false; setIsPaused(false); }} onStop={handleStop} />;
  }

  // ══════════════ 任务详情 ══════════════
  if (activeTaskId && activeTask) {
    const { progress, items } = activeTask;
    const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
    const taskBusy = isRunning || activeTask.status === 'running';
    const canRun = !taskBusy && (items || []).some((i: any) => i.status !== 'success');
    const columns = [
      { title: '#', width: 46, render: (_: any, __: any, i: number) => i + 1 },
      { title: '检索目标', render: (_: any, r: any) => <div><div style={{ fontWeight: 600 }}>{[r.company, r.query].filter(Boolean).join(' · ') || '—'}</div><div style={{ fontSize: 12, color: BRAND.ink3 }}>{[(r.kinds || []).length ? r.kinds.map((k: string) => COMPETITION_KIND_LABELS[k]?.label).join(' / ') : '全部类型', SEARCH_REGION_OPTIONS.find(o => o.value === r.region)?.label, `候选 ≤ ${r.count}`, r.enrich === false ? '不抓官方页' : null].filter(Boolean).join(' · ')}</div></div> },
      { title: '奖励导向', width: 200, render: (_: any, r: any) => <RewardTags types={r.rewards} /> },
      { title: '候选', dataIndex: 'candidates_found', width: 70, align: 'center' as const, render: (n: number, r: any) => r.status === 'success' ? n : '-' },
      { title: '入库', dataIndex: 'saved', width: 70, align: 'center' as const, render: (n: number, r: any) => r.status === 'success' ? <Text strong style={{ color: n ? BRAND.success : BRAND.ink4 }}>{n}</Text> : '-' },
      { title: '成本', width: 100, render: (_: any, r: any) => r.llm_calls ? <Tooltip title={`${r.llm_calls} 次调用 · ${(r.token_total || 0).toLocaleString()} tokens`}>${Number(r.cost_usd).toFixed(4)}</Tooltip> : '-' },
      { title: '状态', width: 88, render: (_: any, r: any) => <Tooltip title={r.error_message}><Tag color={ITEM_STATUS[r.status]?.color}>{ITEM_STATUS[r.status]?.label || r.status}</Tag></Tooltip> },
      { title: '操作', width: 120, render: (_: any, r: any) => (
        <Space size="small">
          {!taskBusy && r.status !== 'success' && <Popconfirm title="移除这条检索？" onConfirm={() => handleRemoveItem(r.id)} okText="移除" cancelText="取消"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
          {!taskBusy && r.status !== 'pending' && <Tooltip title="重置为待处理（重跑）"><Button type="text" size="small" icon={<ReloadOutlined />} style={{ color: '#fa8c16' }} onClick={async () => { await resetItem(r.id); fetchTasks(); }} /></Tooltip>}
          {r.status !== 'pending' && <Tooltip title="查看候选与日志"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openItemView(r)} /></Tooltip>}
        </Space>
      ) },
    ];
    return (
      <div style={{ maxWidth: 1480, margin: '0 auto' }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setActiveTaskId(null)} type="text">返回任务列表</Button>
          {!taskBusy && <Popconfirm title="删除这个任务？" description="检索记录会一起删除，已入库的赛事保留。" onConfirm={() => handleDeleteTask(activeTask.id)} okText="删除" okButtonProps={{ danger: true }} cancelText="取消"><Button type="text" danger icon={<DeleteOutlined />}>删除任务</Button></Popconfirm>}
        </div>
        <Card variant="borderless" style={{ marginBottom: 16, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <Title level={4} style={{ margin: 0 }}>{activeTask.name}<Tag color={STATUS_MAP[activeTask.status]?.color} style={{ marginLeft: 12 }}>{STATUS_MAP[activeTask.status]?.icon} {STATUS_MAP[activeTask.status]?.label}</Tag></Title>
              {activeTask.notes && <Text type="secondary" style={{ fontSize: 13 }}>{activeTask.notes}</Text>}
            </div>
            <Space>
              {[{ v: progress.total, l: '检索条数', c: '#2f54eb', bg: '#f0f5ff' }, { v: activeTask.found_total, l: '候选赛事', c: '#722ed1', bg: '#f9f0ff' }, { v: activeTask.saved_total, l: '入库', c: '#52c41a', bg: '#f6ffed' }, { v: `$${activeTask.cost_usd.toFixed(3)}`, l: '成本', c: '#fa8c16', bg: '#fff7e6' }].map(m => (
                <div key={m.l} style={{ textAlign: 'center', padding: '4px 14px', background: m.bg, borderRadius: 8 }}><div style={{ fontSize: 18, fontWeight: 700, color: m.c }}>{m.v}</div><div style={{ fontSize: 10, color: '#999' }}>{m.l}</div></div>
              ))}
            </Space>
          </div>
          {progress.total > 0 && <Progress style={{ marginTop: 16 }} percent={pct} status={taskBusy ? 'active' : (activeTask.status === 'failed' ? 'exception' : undefined)} format={() => `${progress.completed}/${progress.total} 完成${progress.failed ? ` · ${progress.failed} 失败` : ''}`} />}
        </Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {!taskBusy && (<>
            <Button icon={<PlusOutlined />} onClick={() => { addForm.setFieldsValue({ query: '', ...DEFAULT_CFG }); setAddCompany(''); setAddPicked(null); setAddOpen(true); }}>添加一条检索</Button>
            <Button icon={<DatabaseOutlined />} onClick={() => { pickForm.setFieldsValue({ ...DEFAULT_CFG }); setPickedKeys([]); setPickOpen(true); loadPick(); }}>从企业库选主办方</Button>
            <Button icon={<EditOutlined />} onClick={() => { pasteForm.setFieldsValue({ text: '', ...DEFAULT_CFG }); setPasteOpen(true); }}>粘贴主题名单</Button>
            {(items || []).length > 0 && <Popconfirm title="重置所有条目并重跑？" onConfirm={async () => { await Promise.all(items.map((i: any) => resetItem(i.id))); fetchTasks(); }} okText="确认" cancelText="取消"><Button icon={<ReloadOutlined />} style={{ color: '#fa8c16' }}>全任务重跑</Button></Popconfirm>}
          </>)}
          {canRun && <Button type="primary" icon={<RocketOutlined />} onClick={handleRunTask}>启动检索</Button>}
          {isRunning && !isPaused && <Button icon={<PauseCircleOutlined />} onClick={() => { pausedRef.current = true; setIsPaused(true); }} style={{ color: '#fa8c16', borderColor: '#fa8c16' }}>暂停</Button>}
          {isRunning && isPaused && <Button type="primary" icon={<RocketOutlined />} onClick={() => { pausedRef.current = false; setIsPaused(false); }} style={{ background: '#52c41a', borderColor: '#52c41a' }}>继续</Button>}
          {taskBusy && <Button danger icon={<StopOutlined />} onClick={handleStop}>{isRunning ? '停止' : '重置运行状态'}</Button>}
          {isRunning && currentItemId && <Button onClick={() => { const it = items.find((x: any) => x.id === currentItemId); if (it) setActiveItem({ ...it, status: 'running' }); }}>看实时流水 →</Button>}
          {activeTask.saved_total > 0 && <Button onClick={() => router.push('/admin/db-competition')}>去赛事库审核 →</Button>}
        </div>
        <Card variant="borderless" style={{ borderRadius: 12 }}>
          <Table dataSource={items || []} columns={columns} rowKey="id" pagination={false} size="small" scroll={{ x: 900 }}
            rowClassName={(r: any) => isRunning && r.id === currentItemId ? 'ant-table-row-selected' : ''}
            locale={{ emptyText: <Empty description="还没有检索条目。添加一条主题、从企业库选主办方，或粘贴主题名单。" /> }} />
        </Card>

        <Modal title="添加一条检索" open={addOpen} onCancel={() => setAddOpen(false)} okText="添加" width={720} destroyOnHidden
          onOk={async () => { const v = await addForm.validateFields(); if (!String(v.query || '').trim() && !addCompany.trim()) { message.warning('主题和主办企业至少填一个'); return; } if (await addItems([{ ...v, company: addCompany, companyId: addPicked?.id }])) setAddOpen(false); }}>
          <Form form={addForm} layout="vertical"><ConfigFields withTarget company={addCompany} setCompany={setAddCompany} picked={addPicked} setPicked={setAddPicked} /></Form>
        </Modal>

        <Modal title="从企业库选主办方（每家一条检索：只查这家企业办的比赛）" open={pickOpen} onCancel={() => setPickOpen(false)} width={980} destroyOnHidden
          okText={`添加 ${pickedKeys.length} 条`} okButtonProps={{ disabled: pickedKeys.length === 0 }}
          onOk={async () => { const cfg = await pickForm.validateFields(); const items = pickRows.filter(r => pickedKeys.includes(r.id)).map(r => ({ ...cfg, query: cfg.query || '', company: r.name, companyId: r.id })); if (await addItems(items)) { setPickOpen(false); setPickedKeys([]); } }}>
          <Form form={pickForm} layout="vertical">
            <Form.Item name="query" label="附加主题（可空，例如：校园 / 黑客松 / 案例赛）"><Input placeholder="留空 = 这家企业办的所有比赛" /></Form.Item>
            <ConfigFields />
          </Form>
          <Space style={{ marginBottom: 12 }} wrap>
            <Select value={pickSegment} style={{ width: 150 }} onChange={v => { setPickSegment(v); loadPick(v); }} options={[{ value: '', label: '全部分类' }, ...SEGMENT_OPTIONS, { value: 'none', label: '未分类' }]} />
            <Input.Search placeholder="搜索企业" allowClear style={{ width: 260 }} onSearch={v => loadPick(pickSegment, v)} />
            <Button size="small" onClick={() => setPickedKeys(pickRows.map(r => r.id))}>全选</Button>
          </Space>
          <Table size="small" loading={pickLoading} dataSource={pickRows} rowKey="id" rowSelection={{ selectedRowKeys: pickedKeys, onChange: setPickedKeys }} pagination={{ pageSize: 8, size: 'small', showSizeChanger: false }}
            columns={[
              { title: '企业', dataIndex: 'name', width: 220, render: (t: string, r: any) => <div><Text strong style={{ fontSize: 12 }}>{t}</Text>{r.name_en && r.name_en !== t && <div style={{ fontSize: 11, color: BRAND.ink3 }}>{r.name_en}</div>}</div> },
              { title: '分类', dataIndex: 'segment', width: 100, render: (s: string) => s ? <Tag color={SEGMENT_LABELS[s]?.color}>{SEGMENT_LABELS[s]?.label}</Tag> : <Text type="secondary">未分类</Text> },
              { title: '行业', dataIndex: 'industry', render: (t: string) => t || '-' },
            ]} />
        </Modal>

        <Modal title="粘贴主题名单（一行一条）" open={pasteOpen} onCancel={() => setPasteOpen(false)} okText="添加" width={720} destroyOnHidden
          onOk={async () => { const v = await pasteForm.validateFields(); const lines = String(v.text || '').split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean); if (!lines.length) { message.warning('名单为空'); return; } const { text, ...cfg } = v; void text; if (await addItems(lines.map((q: string) => ({ ...cfg, query: q })))) setPasteOpen(false); }}>
          <Form form={pasteForm} layout="vertical">
            <Form.Item name="text" label="主题"><Input.TextArea rows={6} placeholder={'AI 黑客松 送笔记本\nWeb coding 大赛\n大学生商业案例分析大赛\nKaggle 2026 奖金'} /></Form.Item>
            <ConfigFields />
          </Form>
        </Modal>
      </div>
    );
  }

  // ══════════════ 任务列表 ══════════════
  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <PageHeader icon={<TrophyOutlined />} title="企业赛事雷达" description="奔着奖品去找比赛：给设备 / 给钱 / 给实习 / 给 offer。建任务 → 每条配置一个主题或一家主办企业 → 逐条联网检索候选、抓官方页提取完整字段、写入赛事库（待审核）。历史与成败累积在任务里。"
        extra={<Space><Button icon={<DatabaseOutlined />} onClick={() => router.push('/admin/db-competition')}>赛事库</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建检索任务</Button></Space>} />
      {tasksLoading ? <div style={{ textAlign: 'center', marginTop: 80 }}><Spin size="large" /></div>
        : tasks.length === 0 ? <Empty description="暂无任务。新建一个任务，加几条检索主题或主办企业，奔着奖品去。" style={{ marginTop: 80 }} />
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tasks.map(task => {
            const st = STATUS_MAP[task.status] || STATUS_MAP.draft; const p = task.progress; const pct = p.total ? Math.round((p.completed / p.total) * 100) : 0;
            return (
              <Card key={task.id} hoverable onClick={() => setActiveTaskId(task.id)} style={{ borderRadius: 12, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}><Text strong style={{ fontSize: 15 }}>{task.name}</Text><Tag color={st.color}>{st.icon} {st.label}</Tag></div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{[task.notes, task.created_by, new Date(task.created_at).toLocaleString('zh-CN')].filter(Boolean).join(' · ')}</Text>
                    {p.total > 0 && <Progress percent={pct} size="small" style={{ marginTop: 8, maxWidth: 300 }} format={() => `${p.completed}/${p.total}`} />}
                  </div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    {[{ v: p.total, l: '检索条数', c: BRAND.primary }, { v: task.found_total, l: '候选', c: '#722ed1' }, { v: task.saved_total, l: '入库', c: BRAND.success }, { v: `$${task.cost_usd.toFixed(2)}`, l: '成本', c: '#fa8c16' }].map(m => (
                      <div key={m.l} style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: m.c }}>{m.v}</div><div style={{ fontSize: 11, color: '#999' }}>{m.l}</div></div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>}
      <Modal title="新建赛事检索任务" open={createOpen} onOk={handleCreateTask} onCancel={() => setCreateOpen(false)} okText="创建" destroyOnHidden>
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}><Input placeholder="例如：2026 秋 · 送电脑的黑客松 / 大厂校招直通赛" /></Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} placeholder="可选" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function ToolCompetitionPage() {
  return <Suspense><ToolCompetitionInner /></Suspense>;
}
