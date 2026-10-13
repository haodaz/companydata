'use client';

/**
 * 工作场所库 / 工具设备库（迁移 026）共用的列表页与详情页。
 * 这边是全集知识图谱，AI 百业生成时来查；百业里画过的场所 / 道具是子集，作为第一批种子（配图、叫法进别名）。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Button, Card, Col, Descriptions, Empty, Form, Image, Input, Modal, Popconfirm, Row, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, ControlOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, EnvironmentOutlined, ToolOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { REVIEW_STATUS } from '@/lib/review-status';
import { exportToCsv } from '@/lib/export-csv';
import { ensureDownloadAllowed, clearDownloadPermissionCache } from '@/lib/download-gate';
import { BRAND } from '@/lib/theme';
import { ENTITY_TABLES, ITEM_KIND_LABELS, LINK_FREQUENCY_LABELS, PLACE_CATEGORY_LABELS, PLACE_SETTING_LABELS, TASK_DIFFICULTY_LABELS, hasEntityValue, type LibraryType } from '@/lib/entity-fields';

const { Text, Paragraph } = Typography;
const SOURCE_LABELS: Record<string, string> = { lab: 'AI 百业', ai: 'AI 生成', manual: '手工新建' };
type T = LibraryType;
const facetLabel = (type: T, k: string) => type === 'item' ? ITEM_KIND_LABELS[k]?.label || k : PLACE_CATEGORY_LABELS[k] || k;

function Thumb({ url, size = 44 }: { url?: string | null; size?: number }) {
  if (!url) return <div style={{ width: size, height: size, borderRadius: 6, background: '#f3f4f6' }} />;
  return <Image src={url} width={size} height={size} style={{ objectFit: 'cover', borderRadius: 6 }} preview={{ mask: false }} />;
}

export function EntityListPage({ type }: { type: T }) {
  const { message } = App.useApp();
  const router = useRouter();
  const c = ENTITY_TABLES[type];
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [facets, setFacets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ search: '', facet: '', source: '', labOnly: '' });
  const [exporting, setExporting] = useState(false);

  const query = useCallback((extra: Record<string, string> = {}) => new URLSearchParams({
    ...(f.search ? { search: f.search } : {}), ...(f.facet ? { [type === 'item' ? 'kind' : 'category']: f.facet } : {}),
    ...(f.source ? { source: f.source } : {}), ...(f.labOnly ? { labOnly: '1' } : {}), ...extra,
  }), [f, type]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch(`/api/db/entities/${type}?${query({ page: String(page), pageSize: '50', withStats: '1' })}`, { cache: 'no-store' })).json();
      if (!j.success) throw new Error(j.error);
      setData(j.data); setTotal(j.total); if (j.stats) setStats(j.stats); if (j.facets) setFacets(j.facets);
    } catch (e: any) { message.error(`加载失败：${e.message}（迁移 026 跑过了吗？）`); } finally { setLoading(false); }
  }, [type, page, query, message]);
  useEffect(() => { load(); }, [load]);
  const set = (patch: Partial<typeof f>) => { setPage(1); setF(x => ({ ...x, ...patch })); };

  const handleExport = async () => {
    if (!(await ensureDownloadAllowed())) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/db/entities/${type}?${query({ exportAll: 'true' })}`);
      const json = await res.json();
      if (res.status === 403 && json.code === 'DOWNLOAD_PERMISSION_REQUIRED') { clearDownloadPermissionCache(); await ensureDownloadAllowed(); return; }
      if (!json.success) throw new Error(json.error);
      exportToCsv(json.data, [
        { key: 'id', header: 'ID' },
        ...c.fields.map(fd => ({ key: fd.key, header: `${fd.label}(${fd.key})`, formatter: (v: any) => Array.isArray(v) ? v.join('、') : fd.options ? fd.options[v] || v || '' : v ?? '' })),
        ...(type === 'item' ? [{ key: 'lab_bench', header: '百业可体验(lab_bench)' }] : []),
        { key: 'occupation_count', header: '关联职业数' },
        { key: 'source', header: '来源', formatter: (v: any) => SOURCE_LABELS[v] || v || '' },
      ], c.label + '库', { serverChecked: true });
    } catch (e: any) { message.error(`导出失败：${e.message}`); } finally { setExporting(false); }
  };

  return (
    <div>
      <PageHeader title={`${c.label}库`} icon={type === 'item' ? <ToolOutlined /> : type === 'station' ? <ControlOutlined /> : <EnvironmentOutlined />}
        description={type === 'station'
          ? '工位 / 操作台：一组仪器、设备、操作对象和软件，放在某个场所里。典型任务发生在工位上；AI 百业的虚拟工位是它可以亲手操作的实例。'
          : type === 'item'
          ? '职业会用到的工具、设备、耗材、软件、防护用品、单据和证照。每样东西能看到哪些职业要会用、在哪个场所用、对应哪些技能，以及能在哪个百业空间亲手体验。'
          : '职业真实工作的地方：车间、手术室、吧台、控制室、工地……每个场所能看到在这里工作的职业、里面有哪些设备和工具、环境与安全要求。'}
        extra={<Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>导出 CSV（当前筛选）</Button>} />
      <StatCards loading={loading && !stats.total} items={[
        { label: `${c.label}总数`, value: stats.total || 0 },
        { label: '来自 AI 百业', value: stats.lab || 0, color: '#8b5cf6' },
        { label: 'AI 生成', value: stats.ai || 0, color: '#2f54eb' },
        { label: '有配图', value: stats.with_image || 0, color: '#16a34a' },
        ...(type !== 'place' ? [{ label: '百业里可亲手体验', value: stats.bench || 0, color: '#d97706' }] : []),
        { label: '与职业的关联', value: stats.links || 0 },
      ]} />
      <Panel padding={16}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search allowClear placeholder={`搜${c.label}名称 / 别名 / 描述`} style={{ width: 260 }} onSearch={v => set({ search: v })} />
          <Select allowClear placeholder={type === 'item' ? '类型' : '类别'} style={{ width: 170 }} onChange={v => set({ facet: v || '' })}
            options={Object.entries(facets).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ value: k, label: `${facetLabel(type, k)}（${n}）` }))} />
          <Select allowClear placeholder="来源" style={{ width: 130 }} onChange={v => set({ source: v || '' })} options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))} />
          {type !== 'place' && <Select allowClear placeholder="百业可体验" style={{ width: 140 }} onChange={v => set({ labOnly: v || '' })} options={[{ value: '1', label: '只看可亲手体验' }]} />}
        </Space>
        <Table size="small" rowKey="id" loading={loading} dataSource={data} scroll={{ x: 1000 }}
          pagination={{ current: page, pageSize: 50, total, onChange: setPage, showSizeChanger: false, showTotal: t => `共 ${t} 个` }}
          columns={[
            { title: '', dataIndex: 'image_url', width: 60, render: (v: string) => <Thumb url={v} /> },
            { title: c.label, dataIndex: 'name', render: (v: string, r: any) => <div style={{ cursor: 'pointer' }} onClick={() => router.push(`${c.path}/${r.id}`)}>
              <div style={{ fontWeight: 600, color: BRAND.primary }}>{v}{r.lab_bench && <Tag color="orange" style={{ marginLeft: 6 }}>可在百业体验</Tag>}</div>
              {!!r.aliases?.length && <div style={{ fontSize: 12, color: BRAND.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>{r.aliases.slice(0, 4).join(' / ')}</div>}
            </div> },
            { title: type === 'item' ? '类型 / 细分' : type === 'station' ? '操作对象 / 监测量' : '类别', width: 190, render: (_: any, r: any) => type === 'station'
              ? <Text type="secondary" style={{ fontSize: 12 }}>{(r.controls || []).length} 个操作对象 · {(r.monitors || []).length} 个监测量</Text>
              : type === 'item'
              ? <span>{r.kind && <Tag color={ITEM_KIND_LABELS[r.kind]?.color}>{ITEM_KIND_LABELS[r.kind]?.label}</Tag>}<Text type="secondary" style={{ fontSize: 12 }}>{r.category || ''}</Text></span>
              : <span>{r.category && <Tag>{PLACE_CATEGORY_LABELS[r.category] || r.category}</Tag>}<Text type="secondary" style={{ fontSize: 12 }}>{PLACE_SETTING_LABELS[r.setting] || ''}</Text></span> },
            { title: '描述', dataIndex: 'description', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>{v || '—'}</Text> },
            { title: '关联职业', dataIndex: 'occupation_count', width: 90 },
            { title: '来源', dataIndex: 'source', width: 90, render: (v: string) => v ? <Tag>{SOURCE_LABELS[v] || v}</Tag> : '—' },
          ]} />
      </Panel>
    </div>
  );
}

export function EntityDetailPage({ type, id }: { type: T; id: string }) {
  const { message } = App.useApp();
  const router = useRouter();
  const c = ENTITY_TABLES[type];
  const [d, setD] = useState<{ entity: any; links: any[]; spaces: any[] } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();
  const load = useCallback(async () => {
    const j = await (await fetch(`/api/db/entities/${type}/${id}`, { cache: 'no-store' })).json();
    if (j.success) setD(j); else message.error(j.error);
  }, [type, id, message]);
  useEffect(() => { load(); }, [load]);
  const patch = async (body: any, ok = '已保存') => {
    const j = await (await fetch(`/api/db/entities/${type}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    if (!j.success) { message.error(j.error); return false; }
    message.success(ok); load(); return true;
  };
  if (!d) return <div style={{ padding: 80, textAlign: 'center' }}><Spin /></div>;
  const e = d.entity;
  const occ = d.links.filter(l => l.other_type === 'occupation');
  const items = d.links.filter(l => l.other_type === 'item');
  const places = d.links.filter(l => l.other_type === 'place');
  const tasks = d.links.filter(l => l.other_type === 'task');
  const stations = d.links.filter(l => l.other_type === 'station');
  const groups = Array.from(new Set(c.fields.map(f => f.group)));
  const goto = (t: string, oid: number) => router.push(t === 'occupation' ? `/admin/db-occupation/${oid}` : t === 'task' ? '#' : `${ENTITY_TABLES[t as T].path}/${oid}`);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => router.push(c.path)} style={{ paddingLeft: 0 }}>返回{c.label}库</Button>
        <Space>
          <Button icon={<CheckCircleOutlined />} onClick={() => patch({ human_review_status: 'complete' }, '已审核通过')}>审核通过</Button>
          <Button icon={<EditOutlined />} onClick={() => { form.setFieldsValue(e); setEditOpen(true); }}>编辑</Button>
          <Popconfirm title={`删除这个${c.label}？`} okButtonProps={{ danger: true }} onConfirm={async () => {
            const j = await (await fetch(`/api/db/entities/${type}/${id}`, { method: 'DELETE' })).json();
            if (j.success) router.push(c.path); else message.error(j.error);
          }}><Button danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {e.image_url && <Image src={e.image_url} width={220} style={{ borderRadius: 8, objectFit: 'cover' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{e.name}{e.name_en && <span style={{ fontSize: 14, color: BRAND.ink3, fontWeight: 400, marginLeft: 10 }}>{e.name_en}</span>}</div>
            <Space wrap style={{ margin: '8px 0' }}>
              {type === 'item' && e.kind && <Tag color={ITEM_KIND_LABELS[e.kind]?.color}>{ITEM_KIND_LABELS[e.kind]?.label}</Tag>}
              {type === 'place' && e.category && <Tag>{PLACE_CATEGORY_LABELS[e.category]}</Tag>}
              {e.category && type === 'item' && <Tag>{e.category}</Tag>}
              {e.setting && <Tag>{PLACE_SETTING_LABELS[e.setting]}</Tag>}
              {e.lab_bench && <Tag color="orange" icon={<PlayCircleOutlined />}>可在百业虚拟工位体验（{e.lab_bench}）</Tag>}
              {e.source && <Tag>{SOURCE_LABELS[e.source] || e.source}</Tag>}
              <Tag color={REVIEW_STATUS[e.human_review_status]?.color}>{REVIEW_STATUS[e.human_review_status]?.label || '未审核'}</Tag>
            </Space>
            {!!e.aliases?.length && <div style={{ fontSize: 12, color: BRAND.ink3 }}>也叫：{e.aliases.join('、')}</div>}
            {e.description && <Paragraph style={{ marginTop: 10, marginBottom: 0 }}>{e.description}</Paragraph>}
          </div>
        </div>
      </Card>
      <Row gutter={16}>
        <Col xs={24} lg={14}>
          {groups.map(g => {
            const fs = c.fields.filter(f => f.group === g && hasEntityValue(e[f.key]) && !['name', 'name_en', 'aliases', 'image_url', 'description', 'kind', 'category', 'setting'].includes(f.key) && f.kind !== 'json');
            if (!fs.length) return null;
            return <Card key={g} size="small" title={g} style={{ marginBottom: 16 }}>
              <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
                {fs.map(f => <Descriptions.Item key={f.key} label={f.label}><span style={{ whiteSpace: 'pre-wrap' }}>{Array.isArray(e[f.key]) ? e[f.key].join('、') : f.options ? f.options[e[f.key]] || e[f.key] : e[f.key]}</span></Descriptions.Item>)}
              </Descriptions>
            </Card>;
          })}
          {type === 'station' && <>
            <Card size="small" title={`操作对象（${(e.controls || []).length}）`} style={{ marginBottom: 16 }}>
              <Table size="small" rowKey={(r: any, i?: number) => `${r.name}-${i}`} pagination={false} dataSource={e.controls || []} columns={[
                { title: '操作对象', dataIndex: 'name', width: 160, render: (v: string) => <b>{v}</b> }, { title: '单位', dataIndex: 'unit', width: 80 },
                { title: '常用范围', dataIndex: 'range', width: 140 }, { title: '调它干什么', dataIndex: 'purpose' },
              ]} />
            </Card>
            <Card size="small" title={`监测量（${(e.monitors || []).length}）`} style={{ marginBottom: 16 }}>
              <Table size="small" rowKey={(r: any, i?: number) => `${r.name}-${i}`} pagination={false} dataSource={e.monitors || []} columns={[
                { title: '监测量', dataIndex: 'name', width: 160, render: (v: string) => <b>{v}</b> }, { title: '单位', dataIndex: 'unit', width: 80 },
                { title: '正常范围', dataIndex: 'normal', width: 160 }, { title: '报警条件', dataIndex: 'alarm', render: (v: string) => v ? <Text type="danger">{v}</Text> : '—' },
              ]} />
            </Card>
            <Card size="small" title={`在这里发生的典型任务（${tasks.length}）`} style={{ marginBottom: 16 }}>
              {tasks.length ? tasks.map(l => <div key={l.id} style={{ marginBottom: 6 }}>
                <a onClick={() => router.push(`/admin/db-occupation/${l.other.occupation_id}?tab=tasks`)}>{l.other.name}</a>
                {l.other.difficulty && <Tag style={{ marginLeft: 6 }}>{TASK_DIFFICULTY_LABELS[l.other.difficulty]}</Tag>}
              </div>) : <Text type="secondary">—</Text>}
            </Card>
          </>}
          {(type === 'place' || type === 'station') && <Card size="small" title={`${type === 'station' ? '工位上的仪器设备' : '这里有哪些工具设备'}（${items.length}）`} style={{ marginBottom: 16 }}>
            {items.length ? <Space wrap>{items.map(l => <Tag key={l.id} style={{ cursor: 'pointer', padding: '2px 8px' }} onClick={() => goto('item', l.other_id)} color={ITEM_KIND_LABELS[l.other.kind]?.color}>{l.other.name}</Tag>)}</Space> : <Text type="secondary">—</Text>}
          </Card>}
          {type === 'place' && <Card size="small" title={`这里的工位 / 操作台（${stations.length}）`} style={{ marginBottom: 16 }}>
            {stations.length ? <Space wrap>{stations.map(l => <Tag key={l.id} style={{ cursor: 'pointer', padding: '2px 8px' }} onClick={() => goto('station', l.other_id)}>{l.other.name}</Tag>)}</Space> : <Text type="secondary">—</Text>}
          </Card>}
          {type === 'item' && <Card size="small" title={`装在哪些工位上（${stations.length}）`} style={{ marginBottom: 16 }}>
            {stations.length ? <Space wrap>{stations.map(l => <Tag key={l.id} style={{ cursor: 'pointer', padding: '2px 8px' }} onClick={() => goto('station', l.other_id)}>{l.other.name}</Tag>)}</Space> : <Text type="secondary">—</Text>}
          </Card>}
          {(type === 'item' || type === 'station') && <Card size="small" title={`在哪些场所${type === 'station' ? '' : '用'}（${places.length}）`} style={{ marginBottom: 16 }}>
            {places.length ? <Space wrap>{places.map(l => <Tag key={l.id} style={{ cursor: 'pointer', padding: '2px 8px' }} onClick={() => goto('place', l.other_id)}>{l.other.name}</Tag>)}</Space> : <Text type="secondary">—</Text>}
          </Card>}
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title={`${type === 'item' ? '要会用它的职业' : type === 'station' ? '在这个工位上工作的职业' : '在这里工作的职业'}（${occ.length}）`} style={{ marginBottom: 16 }}>
            {occ.length ? occ.map(l => <div key={l.id} style={{ marginBottom: 8 }}>
              <a onClick={() => goto('occupation', l.other_id)} style={{ fontWeight: 600 }}>{l.other.name}</a>
              {l.frequency && <Tag style={{ marginLeft: 6 }}>{LINK_FREQUENCY_LABELS[l.frequency] || l.frequency}</Tag>}
              {l.proficiency && <Tag color="blue">{l.proficiency}</Tag>}
              {l.source === 'lab' && <Tag color="purple">百业</Tag>}
              {l.note && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{l.note}</div>}
            </div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有关联职业" />}
          </Card>
          <Card size="small" title={`能亲手体验的百业空间（${d.spaces.length}）`}>
            {d.spaces.length ? d.spaces.map((s: any) => <div key={s.id} style={{ marginBottom: 6 }}><a href={`/lab/${s.id}`} target="_blank" rel="noreferrer">{s.title}</a></div>) : <Text type="secondary">还没有百业空间用到它</Text>}
          </Card>
        </Col>
      </Row>
      <Modal open={editOpen} title={`编辑：${e.name}`} width={760} onCancel={() => setEditOpen(false)} okText="保存（改过的字段会锁定）" destroyOnHidden
        onOk={async () => { if (await patch(await form.validateFields())) setEditOpen(false); }}>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            {c.fields.filter(f => f.kind !== 'json').map(f => <Col key={f.key} span={f.kind === 'text' || f.kind === 'tags' || f.key === 'image_url' ? 24 : 12}>
              <Form.Item name={f.key} label={f.label} rules={f.key === 'name' ? [{ required: true }] : undefined}>
                {f.kind === 'text' ? <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} />
                  : f.kind === 'tags' ? <Select mode="tags" tokenSeparators={['、', ',', '，']} />
                  : f.kind === 'enum' ? <Select allowClear options={Object.entries(f.options || {}).map(([value, label]) => ({ value, label }))} />
                  : <Input />}
              </Form.Item>
            </Col>)}
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

/** 职业详情里的「场所与工具」tab：场所卡片 + 物品按类型分组（频率、熟练度、对应技能） */
export function OccupationContextTab({ links, skills, onGenerate, busy }: { links: any[]; skills: { id: string; name: string }[]; onGenerate: () => void; busy: boolean }) {
  const router = useRouter();
  const places = links.filter(l => l.other_type === 'place');
  const items = links.filter(l => l.other_type === 'item');
  const stations = links.filter(l => l.other_type === 'station');
  const skillName = (sid: string) => skills.find(s => s.id === sid)?.name || sid;
  if (!places.length && !items.length) return <Empty description={<span>还没有场所与工具 <Button type="link" loading={busy} onClick={onGenerate}>联网生成</Button></span>} />;
  const kinds = Object.keys(ITEM_KIND_LABELS).filter(k => items.some(l => l.other.kind === k));
  const rank = (l: any) => ({ daily: 0, weekly: 1, occasional: 2 } as any)[l.frequency] ?? 3;
  return (
    <div>
      <Card size="small" title={`工作场所（${places.length}）`} style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {places.sort((a, b) => rank(a) - rank(b)).map(l => (
            <div key={l.id} onClick={() => router.push(`/admin/db-place/${l.other_id}`)} style={{ cursor: 'pointer', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
              {l.other.image_url ? <img src={l.other.image_url} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} /> : <div style={{ height: 52, background: '#f5f3ff' }} />}
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontWeight: 600 }}>{l.other.name}{l.source === 'lab' && <Tag color="purple" style={{ marginLeft: 6 }}>百业</Tag>}</div>
                <div style={{ fontSize: 12, color: BRAND.ink3 }}>{[PLACE_CATEGORY_LABELS[l.other.category], LINK_FREQUENCY_LABELS[l.frequency]].filter(Boolean).join(' · ')}</div>
                {l.note && <div style={{ fontSize: 12, marginTop: 4 }}>{l.note}</div>}
              </div>
            </div>
          ))}
        </div>
      </Card>
      {stations.length > 0 && <Card size="small" title={`工位 / 操作台（${stations.length}）`} style={{ marginBottom: 16 }}>
        <Space wrap>{stations.map(l => <Tag key={l.id} style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 13 }} onClick={() => router.push(`/admin/db-station/${l.other_id}`)}>
          {l.other.name}{l.other.lab_bench && <span style={{ color: '#d97706' }}> · 可体验</span>}</Tag>)}</Space>
      </Card>}
      {kinds.map(k => (
        <Card key={k} size="small" title={`${ITEM_KIND_LABELS[k].label}（${items.filter(l => l.other.kind === k).length}）`} style={{ marginBottom: 16 }}>
          <Table size="small" rowKey="id" pagination={false} dataSource={items.filter(l => l.other.kind === k).sort((a, b) => rank(a) - rank(b))}
            columns={[
              { title: '', width: 56, render: (_: any, l: any) => <Thumb url={l.other.image_url} size={36} /> },
              { title: '名称', render: (_: any, l: any) => <span><a onClick={() => router.push(`/admin/db-item/${l.other_id}`)} style={{ fontWeight: 600 }}>{l.other.name}</a>
                {l.other.lab_bench && <Tag color="orange" style={{ marginLeft: 6 }}>可在百业体验</Tag>}{l.source === 'lab' && <Tag color="purple">百业</Tag>}
                {l.other.category && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{l.other.category}</div>}</span> },
              { title: '频率', dataIndex: 'frequency', width: 70, render: (v: string) => LINK_FREQUENCY_LABELS[v] || '—' },
              { title: '熟练度', dataIndex: 'proficiency', width: 80, render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '—' },
              { title: '对应技能', dataIndex: 'skill_ids', width: 240, render: (v: string[]) => (v || []).map(s => <Tag key={s} style={{ fontSize: 11, marginBottom: 2 }}>{skillName(s)}</Tag>) },
              { title: '用法', dataIndex: 'note', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text> },
            ]} />
        </Card>
      ))}
    </div>
  );
}

