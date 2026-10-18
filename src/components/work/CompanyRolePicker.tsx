'use client';

/** 出题时从库里选企业 / 岗位：企业带行业 / 城市 / 画像完整度 / 在招岗位数，岗位从这家在招的里选（也可手填）——让人看见题是从数据底座里长出来的 */
import React, { useEffect, useState } from 'react';
import { AutoComplete, Tag } from 'antd';

export type PickedCompany = { id: number; name: string; industry?: string; city?: string; completeness?: number; has_profile?: boolean; jobs?: number } | null;

export function CompanyRolePicker({ company, role, onCompany, onRole, size = 'large' }: { company: string; role: string; onCompany: (name: string, picked: PickedCompany) => void; onRole: (role: string) => void; size?: 'large' | 'middle' }) {
  const [opts, setOpts] = useState<any[]>([]);
  const [picked, setPicked] = useState<PickedCompany>(null);
  const [searched, setSearched] = useState('');
  const [jobs, setJobs] = useState<{ title: string; job_function?: string; city?: string }[]>([]);
  useEffect(() => {
    const q = company.trim(); if (!q || (picked && picked.name === q)) { if (!q) setOpts([]); return; }
    const t = setTimeout(async () => {
      const j = await (await fetch(`/api/work/companies?q=${encodeURIComponent(q)}`)).json().catch(() => null);
      const list = j?.companies || []; setOpts(list); setSearched(q);
      // 名字和库里完全一致就直接选中（不用再点）；搜不到就是新企业
      const exact = list.find((c: any) => c.name === q || c.brief_name === q);
      if (exact) { setPicked(exact); onCompany(exact.name, exact); }
    }, 250);
    return () => clearTimeout(t);
  }, [company, picked]);
  useEffect(() => {
    if (!picked) { setJobs([]); return; }
    (async () => { const j = await (await fetch(`/api/work/companies?company_id=${picked.id}`)).json().catch(() => null); setJobs(j?.jobs || []); })();
  }, [picked]);
  return (
    <>
      <AutoComplete value={company} size={size} style={{ width: '100%' }} placeholder="企业：输入名字，从库里选（如 宁德时代）"
        options={opts.map(c => ({ value: c.name, label: <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b>{c.name}</b><span style={{ color: '#888', fontSize: 12 }}>{[c.industry, c.city].filter(Boolean).join(' · ')}</span><span style={{ marginLeft: 'auto', fontSize: 11, color: '#999' }}>{c.has_profile ? '画像 ✓' : '无画像'} · 岗位 {c.jobs}</span></div>, c }))}
        onChange={v => { onCompany(v, null); setPicked(null); }}
        onSelect={(_v, o: any) => { setPicked(o.c); onCompany(o.c.name, o.c); }} />
      {!picked && company.trim().length >= 2 && searched === company.trim() && !opts.length && <div style={{ marginTop: -4 }}><Tag color="orange">库里没有「{company.trim()}」· 按新企业出题</Tag><span style={{ fontSize: 12, color: '#888' }}>没有画像和在招岗位，题里的企业事实会少，材料会标「示例数据」</span></div>}
      {picked && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: -4 }}>
        <Tag color="green">企业库 #{picked.id}</Tag>{picked.industry && <Tag>{picked.industry}</Tag>}{picked.city && <Tag>{picked.city}</Tag>}
        <Tag color={picked.has_profile ? 'blue' : 'default'}>{picked.has_profile ? `画像完整度 ${picked.completeness ?? '–'}` : '没有画像，只能按名字出题'}</Tag>
        <Tag color={picked.jobs ? 'purple' : 'default'}>在招岗位 {picked.jobs}</Tag>
      </div>}
      <AutoComplete value={role} size={size} style={{ width: '100%' }} placeholder={picked && jobs.length ? `岗位：从 ${picked.name} 在招的 ${jobs.length} 个里选，或手填` : '岗位 / 职业：如 供应链计划、后端开发'}
        options={jobs.map(j => ({ value: j.title, label: <div style={{ display: 'flex', gap: 8 }}><span>{j.title}</span><span style={{ color: '#888', fontSize: 12 }}>{[j.job_function, j.city].filter(Boolean).join(' · ')}</span></div> }))}
        filterOption={(input, o) => String(o?.value || '').toLowerCase().includes(input.toLowerCase())}
        onChange={v => onRole(v)} />
    </>
  );
}
