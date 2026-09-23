'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Col, Descriptions, Drawer, Dropdown, Form, Input, InputNumber, Modal, Popconfirm, Progress, Row, Select, Space, Switch, Table, Tag, Tooltip, Typography, App } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, DownOutlined, EditOutlined, LinkOutlined, LockOutlined, SafetyCertificateOutlined, TrophyOutlined, GlobalOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { BRAND } from '@/lib/theme';
import { REVIEW_STATUS, REVIEW_STATUS_OPTIONS } from '@/lib/review-status';
import {
  COMPETITION_FIELDS, COMPETITION_GROUPS, COMPETITION_KIND_LABELS, COMPETITION_LEVEL_LABELS, COMPETITION_STATUS_LABELS, OFFER_TRACK_LABELS, REWARD_LABELS, REWARD_KEYS,
  formatCompetitionValue, hasCompetitionValue,
} from '@/lib/competition-fields';

const { Text, Paragraph } = Typography;

const RewardTags = ({ types }: { types?: string[] }) => <Space size={2} wrap>{(types || []).map(t => REWARD_LABELS[t] ? <Tag key={t} color={REWARD_LABELS[t].color} style={{ margin: 0 }}>{REWARD_LABELS[t].emoji} {REWARD_LABELS[t].label}</Tag> : null)}</Space>;
const deadlineColor = (d?: string | null) => {
  if (!d) return BRAND.ink4;
  const days = (new Date(d).getTime() - Date.now()) / 86400000;
  return days < 0 ? BRAND.ink4 : days <= 7 ? '#f5222d' : days <= 30 ? '#fa8c16' : BRAND.ink;
};

