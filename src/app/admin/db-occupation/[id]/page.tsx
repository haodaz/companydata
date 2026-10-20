'use client';

/**
 * 职业详情，分 tab：
 *   职业信息   职业画像（按字段组）+ 百业空间 / 行业标准关联
 *   发展图谱   技能树（分层 + 前置）、成长阶梯、更资深 / 可转型岗位（能对回职业库）
 *   薪资       分工作年限 + 分国家 / 中国各地区（本币 + 折人民币 + 出处）
 *   热门公司   岗位库里招这个职业的企业，按在招岗位数排
 *   岗位       岗位库里的对应岗位（名称 / 别名匹配）
 * 编辑过的字段锁定，AI 补全不再覆盖；审核同其他库。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { App, Avatar, Button, Card, Col, Descriptions, Empty, Form, Input, InputNumber, Modal, Popconfirm, Row, Segmented, Select, Space, Spin, Table, Tabs, Tooltip, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, EditOutlined, ThunderboltOutlined, ApartmentOutlined, GlobalOutlined, ToolOutlined } from '@ant-design/icons';
import { EntityHero } from '@/components/admin/EntityHero';
import { OccupationCareerGraph } from '@/components/admin/OccupationCareerGraph';
import { OccupationContextTab, OccupationTasksTab } from '@/components/admin/EntityLibrary';
import { REVIEW_STATUS } from '@/lib/review-status';
import { useModel } from '@/lib/model-context';
import { BRAND } from '@/lib/theme';
import { JOB_SOURCE_LABELS, JOB_STATUS, JOB_TYPE_LABELS, formatSalary } from '@/lib/job-fields';
import { SEGMENT_LABELS } from '@/lib/company-fields';
import {
  CAREER_CATEGORY_LABELS, CAREER_MID_CATEGORIES, CAREER_MID_LABELS, OCCUPATION_FIELDS, OCCUPATION_GROUPS, SALARY_YEAR_LABELS, SALARY_YEARS,
  SALARY_COUNTRIES, SALARY_CN_REGIONS, formatOccupationValue, hasOccupationValue,
} from '@/lib/occupation-fields';

const { Text, Paragraph } = Typography;
const SOURCE_LABELS: Record<string, string> = { import: '数据部门导入', ai: 'AI 生成', manual: '手工新建' };

/** 横向条形：label | 条 | 数值 */
function Bar({ label, value, max, right, hint, href }: { label: React.ReactNode; value: number; max: number; right: React.ReactNode; hint?: React.ReactNode; href?: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ width: 140, fontSize: 12, color: BRAND.ink2, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 14 }}>
        {value > 0 && <div style={{ width: `${Math.max(2, (value / max) * 100)}%`, height: 14, borderRadius: 4, background: BRAND.gradient }} />}
      </div>
      <span style={{ width: 170, textAlign: 'right', fontSize: 12 }}>{right}{hint && <span style={{ color: BRAND.ink3 }}> {hint}</span>}</span>
      <span style={{ width: 20 }}>{href && <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>源</a>}</span>
    </div>
  );
}

