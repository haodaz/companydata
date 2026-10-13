'use client';

/**
 * 职业问答日志（迁移 029）：「和我聊」里所有职业的提问放在一起——数据飞轮的入口。
 *   质检：合格 / 不合格（带备注）
 *   排任务：平方答不上的（知识缺口）→ 给涉及的职业补某一块（画像 / 图谱 / 地区薪资 / 场所工具 / 典型任务）
 *   转译入库：合格的问答 → AI 整理成中立的问答草稿 → 人改 → 进「平方问答库」，以后职人直接从平方库里答（[F] 编号）
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Button, Checkbox, Form, Input, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, MessageOutlined, ThunderboltOutlined, BookOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { BRAND } from '@/lib/theme';
import { useModel } from '@/lib/model-context';

const { Text, Paragraph } = Typography;
const STATUS: Record<string, { label: string; color: string }> = {
  new: { label: '待质检', color: 'default' }, ok: { label: '合格', color: 'green' }, bad: { label: '不合格', color: 'red' },
  task: { label: '已排补全', color: 'blue' }, ingested: { label: '已入库', color: 'purple' },
};
const SURFACE: Record<string, string> = { lab: '体验百业', studio: '百业工厂', admin: '后台试聊' };
const PARTS: Record<string, string> = { profile: '职业画像 + 年限薪资', career: '发展图谱', regions: '分地区薪资', context: '场所与工具', tasks: '典型任务与工位' };
const SRC_COLOR: Record<string, string> = { web: 'orange', faq: 'purple', job: 'blue', standard: 'cyan', task: 'geekblue', data: 'default', company: 'gold' };

function FaqLibrary() {
  const { message } = App.useApp();
  const [data, setData] = useState<any[]>([]);
  const load = useCallback(async () => { const j = await (await fetch('/api/admin/kg-faqs')).json(); if (j.success) setData(j.data); }, []);
  useEffect(() => { load(); }, [load]);
  const toggle = async (id: number, ok: boolean) => {
    const j = await (await fetch('/api/admin/kg-faqs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: ok ? 'ok' : 'hidden' }) })).json();
    if (j.success) { message.success(ok ? '已生效' : '已停用'); load(); } else message.error(j.error);
  };
  return <Table size="small" rowKey="id" dataSource={data} pagination={{ pageSize: 30, showSizeChanger: false }}
    expandable={{ expandedRowRender: (f: any) => <div>
      <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{f.answer}</Paragraph>
      {(f.sources || []).map((s: any, i: number) => <div key={i} style={{ fontSize: 12 }}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</div>)}
    </div> }}
    columns={[
      { title: '职业', dataIndex: ['occupation', 'name'], width: 140 },
      { title: '问题', dataIndex: 'question', render: (v: string, f: any) => <span><b>{v}</b><div style={{ fontSize: 12, color: BRAND.ink3 }}>{String(f.answer).slice(0, 80)}…</div></span> },
      { title: '来源', width: 70, render: (_: any, f: any) => (f.sources || []).length },
      { title: '审核人', dataIndex: 'reviewer', width: 170 },
      { title: '生效', dataIndex: 'status', width: 80, render: (v: string, f: any) => <Switch size="small" checked={v === 'ok'} onChange={c => toggle(f.id, c)} /> },
    ]} />;
}

export default function KgQuestionsPage() {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const { currentModel } = useModel();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [occs, setOccs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ occupation: '', status: '', gap: false, surface: '', search: '' });
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [draft, setDraft] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => { const o = new URLSearchParams(window.location.search).get('occupation'); if (o) setF(x => ({ ...x, occupation: o })); }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: '50', ...Object.fromEntries(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, v === true ? '1' : String(v)])) });
      const j = await (await fetch(`/api/admin/kg-questions?${q}`, { cache: 'no-store' })).json();
      if (!j.success) throw new Error(j.error);
      setData(j.data); setTotal(j.total); setStats(j.stats); setOccs(j.occupations);
    } catch (e: any) { message.error(`加载失败：${e.message}（迁移 029 跑过了吗？）`); } finally { setLoading(false); }
  }, [page, f, message]);
  useEffect(() => { load(); }, [load]);
  const set = (patch: Partial<typeof f>) => { setPage(1); setSelected([]); setF(x => ({ ...x, ...patch })); };

  const qc = async (status: string, ids = selected) => {
    let note = '';
    if (status === 'bad') {
      const ok = await new Promise<boolean>(res => modal.confirm({ title: `标 ${ids.length} 条不合格`, content: <Input.TextArea id="qc-note" placeholder="哪里不对？（编造 / 来源不对 / 答非所问 / 口吻……）" autoSize={{ minRows: 2 }} />, onOk: () => { note = (document.getElementById('qc-note') as HTMLTextAreaElement)?.value || ''; res(true); }, onCancel: () => res(false) }));
      if (!ok) return;
    }
    const j = await (await fetch('/api/admin/kg-questions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, status, ...(note ? { qc_note: note } : {}) }) })).json();
    if (!j.success) return message.error(j.error);
    message.success(`已标 ${STATUS[status].label}`); setSelected([]); load();
  };
  const task = async (part: string) => {
    const j = await (await fetch('/api/admin/kg-questions/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected, part, model: currentModel }) })).json();
    if (!j.success) return message.error(j.error);
    message.success(`已排任务：${j.occupations} 个职业补「${j.part}」，后台跑（国内检索走千问）`); setSelected([]); load();
  };
  const translate = async (ids: React.Key[]) => {
    const rows = data.filter(r => ids.includes(r.id));
    if (new Set(rows.map(r => r.occupation_id)).size > 1) return message.warning('一次只转译同一个职业的问答');
    const hide = message.loading('AI 正在整理成中立的问答草稿（不加新事实）…', 0);
    try {
      const j = await (await fetch('/api/admin/kg-questions/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })).json();
      if (!j.success) throw new Error(j.error);
      setDraft({ ...j, ids }); form.setFieldsValue({ question: j.question, answer: j.answer });
    } catch (e: any) { message.error(e.message); } finally { hide(); }
  };
  const ingest = async () => {
    const v = await form.validateFields();
    const j = await (await fetch('/api/admin/kg-questions/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ occupation_id: draft.occupation_id, question: v.question, answer: v.answer, sources: draft.sources, ids: draft.ids }) })).json();
    if (!j.success) return message.error(j.error);
    message.success('已进平方问答库：以后职人会直接从这里答'); setDraft(null); setSelected([]); load();
  };

  const list = (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search allowClear placeholder="搜问题 / 回答" style={{ width: 220 }} onSearch={v => set({ search: v })} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="职业" style={{ width: 220 }} value={f.occupation || undefined} onChange={v => set({ occupation: v || '' })}
          options={occs.map(o => ({ value: String(o.id), label: `${o.name}（${o.total} 问${o.gaps ? ` · ${o.gaps} 缺口` : ''}）` }))} />
        <Select allowClear placeholder="状态" style={{ width: 120 }} onChange={v => set({ status: v || '' })} options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        <Select allowClear placeholder="在哪问的" style={{ width: 120 }} onChange={v => set({ surface: v || '' })} options={Object.entries(SURFACE).map(([value, label]) => ({ value, label }))} />
        <Checkbox checked={f.gap} onChange={e => set({ gap: e.target.checked })}>只看平方答不上的（知识缺口）</Checkbox>
      </Space>
      {selected.length > 0 && <Space wrap style={{ marginBottom: 12, padding: '8px 12px', background: BRAND.primarySoft, borderRadius: 8, width: '100%' }}>
        <Text>已选 {selected.length} 条</Text>
        <Button size="small" icon={<CheckCircleOutlined />} onClick={() => qc('ok')}>合格</Button>
        <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => qc('bad')}>不合格</Button>
        <Select size="small" placeholder="排补全任务：补哪一块" style={{ width: 200 }} value={null as any} onChange={task} options={Object.entries(PARTS).map(([value, label]) => ({ value, label }))} />
        <Button size="small" type="primary" icon={<BookOutlined />} onClick={() => translate(selected)}>转译入库</Button>
      </Space>}
      <Table size="small" rowKey="id" loading={loading} dataSource={data}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        pagination={{ current: page, pageSize: 50, total, onChange: setPage, showSizeChanger: false, showTotal: t => `共 ${t} 问` }}
        expandable={{ expandedRowRender: (r: any) => <div style={{ padding: '4px 8px' }}>
          <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{r.reply}</Paragraph>
          {(r.sources || []).map((s: any) => <div key={s.id} style={{ fontSize: 12, marginBottom: 2 }}>
            <Tag color={SRC_COLOR[s.type]} style={{ fontSize: 11 }}>{s.id}</Tag>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}
          </div>)}
          {r.web_points && <div style={{ marginTop: 8, padding: 8, background: '#fffbeb', borderRadius: 6, fontSize: 12.5, whiteSpace: 'pre-wrap' }}><b>网上查到的（平方未核实）：</b>{'\n'}{r.web_points}</div>}
          {r.qc_note && <div style={{ marginTop: 6, color: '#dc2626', fontSize: 12 }}>质检备注：{r.qc_note}</div>}
        </div> }}
        columns={[
          { title: '问题', dataIndex: 'question', render: (v: string, r: any) => <span>{v}{r.gap && <Tag color="orange" style={{ marginLeft: 6 }}>知识缺口</Tag>}
            {r.gap && r.gap !== v && <div style={{ fontSize: 12, color: BRAND.ink3 }}>缺：{r.gap}</div>}</span> },
          { title: '职业', width: 140, render: (_: any, r: any) => r.occupation ? <a onClick={() => router.push(`/admin/db-occupation/${r.occupation.id}`)}>{r.occupation.name}</a> : '—' },
          { title: '来源', width: 120, render: (_: any, r: any) => { const s: any[] = r.sources || []; return s.length ? <span>{s.length} 条{s.some(x => x.type === 'web') && <Tag color="orange" style={{ marginLeft: 4 }}>含网上</Tag>}</span> : <Text type="danger">无</Text>; } },
          { title: '在哪问', dataIndex: 'surface', width: 90, render: (v: string) => SURFACE[v] || v },
          { title: '状态', dataIndex: 'status', width: 120, render: (v: string, r: any) => <span><Tag color={STATUS[v]?.color}>{STATUS[v]?.label || v}</Tag>{r.task_part && <div style={{ fontSize: 11, color: BRAND.ink3 }}>补 {PARTS[r.task_part]}</div>}</span> },
          { title: '时间', dataIndex: 'created_at', width: 150, render: (v: string) => new Date(v).toLocaleString() },
          { title: '', width: 150, render: (_: any, r: any) => <Space size={4}>
            {r.status === 'new' && <a onClick={() => qc('ok', [r.id])}>合格</a>}
            {r.status === 'new' && <a style={{ color: '#dc2626' }} onClick={() => qc('bad', [r.id])}>不合格</a>}
            {(r.status === 'ok' || r.status === 'task') && <a onClick={() => translate([r.id])}>转译入库</a>}
          </Space> },
        ]} />
    </>
  );

  return (
    <div>
      <PageHeader title="职业问答日志" icon={<MessageOutlined />}
        description="「和我聊」里大家问了什么、职人怎么答的、引了哪些来源。平方答不上、去网上查的是知识缺口：质检后排补全任务，合格的转译进平方问答库，下次直接从平方库里答——数据飞轮。" />
      <StatCards loading={loading && !stats.total} items={[
        { label: '问题总数', value: stats.total || 0, icon: <MessageOutlined /> },
        { label: '知识缺口', value: stats.gaps || 0, color: '#d97706', hint: '平方答不上、上网查了' },
        { label: '待质检', value: stats.new || 0 },
        { label: '合格', value: stats.ok || 0, color: '#16a34a' },
        { label: '已排补全', value: stats.task || 0, color: '#2f54eb', icon: <ThunderboltOutlined /> },
        { label: '平方问答库', value: stats.faqs || 0, color: '#8b5cf6', hint: `已转译 ${stats.ingested || 0} 问` },
      ]} />
      <Panel padding={16}>
        <Tabs items={[{ key: 'log', label: '问答日志', children: list }, { key: 'faq', label: `平方问答库（${stats.faqs || 0}）`, children: <FaqLibrary /> }]} />
      </Panel>
      <Modal open={!!draft} title={`转译入库 · ${draft?.occupation || ''}`} width={720} onCancel={() => setDraft(null)} onOk={ingest} okText="进平方问答库" destroyOnHidden>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>AI 只做整理（去掉角色口吻、不加新事实），请核对后再入库；网上来的内容要写「据网上资料」。</Text>
        <Form form={form} layout="vertical">
          <Form.Item name="question" label="问题（规范问法）" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="answer" label="回答（中立、可核对）" rules={[{ required: true }]}><Input.TextArea autoSize={{ minRows: 4, maxRows: 12 }} /></Form.Item>
        </Form>
        <div>{(draft?.sources || []).map((s: any, i: number) => <div key={i} style={{ fontSize: 12 }}>· {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</div>)}</div>
      </Modal>
    </div>
  );
}