export default function DbCompetitionPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [reward, setReward] = useState('');
  const [review, setReview] = useState('');
  const [sort, setSort] = useState('deadline');
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [active, setActive] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '50', search, kind, level, status, reward, review, sort, withStats: '1' });
      const json = await (await fetch(`/api/db/competitions?${qs}`)).json();
      if (!json.success) throw new Error(json.error);
      setData(json.data); setTotal(json.total); setStats(json.stats || {});
    } catch (e: any) { message.error(`加载失败: ${e.message}`); }
    finally { setLoading(false); }
  }, [page, search, kind, level, status, reward, review, sort]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (r: any) => {
    setActive(r); setNote(r.human_review_note || '');
    try { const j = await (await fetch(`/api/db/competitions/${r.id}`)).json(); if (j.success) setActive(j.competition); } catch { /* ignore */ }
  };
  const patchOne = async (id: number, body: any, ok: string) => {
    const j = await (await fetch(`/api/db/competitions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    if (!j.success) { message.error(j.error); return; }
    message.success(ok); setActive(j.competition); load();
  };
  const remove = async (id: number) => {
    const j = await (await fetch(`/api/db/competitions/${id}`, { method: 'DELETE' })).json();
    if (j.success) { message.success('已删除'); setActive(null); load(); } else message.error(j.error);
  };
  const batchReview = async (s: string) => {
    const j = await (await fetch('/api/db/competitions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected, human_review_status: s }) })).json();
    if (!j.success) { message.error(j.error); return; }
    message.success(`已标记 ${j.updated} 条为「${REVIEW_STATUS[s]?.label}」`); setSelected([]); load();
  };
  const openEdit = () => { form.setFieldsValue(active); setEditOpen(true); };
  const saveEdit = async () => {
    try { const v = await form.validateFields(); await patchOne(active.id, v, '已保存'); setEditOpen(false); } catch (e: any) { if (e?.message) message.error(e.message); }
  };

  const sources: Record<string, string> = active?.ai_sources || {};
  const columns = [
    { title: '赛事', dataIndex: 'name', fixed: 'left' as const, width: 300, render: (t: string, r: any) => (
      <div style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
        <div style={{ fontWeight: 600, color: BRAND.primary }}>{t}{r.official_url && <a href={r.official_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ marginLeft: 6, fontSize: 12, color: BRAND.ink4 }}><LinkOutlined /></a>}</div>
        <div style={{ fontSize: 12, color: BRAND.ink3 }}>{[r.organizer, r.year].filter(Boolean).join(' · ')}</div>
      </div>
    ) },
    { title: '类型', dataIndex: 'kind', width: 110, render: (k: string) => k ? <Tag color={COMPETITION_KIND_LABELS[k]?.color}>{COMPETITION_KIND_LABELS[k]?.label || k}</Tag> : '-' },
    { title: '级别', dataIndex: 'level', width: 80, render: (l: string) => l ? <Tag color={COMPETITION_LEVEL_LABELS[l]?.color}>{COMPETITION_LEVEL_LABELS[l]?.label}</Tag> : '-' },
    { title: '奖励', dataIndex: 'reward_types', width: 190, render: (t: string[]) => t?.length ? <RewardTags types={t} /> : <Text type="secondary">—</Text> },
    { title: '硬件', dataIndex: 'hardware_prize_detail', width: 150, ellipsis: true, render: (t: string, r: any) => r.hardware_prize ? <Tooltip title={t}><span style={{ fontSize: 12 }}>💻 {t || '有实物奖品'}</span></Tooltip> : <Text type="secondary">—</Text> },
    { title: '求职通道', dataIndex: 'offer_track', width: 100, render: (t: string, r: any) => t && t !== 'none' && t !== 'unknown' ? <Tooltip title={r.offer_track_detail}><Tag color="red">{OFFER_TRACK_LABELS[t]}</Tag></Tooltip> : <Text type="secondary">—</Text> },
    { title: '报名截止', dataIndex: 'registration_deadline_str', width: 110, render: (t: string, r: any) => <span style={{ color: deadlineColor(r.registration_deadline), fontSize: 12, fontWeight: r.registration_deadline && (new Date(r.registration_deadline).getTime() - Date.now()) / 86400000 <= 7 ? 600 : 400 }}>{t || '-'}</span> },
    { title: '状态', dataIndex: 'status', width: 90, render: (s: string) => <Tag color={COMPETITION_STATUS_LABELS[s]?.color}>{COMPETITION_STATUS_LABELS[s]?.label || s || '未知'}</Tag> },
    { title: '完整度', dataIndex: 'completeness_score', width: 100, render: (n: number) => n != null ? <Progress percent={n} size="small" style={{ width: 70 }} strokeColor={n >= 80 ? BRAND.success : n >= 50 ? '#fa8c16' : '#f5222d'} /> : '-' },
    { title: '审核', dataIndex: 'human_review_status', width: 90, render: (s: string) => s ? <Tag color={REVIEW_STATUS[s]?.color}>{REVIEW_STATUS[s]?.label || s}</Tag> : <Tag>未审核</Tag> },
  ];

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <PageHeader icon={<TrophyOutlined />} title="企业赛事库" description="企业办的比赛：黑客松 / 开发者大赛 / 商业案例赛 / 数据竞赛 / 校园创新赛。按奖励（设备 / 钱 / 实习 / offer）、截止时间、级别筛选；学生视角标注背提价值与求职通道。"
        extra={<Button type="primary" icon={<TrophyOutlined />} onClick={() => router.push('/admin/tool-competition')}>去雷达检索</Button>} />

      <StatCards loading={loading && !total} items={[
        { label: '赛事总数', value: stats.total || 0, icon: <TrophyOutlined /> },
        { label: '报名中', value: stats.open || 0, icon: <ClockCircleOutlined />, color: '#16a34a' },
        { label: '💻 给设备', value: stats.hardware || 0, color: '#722ed1' },
        { label: '💰 给钱', value: stats.cash || 0, color: '#d97706' },
        { label: '🪪 给实习', value: stats.internship || 0, color: '#0891b2' },
        { label: '🎯 给 offer', value: stats.offer || 0, color: '#dc2626' },
        { label: '全球级', value: stats.global || 0, icon: <GlobalOutlined />, color: '#2f54eb' },
        { label: '审核通过', value: stats.reviewed || 0, icon: <SafetyCertificateOutlined />, color: '#16a34a' },
      ]} />

      <Panel padding={16}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input.Search placeholder="搜索赛事 / 主办方 / 主题" allowClear style={{ width: 260 }} onSearch={v => { setSearch(v); setPage(1); }} />
          <Select value={reward} style={{ width: 130 }} onChange={v => { setReward(v); setPage(1); }} options={[{ value: '', label: '全部奖励' }, ...REWARD_KEYS.map(k => ({ value: k, label: `${REWARD_LABELS[k].emoji} ${REWARD_LABELS[k].label}` }))]} />
          <Select value={kind} style={{ width: 150 }} onChange={v => { setKind(v); setPage(1); }} options={[{ value: '', label: '全部类型' }, ...Object.entries(COMPETITION_KIND_LABELS).map(([k, m]) => ({ value: k, label: m.label }))]} />
          <Select value={level} style={{ width: 110 }} onChange={v => { setLevel(v); setPage(1); }} options={[{ value: '', label: '全部级别' }, ...Object.entries(COMPETITION_LEVEL_LABELS).map(([k, m]) => ({ value: k, label: m.label }))]} />
          <Select value={status} style={{ width: 110 }} onChange={v => { setStatus(v); setPage(1); }} options={[{ value: '', label: '全部状态' }, ...Object.entries(COMPETITION_STATUS_LABELS).map(([k, m]) => ({ value: k, label: m.label }))]} />
          <Select value={review} style={{ width: 120 }} onChange={v => { setReview(v); setPage(1); }} options={[{ value: '', label: '全部审核' }, { value: 'none', label: '未审核' }, ...REVIEW_STATUS_OPTIONS]} />
          <Select value={sort} style={{ width: 120 }} onChange={setSort} options={[{ value: 'deadline', label: '按截止时间' }, { value: 'created', label: '按入库时间' }]} />
          <div style={{ flex: 1 }} />
          {selected.length > 0 && (
            <Space>
              <Text type="secondary">已选 {selected.length}</Text>
              <Button type="primary" ghost icon={<CheckCircleOutlined />} onClick={() => batchReview('complete')}>审核通过</Button>
              <Dropdown menu={{ items: REVIEW_STATUS_OPTIONS.filter(o => o.value !== 'complete').map(o => ({ key: o.value, label: `审核：${o.label}` })), onClick: ({ key }) => batchReview(key) }}><Button>更多 <DownOutlined /></Button></Dropdown>
            </Space>
          )}
        </div>
        <Table rowKey="id" size="small" loading={loading} dataSource={data} columns={columns} scroll={{ x: 1400 }}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={{ current: page, pageSize: 50, total, onChange: setPage, showTotal: t => `共 ${t} 条`, showSizeChanger: false }}
          locale={{ emptyText: <span>还没有赛事。<a onClick={() => router.push('/admin/tool-competition')}>去雷达检索</a>，奔着奖品找比赛。</span> }} />
      </Panel>

      <Drawer open={!!active} onClose={() => setActive(null)} size="large" title={active ? <Space><span>{active.name}</span>{active.status && <Tag color={COMPETITION_STATUS_LABELS[active.status]?.color}>{COMPETITION_STATUS_LABELS[active.status]?.label}</Tag>}</Space> : ''}
        extra={active && <Space>
          <Button size="small" icon={<EditOutlined />} onClick={openEdit}>编辑</Button>
          <Popconfirm title="删除这条赛事？" onConfirm={() => remove(active.id)} okText="删除" okButtonProps={{ danger: true }} cancelText="取消"><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>}>
        {active && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <RewardTags types={active.reward_types} />
              {active.kind && <Tag color={COMPETITION_KIND_LABELS[active.kind]?.color}>{COMPETITION_KIND_LABELS[active.kind]?.label}</Tag>}
              {active.level && <Tag color={COMPETITION_LEVEL_LABELS[active.level]?.color}>{COMPETITION_LEVEL_LABELS[active.level]?.label}</Tag>}
              {active.organizer_company?.id && <Tag style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/db-company/${active.organizer_company.id}`)}>主办：{active.organizer_company.name} →</Tag>}
              {active.completeness_score != null && <Tag>完整度 {active.completeness_score}</Tag>}
            </div>
            <Space wrap style={{ marginBottom: 8 }}>
              {active.official_url && <Button size="small" href={active.official_url} target="_blank" icon={<LinkOutlined />}>官方页面</Button>}
              {active.registration_url && <Button size="small" type="primary" href={active.registration_url} target="_blank">去报名</Button>}
            </Space>
            <div style={{ background: '#fafafa', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <Space wrap style={{ marginBottom: 8 }}>
                <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => patchOne(active.id, { human_review_status: 'complete', human_review_note: note }, '已审核通过')}>审核通过</Button>
                <Button danger size="small" icon={<CloseCircleOutlined />} onClick={() => patchOne(active.id, { human_review_status: 'rejected', human_review_note: note }, '已标记不通过')}>不通过</Button>
                <Select size="small" style={{ width: 120 }} placeholder="其他状态" value={null} options={REVIEW_STATUS_OPTIONS.filter(o => !['complete', 'rejected'].includes(o.value))} onChange={v => v && patchOne(active.id, { human_review_status: v, human_review_note: note }, '审核状态已更新')} />
                {active.human_review_status && <Tag color={REVIEW_STATUS[active.human_review_status]?.color}>{REVIEW_STATUS[active.human_review_status]?.label}</Tag>}
              </Space>
              <Input.TextArea rows={1} placeholder="审核备注" value={note} onChange={e => setNote(e.target.value)} />
              {(active.human_locked_fields || []).length > 0 && <div style={{ fontSize: 12, color: BRAND.ink4, marginTop: 6 }}><LockOutlined /> 已锁定：{(active.human_locked_fields as string[]).map(k => COMPETITION_FIELDS.find(f => f.key === k)?.label || k).join('、')} <a onClick={() => patchOne(active.id, { unlock: active.human_locked_fields }, '已解除锁定')}>解除</a></div>}
            </div>
            {COMPETITION_GROUPS.map(g => {
              const fields = COMPETITION_FIELDS.filter(f => f.group === g);
              const filled = fields.filter(f => hasCompetitionValue(active[f.key]));
              if (!filled.length) return null;
              return (
                <div key={g} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.ink2, margin: '0 0 8px', borderLeft: `3px solid ${BRAND.primary}`, paddingLeft: 8 }}>{g}<Text type="secondary" style={{ fontWeight: 400, marginLeft: 8 }}>{fields.length > filled.length ? `空缺 ${fields.length - filled.length} 项` : ''}</Text></div>
                  <Descriptions column={1} size="small" styles={{ label: { width: 110 } }}>
                    {filled.map(f => (
                      <Descriptions.Item key={f.key} label={f.label}>
                        {f.kind === 'url' ? <a href={active[f.key]} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{active[f.key]}</a>
                          : f.kind === 'text' ? <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }} ellipsis={{ rows: 4, expandable: true, symbol: '展开' }}>{formatCompetitionValue(f.key, active[f.key])}</Paragraph>
                          : formatCompetitionValue(f.key, active[f.key])}
                        {sources[f.key] && <Tooltip title={sources[f.key]}><a href={sources[f.key]} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: BRAND.ink4 }}><LinkOutlined /></a></Tooltip>}
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                </div>
              );
            })}
            {active.search && <Text type="secondary" style={{ fontSize: 12 }}>来自检索「{active.search.company ? `${active.search.company} · ` : ''}{active.search.query}」 · {new Date(active.search.created_at).toLocaleString('zh-CN')}</Text>}
          </>
        )}
      </Drawer>

      <Modal title="编辑赛事" open={editOpen} onOk={saveEdit} onCancel={() => setEditOpen(false)} okText="保存" width={760} destroyOnHidden>
        <Form form={form} layout="vertical" style={{ maxHeight: '64vh', overflowY: 'auto', paddingRight: 8 }}>
          {COMPETITION_GROUPS.map(group => (
            <div key={group}>
              <div style={{ fontWeight: 600, color: BRAND.ink2, margin: '8px 0 12px', borderLeft: `3px solid ${BRAND.primary}`, paddingLeft: 8 }}>{group}</div>
              <Row gutter={12}>
                {COMPETITION_FIELDS.filter(f => f.group === group).map(f => (
                  <Col key={f.key} span={f.kind === 'text' || f.kind === 'url' || f.kind === 'tags' ? 24 : 12}>
                    <Form.Item name={f.key} label={f.label} valuePropName={f.kind === 'bool' ? 'checked' : 'value'} rules={f.key === 'name' ? [{ required: true, message: '必填' }] : undefined}>
                      {f.kind === 'text' ? <Input.TextArea rows={3} />
                        : f.kind === 'number' ? <InputNumber style={{ width: '100%' }} />
                        : f.kind === 'bool' ? <Switch />
                        : f.kind === 'tags' && f.key === 'reward_types' ? <Select mode="multiple" options={REWARD_KEYS.map(k => ({ value: k, label: `${REWARD_LABELS[k].emoji} ${REWARD_LABELS[k].label}` }))} />
                        : f.kind === 'tags' ? <Select mode="tags" tokenSeparators={[',', '，']} open={false} suffixIcon={null} placeholder="输入后回车" />
                        : f.kind === 'enum' && f.enum ? <Select allowClear options={Object.entries(f.enum).map(([k, m]) => ({ value: k, label: typeof m === 'string' ? m : m.label }))} />
                        : <Input />}
                    </Form.Item>
                  </Col>
                ))}
              </Row>
            </div>
          ))}
        </Form>
      </Modal>
    </div>
  );
}
