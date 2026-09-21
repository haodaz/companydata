'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Input, Button, Spin, Typography, Space, Tag, Table, Progress, Modal, Form, Upload, Popconfirm, Tooltip, Empty, Timeline, Radio, Select, App } from 'antd';
import { PageHeader } from '@/components/admin/PageHeader';
import {
  FileTextOutlined, SyncOutlined, ArrowLeftOutlined, PlusOutlined, RocketOutlined, DeleteOutlined, UploadOutlined,
  CodeOutlined, CheckCircleOutlined, CloseCircleOutlined, EditOutlined, EyeOutlined, DatabaseOutlined,
  PauseCircleOutlined, ReloadOutlined, StopOutlined, ApiOutlined,
} from '@ant-design/icons';
import { useModel } from '@/lib/model-context';
import { useUser } from '@/lib/user-context';
import { CompanyPicker, PickedCompany } from '@/components/admin/CompanyPicker';
import { JOB_FIELDS, JOB_TYPE_LABELS, formatJobValue } from '@/lib/job-fields';
import { URL_TYPE_OPTIONS, EXTRACTABLE_URL_TYPES, urlTypeMeta, subtypeLabel } from '@/lib/url-types';
import { BRAND } from '@/lib/theme';

const { Title, Text } = Typography;

const STATUS_MAP: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  draft:     { color: 'default',    icon: <EditOutlined />,        label: '草稿' },
  running:   { color: 'processing', icon: <SyncOutlined spin />,   label: '运行中' },
  completed: { color: 'success',    icon: <CheckCircleOutlined />, label: '已完成' },
  failed:    { color: 'error',      icon: <CloseCircleOutlined />, label: '失败' },
};

const URL_STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending: { color: 'default',    label: '待处理' },
  running: { color: 'processing', label: '处理中' },
  success: { color: 'success',    label: '成功' },
  failed:  { color: 'error',      label: '失败' },
};

const SCOPE_LABELS: Record<string, string> = { campus: '仅校招 / 实习 / 专项', all: '含社招' };

interface PipelineEvent {
  key: string;
  title: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  color?: string;
}