function CompaniesTab({ id, router }: { id: string; router: ReturnType<typeof useRouter> }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch(`/api/db/occupations/${id}/related?kind=companies`).then(r => r.json()).then(setD); }, [id]);
  if (!d) return <Spin />;
  if (!d.success) return <Empty description={d.error} />;
  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>按岗位名里出现「{d.names.join(' / ')}」统计：{d.total} 家企业、{d.total_jobs} 条岗位，按在招岗位数排序。</Text>
      <Table size="small" rowKey={(r: any) => r.company_id || r.name} dataSource={d.data} pagination={{ pageSize: 20, showSizeChanger: false }}
        columns={[
          { title: '#', width: 44, render: (_: any, __: any, i: number) => i + 1 },
          { title: '企业', render: (_: any, r: any) => <Space>
            <Avatar shape="square" size={32} src={r.company?.logo_url || undefined} style={{ background: r.company?.logo_url ? '#fff' : BRAND.primary, border: '1px solid #eee' }}>{(r.company?.name || r.name || '?').slice(0, 1)}</Avatar>
            <div>
              {r.company_id ? <a onClick={() => router.push(`/admin/db-company/${r.company_id}`)} style={{ fontWeight: 600 }}>{r.company?.name || r.name}</a> : <span style={{ fontWeight: 600 }}>{r.name}</span>}
              {r.company?.registered_name && r.company.registered_name !== r.company.name && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{r.company.registered_name}</div>}
            </div>
          </Space> },
          { title: '分类 / 行业', width: 220, render: (_: any, r: any) => <span>{r.company?.segment && <Tag color={SEGMENT_LABELS[r.company.segment]?.color}>{SEGMENT_LABELS[r.company.segment]?.label}</Tag>}<Text type="secondary" style={{ fontSize: 12 }}>{r.company?.industry || ''}</Text></span> },
          { title: '在招', dataIndex: 'open', width: 70, render: (v: number) => <Text strong>{v}</Text> },
          { title: '岗位总数', dataIndex: 'total', width: 80 },
          { title: '主要城市', dataIndex: 'cities', width: 200, render: (v: string[]) => v.join('、') || '—' },
          { title: '', width: 90, render: (_: any, r: any) => r.company_id && <a onClick={() => router.push(`/admin/db-job?companyId=${r.company_id}&companyName=${encodeURIComponent(r.company?.name || r.name)}&jobType=all`)}>看岗位</a> },
        ]} />
    </div>
  );
}

function JobsTab({ id, router }: { id: string; router: ReturnType<typeof useRouter> }) {
  const [d, setD] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('open');
  useEffect(() => { setD(null); fetch(`/api/db/occupations/${id}/related?kind=jobs&page=${page}&pageSize=20${status ? `&status=${status}` : ''}`).then(r => r.json()).then(setD); }, [id, page, status]);
  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Segmented value={status} onChange={v => { setStatus(String(v)); setPage(1); }} options={[{ value: 'open', label: '在招' }, { value: '', label: '全部' }]} />
        {d?.names && <Text type="secondary">岗位名里出现「{d.names.join(' / ')}」的岗位；给职业补别名能对上更多</Text>}
      </Space>
      <Table size="small" rowKey="id" loading={!d} dataSource={d?.data || []}
        pagination={{ current: page, pageSize: 20, total: d?.total || 0, onChange: setPage, showSizeChanger: false, showTotal: t => `共 ${t} 条` }}
        columns={[
          { title: '岗位', dataIndex: 'name', render: (v: string, r: any) => <a onClick={() => router.push(`/admin/db-job/${r.id}`)}>{v}</a> },
          { title: '企业', dataIndex: 'institute_or_company_name', width: 180, render: (v: string, r: any) => r.company_id ? <a onClick={() => router.push(`/admin/db-company/${r.company_id}`)}>{r.company_ref?.name || v}</a> : v },
          { title: '类型', dataIndex: 'job_type', width: 90, render: (v: string) => v ? <Tag>{JOB_TYPE_LABELS[v] || v}</Tag> : '—' },
          { title: '地点', dataIndex: 'location', width: 140 },
          { title: '薪资', width: 130, render: (_: any, r: any) => formatSalary(r) || '—' },
          { title: '来源', dataIndex: 'source', width: 90, render: (v: string) => v ? JOB_SOURCE_LABELS[v] || v : '—' },
          { title: '发布', dataIndex: 'official_publish_date', width: 100, render: (v: string) => v || '—' },
          { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={JOB_STATUS[v]?.color}>{JOB_STATUS[v]?.label || v}</Tag> },
        ]} />
    </div>
  );
}

