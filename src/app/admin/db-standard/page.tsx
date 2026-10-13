'use client';

/**
 * 行业标准与操作规程库（迁移 022）：标准题录 + 操作要点（AI 转述，不抄原文）+ 适用职业；人工审核同其他库。
 * 详情里能看到这条标准被哪些百业空间引为依据（standard_links）。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Descriptions, Drawer, Input, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { BookOutlined, CheckCircleOutlined, CloseCircleOutlined, LinkOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { REVIEW_STATUS, REVIEW_STATUS_OPTIONS } from '@/lib/review-status';
import { POINT_KIND_LABELS, STANDARD_DOC_TYPE_LABELS, STANDARD_FIELDS, STANDARD_KIND_LABELS, STANDARD_STATUS_LABELS, formatStandardValue } from '@/lib/standard-fields';

const { Text, Paragraph } = Typography;

export default function DbStandardPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [profs, setProfs] = useState<[string, number][]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ search: '', kind: '', docType: '', status: '', review: '', profession: '' });
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [detail, setDetail] = useState<{ standard: any; links: any[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: '50', withStats: '1', ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
      const j = await (await fetch(`/api/db/standards?${q}`, { cache: 'no-store' })).json();
      if (!j.success) throw new Error(j.error);
      setData(j.data); setTotal(j.total); if (j.stats) setStats(j.stats); if (j.professions) setProfs(j.professions);
    } catch (e: any) { message.error(e.message); } finally { setLoading(false); }
  }, [page, f, message]);
  useEffect(() => { load(); }, [load]);
  const set = (k: keyof typeof f, v: string) => { setPage(1); setF(x => ({ ...x, [k]: v })); };

  const review = async (ids: React.Key[], status: string) => {
    const j = await (await fetch('/api/db/standards', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, human_review_status: status }) })).json();
    if (!j.success) return message.error(j.error);
    message.success(`已更新 ${ids.length} 条`); setSelected([]); load();
  };
  const open = async (id: number) => {
    const j = await (await fetch(`/api/db/standards/${id}`)).json();
    if (j.success) setDetail({ standard: j.standard, links: j.links }); else message.error(j.error);
  };

  return (
    <div>
      <PageHeader title="行业标准与操作规程库" icon={<BookOutlined />}
        description="国标、行标、团标、企业规程、国际标准与法规的题录，加上每条标准对岗位操作的要点（转述，不抄原文，全文走官方链接）。百业空间的工位规则可以逐条指回这里。" />
      <StatCards loading={loading && !stats.total} items={[
        { label: '标准总数', value: stats.total }, { label: '现行', value: stats.current, color: '#52c41a' },
        { label: '有操作要点', value: stats.withPoints }, { label: '要点条数', value: stats.points },
        { label: '强制性国标', value: stats.national_mandatory, color: '#f5222d' }, { label: '行业标准', value: stats.industry }, { label: '审核通过', value: stats.reviewed },
      ]} />
      <Panel>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search allowClear placeholder="搜标准号 / 名称 / 单位 / 行业" style={{ width: 260 }} onSearch={v => set('search', v)} />
          <Select allowClear placeholder="适用职业" style={{ width: 200 }} showSearch value={f.profession || undefined} onChange={v => set('profession', v || '')} options={profs.map(([p, n]) => ({ value: p, label: `${p} · ${n}` }))} />
          <Select allowClear placeholder="层级" style={{ width: 140 }} onChange={v => set('kind', v || '')} options={Object.entries(STANDARD_KIND_LABELS).map(([k, v]) => ({ value: k, label: v.label }))} />
          <Select allowClear placeholder="文件类型" style={{ width: 160 }} onChange={v => set('docType', v || '')} options={Object.entries(STANDARD_DOC_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v.label }))} />
          <Select allowClear placeholder="状态" style={{ width: 110 }} onChange={v => set('status', v || '')} options={Object.entries(STANDARD_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v.label }))} />
          <Select allowClear placeholder="审核" style={{ width: 110 }} onChange={v => set('review', v || '')} options={REVIEW_STATUS_OPTIONS} />
          {selected.length > 0 && <>
            <Button icon={<CheckCircleOutlined />} onClick={() => review(selected, 'complete')}>通过 {selected.length}</Button>
            <Button icon={<CloseCircleOutlined />} danger onClick={() => review(selected, 'rejected')}>不通过</Button>
          </>}
        </Space>
        <Table size="small" rowKey="id" loading={loading} dataSource={data} scroll={{ x: 1100 }}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={{ current: page, pageSize: 50, total, onChange: setPage, showSizeChanger: false, showTotal: t => `共 ${t} 条` }}
          columns={[
            { title: '标准号', dataIndex: 'code', width: 170, render: (v: string, r: any) => <a onClick={() => open(r.id)} style={{ fontFamily: 'monospace' }}>{v || '（无编号）'}</a> },
            { title: '名称', dataIndex: 'title', render: (v: string, r: any) => <a onClick={() => open(r.id)}>{v}</a> },
            { title: '层级', dataIndex: 'kind', width: 110, render: (v: string) => v ? <Tag color={STANDARD_KIND_LABELS[v]?.color}>{STANDARD_KIND_LABELS[v]?.label}</Tag> : '—' },
            { title: '类型', dataIndex: 'doc_type', width: 120, render: (v: string) => v ? <Tag color={STANDARD_DOC_TYPE_LABELS[v]?.color}>{STANDARD_DOC_TYPE_LABELS[v]?.label}</Tag> : '—' },
            { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={STANDARD_STATUS_LABELS[v]?.color}>{STANDARD_STATUS_LABELS[v]?.label || v}</Tag> },
            { title: '适用职业', dataIndex: 'professions', width: 200, render: (v: string[]) => <Space size={2} wrap>{(v || []).slice(0, 3).map(p => <Tag key={p} style={{ margin: 0 }}>{p}</Tag>)}{(v || []).length > 3 && <Text type="secondary">+{v.length - 3}</Text>}</Space> },
            { title: '要点', dataIndex: 'key_points', width: 60, render: (v: any[]) => (v || []).length || '—' },
            { title: '审核', dataIndex: 'human_review_status', width: 90, render: (v: string) => <Tag color={REVIEW_STATUS[v]?.color}>{REVIEW_STATUS[v]?.label || '—'}</Tag> },
          ]} />
      </Panel>

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={780} title={detail ? `${detail.standard.code || ''} ${detail.standard.title}` : ''}
        extra={detail && <Space>
          <Button onClick={() => review([detail.standard.id], 'complete').then(() => setDetail(null))}>通过</Button>
          <Popconfirm title="删除这条标准？" onConfirm={async () => { await fetch(`/api/db/standards/${detail.standard.id}`, { method: 'DELETE' }); setDetail(null); load(); }}><Button danger>删除</Button></Popconfirm>
        </Space>}>
        {detail && (() => { const s = detail.standard; return <>
          {s.official_url && <Paragraph><a href={s.official_url} target="_blank" rel="noreferrer"><LinkOutlined /> 官方页面 · 看全文</a></Paragraph>}
          <Descriptions size="small" column={2} bordered items={STANDARD_FIELDS.filter(x => !['key_points', 'official_url', 'note', 'title'].includes(x.key)).map(x => ({ key: x.key, label: x.label, span: x.kind === 'text' ? 2 : 1, children: formatStandardValue(x.key, s[x.key]) || <Text type="secondary">—</Text> }))} />
          <div style={{ marginTop: 16, fontWeight: 600 }}>操作要点 <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>AI 转述，以官方原文为准</Text></div>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {(s.key_points || []).map((p: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <Tag color={POINT_KIND_LABELS[p.kind]?.color} style={{ margin: 0 }}>{POINT_KIND_LABELS[p.kind]?.label || p.kind}</Tag>
                {p.clause && <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.clause}</Text>}
                <span>{p.point}</span>
              </div>
            ))}
            {!(s.key_points || []).length && <Text type="secondary">还没有要点</Text>}
          </div>
          <div style={{ marginTop: 16, fontWeight: 600 }}>被这些百业空间引为依据</div>
          {detail.links.length ? detail.links.map(l => <div key={l.id} style={{ fontSize: 13 }}><a href={`/lab/${l.space_id}`} target="_blank" rel="noreferrer">{l.space_id.slice(0, 8)}</a> · {l.target}{l.clause ? ` · ${l.clause}` : ''}{l.note ? ` — ${l.note}` : ''}</div>) : <Text type="secondary">暂无（空间挂依据是下一步）</Text>}
          {Object.keys(s.ai_sources || {}).length > 0 && <Paragraph style={{ marginTop: 16, fontSize: 12 }}><Text strong>来源：</Text>{Object.entries(s.ai_sources).map(([k, u]: any) => <div key={k}>{k}：<a href={u} target="_blank" rel="noreferrer">{u}</a></div>)}</Paragraph>}
        </>; })()}
      </Drawer>
    </div>
  );
}