const patchLog = (body: Record<string, any>) => fetch('/api/admin/journal-job', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(r => r.json()).catch(() => ({}));

const patchTask = (body: Record<string, any>) => fetch('/api/admin/job-tasks', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const urlStatusOf = (r: any) => r.structurer_status === 'success' ? 'success'
  : (r.fetcher_status === 'failed' || r.structurer_status === 'failed') ? 'failed'
  : r.fetcher_status === 'running' ? 'running' : 'pending';

export default function ToolJobPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { currentModel } = useModel();
  const { user } = useUser();

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeUrlLog, setActiveUrlLog] = useState<any>(null);

  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();

  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [addUrlForm] = Form.useForm();
  const [addCompany, setAddCompany] = useState('');
  const [addPicked, setAddPicked] = useState<PickedCompany | null>(null);

  const [pickUrlOpen, setPickUrlOpen] = useState(false);
  const [dbUrls, setDbUrls] = useState<any[]>([]);
  const [dbUrlsLoading, setDbUrlsLoading] = useState(false);
  const [pickedKeys, setPickedKeys] = useState<React.Key[]>([]);
  const [pickType, setPickType] = useState<string>('campus');
  const [pickSearch, setPickSearch] = useState('');

  // ── Pipeline execution state (client-side orchestration) ──
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);
  const abortRef = useRef(false);
  const runningTaskIdRef = useRef<string | null>(null);
  const eventsRef = useRef<PipelineEvent[]>([]);
  const currentLogIdRef = useRef<number | null>(null);
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([]);
  const [pipelineMarkdown, setPipelineMarkdown] = useState('');
  const [pipelineData, setPipelineData] = useState<any>(null);
  const [showMarkdown, setShowMarkdown] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/job-tasks');
      const json = await res.json();
      if (json.ok) setTasks(json.tasks || []);
      else message.error(json.error || '任务列表加载失败');
    } catch (e) { console.error('fetchTasks error:', e); }
    finally { setTasksLoading(false); }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // ── Event helpers（用 ref 同步保存，落库时拿到的是完整日志而不是过期的 state）──
  const setEvents = (next: PipelineEvent[]) => { eventsRef.current = next; setPipelineEvents(next); };
  const addEvent = (event: PipelineEvent) => setEvents([...eventsRef.current, event]);
  const updateLastEvent = (updates: Partial<PipelineEvent>) => {
    const next = [...eventsRef.current];
    if (next.length > 0) next[next.length - 1] = { ...next[next.length - 1], ...updates };
    setEvents(next);
  };

  const waitIfPaused = async () => {
    while (pausedRef.current && !abortRef.current) await new Promise(r => setTimeout(r, 500));
    return !abortRef.current;
  };

  // ── 查看已处理的单个 URL ──
  const openUrlView = async (record: any) => {
    // 正在处理的这一条：直接看实时流水，不要清空
    if (isRunning && currentLogIdRef.current === record.id) { setActiveUrlLog(record); return; }
    if (isRunning) { message.info('任务运行中，结束后可查看其他 URL 的结果'); return; }
    setEvents([]);
    setPipelineMarkdown('');
    setPipelineData(null);
    setActiveUrlLog(record);
    try {
      const res = await fetch(`/api/admin/journal-job?logId=${record.id}`);
      const json = await res.json();
      const log = json.ok && json.log ? json.log : record;
      const saved = log.structured_json?.pipeline_log;
      setEvents(saved?.length ? saved : [{ key: 'done', title: log.error_message ? `❌ ${log.error_message}` : '✅ 已完成', status: log.error_message ? 'error' : 'success', color: log.error_message ? 'red' : 'green' }]);
      setPipelineMarkdown(log.raw_markdown || '');
      setPipelineData(log.structured_json || null);
    } catch {
      setEvents([{ key: 'done', title: '日志加载失败', status: 'error', color: 'red' }]);
    }
  };

  // ── Process single URL (Fetcher → Structurer → 入库) ──
  const processSingleUrl = async (log: any, urlIndex: number, totalUrls: number, scope: string) => {
    setEvents([]);
    setPipelineMarkdown('');
    setPipelineData(null);

    const batchId = Date.now();
    const modelId = currentModel;
    const fail = async (msg: string, extra: Record<string, any> = {}) => {
      await patchLog({ id: log.id, fetcher_status: 'failed', structurer_status: 'failed', error_message: msg, ...extra });
      return { status: 'failed' as const, error: msg };
    };

    addEvent({ key: 'url-start', title: `🌐 [${urlIndex + 1}/${totalUrls}] ${log.company ? `${log.company} · ` : ''}${log.target_url}`, status: 'success', color: 'blue' });
    await patchLog({ id: log.id, fetcher_status: 'running', structurer_status: 'pending', error_message: null });

    try {
      // ── STEP 1: 主页 + 选子页面 ──
      addEvent({ key: 'fetch-1', title: '步骤 1: 正在抓取页面，并让大模型挑选岗位 / 项目子页面...', status: 'loading', color: 'blue' });
      const initRes = await fetch('/api/agents/fetcher/init', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: log.target_url, model: modelId, batchId, hint: log.hint, scope }),
      });
      const initData = await initRes.json();
      if (!initData.success) {
        const msg = initData.error_message || initData.error || '未知错误';
        updateLastEvent({ status: 'error', color: 'red', title: `页面抓取失败: ${msg}` });
        return fail(msg);
      }

      let finalMarkdown: string = initData.base_markdown;
      setPipelineMarkdown(finalMarkdown);
      const candidateUrls: string[] = initData.candidate_urls || [];
      const fetchedSubPages: string[] = [];

      if (candidateUrls.length === 0) {
        updateLastEvent({ status: 'success', color: 'green', title: '步骤 1 完成: 页面抓取成功，未发现需要继续抓取的子页面。' });
      } else {
        updateLastEvent({ status: 'success', color: 'green', title: `步骤 1 完成: 挖掘到 ${candidateUrls.length} 个候选子页面。` });

        // ── STEP 2: 分批抓取子页面 ──
        const BATCH_SIZE = 3;
        const totalBatches = Math.ceil(candidateUrls.length / BATCH_SIZE);
        for (let i = 0; i < candidateUrls.length; i += BATCH_SIZE) {
          if (!(await waitIfPaused())) return { status: 'aborted' as const };
          const batchUrls = candidateUrls.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          addEvent({ key: `batch-${batchNum}`, title: `步骤 2.${batchNum}: 并发抓取 Batch ${batchNum}/${totalBatches}（${batchUrls.length} 个子页面）...`, status: 'loading', color: 'blue' });

          const batchRes = await fetch('/api/agents/fetcher/batch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: batchUrls, model: modelId, batchId }),
          });
          const batchData = await batchRes.json();
          if (batchData.success) {
            finalMarkdown += batchData.useful_markdown;
            fetchedSubPages.push(...(batchData.useful_urls || []));
            setPipelineMarkdown(finalMarkdown);
            updateLastEvent({ status: 'success', color: 'green', title: `Batch ${batchNum} 完成: ${batchData.useful_urls?.length || 0}/${batchUrls.length} 个页面含岗位信息` });
          } else {
            updateLastEvent({ status: 'error', color: 'red', title: `Batch ${batchNum} 失败: ${batchData.error_message || batchData.error}` });
          }
        }
      }
      addEvent({ key: 'fetch-done', title: `抓取完成，汇总 Markdown 共 ${finalMarkdown.length.toLocaleString()} 字符。`, status: 'success', color: 'green' });
      if (!(await waitIfPaused())) return { status: 'aborted' as const };

      // ── STEP 3: 结构化 ──
      addEvent({ key: 'struct-1', title: '步骤 3: 大模型正在提取校招项目与岗位...', status: 'loading', color: 'blue' });
      const structRes = await fetch('/api/agents/structurer-job', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: finalMarkdown, company: log.company, hint: log.hint, model: modelId, batchId, scope }),
      });
      const structData = await structRes.json();
      if (!structData.result) {
        updateLastEvent({ status: 'error', color: 'red', title: `大模型未能返回有效 JSON${structData.error ? `: ${structData.error}` : ''}` });
        await patchLog({ id: log.id, fetcher_status: 'success', structurer_status: 'failed', raw_markdown: finalMarkdown.substring(0, 500000), markdown_len: finalMarkdown.length, sub_pages_fetched: fetchedSubPages, error_message: 'Structurer returned no result' });
        return { status: 'failed' as const, error: 'Structurer failed' };
      }
      const jobCount = structData.result.jobs?.length || 0;
      setPipelineData(structData.result);
      updateLastEvent({ status: 'success', color: jobCount ? 'green' : 'orange', title: `步骤 3 完成: 提取到 ${jobCount} 个岗位 / 项目。` });

      // ── STEP 4: 落库（日志 + 岗位实体库）──
      addEvent({ key: 'save', title: '步骤 4: 正在写入岗位实体库...', status: 'loading', color: 'blue' });
      const doneEvents = [...eventsRef.current];
      const saved = await patchLog({
        id: log.id,
        raw_markdown: finalMarkdown.substring(0, 500000),
        markdown_len: finalMarkdown.length,
        sub_pages_fetched: fetchedSubPages,
        fetcher_status: 'success',
        structurer_status: 'success',
        structured_json: { ...structData.result, pipeline_log: doneEvents.slice(0, -1) },
        model_id: modelId,
        batch_id: batchId,
      });
      if (saved.storeError) updateLastEvent({ status: 'error', color: 'red', title: `岗位入库失败: ${saved.storeError}` });
      else updateLastEvent({ status: 'success', color: 'green', title: `✅ 完成！${saved.jobsSaved || 0} 个岗位已写入校招岗位库（待审核）。` });

      return { status: 'success' as const, jobs: jobCount };
    } catch (e: any) {
      addEvent({ key: 'error', title: `❌ 处理异常: ${e.message}`, status: 'error', color: 'red' });
      return fail(e.message);
    }
  };

  // ── Run task ──
  const handleRunTask = async () => {
    const task = tasks.find(t => t.id === activeTaskId);
    if (!task) return;

    const pendingUrls = (task.urls || []).filter((u: any) => urlStatusOf(u) !== 'success');
    if (pendingUrls.length === 0) { message.warning('没有待处理的 URL'); return; }

    setIsRunning(true);
    setIsPaused(false);
    pausedRef.current = false;
    abortRef.current = false;
    runningTaskIdRef.current = task.id;

    await patchTask({ id: task.id, status: 'running' });
    await fetchTasks();

    let successCount = 0, failCount = 0, jobsTotal = 0;
    for (let i = 0; i < pendingUrls.length; i++) {
      if (!(await waitIfPaused())) break;
      currentLogIdRef.current = pendingUrls[i].id;
      const result = await processSingleUrl(pendingUrls[i], i, pendingUrls.length, task.scope || 'campus');
      if (result.status === 'success') { successCount++; jobsTotal += result.jobs || 0; }
      else if (result.status === 'failed') failCount++;
      else break;
      await fetchTasks();
    }

    const aborted = abortRef.current;
    await patchTask({ id: task.id, status: aborted ? 'draft' : (failCount === pendingUrls.length ? 'failed' : 'completed') });
    setIsRunning(false);
    runningTaskIdRef.current = null;
    currentLogIdRef.current = null;
    await fetchTasks();
    if (aborted) message.info('任务已停止');
    else message.success(`任务完成！成功 ${successCount}/${pendingUrls.length}，失败 ${failCount}，共提取 ${jobsTotal} 个岗位`);
  };

  const resetLog = (id: number) => patchLog({ id, fetcher_status: 'pending', structurer_status: 'pending', error_message: null });

  const handleRetryUrl = async (logId: number) => { await resetLog(logId); message.success('已重置为待处理'); fetchTasks(); };

  const handleRetryAll = async () => {
    const task = tasks.find(t => t.id === activeTaskId);
    await Promise.all((task?.urls || []).map((u: any) => resetLog(u.id)));
    message.success('全任务已重置为待处理');
    fetchTasks();
  };

  const handlePause = () => { pausedRef.current = true; setIsPaused(true); };
  const handleResume = () => { pausedRef.current = false; setIsPaused(false); };
  const handleStop = async () => {
    abortRef.current = true;
    pausedRef.current = false;
    setIsPaused(false);
    const taskId = runningTaskIdRef.current || activeTaskId;
    if (!taskId) return;
    // 页面刷新后残留的 running 状态也能在这里清掉
    await patchTask({ id: taskId, status: 'draft' });
    const task = tasks.find(t => t.id === taskId);
    await Promise.all((task?.urls || []).filter((u: any) => u.fetcher_status === 'running').map((u: any) => resetLog(u.id)));
    if (!isRunning) { await fetchTasks(); message.info('任务已停止'); }
  };

  const handleCreateTask = async () => {
    try {
      const values = await createForm.validateFields();
      const res = await fetch('/api/admin/job-tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: values.name, notes: values.notes || '', scope: values.scope, model_id: currentModel, created_by: user?.email || '' }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      message.success('任务创建成功');
      setCreateOpen(false);
      createForm.resetFields();
      await fetchTasks();
      if (json.task?.id) setActiveTaskId(json.task.id);
    } catch (e: any) { if (e?.message) message.error(e.message); }
  };

  const addUrlsToTask = async (urls: any[]) => {
    const res = await fetch('/api/admin/job-tasks/urls', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: activeTaskId, urls }),
    });
    const json = await res.json();
    if (!json.ok) { message.error(json.error); return false; }
    message.success(`已添加 ${json.added} 个 URL${json.skipped ? `，跳过 ${json.skipped} 个（重复或无效）` : ''}`);
    fetchTasks();
    return true;
  };

  const handleAddUrl = async () => {
    try {
      const values = await addUrlForm.validateFields();
      const ok = await addUrlsToTask([{ url: values.url, company: addCompany, company_id: addPicked?.id, hint: values.hint || '' }]);
      if (ok) { setAddUrlOpen(false); addUrlForm.resetFields(); }
    } catch { /* 表单校验未通过 */ }
  };

  const handleRemoveUrl = async (logId: number) => {
    const res = await fetch(`/api/admin/job-tasks/urls?logId=${logId}`, { method: 'DELETE' });
    if ((await res.json()).ok) { message.success('已移除'); fetchTasks(); }
  };

  const handleDeleteTask = async (id: string) => {
    const res = await fetch(`/api/admin/job-tasks?id=${id}`, { method: 'DELETE' });
    if ((await res.json()).ok) { message.success('任务已删除（已入库的岗位保留）'); setActiveTaskId(null); fetchTasks(); }
  };

  // ── CSV：表头 url, company, hint（或中文 链接 / 企业 / 提示）──
  const handleCsvUpload = async (file: File) => {
    const lines = (await file.text()).split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { message.error('CSV 至少需要表头行 + 1 行数据'); return false; }
    const headers = lines[0].replace(/^﻿/, '').split(',').map(h => h.trim().toLowerCase());
    const idx = (...names: string[]) => headers.findIndex(h => names.includes(h));
    const urlIdx = idx('url', 'target_url', '链接');
    const comIdx = idx('company', '企业', '公司');
    const hintIdx = idx('hint', '提示', '备注');
    if (urlIdx === -1) { message.error('CSV 中未找到 url 列'); return false; }
    const urls = lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim());
      return { url: cols[urlIdx], company: comIdx >= 0 ? cols[comIdx] : '', hint: hintIdx >= 0 ? cols[hintIdx] : '' };
    }).filter(u => u.url);
    await addUrlsToTask(urls);
    return false;
  };

  const loadDbUrls = async (type = pickType, search = pickSearch) => {
    setDbUrlsLoading(true);
    try {
      const res = await fetch(`/api/admin/db-url?pageSize=500&type=${type || EXTRACTABLE_URL_TYPES.join(',')}&search=${encodeURIComponent(search)}`);
      const json = await res.json();
      setDbUrls(json.ok ? json.data : []);
    } catch { setDbUrls([]); }
    finally { setDbUrlsLoading(false); }
  };

  const activeTask = tasks.find(t => t.id === activeTaskId);

  // ══════════════════════════════════════════
  // RENDER: 单个 URL 三栏视图
  // ══════════════════════════════════════════
  if (activeUrlLog) {
    const jobs: any[] = Array.isArray(pipelineData?.jobs) ? pipelineData.jobs : [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setActiveUrlLog(null)} type="text">返回任务详情</Button>
          {isRunning && (
            <Space>
              {!isPaused
                ? <Button size="small" icon={<PauseCircleOutlined />} onClick={handlePause}>暂停</Button>
                : <Button size="small" type="primary" icon={<RocketOutlined />} onClick={handleResume}>继续</Button>}
              <Button size="small" danger icon={<StopOutlined />} onClick={handleStop}>停止</Button>
            </Space>
          )}
        </div>
        <div className="cd-split" style={{ flex: 1, minHeight: 0 }}>
          {/* 左：目标 + 日志 */}
          <div style={{ flex: '0 0 380px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
            <Card title="提取目标" variant="borderless" size="small" style={{ borderRadius: 12 }}>
              <div style={{ fontSize: 12, color: BRAND.ink3, marginBottom: 4 }}>目标网页</div>
              <a href={activeUrlLog.target_url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', fontSize: 13 }}>{activeUrlLog.target_url}</a>
              <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
                <div><div style={{ fontSize: 12, color: BRAND.ink3 }}>企业</div><Text strong>{activeUrlLog.company || '—'}</Text></div>
                <div><div style={{ fontSize: 12, color: BRAND.ink3 }}>提取提示</div><Text>{activeUrlLog.hint || '—'}</Text></div>
              </div>
            </Card>
            <Card title="流水日志" variant="borderless" size="small" style={{ borderRadius: 12, flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {pipelineEvents.length > 0 ? (
                <Timeline items={pipelineEvents.map(ev => ({
                  color: ev.color,
                  icon: ev.status === 'loading' ? <SyncOutlined spin /> : undefined,
                  content: <div style={{ fontWeight: 500, fontSize: 13, wordBreak: 'break-all' }}>{ev.title}</div>,
                }))} />
              ) : <div style={{ color: '#999', fontSize: 13, textAlign: 'center', marginTop: 20 }}>暂无日志记录。</div>}
            </Card>
          </div>

          {/* 中：结构化岗位 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Card
              title={`提取结果${jobs.length ? `（${jobs.length} 个岗位 / 项目）` : ''}`}
              extra={pipelineMarkdown && <Button type="text" size="small" icon={<FileTextOutlined />} onClick={() => setShowMarkdown(v => !v)}>{showMarkdown ? '隐藏 Markdown' : '查看 Raw Markdown'}</Button>}
              variant="borderless"
              style={{ borderRadius: 12, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
              styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 } }}
            >
              {pipelineData ? (
                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {jobs.length === 0 && <Empty description="这个页面没有提取到校招 / 实习岗位（看右侧 AI 摘要的说明）" />}
                  {jobs.map((job, i) => (
                    <Card key={i} size="small" type="inner" style={{ borderRadius: 8 }}
                      title={<Space size={6}><span>{i + 1}. {job.title || '未命名'}</span>{job.job_type && <Tag color="orange">{JOB_TYPE_LABELS[job.job_type] || job.job_type}</Tag>}</Space>}>
                      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <tbody>
                          {JOB_FIELDS.filter(f => formatJobValue(f.key, job[f.key])).map((f, idx) => (
                            <tr key={f.key} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fafafa' : '#fff' }}>
                              <td style={{ padding: '6px 12px', fontWeight: 600, color: '#555', width: 160, verticalAlign: 'top' }}>{f.label}</td>
                              <td style={{ padding: '6px 12px', color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {f.kind === 'url' ? <a href={job[f.key]} target="_blank" rel="noreferrer">{job[f.key]}</a> : formatJobValue(f.key, job[f.key])}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  ))}
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 13 }}>
                  {isRunning ? <Spin size="large" /> : <Space orientation="vertical" align="center"><CodeOutlined style={{ fontSize: 48, opacity: 0.15 }} /><span>暂无提取结果</span></Space>}
                </div>
              )}
              {showMarkdown && pipelineMarkdown && (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: 16, maxHeight: 300, overflowY: 'auto' }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>📄 Raw Markdown（{(pipelineMarkdown.length / 1000).toFixed(0)}k 字符）</div>
                  <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: '#555', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f9f9f9', padding: 12, borderRadius: 6 }}>
                    {pipelineMarkdown.substring(0, 50000)}{pipelineMarkdown.length > 50000 && '\n\n...（已截断）'}
                  </pre>
                </div>
              )}
            </Card>
          </div>

          {/* 右：AI 摘要 + JSON */}
          <div style={{ flex: '0 0 340px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Card title="AI 摘要 + JSON" variant="borderless"
              style={{ borderRadius: 12, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
              styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 } }}>
              {!pipelineData ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>{isRunning ? <Spin /> : '等待 Structurer 输出...'}</div>
              ) : (
                <>
                  {pipelineData.ai_summary && (
                    <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', background: '#fafafa', fontSize: 13, color: '#555', lineHeight: 1.7 }}>{pipelineData.ai_summary}</div>
                  )}
                  <div style={{ flex: 1, overflowY: 'auto', background: '#1e1e1e', padding: 16 }}>
                    <pre style={{ margin: 0, color: '#d4d4d4', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify({ ...pipelineData, pipeline_log: undefined }, null, 2)}
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

  // ══════════════════════════════════════════
  // RENDER: 任务详情
  // ══════════════════════════════════════════
  if (activeTaskId && activeTask) {
    const { progress, urls: taskUrls } = activeTask;
    const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
    const taskBusy = isRunning || activeTask.status === 'running';
    const canRun = !taskBusy && (taskUrls || []).some((u: any) => urlStatusOf(u) !== 'success');

    const urlColumns = [
      { title: '#', width: 50, render: (_: any, __: any, i: number) => i + 1 },
      { title: 'URL', dataIndex: 'target_url', ellipsis: true, render: (url: string) => <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{url}</a> },
      { title: '企业', dataIndex: 'company', width: 150, render: (t: string, r: any) => t ? <a onClick={() => r.company_id && router.push(`/admin/db-company/${r.company_id}`)} style={{ fontSize: 12, fontWeight: 600 }}>{t}</a> : '-' },
      { title: '提示', dataIndex: 'hint', width: 140, ellipsis: true, render: (t: string) => <Text style={{ fontSize: 12 }}>{t || '-'}</Text> },
      { title: '岗位数', dataIndex: 'jobs_extracted', width: 80, align: 'center' as const, render: (n: number, r: any) => r.structurer_status === 'success' ? <Text strong style={{ color: n ? BRAND.success : BRAND.ink4 }}>{n}</Text> : '-' },
      {
        title: '状态', width: 90,
        render: (_: any, r: any) => {
          const cfg = URL_STATUS_MAP[urlStatusOf(r)];
          return <Tooltip title={r.error_message}><Tag color={cfg.color}>{cfg.label}</Tag></Tooltip>;
        },
      },
      {
        title: '操作', width: 120,
        render: (_: any, r: any) => (
          <Space size="small">
            {!taskBusy && urlStatusOf(r) !== 'success' && (
              <Popconfirm title="移除此 URL？" onConfirm={() => handleRemoveUrl(r.id)} okText="移除" cancelText="取消">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
            {!taskBusy && urlStatusOf(r) !== 'pending' && (
              <Tooltip title="重置为待处理（重跑）"><Button type="text" size="small" icon={<ReloadOutlined />} style={{ color: '#fa8c16' }} onClick={() => handleRetryUrl(r.id)} /></Tooltip>
            )}
            {(r.structurer_status === 'success' || r.fetcher_status !== 'pending') && (
              <Tooltip title="查看提取结果与日志"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openUrlView(r)} /></Tooltip>
            )}
          </Space>
        ),
      },
    ];

    return (
      <div style={{ maxWidth: 1480, margin: '0 auto' }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setActiveTaskId(null)} type="text">返回任务列表</Button>
          {!taskBusy && (
            <Popconfirm title="删除这个任务？" description="爬取日志会一起删除，已入库的岗位保留。" onConfirm={() => handleDeleteTask(activeTask.id)} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
              <Button type="text" danger icon={<DeleteOutlined />}>删除任务</Button>
            </Popconfirm>
          )}
        </div>

        <Card variant="borderless" style={{ marginBottom: 16, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {activeTask.name}
                <Tag color={STATUS_MAP[activeTask.status]?.color || 'default'} style={{ marginLeft: 12 }}>{STATUS_MAP[activeTask.status]?.icon} {STATUS_MAP[activeTask.status]?.label || activeTask.status}</Tag>
                <Tag color={activeTask.scope === 'all' ? 'purple' : 'orange'}>{SCOPE_LABELS[activeTask.scope || 'campus']}</Tag>
              </Title>
              {activeTask.notes && <Text type="secondary" style={{ fontSize: 13 }}>{activeTask.notes}</Text>}
            </div>
            <Space>
              <div style={{ textAlign: 'center', padding: '4px 16px', background: '#f0f5ff', borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#2f54eb' }}>{progress.total}</div><div style={{ fontSize: 10, color: '#999' }}>URL 数</div>
              </div>
              <div style={{ textAlign: 'center', padding: '4px 16px', background: '#f6ffed', borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#52c41a' }}>{activeTask.jobs_total}</div><div style={{ fontSize: 10, color: '#999' }}>已提取岗位</div>
              </div>
            </Space>
          </div>
          {progress.total > 0 && (
            <Progress style={{ marginTop: 16 }} percent={pct} status={taskBusy ? 'active' : (activeTask.status === 'failed' ? 'exception' : undefined)}
              format={() => `${progress.completed}/${progress.total} 完成${progress.failed ? ` · ${progress.failed} 失败` : ''}`} />
          )}
        </Card>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {!taskBusy && (
            <>
              <Button icon={<DatabaseOutlined />} onClick={() => { setPickUrlOpen(true); setPickedKeys([]); loadDbUrls(); }}>从信息源库选择</Button>
              <Button icon={<PlusOutlined />} onClick={() => { setAddUrlOpen(true); setAddCompany(''); setAddPicked(null); }}>添加 URL</Button>
              <Upload accept=".csv" showUploadList={false} beforeUpload={handleCsvUpload as any}>
                <Tooltip title="表头：url, company, hint"><Button icon={<UploadOutlined />}>导入 CSV</Button></Tooltip>
              </Upload>
              {(taskUrls || []).length > 0 && (
                <Popconfirm title="重置所有 URL 并重新提取？" onConfirm={handleRetryAll} okText="确认" cancelText="取消">
                  <Button icon={<ReloadOutlined />} style={{ color: '#fa8c16' }}>全任务重跑</Button>
                </Popconfirm>
              )}
            </>
          )}
          {canRun && <Button type="primary" icon={<RocketOutlined />} onClick={handleRunTask}>启动提取</Button>}
          {isRunning && !isPaused && <Button icon={<PauseCircleOutlined />} onClick={handlePause} style={{ color: '#fa8c16', borderColor: '#fa8c16' }}>暂停</Button>}
          {isRunning && isPaused && <Button type="primary" icon={<RocketOutlined />} onClick={handleResume} style={{ background: '#52c41a', borderColor: '#52c41a' }}>继续</Button>}
          {taskBusy && <Button danger icon={<StopOutlined />} onClick={handleStop}>{isRunning ? '停止' : '重置运行状态'}</Button>}
          {activeTask.jobs_total > 0 && <Button onClick={() => router.push('/admin/db-job')}>去校招岗位库审核 →</Button>}
        </div>

        <Card variant="borderless" style={{ borderRadius: 12 }}>
          <Table dataSource={taskUrls || []} columns={urlColumns} rowKey="id" pagination={false} size="small" scroll={{ x: 820 }}
            locale={{ emptyText: <Empty description="还没有 URL。先用「URL 获取工具」找到校招页面，再点「从信息源库选择」。" /> }} />
        </Card>

        <Modal title="添加 URL" open={addUrlOpen} onOk={handleAddUrl} onCancel={() => setAddUrlOpen(false)} okText="添加" destroyOnHidden>
          <Form form={addUrlForm} layout="vertical">
            <Form.Item name="url" label="目标 URL" rules={[{ required: true, message: '请输入 URL' }, { type: 'url', message: '请输入完整的 http(s) 链接' }]}>
              <Input placeholder="https://campus.example.com/..." />
            </Form.Item>
            <Form.Item label="企业" required help="库里没有的企业会自动建档">
              <CompanyPicker size="middle" value={addCompany} onChange={setAddCompany} picked={addPicked} onPick={setAddPicked} />
            </Form.Item>
            <Form.Item name="hint" label="提取提示（可选）">
              <Input placeholder="例如：2027 届 技术类 / 暑期实习 / 远程实习" />
            </Form.Item>
          </Form>
        </Modal>

        <Modal title="从信息源库选择 URL" open={pickUrlOpen} onCancel={() => setPickUrlOpen(false)} width={920}
          okText={`添加 ${pickedKeys.length} 个`} okButtonProps={{ disabled: pickedKeys.length === 0 }}
          onOk={async () => {
            const urls = dbUrls.filter(u => pickedKeys.includes(u.id)).map(u => ({ url: u.url, company: u.company, company_id: u.company_id, hint: [u.unit, subtypeLabel(u.type, u.subtype)].filter(Boolean).join(' · ') }));
            if (await addUrlsToTask(urls)) { setPickUrlOpen(false); setPickedKeys([]); }
          }}>
          <Space style={{ marginBottom: 12 }} wrap>
            <Select value={pickType} style={{ width: 160 }} onChange={v => { setPickType(v); loadDbUrls(v, pickSearch); }}
              options={[{ value: '', label: '全部可提取类型' }, ...URL_TYPE_OPTIONS.filter(o => EXTRACTABLE_URL_TYPES.includes(o.value))]} />
            <Input.Search placeholder="搜索企业 / 标题 / URL" allowClear style={{ width: 320 }} onSearch={v => { setPickSearch(v); loadDbUrls(pickType, v); }} />
          </Space>
          <Table size="small" loading={dbUrlsLoading} dataSource={dbUrls} rowKey="id"
            rowSelection={{ selectedRowKeys: pickedKeys, onChange: keys => setPickedKeys(keys) }}
            pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
            columns={[
              { title: '企业', dataIndex: 'company', width: 150, render: (t: string) => <Text strong style={{ fontSize: 12 }}>{t}</Text> },
              { title: '类型', width: 120, render: (_: any, r: any) => <Tag color={urlTypeMeta(r.type).color}>{subtypeLabel(r.type, r.subtype) || urlTypeMeta(r.type).short}</Tag> },
              { title: '标题', dataIndex: 'title', ellipsis: true, render: (t: string) => <Text style={{ fontSize: 12 }}>{t || '-'}</Text> },
              { title: 'URL', dataIndex: 'url', ellipsis: true, render: (t: string) => <a href={t} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>{t}</a> },
            ]} />
        </Modal>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // RENDER: 任务列表
  // ══════════════════════════════════════════
  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <PageHeader
        icon={<ApiOutlined />}
        title="校招岗位提取"
        description="批量抓取校招 / 实习页面，AI 结构化提取校招项目与岗位，自动写入校招岗位库（待审核）。"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建任务</Button>}
      />

      {tasksLoading ? (
        <div style={{ textAlign: 'center', marginTop: 80 }}><Spin size="large" /></div>
      ) : tasks.length === 0 ? (
        <Empty description="暂无任务。新建一个任务，再从信息源库挑选校招 URL。" style={{ marginTop: 80 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tasks.map(task => {
            const status = STATUS_MAP[task.status] || STATUS_MAP.draft;
            const p = task.progress;
            const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
            return (
              <Card key={task.id} hoverable onClick={() => setActiveTaskId(task.id)} style={{ borderRadius: 12, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text strong style={{ fontSize: 15 }}>{task.name}</Text>
                      <Tag color={status.color}>{status.icon} {status.label}</Tag>
                      <Tag color={task.scope === 'all' ? 'purple' : 'orange'}>{SCOPE_LABELS[task.scope || 'campus']}</Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {[task.notes, task.created_by, new Date(task.created_at).toLocaleString('zh-CN')].filter(Boolean).join(' · ')}
                    </Text>
                    {p.total > 0 && <Progress percent={pct} size="small" style={{ marginTop: 8, maxWidth: 300 }} format={() => `${p.completed}/${p.total}`} />}
                  </div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: BRAND.primary }}>{p.total}</div><div style={{ fontSize: 11, color: '#999' }}>URL 数</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: BRAND.success }}>{task.jobs_total}</div><div style={{ fontSize: 11, color: '#999' }}>岗位数</div></div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal title="新建岗位提取任务" open={createOpen} onOk={handleCreateTask} onCancel={() => setCreateOpen(false)} okText="创建" destroyOnHidden>
        <Form form={createForm} layout="vertical" initialValues={{ scope: 'campus' }}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="例如：2027 届秋招 · 互联网大厂首批" />
          </Form.Item>
          <Form.Item name="scope" label="提取范围">
            <Radio.Group>
              <Radio value="campus">仅校招 / 实习 / 管培专项（默认）</Radio>
              <Radio value="all">同时提取社招岗位</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea placeholder="可选" rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
