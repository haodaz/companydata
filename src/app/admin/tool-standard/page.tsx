'use client';

/**
 * 行业标准获取（迁移 022）：任务 → 逐条配置检索（职业 / 行业 / 检索重点 / 层级 / 文件类型）→ 逐条运行，历史与成败累积。
 * 运行在服务端（/api/admin/standard-searches/run：检索 → 抓官方页补题录与要点 → 入库），这页只排队和展示。
 * 用来给百业空间的工位规则找依据：每条规则都应该能指回一条标准 / 规程的条款。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { BookOutlined, CaretRightOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { useModel } from '@/lib/model-context';
import { useUser } from '@/lib/user-context';
import { STANDARD_DOC_TYPE_LABELS, STANDARD_KIND_LABELS } from '@/lib/standard-fields';

const { Text, Paragraph } = Typography;
const STATUS: Record<string, { label: string; color: string }> = { pending: { label: '待运行', color: 'default' }, running: { label: '运行中', color: 'processing' }, success: { label: '完成', color: 'success' }, failed: { label: '失败', color: 'error' } };

export default function ToolStandardPage() {
  const { message } = App.useApp();
  const { currentModel } = useModel();
  const { user } = useUser();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [needMigration, setNeedMigration] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [running, setRunning] = useState<Set<number>>(new Set());
  const [newTask, setNewTask] = useState(false);
  const [addItem, setAddItem] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch('/api/admin/standard-tasks', { cache: 'no-store' })).json();
      if (!j.ok) { if (j.needMigration) setNeedMigration(j.needMigration); else message.error(j.error); return; }
      setTasks(j.tasks); setNeedMigration('');
      setTaskId(cur => cur && j.tasks.some((t: any) => t.id === cur) ? cur : j.tasks[0]?.id || null);
    } finally { setLoading(false); }
  }, [message]);
  useEffect(() => { load(); }, [load]);
  // 有在跑的就每 8 秒刷一次（脚本在后台跑的也能看到进度）
  useEffect(() => {
    if (!tasks.some(t => t.items.some((i: any) => i.status === 'running')) && !running.size) return;
    const iv = setInterval(load, 8000); return () => clearInterval(iv);
  }, [tasks, running, load]);

  const task = tasks.find(t => t.id === taskId);

  const run = async (ids: number[]) => {
    for (const id of ids) {
      setRunning(s => new Set(s).add(id));
      try {
        const j = await (await fetch('/api/admin/standard-searches/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, model: currentModel }) })).json();
        if (!j.ok) message.error(j.error); else message.success(`候选 ${j.found} · 新增 ${j.inserted} · 更新 ${j.updated}`);
      } catch (e: any) { message.error(e.message); }
      setRunning(s => { const n = new Set(s); n.delete(id); return n; });
      load();
    }
  };

  const createTask = async (v: any) => {
    const j = await (await fetch('/api/admin/standard-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: v.name, notes: v.notes, model_id: currentModel, created_by: user?.email }) })).json();
    if (!j.ok) return message.error(j.error);
    setNewTask(false); setTaskId(j.task.id); load();
  };
  const addItems = async (v: any) => {
    // 「职业」一行一个，可以一次加一批
    const profs = String(v.professions || '').split(/\n+/).map((x: string) => x.trim()).filter(Boolean);
    const items = (profs.length ? profs : ['']).map(p => ({ profession: p, industry: v.industry, query: v.query, kinds: v.kinds, docTypes: v.docTypes, count: v.count, enrich: v.enrich }));
    const j = await (await fetch('/api/admin/standard-tasks/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, items }) })).json();
    if (!j.ok) return message.error(j.error);
    message.success(`加了 ${j.added} 条${j.skipped ? `，跳过重复 ${j.skipped}` : ''}`); setAddItem(false); form.resetFields(); load();
  };
  const openDetail = async (id: number) => {
    const j = await (await fetch(`/api/admin/standard-searches?id=${id}`)).json();
    if (j.ok) setDetail(j.search); else message.error(j.error);
  };

  if (needMigration) return <Panel><Text type="warning">先在 Supabase 跑迁移 <code>{needMigration}</code>。</Text></Panel>;

  return (
    <div>
      <PageHeader title="行业标准获取" icon={<BookOutlined />}
        description="按职业找它日常操作所依据的国标、行标、团标、企业规程、国际标准与法规：检索 → 抓官方题录补号与状态 → 把操作要求转述成要点 → 入库。百业空间的工位规则据此可解释。"
        extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setNewTask(true)}>新任务</Button></Space>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) minmax(0, 1fr)', gap: 16 }}>
        <Panel padding={12}>
          {tasks.map(t => (
            <div key={t.id} onClick={() => setTaskId(t.id)} style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 6, background: t.id === taskId ? 'rgba(106,92,255,.08)' : 'transparent' }}>
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{t.progress.completed}/{t.progress.total} 完成{t.progress.failed ? ` · ${t.progress.failed} 失败` : ''} · 入库 {t.saved_total} · ${t.cost_usd.toFixed(3)}</Text>
            </div>
          ))}
          {!tasks.length && !loading && <Text type="secondary">还没有任务</Text>}
        </Panel>

        <Panel>
          {task ? <>
            <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              <Text strong style={{ fontSize: 16 }}>{task.name}</Text>
              <Button icon={<PlusOutlined />} onClick={() => setAddItem(true)}>加检索</Button>
              <Button type="primary" icon={<CaretRightOutlined />} disabled={!task.items.some((i: any) => i.status !== 'success' && i.status !== 'running')}
                onClick={() => run(task.items.filter((i: any) => i.status !== 'success' && i.status !== 'running').map((i: any) => i.id))}>跑未完成的</Button>
              <Popconfirm title="删除任务？已入库的标准保留" onConfirm={async () => { await fetch(`/api/admin/standard-tasks?id=${task.id}`, { method: 'DELETE' }); load(); }}><Button danger icon={<DeleteOutlined />}>删除任务</Button></Popconfirm>
            </Space>
            {task.notes && <Paragraph type="secondary">{task.notes}</Paragraph>}
            <Table size="small" rowKey="id" loading={loading} dataSource={task.items} pagination={{ pageSize: 30 }} scroll={{ x: 900 }}
              columns={[
                { title: '职业', dataIndex: 'profession', width: 150, render: (v: string, r: any) => <a onClick={() => openDetail(r.id)}>{v || '—'}</a> },
                { title: '行业', dataIndex: 'industry', width: 100 },
                { title: '检索重点', dataIndex: 'query', render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
                { title: '状态', dataIndex: 'status', width: 90, render: (v: string, r: any) => <Tag color={STATUS[running.has(r.id) ? 'running' : v]?.color}>{STATUS[running.has(r.id) ? 'running' : v]?.label || v}</Tag> },
                { title: '候选 / 入库', key: 'n', width: 100, render: (_: any, r: any) => `${r.candidates_found || 0} / ${r.saved || 0}` },
                { title: '费用', dataIndex: 'cost_usd', width: 80, render: (v: any) => v ? `$${Number(v).toFixed(4)}` : '—' },
                { title: '', key: 'op', width: 120, render: (_: any, r: any) => <Space>
                  <Button size="small" disabled={running.has(r.id) || r.status === 'running'} onClick={() => run([r.id])}>{r.status === 'success' ? '重跑' : '运行'}</Button>
                  <Popconfirm title="删除这条检索？" onConfirm={async () => { await fetch(`/api/admin/standard-tasks/items?id=${r.id}`, { method: 'DELETE' }); load(); }}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
                </Space> },
              ]} />
          </> : <Text type="secondary">选一个任务，或新建一个。</Text>}
        </Panel>
      </div>

      <Modal title="新任务" open={newTask} onCancel={() => setNewTask(false)} footer={null} destroyOnHidden>
        <Form layout="vertical" onFinish={createTask}>
          <Form.Item name="name" label="任务名" rules={[{ required: true }]}><Input placeholder="如：新能源行业的标准与规程" /></Form.Item>
          <Form.Item name="notes" label="说明"><Input.TextArea rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit">创建</Button>
        </Form>
      </Modal>

      <Modal title="加检索" open={addItem} onCancel={() => setAddItem(false)} footer={null} width={640} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={addItems} initialValues={{ count: 8, enrich: true }}>
          <Form.Item name="professions" label="职业（一行一个，可一次加一批）"><Input.TextArea rows={3} placeholder={'转炉炼钢操作工\n变电站值班员'} /></Form.Item>
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="industry" label="行业"><Input placeholder="冶金 / 电力 …" /></Form.Item>
            <Form.Item name="count" label="候选上限"><InputNumber min={3} max={20} /></Form.Item>
            <Form.Item name="enrich" label="抓官方页补要点" valuePropName="checked"><Switch /></Form.Item>
          </Space>
          <Form.Item name="query" label="检索重点（工序 / 设备 / 场景）"><Input placeholder="如：氧枪 吹炼 炼钢安全规程" /></Form.Item>
          <Form.Item name="kinds" label="只要这些层级（不选 = 都要）"><Select mode="multiple" options={Object.entries(STANDARD_KIND_LABELS).map(([k, v]) => ({ value: k, label: v.label }))} /></Form.Item>
          <Form.Item name="docTypes" label="只要这些文件类型（不选 = 都要）"><Select mode="multiple" options={Object.entries(STANDARD_DOC_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v.label }))} /></Form.Item>
          <Button type="primary" htmlType="submit">加入任务</Button>
        </Form>
      </Modal>

      <Drawer title={detail ? `${detail.profession || detail.query} · 检索记录` : ''} open={!!detail} onClose={() => setDetail(null)} width={760}>
        {detail && <>
          <Paragraph><Text strong>AI 摘要：</Text>{detail.structured_json?.ai_summary || '—'}</Paragraph>
          <Paragraph><Text strong>搜索词：</Text>{(detail.search_queries || []).join(' · ') || '—'}</Paragraph>
          <Paragraph><Text strong>流水：</Text><br />{(detail.structured_json?.pipeline_log || []).map((l: string, i: number) => <div key={i} style={{ fontSize: 12 }}>{l}</div>)}</Paragraph>
          {detail.error_message && <Paragraph type="danger">{detail.error_message}</Paragraph>}
          <Table size="small" rowKey={(r: any) => r.code || r.title} pagination={false} dataSource={detail.structured_json?.standards || []}
            columns={[
              { title: '标准号', dataIndex: 'code', width: 160 },
              { title: '名称', dataIndex: 'title' },
              { title: '要点', key: 'p', width: 60, render: (_: any, r: any) => (r.key_points || []).length },
            ]} />
          <Paragraph style={{ marginTop: 12 }}><Text strong>官方页抓取：</Text>{(detail.raw_pages || []).map((p: any) => <div key={p.url} style={{ fontSize: 12 }}>{p.ok ? '✓' : '✗'} {p.mismatch ? '（不符）' : ''}<a href={p.url} target="_blank" rel="noreferrer">{p.url}</a> · {p.len} 字</div>)}</Paragraph>
        </>}
      </Drawer>
    </div>
  );
}
