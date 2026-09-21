'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { App, Button, Input, Tag, Tooltip } from 'antd';
import {
  CheckOutlined, CloseOutlined, DownOutlined, LoadingOutlined, MinusOutlined, PlusOutlined, ReloadOutlined,
  RocketOutlined, StopOutlined, CodeOutlined, UpOutlined, MessageOutlined,
} from '@ant-design/icons';
import { useModel } from '@/lib/model-context';
import { useUser } from '@/lib/user-context';
import { BRAND } from '@/lib/theme';
import { AGENT_MAP, FACTORY_AGENTS, FACTORY_STAGES, type AgentId, type FactoryStage } from '@/lib/factory-agents';
import {
  planTask, buildCompanyList, ensureCompany, profileCompany, findAndSaveCampusUrls, pickUrlsToExtract,
  createJobTask, addUrlsToTask, setJobTaskStatus, extractUrl, fetchQaStats, qaBriefing,
  type FactoryPlan, type FactoryCompany,
} from '@/lib/factory-pipeline';

type ItemStatus = 'idle' | 'working' | 'done' | 'failed' | 'skipped';
type RunStatus = 'idle' | 'planning' | 'running' | 'completed' | 'failed' | 'stopped';
type StageKey = FactoryStage['key'];

interface WorkItem {
  key: string;
  stage: StageKey;
  agent: AgentId;
  title: string;
  detail?: string;
  status: ItemStatus;
  summary?: string;
  link?: string;
}

interface LogLine { time: string; source: string; message: string }

interface Snapshot { task: string; plan: FactoryPlan | null; items: WorkItem[]; logs: LogLine[]; status: RunStatus; report: string; finishedAt?: string }

const STORAGE_KEY = 'cd_factory_last_run';

const PRESETS = [
  '采集 腾讯、字节跳动、美团 的 2027 届校招和实习岗位',
  '找 5 家汽车行业中外合资企业，补全企业画像，并采集它们的校招项目',
  '宝洁、联合利华、欧莱雅：看看它们在中国的管培生和暑期实习',
  '列出 8 家中国新能源与动力电池龙头，只要名单和企业画像',
];

const STATUS_STYLE: Record<ItemStatus, { border: string; bg: string; footBg: string; footColor: string; label: string }> = {
  idle:    { border: '#e5e7eb', bg: '#fafafa', footBg: '#f5f5f7', footColor: BRAND.ink4, label: '等待上一道工序' },
  working: { border: '#a5b4fc', bg: '#fff', footBg: 'rgba(99,102,241,0.06)', footColor: '#4f46e5', label: '作业中…' },
  done:    { border: '#34d399', bg: '#fff', footBg: 'rgba(16,185,129,0.07)', footColor: '#047857', label: '完成' },
  failed:  { border: '#fca5a5', bg: '#fff7f7', footBg: 'rgba(239,68,68,0.06)', footColor: '#dc2626', label: '失败' },
  skipped: { border: '#e5e7eb', bg: '#fff', footBg: '#f5f5f7', footColor: BRAND.ink3, label: '跳过' },
};

/** 并发池：同一工序里多家企业同时作业 */
async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift()!);
  }));
}

