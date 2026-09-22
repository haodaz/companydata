'use client';

import React, { useRef, useState } from 'react';
import { App, Button, Checkbox, Input, Modal, Progress, Select, Space, Table, Tag, Typography } from 'antd';
import { DatabaseOutlined, PauseCircleOutlined, PlayCircleOutlined, RocketOutlined, StopOutlined } from '@ant-design/icons';
import { useModel } from '@/lib/model-context';
import { BRAND } from '@/lib/theme';
import { SEGMENT_LABELS, SEGMENT_OPTIONS } from '@/lib/company-fields';

type RowStatus = 'pending' | 'running' | 'done' | 'failed' | 'stopped';
interface Row { key: string; company: string; companyId?: number; status: RowStatus; campus: number; homepage: number; note: string }

const STATUS: Record<RowStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: '待处理' }, running: { color: 'processing', label: '检索中' },
  done: { color: 'success', label: '完成' }, failed: { color: 'error', label: '失败' }, stopped: { color: 'warning', label: '已停止' },
};

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `请求失败（${res.status}）`);
  return json;
}

/**
 * URL 获取工具 · 批处理：一次给一批企业，逐家检索校招 / 实习（可选企业官网），全部自动落库。
 * 不生成汇总报告（省 Token），每家的结果进信息源库 + URL 日志。
 */