export default function OccupationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const { message } = App.useApp();
  const { currentModel } = useModel();
  const [d, setD] = useState<{ occupation: any; salaries: any[]; regions: any[]; roleLinks: Record<string, number>; links: any[]; tasks: any[]; related: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState(sp.get('tab') || 'info');
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();
  const catWatch = Form.useWatch('career_category', form);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch(`/api/db/occupations/${id}`, { cache: 'no-store' })).json();
      if (!j.success) throw new Error(j.error);
      setD(j);
    } catch (e: any) { message.error(e.message); } finally { setLoading(false); }
  }, [id, message]);
  useEffect(() => { load(); }, [load]);
  const switchTab = (k: string) => { setTab(k); window.history.replaceState(window.history.state, '', k === 'info' ? window.location.pathname : `?tab=${k}`); };

  const patch = async (body: Record<string, any>, ok = '已保存') => {
    const j = await (await fetch(`/api/db/occupations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    if (!j.success) { message.error(j.error); return false; }
    message.success(ok); load(); return true;
  };

  /** part：profile 职业画像 + 年限薪资（只填空）/ career 重新生成发展图谱 / regions 重新检索各地薪资 */
  const runAgent = async (part: 'profile' | 'career' | 'regions' | 'context' | 'tasks') => {
    setBusy(part);
    const label = { profile: 'AI 补全', career: '生成发展图谱', regions: '检索各国家 / 地区薪资', context: '生成工作场所与工具设备', tasks: '生成典型任务与工位' }[part];
    const hide = message.loading(`${label}中，约 30–90 秒…`, 0);
    try {
      const j = await (await fetch('/api/agents/occupation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(id), model: currentModel, part }) })).json();
      if (!j.success) throw new Error(j.error);
      message.success(part === 'career' ? `图谱：${j.skills} 个技能、${j.ladder} 级阶梯、${j.next_roles} 个进阶 / 转型岗位`
        : part === 'regions' ? `拿到 ${j.regions} 个国家 / 地区的薪资`
        : part === 'context' ? `场所 ${j.places} 个、工具设备 ${j.items} 个，新关联 ${j.links} 条`
        : part === 'tasks' ? `新典型任务 ${j.tasks} 个、新工位 ${j.stations} 个`
        : j.skipped ? `跳过：${j.skipped}` : `补了 ${j.changed.length} 个字段、${j.salaries} 档薪资`);
      load();
    } catch (e: any) { message.error(`${label}失败：${e.message}`); } finally { hide(); setBusy(null); }
  };

  /** 图谱里的岗位还不在职业库：查询并建档，建好跳过去 */
  const queryRole = async (name: string) => {
    const hide = message.loading(`正在查「${name}」，没有就联网建档…`, 0);
    try {
      const j = await (await fetch('/api/agents/occupation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, model: currentModel, part: 'all' }) })).json();
      if (!j.success) throw new Error(j.error);
      router.push(`/admin/db-occupation/${j.id}`);
    } catch (e: any) { message.error(e.message); } finally { hide(); }
  };

  const openEdit = () => {
    const o = d!.occupation;
    const sal = Object.fromEntries(d!.salaries.map((s: any) => [s.year, s.salary]));
    form.setFieldsValue({ ...o, external_id: o.external_id, ...Object.fromEntries(SALARY_YEARS.map(y => [`salary_${y}`, sal[y] ?? null])) });
    setEditOpen(true);
  };
  const saveEdit = async () => {
    const v = await form.validateFields();
    const salaries = SALARY_YEARS.map(y => ({ year: y, salary: v[`salary_${y}`] ?? null }));
    const body: Record<string, any> = { external_id: v.external_id || '', salaries };
    for (const f of OCCUPATION_FIELDS) body[f.key] = v[f.key] ?? null;
    if (await patch(body)) setEditOpen(false);
  };

  if (loading && !d) return <div style={{ padding: 80, textAlign: 'center' }}><Spin /></div>;
  if (!d) return <Empty description="职业不存在" />;
  const o = d.occupation;
  const locked: string[] = o.human_locked_fields || [];
  const salMax = Math.max(0, ...d.salaries.map((s: any) => s.salary || 0));
  const countries = SALARY_COUNTRIES.map(c => ({ ...c, row: d.regions.find((r: any) => r.scope === 'country' && r.code === c.code) })).filter(c => c.row).sort((a, b) => (b.row.monthly_cny || 0) - (a.row.monthly_cny || 0));
  const cnRegions = SALARY_CN_REGIONS.map(c => ({ ...c, row: d.regions.find((r: any) => r.scope === 'cn_region' && r.code === c.code) })).filter(c => c.row).sort((a, b) => (b.row.monthly_cny || 0) - (a.row.monthly_cny || 0));
  // 技能节点 → 用到的工具设备（关联上的 skill_ids）+ 练它的典型任务
  const skillUses: Record<string, { tools: string[]; tasks: string[] }> = {};
  const use = (sid: string) => (skillUses[sid] ||= { tools: [], tasks: [] });
  for (const l of d.links || []) if (l.dir === 'out' && l.other_type === 'item') for (const sid of l.skill_ids || []) use(sid).tools.push(l.other.name);
  for (const t of d.tasks || []) for (const sid of t.skill_ids || []) use(sid).tasks.push(t.name);
  const countryMax = Math.max(0, ...countries.map(c => c.row.monthly_cny || 0));
  const regionMax = Math.max(0, ...cnRegions.map(c => c.row.monthly_cny || 0));

  const infoTab = (
    <Row gutter={16}>
      <Col xs={24} lg={16}>
        {OCCUPATION_GROUPS.map(g => {
          const fields = OCCUPATION_FIELDS.filter(f => f.group === g);
          const filled = fields.filter(f => hasOccupationValue(o[f.key]));
          const short = filled.filter(f => f.kind !== 'text');
          const long = filled.filter(f => f.kind === 'text');
          return (
            <Card key={g} size="small" style={{ marginBottom: 16 }} title={g} extra={fields.length > filled.length && <Text type="secondary" style={{ fontSize: 12 }}>空缺 {fields.length - filled.length} 项</Text>}>
              {short.length > 0 && <Descriptions column={1} size="small" labelStyle={{ width: 140 }}>
                {short.map(f => <Descriptions.Item key={f.key} label={<span>{f.label}{locked.includes(f.key) && <Tag style={{ marginLeft: 4, fontSize: 10 }}>已锁定</Tag>}</span>}>
                  {f.kind === 'tags' ? <Space size={4} wrap>{(o[f.key] || []).map((t: string) => <Tag key={t} style={{ margin: 0 }}>{t}</Tag>)}</Space> : formatOccupationValue(f, o[f.key])}
                  {o.ai_sources?.[f.key] && <a href={o.ai_sources[f.key]} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontSize: 12 }}>来源</a>}
                </Descriptions.Item>)}
              </Descriptions>}
              {long.map(f => <div key={f.key} style={{ marginTop: 12 }}>
                <Text strong>{f.label}</Text>{locked.includes(f.key) && <Tag style={{ marginLeft: 6, fontSize: 10 }}>已锁定</Tag>}
                {o.ai_sources?.[f.key] && <a href={o.ai_sources[f.key]} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontSize: 12 }}>来源</a>}
                <Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 4, marginBottom: 0, color: BRAND.ink2 }}>{o[f.key]}</Paragraph>
              </div>)}
              {!filled.length && <Text type="secondary">暂无，点右上角「AI 补全」</Text>}
            </Card>
          );
        })}
        {locked.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>
          人工编辑过的字段已锁定，AI 补全不会覆盖：{locked.join('、')}　<a onClick={() => patch({ unlock: locked }, '已解除锁定')}>全部解除</a>
        </Text>}
      </Col>
      <Col xs={24} lg={8}>
        <Card size="small" title={`百业空间（${d.related.spaces.length}）`} style={{ marginBottom: 16 }}>
          {d.related.spaces.length ? d.related.spaces.map((s: any) => <div key={s.id} style={{ marginBottom: 6 }}>
            <a href={`/lab/${s.id}`} target="_blank" rel="noreferrer">{s.profile?.role ? `${s.profile.role} · ` : ''}{s.title}</a>
          </div>) : <Text type="secondary">还没有这个职业的百业空间</Text>}
        </Card>
        <Card size="small" title={`行业标准与规程（${d.related.standards.length}）`}>
          {d.related.standards.length ? d.related.standards.map((s: any) => <div key={s.id} style={{ marginBottom: 6 }}>
            <Text code>{s.code || '无编号'}</Text> {s.title}
          </div>) : <Text type="secondary">标准库里还没有标注适用于这个职业的标准</Text>}
        </Card>
      </Col>
    </Row>
  );

  const salaryTab = (
    <div>
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card size="small" title="按工作年限（全国，月薪）" style={{ marginBottom: 16 }}>
            {d.salaries.length ? SALARY_YEARS.map(y => {
              const s = d.salaries.find((x: any) => x.year === y);
              return <Bar key={y} label={SALARY_YEAR_LABELS[y]} value={s?.salary || 0} max={salMax} right={s?.salary ? <b>¥{s.salary.toLocaleString()}</b> : '—'} href={s?.source_url} />;
            }) : <Text type="secondary">暂无，点「AI 补全」或在编辑里填</Text>}
            {o.recent_year_monthly_salary && <Text type="secondary" style={{ fontSize: 12 }}>全国平均月薪 ¥{o.recent_year_monthly_salary.toLocaleString()}</Text>}
          </Card>
          <Card size="small" title={<span><GlobalOutlined /> 按国家 / 地区（折人民币，月薪）</span>} style={{ marginBottom: 16 }}>
            {countries.length ? countries.map(c => <Bar key={c.code} label={c.name} value={c.row.monthly_cny || 0} max={countryMax}
              right={<b>¥{(c.row.monthly_cny || 0).toLocaleString()}</b>} hint={c.row.currency !== 'CNY' ? `(${c.row.currency} ${c.row.monthly_local.toLocaleString()})` : undefined} href={c.row.source_url} />)
              : <Text type="secondary">暂无，点右上角「检索各地薪资」</Text>}
            {countries.length > 0 && <Text type="secondary" style={{ fontSize: 11 }}>税前；外币按固定汇率折人民币，仅作横向比较（生活成本、税负差异很大）。</Text>}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="中国各地区（月薪）">
            {cnRegions.length ? ['华北', '华东', '华南', '华中', '西南', '西北', '东北'].map(area => {
              const list = cnRegions.filter(r => r.area === area);
              if (!list.length) return null;
              return <div key={area} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: BRAND.ink3, margin: '4px 0' }}>{area}</div>
                {list.map(r => <Bar key={r.code} label={r.name} value={r.row.monthly_cny || 0} max={regionMax} right={<b>¥{(r.row.monthly_cny || 0).toLocaleString()}</b>} href={r.row.source_url} />)}
              </div>;
            }) : <Text type="secondary">暂无，点右上角「检索各地薪资」</Text>}
          </Card>
        </Col>
      </Row>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => router.push('/admin/db-occupation')} style={{ paddingLeft: 0 }}>返回职业实体库</Button>
        <Space wrap>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={busy === 'profile'} onClick={() => runAgent('profile')}>AI 补全</Button>
          <Button icon={<ApartmentOutlined />} loading={busy === 'career'} onClick={() => runAgent('career')}>{o.career_map ? '重新生成发展图谱' : '生成发展图谱'}</Button>
          <Button icon={<GlobalOutlined />} loading={busy === 'regions'} onClick={() => runAgent('regions')}>检索各地薪资</Button>
          <Button icon={<ToolOutlined />} loading={busy === 'context'} onClick={() => runAgent('context')}>生成场所与工具</Button>
          <Button onClick={() => router.push(`/admin/kg-questions?occupation=${id}`)}>问答日志</Button>
          <Button icon={<CheckCircleOutlined />} onClick={() => patch({ human_review_status: 'complete' }, '已审核通过')}>审核通过</Button>
          <Button icon={<CloseCircleOutlined />} onClick={() => patch({ human_review_status: 'rejected' }, '已标为不通过')}>不通过</Button>
          <Button icon={<EditOutlined />} onClick={openEdit}>编辑</Button>
          <Popconfirm title="删除这个职业？" description="软删除，可在数据库里恢复。" okButtonProps={{ danger: true }} onConfirm={async () => {
            const j = await (await fetch(`/api/db/occupations/${id}`, { method: 'DELETE' })).json();
            if (j.success) { message.success('已删除'); router.push('/admin/db-occupation'); } else message.error(j.error);
          }}><Button danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      </div>

      <EntityHero initial={(o.name || '?').slice(0, 1)} title={o.name}
        subtitle={[o.name_lang_en, o.external_id && `#${o.external_id}`].filter(Boolean).join(' · ') || undefined}
        tags={<>
          {o.career_category && <Tag color="blue">{CAREER_CATEGORY_LABELS[o.career_category] || o.career_category}</Tag>}
          {o.career_mid_category && <Tag>{CAREER_MID_LABELS[o.career_mid_category] || o.career_mid_category}</Tag>}
          {o.origin === 'market' && <Tooltip title="不在职业大典 / O*NET 里：从招聘岗位里反复出现、归并统计后升级成的职业"><Tag color="purple">市场新兴</Tag></Tooltip>}
          {o.origin === 'framework' && (o.emergence?.official
            ? <Tooltip title={<>{({ cn_dadian: '职业分类大典', cn_new: '人社部新职业', onet: 'O*NET' } as any)[o.emergence.official.framework] || ''} {o.emergence.official.code || ''}<br />{o.emergence.official.url || '出处待核实'}</>}><Tag color="geekblue">官方框架{o.emergence.official.verified ? '' : ' · 出处待核实'}</Tag></Tooltip>
            : <Tag color="geekblue">官方框架</Tag>)}
          {o.source && <Tag>{SOURCE_LABELS[o.source] || o.source}</Tag>}
          <Tag color={REVIEW_STATUS[o.human_review_status]?.color}>{REVIEW_STATUS[o.human_review_status]?.label || '未审核'}</Tag>
          {(o.aliases || []).map((a: string) => <Tag key={a} color="default" style={{ color: BRAND.ink3 }}>{a}</Tag>)}
        </>}
        metrics={[
          { label: '完整度', value: `${o.completeness_score || 0}%`, color: (o.completeness_score || 0) >= 80 ? '#16a34a' : '#d97706' },
          { label: '平均月薪', value: o.recent_year_monthly_salary ? `¥${o.recent_year_monthly_salary.toLocaleString()}` : '—' },
          { label: '岗位库在招', value: d.related.jobs_total, active: tab === 'jobs' },
          { label: '百业空间', value: d.related.spaces.length },
        ]} />
      {/* 市场新兴职业的涌现数据（飞轮每次检测刷新） */}
      {o.emergence && o.emergence.jobs !== undefined && (
        <Card size="small" style={{ marginBottom: 16, borderLeft: '3px solid #722ed1' }} title={o.origin === 'market' ? '涌现数据 · 市场新兴职业' : '涌现数据 · 从招聘岗位里补进来的官方职业'}
          extra={<Text type="secondary" style={{ fontSize: 12 }}>{o.emergence.updated_at ? `更新于 ${String(o.emergence.updated_at).slice(0, 10)}` : ''}</Text>}>
          <Space size={16} wrap>
            <span>挂了 <b>{o.emergence.jobs ?? 0}</b> 个岗位</span>
            <span><b>{o.emergence.companies ?? 0}</b> 家企业</span>
            <span><b>{o.emergence.cities ?? 0}</b> 个城市</span>
            <span>近 30 天 <b>+{o.emergence.last_30d ?? 0}</b></span>
            {o.emergence.first_seen && <span>首次出现 {o.emergence.first_seen}</span>}
          </Space>
          {(o.emergence.titles || []).length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: BRAND.ink3 }}>代表岗位：{o.emergence.titles.join('、')}</div>}
          {(o.emergence.names || []).length > 0 && <div style={{ marginTop: 4, fontSize: 12, color: BRAND.ink3 }}>市场上的叫法：{o.emergence.names.join('、')}</div>}
        </Card>
      )}

      <Card styles={{ body: { paddingTop: 4 } }}>
        <Tabs activeKey={tab} onChange={switchTab} destroyOnHidden items={[
          { key: 'info', label: '职业信息', children: infoTab },
          { key: 'graph', label: `发展图谱${o.career_map?.skills?.length ? '' : '（未生成）'}`, children: <OccupationCareerGraph graph={o.career_map} uses={skillUses} roleLinks={d.roleLinks || {}} onOpenRole={rid => router.push(`/admin/db-occupation/${rid}?tab=graph`)} onQueryRole={queryRole} /> },
          { key: 'tasks', label: `典型任务${(d.tasks || []).length ? `（${d.tasks.length}）` : ''}`, children: <OccupationTasksTab tasks={d.tasks || []} skills={o.career_map?.skills || []} busy={busy === 'tasks'} onGenerate={() => runAgent('tasks')} /> },
          { key: 'context', label: `场所与工具${(d.links || []).filter((l: any) => l.other_type === 'place' || l.other_type === 'item').length ? `（${(d.links || []).filter((l: any) => l.other_type === 'place' || l.other_type === 'item').length}）` : ''}`, children: <OccupationContextTab links={(d.links || []).filter((l: any) => l.dir === 'out')} skills={o.career_map?.skills || []} busy={busy === 'context'} onGenerate={() => runAgent('context')} /> },
          { key: 'salary', label: `薪资${d.regions.length ? `（${d.regions.length} 地）` : ''}`, children: salaryTab },
          { key: 'companies', label: '热门公司', children: <CompaniesTab id={id} router={router} /> },
          { key: 'jobs', label: `岗位（${d.related.jobs_total}）`, children: <JobsTab id={id} router={router} /> },
        ]} />
      </Card>


      <Modal open={editOpen} title={`编辑：${o.name}`} width={860} onCancel={() => setEditOpen(false)} onOk={saveEdit} okText="保存（改过的字段会锁定）" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={12}><Form.Item name="external_id" label="外部指定标识(flora_external_id)"><Input /></Form.Item></Col>
            {OCCUPATION_FIELDS.map(f => (
              <Col key={f.key} span={f.kind === 'text' || f.kind === 'tags' ? 24 : 12}>
                <Form.Item name={f.key} label={f.label} tooltip={f.desc} rules={f.key === 'name' ? [{ required: true }] : undefined}>
                  {f.kind === 'text' ? <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} />
                    : f.kind === 'int' ? <InputNumber style={{ width: '100%' }} min={0} />
                    : f.kind === 'tags' ? <Select mode="tags" tokenSeparators={[',', '，', '|', '、']} />
                    : f.kind === 'category' ? <Select allowClear options={Object.entries(CAREER_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
                    : f.kind === 'mid_category' ? <Select allowClear showSearch optionFilterProp="label" options={Object.entries(CAREER_MID_CATEGORIES).filter(([, [, c]]) => !catWatch || c === catWatch).map(([value, [label]]) => ({ value, label }))} />
                    : <Input />}
                </Form.Item>
              </Col>
            ))}
            {SALARY_YEARS.map(y => <Col key={y} span={8}><Form.Item name={`salary_${y}`} label={`${SALARY_YEAR_LABELS[y]}（元/月）`}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>)}
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
