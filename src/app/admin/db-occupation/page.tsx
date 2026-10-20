'use client';

/**
 * 职业实体库（迁移 024）：字段按数据部门《职业库_字段.xlsx》，子实体职业薪资按工作年限分档。
 * 「职业查询」：输入任意职业 / 岗位叫法——库里有（名称或别名）就打开，没有就联网检索生成一条（待审核）。
 * 这是 /lab 百业的数据底色：详情页能看到岗位库里的对应岗位、百业空间、行业标准。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Button, Input, Progress, Select, Space, Table, Tag, Tooltip, Typography, Upload } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, DownloadOutlined, IdcardOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { REVIEW_STATUS, REVIEW_STATUS_OPTIONS } from '@/lib/review-status';
import { exportToCsv } from '@/lib/export-csv';
import { ensureDownloadAllowed, clearDownloadPermissionCache } from '@/lib/download-gate';
import { useModel } from '@/lib/model-context';
import { BRAND } from '@/lib/theme';
import {
  CAREER_CATEGORY_LABELS, CAREER_MID_CATEGORIES, CAREER_MID_LABELS, OCCUPATION_FIELDS, SALARY_YEAR_LABELS, SALARY_YEARS,
  formatOccupationValue, importHeaderKey,
} from '@/lib/occupation-fields';

const { Text } = Typography;
const SOURCE_LABELS: Record<string, string> = { import: '数据部门导入', ai: 'AI 生成', manual: '手工新建' };
const yuan = (n?: number | null) => (n ? `${(n / 1000).toFixed(n >= 10000 ? 1 : 1)}k` : '—');

export default function DbOccupationPage() {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const { currentModel } = useModel();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [cats, setCats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ search: '', category: '', mid: '', review: '', sort: 'hot' });
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [asking, setAsking] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: '50', withStats: '1', ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
      const j = await (await fetch(`/api/db/occupations?${q}`, { cache: 'no-store' })).json();
      if (!j.success) throw new Error(j.error);
      setData(j.data); setTotal(j.total); if (j.stats) setStats(j.stats); if (j.categories) setCats(j.categories);
    } catch (e: any) { message.error(`加载失败：${e.message}（迁移 024 跑过了吗？）`); } finally { setLoading(false); }
  }, [page, f, message]);
  useEffect(() => { load(); }, [load]);
  const set = (patch: Partial<typeof f>) => { setPage(1); setSelected([]); setF(x => ({ ...x, ...patch })); };

  /** 职业查询：库里有就打开，没有就 AI 联网生成 */
  const ask = async (name: string) => {
    if (!name.trim()) return;
    setAsking(true);
    const hide = message.loading(`正在查「${name}」：先查库，没有就联网检索生成（新职业连发展图谱、各地薪资一起生成，约 1–2 分钟）…`, 0);
    try {
      const j = await (await fetch('/api/agents/occupation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, model: currentModel, part: 'all' }) })).json();
      if (!j.success) throw new Error(j.error);
      message.success(j.existed ? '库里已有，打开详情' : j.created ? `已生成新职业（待审核），补了 ${j.changed.length} 个字段、${j.salaries} 档薪资` : '已归到库里已有的职业，补了空字段');
      router.push(`/admin/db-occupation/${j.id}`);
    } catch (e: any) { message.error(`查询失败：${e.message}`); } finally { hide(); setAsking(false); }
  };

  /** 导入数据部门的表：表头「中文名(key)」，跳过模板里「字段类型：…」那一行；可带「1年以内薪资」等列 */
  const importFile = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer());
      const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const header = (rows[0] || []).map(String);
      const keys = header.map(h => importHeaderKey(h));
      const salaryCols = header.map(h => { const k = (h.match(/\(([^()]+)\)\s*$/)?.[1] || h).trim(); return SALARY_YEARS.find(y => y === k || SALARY_YEAR_LABELS[y] === h.trim()) || null; });
      const list = rows.slice(1).filter(r => r.some(c => String(c).trim()) && !/^(必填，)?字段类型/.test(String(r[0]))).map(r => {
        const o: Record<string, any> = {};
        keys.forEach((k, i) => { if (k) o[k] = r[i]; });
        const salaries = salaryCols.map((y, i) => y && r[i] ? { year: y, salary: Number(String(r[i]).replace(/[^\d]/g, '')) } : null).filter(Boolean);
        if (salaries.length) o.salaries = salaries;
        if (typeof o.if_delete === 'string') o.if_delete = o.if_delete === '是' || o.if_delete === 'true';
        return o;
      }).filter(o => o.name);
      if (!list.length) { message.warning('没读到职业：第一行要是「职业名称(name)」这样的表头'); return false; }
      modal.confirm({
        title: `导入 ${list.length} 个职业？`,
        content: `按外部标识 / 职业名称认旧记录，以表里的值为准覆盖（人工锁定的字段不动）。识别到的列：${keys.filter(Boolean).length} 个字段${salaryCols.some(Boolean) ? ' + 分年限薪资' : ''}。`,
        onOk: async () => {
          const j = await (await fetch('/api/db/occupations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: list }) })).json();
          if (!j.success) return message.error(j.error);
          message.success(`新建 ${j.created}、更新 ${j.updated}${j.errors?.length ? `，失败 ${j.errors.length}：${j.errors.slice(0, 3).join('；')}` : ''}`);
          load();
        },
      });
    } catch (e: any) { message.error(`读取失败：${e.message}`); }
    return false;
  };

  const review = async (status: string) => {
    const j = await (await fetch('/api/db/occupations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected, human_review_status: status }) })).json();
    if (!j.success) return message.error(j.error);
    message.success(`已更新 ${selected.length} 条`); setSelected([]); load();
  };

  const handleExport = async () => {
    if (!(await ensureDownloadAllowed())) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/db/occupations?${new URLSearchParams({ exportAll: 'true', ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) })}`);
      const json = await res.json();
      if (res.status === 403 && json.code === 'DOWNLOAD_PERMISSION_REQUIRED') { clearDownloadPermissionCache(); await ensureDownloadAllowed(); return; }
      if (!json.success) throw new Error(json.error);
      // 表头和数据部门模板一致：「中文名(key)」；大类 / 小类导出中文名（对方示例数据就是这么写的）
      exportToCsv(json.data, [
        { key: 'external_id', header: '外部指定标识(flora_external_id)' },
        ...OCCUPATION_FIELDS.map(fd => ({ key: fd.key, header: `${fd.label}(${fd.key === 'relevant_fos_ids' ? 'relevant_fos_ids.flora_external_id' : fd.key})`, formatter: (v: any) => fd.key === 'relevant_fos_ids' ? (v || []).join('|') : formatOccupationValue(fd, v).replace(/ 元\/月$/, '') })),
        ...SALARY_YEARS.map(y => ({ key: `salary_${y}`, header: `${SALARY_YEAR_LABELS[y]}(${y})` })),
        { key: 'source', header: '数据来源', formatter: (v: any) => SOURCE_LABELS[v] || v || '' },
        { key: 'human_review_status', header: '审核状态', formatter: (v: any) => REVIEW_STATUS[v]?.label || '未审核' },
        { key: 'completeness_score', header: '完整度' },
      ], '职业实体库', { serverChecked: true });
    } catch (e: any) { message.error(`导出失败：${e.message}`); } finally { setExporting(false); }
  };

  const midOptions = Object.entries(CAREER_MID_CATEGORIES).filter(([, [, c]]) => !f.category || c === f.category).map(([value, [label]]) => ({ value, label }));

  return (
    <div>
      <PageHeader title="职业实体库" icon={<IdcardOutlined />}
        description="职业百科：职业画像、工作内容与要求、分年限薪资、证书、相关专业、代表人物。字段与数据部门的职业表一致；也是 AI 百业空间的数据底色。"
        extra={<Space>
          <Upload accept=".xlsx,.xls,.csv" showUploadList={false} beforeUpload={importFile}><Button icon={<UploadOutlined />}>导入 Excel</Button></Upload>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>导出 CSV（当前筛选）</Button>
        </Space>} />
      <StatCards loading={loading && !stats.total} items={[
        { label: '职业总数', value: stats.total || 0, icon: <IdcardOutlined /> },
        { label: '有分年限薪资', value: stats.with_salary || 0, color: '#d97706' },
        { label: '数据部门导入', value: stats.imported || 0, color: '#2f54eb' },
        { label: 'AI 生成', value: stats.ai || 0, color: '#8b5cf6' },
        { label: '审核通过', value: stats.reviewed || 0, color: '#16a34a' },
        { label: '平均完整度', value: stats.avg_completeness || 0, hint: '%' },
      ]} />

      <Panel padding={16} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text strong style={{ fontSize: 15 }}>职业查询</Text>
          <Input.Search size="large" enterButton={<><SearchOutlined /> 查询</>} loading={asking} style={{ maxWidth: 560, flex: 1 }}
            placeholder="输入职业或岗位叫法，如「后端开发」「注册会计师」「焊工」" onSearch={ask} />
          <Text type="secondary" style={{ fontSize: 12 }}>库里有（名称 / 别名）直接打开；没有就联网检索生成一条，待审核</Text>
        </div>
      </Panel>

      <Panel padding={16}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search allowClear placeholder="在库里搜名称 / 英文名 / 别名 / 证书" style={{ width: 260 }} onSearch={v => set({ search: v })} />
          <Select allowClear placeholder="职业大类" style={{ width: 180 }} value={f.category || undefined} onChange={v => set({ category: v || '', mid: '' })}
            options={Object.entries(CAREER_CATEGORY_LABELS).map(([value, label]) => ({ value, label: `${label}${cats[value] ? `（${cats[value]}）` : ''}` }))} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="职业小类" style={{ width: 190 }} value={f.mid || undefined} onChange={v => set({ mid: v || '' })} options={midOptions} />
          <Select allowClear placeholder="审核" style={{ width: 110 }} onChange={v => set({ review: v || '' })} options={[{ value: 'none', label: '未审核' }, ...REVIEW_STATUS_OPTIONS]} />
          <Select value={f.sort} style={{ width: 130 }} onChange={v => set({ sort: v })} options={[{ value: 'hot', label: '按热门排序' }, { value: 'salary', label: '按月薪排序' }, { value: 'updated', label: '最近更新' }]} />
          {selected.length > 0 && <>
            <Button icon={<CheckCircleOutlined />} onClick={() => review('complete')}>通过 {selected.length}</Button>
            <Button icon={<CloseCircleOutlined />} danger onClick={() => review('rejected')}>不通过</Button>
          </>}
        </Space>
        <Table size="small" rowKey="id" loading={loading} dataSource={data} scroll={{ x: 1250 }}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={{ current: page, pageSize: 50, total, onChange: setPage, showSizeChanger: false, showTotal: t => `共 ${t} 个职业` }}
          columns={[
            { title: '职业', dataIndex: 'name', width: 220, fixed: 'left' as const, render: (v: string, r: any) => (
              <div style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/db-occupation/${r.id}`)}>
                <div style={{ fontWeight: 600, color: BRAND.primary }}>{v}{r.origin === 'market' && <Tag color="purple" style={{ marginLeft: 6, fontWeight: 400 }}>市场新兴</Tag>}</div>
                {r.name_lang_en && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{r.name_lang_en}</div>}
              </div>) },
            { title: '大类 / 小类', dataIndex: 'career_category', width: 190, render: (v: string, r: any) => <div>
              {v ? <Tag color="blue" style={{ margin: 0 }}>{CAREER_CATEGORY_LABELS[v] || v}</Tag> : <Text type="secondary">未分类</Text>}
              {r.career_mid_category && <div style={{ fontSize: 12, color: BRAND.ink3, marginTop: 2 }}>{CAREER_MID_LABELS[r.career_mid_category] || r.career_mid_category}</div>}
            </div> },
            { title: '平均月薪', dataIndex: 'recent_year_monthly_salary', width: 100, render: (v: number) => v ? <Text strong>¥{v.toLocaleString()}</Text> : '—' },
            { title: <Tooltip title="1年以内 → 1-3年 → 3-5年 → 5-10年 → 10年以上（月薪）">分年限薪资</Tooltip>, dataIndex: 'salaries', width: 230, render: (s: Record<string, number>) => {
              const vals = SALARY_YEARS.map(y => s?.[y] || 0); const max = Math.max(...vals);
              if (!max) return <Text type="secondary">—</Text>;
              return <Tooltip title={SALARY_YEARS.map(y => `${SALARY_YEAR_LABELS[y]}：${s?.[y] ? `¥${s[y].toLocaleString()}` : '—'}`).join('　')}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 30 }}>
                  {vals.map((n, i) => <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 38 }}>
                    <div style={{ width: 22, height: Math.max(2, (n / max) * 20), background: n ? BRAND.primary : '#e5e7eb', borderRadius: 2, opacity: 0.35 + 0.13 * i }} />
                    <span style={{ fontSize: 10, color: BRAND.ink3 }}>{yuan(n)}</span>
                  </div>)}
                </div>
              </Tooltip>;
            } },
            { title: '相关专业', dataIndex: 'relevant_fos_ids', width: 200, render: (v: string[]) => <Space size={2} wrap>{(v || []).slice(0, 3).map(p => <Tag key={p} style={{ margin: 0, fontSize: 11 }}>{p}</Tag>)}{(v || []).length > 3 && <Text type="secondary">+{v.length - 3}</Text>}</Space> },
            { title: '完整度', dataIndex: 'completeness_score', width: 110, render: (v: number) => <Progress percent={v || 0} size="small" strokeColor={(v || 0) >= 80 ? '#16a34a' : (v || 0) >= 50 ? '#d97706' : '#dc2626'} /> },
            { title: '来源', dataIndex: 'source', width: 100, render: (v: string) => v ? <Tag>{SOURCE_LABELS[v] || v}</Tag> : '—' },
            { title: '审核', dataIndex: 'human_review_status', width: 90, render: (v: string) => <Tag color={REVIEW_STATUS[v]?.color}>{REVIEW_STATUS[v]?.label || '未审核'}</Tag> },
          ]} />
      </Panel>
    </div>
  );
}