/** 职业详情里的「典型任务」tab：按难度排，展开看目标 / 验收 / 过程 / 相关方 / 失误；工位、百业空间可点 */
export function OccupationTasksTab({ tasks, skills, onGenerate, busy }: { tasks: any[]; skills: { id: string; name: string }[]; onGenerate: () => void; busy: boolean }) {
  const router = useRouter();
  const skillName = (sid: string) => skills.find(s => s.id === sid)?.name || sid;
  if (!tasks.length) return <Empty description={<span>还没有典型任务 <Button type="link" loading={busy} onClick={onGenerate}>联网生成</Button></span>} />;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text type="secondary">典型任务发生在工位上；AI 百业的章节是它们的演出实例。</Text>
        <Button size="small" loading={busy} onClick={onGenerate}>补充更多任务</Button>
      </div>
      <Table size="small" rowKey="id" pagination={false} dataSource={tasks}
        expandable={{ expandedRowRender: (t: any) => (
          <div style={{ padding: '4px 8px' }}>
            {t.summary && <Paragraph style={{ marginBottom: 6 }}><Text type="secondary">情境：</Text>{t.summary}</Paragraph>}
            {t.goal && <Paragraph style={{ marginBottom: 6 }}><Text type="secondary">目标：</Text><b>{t.goal}</b></Paragraph>}
            {!!t.success_criteria?.length && <div style={{ marginBottom: 8 }}><Text type="secondary">验收标准：</Text>{t.success_criteria.map((c: any, i: number) => <Tag key={i} color="green" style={{ marginBottom: 4 }}>{c.name}{c.target ? `：${c.target}` : ''}</Tag>)}</div>}
            {!!t.process?.length && <div style={{ marginBottom: 8 }}>
              <Text type="secondary">过程：</Text>
              <ol style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                {t.process.map((p: any, i: number) => <li key={i} style={{ marginBottom: 4 }}>
                  <b>{p.step}</b>{p.action ? `：${p.action}` : ''}
                  {!!p.items?.length && <span style={{ marginLeft: 6 }}>{p.items.map((it: string) => <Tag key={it} style={{ fontSize: 11 }}>{it}</Tag>)}</span>}
                  {p.checkpoint && <div style={{ fontSize: 12, color: '#d97706' }}>检查点：{p.checkpoint}</div>}
                </li>)}
              </ol>
            </div>}
            {!!t.stakeholders?.length && <div style={{ marginBottom: 8 }}><Text type="secondary">相关方：</Text>
              {t.stakeholders.map((s: any, i: number) => <div key={i} style={{ fontSize: 13, marginLeft: 12 }}><b>{s.role}</b>{s.relation ? `（${s.relation}）` : ''}{s.interaction ? `：${s.interaction}` : ''}</div>)}</div>}
            {t.common_mistakes && <Paragraph style={{ marginBottom: 6 }}><Text type="secondary">常见失误：</Text><Text type="danger">{t.common_mistakes}</Text></Paragraph>}
            {!!t.skill_ids?.length && <div style={{ marginBottom: 6 }}><Text type="secondary">对应技能：</Text>{t.skill_ids.map((s: string) => <Tag key={s} color="blue">{skillName(s)}</Tag>)}</div>}
            {!!t.spaces?.length && <div><Text type="secondary">百业里演出它的空间：</Text>{t.spaces.map((s: any) => <a key={s.id} href={`/lab/${s.id}`} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>{s.title}</a>)}</div>}
          </div>
        ) }}
        columns={[
          { title: '典型任务', dataIndex: 'name', render: (v: string, t: any) => <span><b>{v}</b>{t.source === 'lab' && <Tag color="purple" style={{ marginLeft: 6 }}>百业</Tag>}
            {t.goal && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{t.goal}</div>}</span> },
          { title: '工位', dataIndex: 'station', width: 220, render: (s: any) => s ? <a onClick={() => router.push(`/admin/db-station/${s.id}`)}>{s.name}{s.lab_bench && <Tag color="orange" style={{ marginLeft: 4 }}>可体验</Tag>}</a> : '—' },
          { title: '难度', dataIndex: 'difficulty', width: 90, render: (v: number) => v ? <Tag color={['', 'green', 'blue', 'purple'][v]}>{TASK_DIFFICULTY_LABELS[v]}</Tag> : '—' },
          { title: '频率', dataIndex: 'frequency', width: 70, render: (v: string) => LINK_FREQUENCY_LABELS[v] || '—' },
          { title: '用时', dataIndex: 'duration', width: 110 },
          { title: '相关方', dataIndex: 'stakeholders', width: 160, render: (v: any[]) => <Text type="secondary" style={{ fontSize: 12 }}>{(v || []).map(s => s.role).join('、') || '—'}</Text> },
        ]} />
    </div>
  );
}