function OfficeInner() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useSearchParams();
  const { currentModel } = useModel();
  const { user } = useUser();

  const [task, setTask] = useState('');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [plan, setPlan] = useState<FactoryPlan | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [report, setReport] = useState('');
  const [finishedAt, setFinishedAt] = useState<string | undefined>();

  const itemsRef = useRef<WorkItem[]>([]);
  const logsRef = useRef<LogLine[]>([]);
  const abortRef = useRef(false);
  const autoStarted = useRef(false);

  const isRunning = status === 'planning' || status === 'running';

  const log = useCallback((source: string, msg: string) => {
    logsRef.current = [...logsRef.current, { time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), source, message: msg }].slice(-400);
    setLogs(logsRef.current);
  }, []);

  const putItems = (next: WorkItem[]) => { itemsRef.current = next; setItems(next); };
  const addItems = (more: WorkItem[]) => putItems([...itemsRef.current, ...more]);
  const setItem = (key: string, p: Partial<WorkItem>) => putItems(itemsRef.current.map(i => i.key === key ? { ...i, ...p } : i));

  // 打开页面时恢复上一次的产线现场（只读）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && !params.get('task')) {
        const s: Snapshot = JSON.parse(raw);
        setTask(s.task); setPlan(s.plan); putItems(s.items); logsRef.current = s.logs; setLogs(s.logs);
        setStatus(s.status); setReport(s.report); setFinishedAt(s.finishedAt);
      }
    } catch { /* 忽略损坏的缓存 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSnapshot = (s: RunStatus, rep: string, p: FactoryPlan | null, t: string) => {
    const at = new Date().toLocaleString('zh-CN');
    setFinishedAt(at);
    const normalized = itemsRef.current.map(i => i.status === 'working' ? { ...i, status: 'failed' as ItemStatus, summary: '未完成' } : i);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ task: t, plan: p, items: normalized, logs: logsRef.current.slice(-200), status: s, report: rep, finishedAt: at } satisfies Snapshot)); } catch { /* 存不下就算了 */ }
  };

  const run = async (taskText: string) => {
    const text = taskText.trim();
    if (!text) { message.warning('先写下总任务'); return; }

    abortRef.current = false;
    putItems([]); logsRef.current = []; setLogs([]); setReport(''); setPlan(null); setFinishedAt(undefined);
    setStatus('planning');
    const model = currentModel;
    const stopped = () => abortRef.current;
    let thePlan: FactoryPlan | null = null;
    let finalStatus: RunStatus = 'completed';
    let finalReport = '';

    try {
      // ── 厂长排产 ──
      log('Max', '收到总任务，正在排产…');
      thePlan = await planTask(text, model);
      setPlan(thePlan);
      log('Max', thePlan.briefing || '排产完成。');
      setStatus('running');

      // ── 工序 1：建名单 ──
      const companies: FactoryCompany[] = [];
      const listKey = 'list:0';
      addItems([{ key: listKey, stage: 'list', agent: 'scout', status: 'working', title: thePlan.mode === 'list' ? '联网生成目标企业名单' : '核对点名企业并建档', detail: thePlan.mode === 'list' ? thePlan.list_query : thePlan.companies.join('、') }]);
      try {
        if (thePlan.mode === 'list') {
          log('Scout', `联网检索：${thePlan.list_query}（${thePlan.list_count} 家）`);
          const list = (await buildCompanyList(thePlan.list_query, thePlan.list_count, model)).slice(0, thePlan.list_count);
          if (!list.length) throw new Error('没有检索到符合条件的企业');
          for (const c of list) companies.push(await ensureCompany(c));
        } else {
          for (const name of thePlan.companies) companies.push(await ensureCompany({ name }));
        }
        setItem(listKey, { status: 'done', summary: `${companies.length} 家企业已建档：${companies.map(c => c.name).join('、')}`, link: '/admin/db-company' });
        log('Scout', `${companies.length} 家企业已进入企业库。`);
      } catch (e: any) {
        setItem(listKey, { status: 'failed', summary: e.message });
        throw e;
      }
      if (stopped()) throw new Error('已停止');

      // 后续工序的工单先全部挂出来，让人看得到全貌
      const pending: WorkItem[] = [];
      if (thePlan.steps.profile) companies.forEach(c => pending.push({ key: `profile:${c.id}`, stage: 'profile', agent: 'profiler', status: 'idle', title: c.name, detail: '补全企业信息与校招概况' }));
      if (thePlan.steps.source) companies.forEach(c => pending.push({ key: `source:${c.id}`, stage: 'source', agent: 'finder', status: 'idle', title: c.name, detail: '找校招 / 实习官方入口' }));
      pending.push({ key: 'qa:0', stage: 'qa', agent: 'qa', status: 'idle', title: '产出质检', detail: '盘点本次任务的产出与数据质量' });
      addItems(pending);

      // ── 工序 2：企业画像 ──
      if (thePlan.steps.profile) {
        await pool(companies, 2, async c => {
          if (stopped()) return;
          const key = `profile:${c.id}`;
          if (c.profiled) { setItem(key, { status: 'skipped', summary: '已有画像，直接复用', link: `/admin/db-company/${c.id}` }); return; }
          setItem(key, { status: 'working' });
          log('Alice', `开始补全「${c.name}」的企业画像`);
          try {
            const { filled, profile } = await profileCompany(c.id, model);
            setItem(key, { status: 'done', summary: `补全 ${filled.length} 个字段${profile.industry ? ` · ${profile.industry}` : ''}${profile.hq_city ? ` · ${profile.hq_city}` : ''}`, link: `/admin/db-company/${c.id}` });
            log('Alice', `「${c.name}」画像完成，补全 ${filled.length} 个字段。`);
          } catch (e: any) { setItem(key, { status: 'failed', summary: e.message }); log('Alice', `「${c.name}」画像失败：${e.message}`); }
        });
      }
      if (stopped()) throw new Error('已停止');

      // ── 工序 3：寻源 ──
      const toExtract: { url: string; company: string; company_id: number; hint: string }[] = [];
      if (thePlan.steps.source) {
        await pool(companies, 2, async c => {
          if (stopped()) return;
          const key = `source:${c.id}`;
          setItem(key, { status: 'working' });
          try {
            // 库里已有校招信息源就直接复用，不重复花 Token
            const existing = await (await fetch(`/api/admin/db-url?companyId=${c.id}&type=campus,job&pageSize=100`)).json();
            let urls: any[] = existing.ok ? existing.data : [];
            if (urls.length) log('Jarvis', `「${c.name}」库里已有 ${urls.length} 条校招信息源，直接复用。`);
            else { log('Jarvis', `开始寻找「${c.name}」的校招与实习入口`); urls = await findAndSaveCampusUrls(c, model); }
            const picked = pickUrlsToExtract(urls, thePlan!.urls_per_company);
            picked.forEach(u => toExtract.push({ url: u.url, company: c.name, company_id: c.id, hint: thePlan!.hint }));
            setItem(key, { status: urls.length ? 'done' : 'failed', summary: urls.length ? `${urls.length} 条官方信息源，选 ${picked.length} 个送去抓取` : '没找到官方校招入口', link: `/admin/db-company/${c.id}` });
            log('Jarvis', `「${c.name}」：${urls.length} 条信息源。`);
          } catch (e: any) { setItem(key, { status: 'failed', summary: e.message }); log('Jarvis', `「${c.name}」寻源失败：${e.message}`); }
        });
      }
      if (stopped()) throw new Error('已停止');

      // ── 工序 4：抓取与提炼 ──
      let jobsSaved = 0;
      if (thePlan.steps.extract && toExtract.length) {
        const taskId = await createJobTask(`🏭 ${thePlan.title} · ${new Date().toLocaleDateString('zh-CN')}`, `虚拟工厂总任务：${text.slice(0, 200)}`, thePlan.scope, model, user?.email || '');
        const taskLogs = await addUrlsToTask(taskId, toExtract);
        await setJobTaskStatus(taskId, 'running');
        addItems(taskLogs.map((l: any) => ({ key: `extract:${l.id}`, stage: 'extract' as StageKey, agent: 'structurer' as AgentId, status: 'idle' as ItemStatus, title: l.company, detail: l.target_url })));

        let failed = 0;
        for (const l of taskLogs) {
          if (stopped()) break;
          const key = `extract:${l.id}`;
          setItem(key, { status: 'working' });
          try {
            const r = await extractUrl(l, { model, scope: thePlan.scope, ctl: { aborted: stopped }, emit: m => { setItem(key, { summary: m }); log(/Thorne|提炼|岗位/.test(m) ? 'Dr. Thorne' : 'Kelly', `[${l.company}] ${m}`); } });
            jobsSaved += r.saved;
            setItem(key, { status: 'done', summary: `提炼 ${r.jobs} 个岗位 / 项目，${r.saved} 个已入库`, link: '/admin/db-job' });
          } catch (e: any) { failed++; setItem(key, { status: 'failed', summary: e.message }); }
        }
        await setJobTaskStatus(taskId, stopped() ? 'draft' : failed === taskLogs.length ? 'failed' : 'completed');
      } else if (thePlan.steps.extract) {
        log('Max', '没有可抓取的页面，跳过抓取与提炼。');
      }
      if (stopped()) throw new Error('已停止');

      // ── 工序 5：质检 ──
      setItem('qa:0', { status: 'working' });
      const stats = await fetchQaStats(companies.map(c => c.id));
      finalReport = qaBriefing(stats);
      setItem('qa:0', { status: 'done', summary: `平均完整度 ${stats.avg_completeness}% · 待审核 ${stats.unreviewed}`, link: '/admin/db-job' });
      log('Nova', finalReport.replace(/\n/g, ' '));
      log('Max', `总任务完成：${companies.length} 家企业，本次新入库 / 更新 ${jobsSaved} 个岗位。`);
    } catch (e: any) {
      finalStatus = e.message === '已停止' ? 'stopped' : 'failed';
      log('Max', finalStatus === 'stopped' ? '已按指令停产。已经入库的数据会保留。' : `任务中断：${e.message}`);
      putItems(itemsRef.current.map(i => i.status === 'working' ? { ...i, status: 'failed', summary: finalStatus === 'stopped' ? '已停止' : i.summary || '未完成' } : i));
      if (finalStatus === 'failed') message.error(e.message);
    }

    setReport(finalReport);
    setStatus(finalStatus);
    saveSnapshot(finalStatus, finalReport, thePlan, text);
  };

  // 从厂长单聊带着总任务过来：/office?task=xxx → 直接开工
  useEffect(() => {
    const t = params.get('task');
    if (t && !autoStarted.current) {
      autoStarted.current = true;
      setTask(t);
      router.replace('/office');
      run(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const reset = () => { putItems([]); logsRef.current = []; setLogs([]); setPlan(null); setReport(''); setStatus('idle'); setFinishedAt(undefined); try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ } };

  const renderItem = (it: WorkItem) => {
    const s = STATUS_STYLE[it.status];
    const agent = AGENT_MAP[it.agent];
    const isUrl = /^https?:\/\//.test(it.detail || '');
    return (
      <div key={it.key} onClick={() => it.link && it.status !== 'working' && router.push(it.link)}
        style={{ borderRadius: 12, border: `2px ${it.status === 'idle' ? 'dashed' : 'solid'} ${s.border}`, background: s.bg, overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: it.link && it.status !== 'working' ? 'pointer' : 'default', transition: 'box-shadow .2s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${BRAND.borderSoft}` }}>
          <img src={agent.pixel} alt={agent.name} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', imageRendering: 'pixelated', border: `1px solid ${BRAND.border}`, flexShrink: 0, filter: it.status === 'idle' ? 'grayscale(0.8) opacity(0.7)' : undefined }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
            <div style={{ fontSize: 11, color: BRAND.ink3 }}>{it.stage === 'extract' ? 'Kelly + Dr. Thorne' : agent.name} · {agent.station}</div>
          </div>
          {it.status === 'working' && <LoadingOutlined style={{ color: '#6366f1', fontSize: 18 }} />}
          {it.status === 'done' && <span style={{ width: 22, height: 22, borderRadius: 11, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}><CheckOutlined /></span>}
          {it.status === 'failed' && <span style={{ width: 22, height: 22, borderRadius: 11, background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}><CloseOutlined /></span>}
          {it.status === 'skipped' && <span style={{ width: 22, height: 22, borderRadius: 11, background: '#d1d5db', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}><MinusOutlined /></span>}
        </div>
        {it.detail && (
          <div style={{ padding: '8px 12px', fontSize: 12, color: BRAND.ink2, lineHeight: 1.6, flex: 1, wordBreak: 'break-all', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {isUrl ? <a href={it.detail} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{it.detail}</a> : it.detail}
          </div>
        )}
        <div style={{ padding: '7px 12px', fontSize: 12, fontWeight: 500, background: s.footBg, color: s.footColor, borderTop: `1px solid ${BRAND.borderSoft}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.summary}>
          {it.summary || s.label}
        </div>
      </div>
    );
  };

  // ══════════ 空闲：下达总任务 ══════════
  if (status === 'idle' && items.length === 0) {
    return (
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 20px 48px' }}>
        <div style={{ background: '#fff', borderRadius: 24, border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow, padding: '28px 36px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <img src="/factory/office_hero.png" alt="虚拟工厂" style={{ width: 250, height: 250, objectFit: 'contain' }} />
          <h1 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, color: BRAND.ink }}>给 AI 工厂下达一个总任务</h1>
          <p style={{ margin: '8px 0 20px', fontSize: 14, color: BRAND.ink3, maxWidth: 560, lineHeight: 1.7 }}>
            一句话说清要哪些企业、要什么数据。厂长 Max 负责排产，AI 员工按「建名单 → 企业画像 → 寻源 → 抓取与提炼 → 质检」逐道工序协作，产出直接进入正式数据库。
          </p>
          <Input.TextArea value={task} onChange={e => setTask(e.target.value)} autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000}
            placeholder="例如：采集 腾讯、宝洁、上汽大众 的 2027 届校招和实习岗位" style={{ fontSize: 15, borderRadius: 14, padding: '12px 16px', maxWidth: 720 }}
            onPressEnter={e => { if (e.metaKey || e.ctrlKey) run(task); }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 12, maxWidth: 760 }}>
            {PRESETS.map(p => <Tag key={p} onClick={() => setTask(p)} style={{ cursor: 'pointer', padding: '3px 10px', borderRadius: 999, fontSize: 12 }}>{p}</Tag>)}
          </div>
          <Button type="primary" size="large" icon={<RocketOutlined />} onClick={() => run(task)} style={{ marginTop: 20, height: 48, minWidth: 240, borderRadius: 14, fontSize: 16, fontWeight: 700 }}>下达任务，开工</Button>
          <div style={{ marginTop: 10, fontSize: 12, color: BRAND.ink4 }}>单次最多 8 家企业 · ⌘/Ctrl + Enter 快速下达 · 已有画像和信息源的企业会自动复用，不重复消耗 Token</div>
        </div>

        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.ink2 }}>在岗 AI 员工 · {FACTORY_AGENTS.length}</span>
            <a onClick={() => router.push('/office/employees')} style={{ fontSize: 12 }}><MessageOutlined /> 和单个 AI 员工对话 →</a>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {FACTORY_AGENTS.map(a => (
              <Tooltip key={a.id} title={a.description}>
                <div onClick={() => router.push(`/office/employees?agent=${a.id}`)} style={{ background: '#fff', borderRadius: 14, border: `1px solid ${BRAND.border}`, padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer' }}>
                  <img src={a.pixel} alt={a.name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', imageRendering: 'pixelated' }} />
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: BRAND.ink }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: BRAND.ink3, lineHeight: 1.4 }}>{a.title}</div>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ══════════ 产线现场 ══════════
  const lastLog = logs[logs.length - 1];
  const doneCount = items.filter(i => i.status === 'done' || i.status === 'skipped').length;
  const statusTag = status === 'planning' ? { c: 'processing', t: '厂长排产中' } : status === 'running' ? { c: 'processing', t: '产线运转中' }
    : status === 'completed' ? { c: 'success', t: '任务完成' } : status === 'stopped' ? { c: 'warning', t: '已停产' } : { c: 'error', t: '任务中断' };

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 24px 48px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 总控台 */}
      <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow, padding: 18, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <img src={AGENT_MAP.chief.pixel} alt="Max" style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover', imageRendering: 'pixelated', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <Tag color={statusTag.c} icon={isRunning ? <LoadingOutlined /> : undefined} style={{ margin: 0, fontWeight: 600 }}>{statusTag.t}</Tag>
            {plan && <span style={{ fontSize: 15, fontWeight: 800, color: BRAND.ink }}>{plan.title}</span>}
            {items.length > 0 && <span style={{ fontSize: 12, color: BRAND.ink3 }}>工单 {doneCount}/{items.length}</span>}
            {!isRunning && finishedAt && <span style={{ fontSize: 12, color: BRAND.ink4 }}>· {finishedAt}</span>}
          </div>
          <div style={{ fontSize: 14, color: BRAND.ink2, lineHeight: 1.6 }}>{task}</div>
          {plan?.briefing && <div style={{ marginTop: 8, fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', lineHeight: 1.7 }}><b>厂长 Max：</b>{plan.briefing}</div>}
          {report && <div style={{ marginTop: 8, fontSize: 13, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '8px 12px', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}><b>质检员 Nova：</b>{report}</div>}
          {isRunning && lastLog && <div style={{ marginTop: 8, fontSize: 12, fontFamily: 'ui-monospace, monospace', color: BRAND.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ color: BRAND.primary, fontWeight: 700 }}>[{lastLog.source}]</span> {lastLog.message}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {isRunning
            ? <Button danger icon={<StopOutlined />} onClick={() => { abortRef.current = true; message.info('收到，当前这一步做完就停'); }}>停产</Button>
            : <>
              <Button icon={<ReloadOutlined />} onClick={() => run(task)}>再跑一次</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={reset}>新的总任务</Button>
            </>}
        </div>
      </div>

      {/* 工序 */}
      {FACTORY_STAGES.map((stage, idx) => {
        const stageItems = items.filter(i => i.stage === stage.key);
        const planned = stage.key === 'list' || stage.key === 'qa' || (plan ? (stage.key === 'profile' ? plan.steps.profile : stage.key === 'source' ? plan.steps.source : plan.steps.extract) : true);
        const active = stageItems.some(i => i.status === 'working');
        const finished = stageItems.length > 0 && stageItems.every(i => i.status === 'done' || i.status === 'skipped' || i.status === 'failed');
        return (
          <div key={stage.key} style={{ opacity: planned ? 1 : 0.45 }}>
            {idx > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '-8px 0 8px' }}>
                <div style={{ width: 2, height: 16, background: active ? '#818cf8' : '#d1d5db' }} />
                <DownOutlined style={{ fontSize: 12, marginTop: -2, color: active ? '#6366f1' : '#9ca3af' }} />
              </div>
            )}
            <section style={{ borderRadius: 18, padding: 16, border: `1px solid ${active ? '#c7d2fe' : finished ? '#a7f3d0' : BRAND.border}`, background: active ? 'rgba(238,242,255,0.6)' : 'rgba(255,255,255,0.85)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: stageItems.length ? 12 : 0 }}>
                <span style={{ width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800, background: finished ? '#10b981' : active ? '#6366f1' : '#d1d5db' }}>{finished ? <CheckOutlined /> : idx + 1}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: BRAND.ink }}>{stage.label}</span>
                <span style={{ fontSize: 12, color: BRAND.ink3 }}>{stage.desc}</span>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {stage.agents.map(id => (
                    <Tooltip key={id} title={`${AGENT_MAP[id].name} · ${AGENT_MAP[id].title}`}>
                      <img src={AGENT_MAP[id].pixel} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover', imageRendering: 'pixelated', border: `1px solid ${BRAND.border}` }} />
                    </Tooltip>
                  ))}
                  <span style={{ fontSize: 12, color: BRAND.ink4, fontWeight: 600 }}>{!planned ? '本次不排产' : stageItems.length ? `${stageItems.filter(i => i.status === 'done' || i.status === 'skipped').length}/${stageItems.length}` : '待开工'}</span>
                </div>
              </div>
              {stageItems.length > 0 && <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>{stageItems.map(renderItem)}</div>}
            </section>
          </div>
        );
      })}

      {/* 车间日志 */}
      {logs.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${BRAND.border}` }}>
          <div onClick={() => setLogOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: BRAND.ink2 }}>
            <span><CodeOutlined /> 车间日志（{logs.length}）</span>{logOpen ? <UpOutlined /> : <DownOutlined />}
          </div>
          {logOpen && (
            <div style={{ maxHeight: 320, overflowY: 'auto', borderTop: `1px solid ${BRAND.borderSoft}`, padding: '10px 16px', fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.9, color: '#334155' }}>
              {logs.map((l, i) => (
                <div key={i}><span style={{ color: '#94a3b8' }}>[{l.time}]</span> <span style={{ color: l.source === 'Max' ? '#b45309' : BRAND.primary, fontWeight: 700 }}>[{l.source}]</span> {l.message}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OfficePage() {
  return <Suspense><OfficeInner /></Suspense>;
}