export function BatchUrlFinder() {
  const { message } = App.useApp();
  const { currentModel } = useModel();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [doCampus, setDoCampus] = useState(true);
  const [doHomepage, setDoHomepage] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const stopRef = useRef(false);
  const rowsRef = useRef<Row[]>([]);

  const [pickOpen, setPickOpen] = useState(false);
  const [pickList, setPickList] = useState<any[]>([]);
  const [pickLoading, setPickLoading] = useState(false);
  const [picked, setPicked] = useState<React.Key[]>([]);
  const [pickSegment, setPickSegment] = useState('');

  const setRow = (key: string, p: Partial<Row>) => { rowsRef.current = rowsRef.current.map(r => r.key === key ? { ...r, ...p } : r); setRows(rowsRef.current); };

  const loadPick = async (segment = pickSegment, search = '') => {
    setPickLoading(true);
    try {
      const json = await (await fetch(`/api/db/companies?pageSize=500&segment=${segment}&search=${encodeURIComponent(search)}`)).json();
      setPickList(json.success ? json.data : []);
    } finally { setPickLoading(false); }
  };

  const addFromPick = () => {
    const names = pickList.filter(c => picked.includes(c.id)).map(c => c.name);
    setText(t => [...new Set([...t.split(/\r?\n/).map(s => s.trim()).filter(Boolean), ...names])].join('\n'));
    setPickOpen(false); setPicked([]);
  };

  const run = async () => {
    const names = [...new Set(text.split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
    if (!names.length) { message.warning('先输入企业名单，每行一家'); return; }
    if (!doCampus && !doHomepage) { message.warning('至少选一个检索维度'); return; }
    stopRef.current = false; pausedRef.current = false; setPaused(false); setRunning(true);
    rowsRef.current = names.map(n => ({ key: n, company: n, status: 'pending', campus: 0, homepage: 0, note: '' }));
    setRows(rowsRef.current);

    let ok = 0, fail = 0;
    for (const name of names) {
      if (stopRef.current) break;
      while (pausedRef.current && !stopRef.current) await new Promise(r => setTimeout(r, 500));
      if (stopRef.current) break;
      setRow(name, { status: 'running' });
      try {
        const c = await post('/api/office/ensure-company', { name });
        setRow(name, { companyId: c.id });
        const notes: string[] = [];
        if (doCampus) {
          const existing = skipExisting ? await (await fetch(`/api/admin/db-url?companyId=${c.id}&type=campus,job&pageSize=1`)).json() : null;
          if (existing?.ok && existing.total > 0) { notes.push(`校招已有 ${existing.total} 条，跳过`); setRow(name, { campus: existing.total }); }
          else {
            const r = await post('/api/agents/finder/campus-urls', { company: c.name, unit: '', model: currentModel });
            const urls: any[] = r.urls || [];
            let saved = 0;
            for (const u of urls) { try { await post('/api/db/save-url', { company: c.name, companyId: c.id, unit: u.unit || '', title: u.title, targetUrl: u.url, type: u.type, subtype: u.subtype, reasoning: u.reasoning }); saved++; } catch { /* 单条失败不影响 */ } }
            if (urls.length) post('/api/db/save-journal', { company: c.name, companyId: c.id, urls, searchQueries: r.search_queries, searchType: 'campus', model: currentModel, aiOverview: '（批处理检索，未生成报告）' }).catch(() => {});
            setRow(name, { campus: saved }); notes.push(`校招 ${saved} 条`);
          }
        }
        if (doHomepage) {
          const r = await post('/api/agents/finder/homepage-urls', { company: c.name, unit: '', model: currentModel });
          const urls: any[] = r.urls || [];
          let saved = 0;
          for (const u of urls) { try { await post('/api/db/save-url', { company: c.name, companyId: c.id, unit: u.unit || '', title: u.title, targetUrl: u.url, type: u.type, subtype: u.subtype, reasoning: u.reasoning }); saved++; } catch { /* noop */ } }
          if (urls.length) post('/api/db/save-journal', { company: c.name, companyId: c.id, urls, searchQueries: r.search_queries, searchType: 'homepage', model: currentModel, aiOverview: '（批处理检索，未生成报告）' }).catch(() => {});
          setRow(name, { homepage: saved }); notes.push(`官网 ${saved} 条`);
        }
        setRow(name, { status: 'done', note: notes.join(' · ') }); ok++;
      } catch (e: any) { setRow(name, { status: 'failed', note: e.message }); fail++; }
    }
    if (stopRef.current) { rowsRef.current = rowsRef.current.map(r => r.status === 'pending' || r.status === 'running' ? { ...r, status: 'stopped' } : r); setRows(rowsRef.current); }
    setRunning(false);
    message.success(`批处理结束：成功 ${ok}，失败 ${fail}${stopRef.current ? '，已手动停止' : ''}`, 6);
  };

  const done = rows.filter(r => r.status === 'done' || r.status === 'failed' || r.status === 'stopped').length;

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '0 0 420px', maxWidth: '100%', background: '#fff', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', padding: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>1. 企业名单（每行一家）</div>
        <Input.TextArea rows={10} value={text} onChange={e => setText(e.target.value)} disabled={running} placeholder={'腾讯\n宝洁\n上汽大众\n…'} style={{ fontSize: 14 }} />
        <Space style={{ marginTop: 8 }} wrap>
          <Button icon={<DatabaseOutlined />} disabled={running} onClick={() => { setPickOpen(true); loadPick(); }}>从企业库选择</Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>库里没有的企业会自动建档</Typography.Text>
        </Space>

        <div style={{ fontWeight: 600, margin: '18px 0 8px' }}>2. 检索维度</div>
        <Space orientation="vertical" size={4}>
          <Checkbox checked={doCampus} disabled={running} onChange={e => setDoCampus(e.target.checked)}>校招 + 实习（校招官网、应届生、实习、远程实习、管培专项、留学生专场）</Checkbox>
          <Checkbox checked={doHomepage} disabled={running} onChange={e => setDoHomepage(e.target.checked)}>企业官网 + 企业信息</Checkbox>
          <Checkbox checked={skipExisting} disabled={running} onChange={e => setSkipExisting(e.target.checked)}>信息源库里已有校招 URL 的企业跳过（省 Token）</Checkbox>
        </Space>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {!running && <Button type="primary" size="large" icon={<RocketOutlined />} onClick={run} block>开始批处理</Button>}
          {running && !paused && <Button size="large" icon={<PauseCircleOutlined />} onClick={() => { pausedRef.current = true; setPaused(true); }} block>暂停</Button>}
          {running && paused && <Button size="large" type="primary" icon={<PlayCircleOutlined />} onClick={() => { pausedRef.current = false; setPaused(false); }} block>继续</Button>}
          {running && <Button size="large" danger icon={<StopOutlined />} onClick={() => { stopRef.current = true; pausedRef.current = false; }}>停止</Button>}
        </div>
        <div style={{ fontSize: 12, color: BRAND.ink4, marginTop: 8 }}>每家约 30–60 秒；结果直接进信息源库和 URL 日志，不生成汇总报告。</div>
      </div>

      <div style={{ flex: '1 1 480px', minWidth: 0, background: '#fff', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>3. 进度</span>
          {rows.length > 0 && <Progress percent={Math.round((done / rows.length) * 100)} size="small" style={{ flex: 1, maxWidth: 360 }} format={() => `${done}/${rows.length}`} />}
        </div>
        <Table size="small" rowKey="key" dataSource={rows} pagination={false} locale={{ emptyText: '还没开始。左边填好名单，点「开始批处理」。' }}
          columns={[
            { title: '企业', dataIndex: 'company', render: (t: string, r: Row) => r.companyId ? <a href={`/admin/db-company/${r.companyId}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{t}</a> : <b>{t}</b> },
            { title: '状态', dataIndex: 'status', width: 90, render: (s: RowStatus) => <Tag color={STATUS[s].color}>{STATUS[s].label}</Tag> },
            { title: '校招 URL', dataIndex: 'campus', width: 90, align: 'center' as const, render: (n: number, r: Row) => doCampus ? n : '-' },
            { title: '官网 URL', dataIndex: 'homepage', width: 90, align: 'center' as const, render: (n: number) => doHomepage ? n : '-' },
            { title: '说明', dataIndex: 'note', ellipsis: true, render: (t: string) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t}</Typography.Text> },
          ]} />
      </div>

      <Modal title="从企业库选择" open={pickOpen} onCancel={() => setPickOpen(false)} onOk={addFromPick} okText={`加入 ${picked.length} 家`} okButtonProps={{ disabled: !picked.length }} width={760}>
        <Space style={{ marginBottom: 12 }} wrap>
          <Select value={pickSegment} style={{ width: 140 }} onChange={v => { setPickSegment(v); loadPick(v); }} options={[{ value: '', label: '全部分类' }, ...SEGMENT_OPTIONS]} />
          <Input.Search placeholder="搜索企业" allowClear style={{ width: 260 }} onSearch={v => loadPick(pickSegment, v)} />
        </Space>
        <Table size="small" rowKey="id" loading={pickLoading} dataSource={pickList} rowSelection={{ selectedRowKeys: picked, onChange: setPicked }} pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
          columns={[
            { title: '企业', dataIndex: 'name', render: (t: string, r: any) => <span><b>{t}</b>{r.segment && <Tag color={SEGMENT_LABELS[r.segment]?.color} style={{ marginLeft: 6 }}>{SEGMENT_LABELS[r.segment]?.label}</Tag>}</span> },
            { title: '行业', dataIndex: 'industry', width: 120 },
            { title: '已有信息源', width: 100, align: 'center' as const, render: (_: any, r: any) => r.counts?.url_total || 0 },
          ]} />
      </Modal>
    </div>
  );
}
