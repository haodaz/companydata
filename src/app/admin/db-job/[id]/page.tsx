'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Spin, Tag, Tooltip, Typography, App } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, EditOutlined, LockOutlined, LinkOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { EntityHero } from '@/components/admin/EntityHero';
import { BRAND } from '@/lib/theme';
import { JOB_FIELDS, JOB_GROUPS, JOB_STATUS, JOB_TYPE_LABELS, RECRUIT_SEASON_LABELS, REMOTE_TYPE_LABELS, JobFieldDef, formatJobValue, formatSalary } from '@/lib/job-fields';
import { REVIEW_STATUS, REVIEW_STATUS_OPTIONS } from '@/lib/review-status';
import { SEGMENT_LABELS } from '@/lib/company-fields';

const { Text } = Typography;

const LEFT_GROUPS: JobFieldDef['group'][] = ['content'];
const RIGHT_GROUPS: JobFieldDef['group'][] = ['basic', 'requirement', 'location', 'salary', 'timeline', 'link'];

export default function JobDetailPage() {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [note, setNote] = useState('');
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    try {
      const json = await (await fetch(`/api/db/jobs/${id}`)).json();
      if (!json.success) throw new Error(json.error);
      setJob(json.job); setNote(json.job.human_review_note || '');
    } catch (e: any) { message.error(`加载失败: ${e.message}`); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const patch = async (body: Record<string, any>, okMsg: string) => {
    const json = await (await fetch(`/api/db/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    if (!json.success) { message.error(json.error); return false; }
    message.success(okMsg);
    load();
    return true;
  };

  const openEdit = () => {
    const values: Record<string, any> = {};
    for (const f of JOB_FIELDS) values[f.key] = f.kind === 'date' ? (job[f.key] ? dayjs(job[f.key]) : null) : job[f.key];
    form.setFieldsValue(values);
    setEditOpen(true);
  };

  /** 只提交改动过的字段；这些字段会被锁定，重新提取时不再覆盖 */
  const saveEdit = async () => {
    try {
      const values = await form.validateFields();
      const fields: Record<string, any> = {};
      for (const f of JOB_FIELDS) {
        let v = values[f.key];
        if (f.kind === 'date') v = v ? dayjs(v).format('YYYY-MM-DD') : null;
        if (v === undefined || v === '') v = null;
        const before = job[f.key] ?? null;
        if (JSON.stringify(v ?? (f.kind === 'string[]' ? [] : null)) !== JSON.stringify(before ?? (f.kind === 'string[]' ? [] : null))) fields[f.key] = v;
      }
      if (Object.keys(fields).length === 0) { message.info('没有改动'); setEditOpen(false); return; }
      if (await patch({ fields }, `已保存 ${Object.keys(fields).length} 个字段（已锁定，重新提取不会覆盖）`)) setEditOpen(false);
    } catch { /* 校验未通过 */ }
  };

  const remove = async () => {
    const json = await (await fetch(`/api/db/jobs/${id}`, { method: 'DELETE' })).json();
    if (json.success) { message.success('岗位已删除'); router.push('/admin/db-job'); } else message.error(json.error);
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: 120 }}><Spin size="large" /></div>;
  if (!job) return <Empty description="岗位不存在" style={{ marginTop: 120 }} />;

  const locked: string[] = job.human_locked_fields || [];

  const renderValue = (f: JobFieldDef) => {
    const v = job[f.key];
    const shown = formatJobValue(f.key, v);
    if (!shown) return <Text type="secondary">—</Text>;
    if (f.kind === 'url') return <a href={v} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{v}</a>;
    if (f.kind === 'string[]') return <Space size={4} wrap>{(v as string[]).map(s => <Tag key={s}>{s}</Tag>)}</Space>;
    return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.8 }}>{shown}</span>;
  };

  const renderGroup = (group: JobFieldDef['group']) => {
    const fields = JOB_FIELDS.filter(f => f.group === group);
    return (
      <Card key={group} title={JOB_GROUPS[group]} size="small" style={{ marginBottom: 16 }}>
        {fields.map(f => (
          <div key={f.key} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: `1px solid ${BRAND.borderSoft}` }}>
            <div style={{ width: 130, flexShrink: 0, color: BRAND.ink3, fontSize: 12, paddingTop: 2 }}>
              {f.label}
              {locked.includes(f.key) && (
                <Tooltip title="人工改过，重新提取时不会覆盖。点击解除锁定。">
                  <LockOutlined style={{ marginLeft: 4, color: BRAND.warning, cursor: 'pointer' }} onClick={() => patch({ unlock: [f.key] }, '已解除锁定')} />
                </Tooltip>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>{renderValue(f)}</div>
          </div>
        ))}
      </Card>
    );
  };

  const editor = (f: JobFieldDef) => {
    if (f.kind === 'text') return <Input.TextArea autoSize={{ minRows: 2, maxRows: 10 }} />;
    if (f.kind === 'number') return <InputNumber style={{ width: '100%' }} />;
    if (f.kind === 'date') return <DatePicker style={{ width: '100%' }} />;
    if (f.kind === 'enum') return <Select allowClear options={Object.entries(f.options || {}).map(([value, label]) => ({ value, label }))} />;
    if (f.kind === 'boolean') return <Select allowClear options={[{ value: true, label: '是' }, { value: false, label: '否' }]} placeholder="未提及" />;
    if (f.kind === 'string[]') return <Select mode="tags" tokenSeparators={[',', '，']} open={false} suffixIcon={null} placeholder="输入后回车" />;
    return <Input />;
  };

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => router.back()}>返回</Button>
        <Space>
          {(job.job_url || job.source_url) && <Button icon={<LinkOutlined />} href={job.job_url || job.source_url} target="_blank">打开原文</Button>}
          <Button icon={<EditOutlined />} onClick={openEdit}>编辑字段</Button>
          <Popconfirm title="删除这个岗位？" onConfirm={remove} okText="删除" okButtonProps={{ danger: true }} cancelText="取消"><Button danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      </div>

      <EntityHero
        initial={(job.company || job.title || '?').slice(0, 1).toUpperCase()}
        title={job.title}
        subtitle={<span>
          <a onClick={() => job.company_id && router.push(`/admin/db-company/${job.company_id}`)}>{job.company || '未关联企业'}</a>
          {job.program_name && ` · ${job.program_name}`}
        </span>}
        tags={<>
          {job.company_ref?.segment && <Tag color={SEGMENT_LABELS[job.company_ref.segment]?.color}>{SEGMENT_LABELS[job.company_ref.segment]?.label}</Tag>}
          {job.job_type && <Tag color="orange">{JOB_TYPE_LABELS[job.job_type]}</Tag>}
          {job.recruit_season && <Tag>{RECRUIT_SEASON_LABELS[job.recruit_season]}</Tag>}
          {job.remote_type && <Tag color={job.remote_type === 'remote' ? 'green' : undefined}>{REMOTE_TYPE_LABELS[job.remote_type]}</Tag>}
          {job.accepts_overseas_students === true && <Tag color="blue">面向海外留学生</Tag>}
          {job.location && <Tag>{job.location}</Tag>}
          {formatSalary(job) && <Tag color="gold">{formatSalary(job)}</Tag>}
          <Tag color={JOB_STATUS[job.status]?.color}>{JOB_STATUS[job.status]?.label}</Tag>
        </>}
        metrics={[
          { label: '完整度', value: `${job.completeness_score ?? 0}%`, color: (job.completeness_score ?? 0) >= 70 ? BRAND.success : BRAND.warning },
          { label: '网申截止', value: job.deadline || '—' },
        ]}
      />

      <Row gutter={16}>
        <Col xs={24} xl={14}>{LEFT_GROUPS.map(renderGroup)}{renderGroup('requirement')}</Col>
        <Col xs={24} xl={10}>
          <Card title="人工审核" size="small" style={{ marginBottom: 16 }}
            extra={job.human_review_status ? <Tag color={REVIEW_STATUS[job.human_review_status]?.color}>{REVIEW_STATUS[job.human_review_status]?.label}</Tag> : <Tag>未审核</Tag>}>
            <Space wrap style={{ marginBottom: 12 }}>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => patch({ human_review_status: 'complete', human_review_note: note }, '已审核通过')}>审核通过</Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={() => patch({ human_review_status: 'rejected', human_review_note: note }, '已标记不通过')}>不通过</Button>
              <Select style={{ width: 130 }} placeholder="其他状态" value={null} options={REVIEW_STATUS_OPTIONS.filter(o => !['complete', 'rejected'].includes(o.value))}
                onChange={v => v && patch({ human_review_status: v, human_review_note: note }, '审核状态已更新')} />
              <Select style={{ width: 110 }} value={job.status} options={Object.entries(JOB_STATUS).map(([value, m]) => ({ value, label: m.label }))} onChange={v => patch({ status: v }, '在招状态已更新')} />
            </Space>
            <Input.TextArea rows={2} placeholder="审核备注（随审核操作一起保存）" value={note} onChange={e => setNote(e.target.value)} />
            <div style={{ fontSize: 12, color: BRAND.ink4, marginTop: 8, lineHeight: 1.7 }}>
              审核通过 / 不通过 / 失效隐藏后，重新提取不会再覆盖这条岗位的内容。
              {job.human_review_at && <> · 上次审核 {new Date(job.human_review_at).toLocaleString('zh-CN')}</>}
            </div>
          </Card>

          {RIGHT_GROUPS.filter(g => g !== 'requirement').map(renderGroup)}

          <Card title="数据来源" size="small">
            <div style={{ fontSize: 12, color: BRAND.ink3, lineHeight: 2 }}>
              <div>来源页面：{job.source_url ? <a href={job.source_url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{job.source_url}</a> : '—'}</div>
              <div>首次发现：{new Date(job.first_seen_at).toLocaleString('zh-CN')} · 最近一次在招：{new Date(job.last_seen_at).toLocaleString('zh-CN')}</div>
              <div>最近更新：{new Date(job.updated_at).toLocaleString('zh-CN')}{job.source_log_id ? ` · 爬取日志 #${job.source_log_id}` : ''}</div>
            </div>
          </Card>
        </Col>
      </Row>

      <Modal title="编辑岗位字段" open={editOpen} onOk={saveEdit} onCancel={() => setEditOpen(false)} okText="保存" width={860} destroyOnHidden>
        <div style={{ fontSize: 12, color: BRAND.ink3, marginBottom: 12 }}>改动过的字段会被锁定 <LockOutlined style={{ color: BRAND.warning }} />，之后重新提取同一页面也不会覆盖。</div>
        <Form form={form} layout="vertical" style={{ maxHeight: '62vh', overflowY: 'auto', paddingRight: 8 }}>
          {(Object.keys(JOB_GROUPS) as JobFieldDef['group'][]).map(group => (
            <div key={group}>
              <div style={{ fontWeight: 600, color: BRAND.ink2, margin: '8px 0 12px', borderLeft: `3px solid ${BRAND.primary}`, paddingLeft: 8 }}>{JOB_GROUPS[group]}</div>
              <Row gutter={12}>
                {JOB_FIELDS.filter(f => f.group === group).map(f => (
                  <Col key={f.key} span={f.kind === 'text' || f.kind === 'url' || f.kind === 'string[]' ? 24 : 12}>
                    <Form.Item name={f.key} label={f.label} rules={[...(f.key === 'title' ? [{ required: true, message: '请输入岗位名称' }] : []), ...(f.kind === 'url' ? [{ type: 'url' as const, message: '请输入完整链接' }] : [])]}>
                      {editor(f)}
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
