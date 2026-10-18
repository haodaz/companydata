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
  const [occs, setOccs] = useState<{ id: number; name: string; category?: string; intro?: string }[]>([]);
  const [roleSearched, setRoleSearched] = useState('');
  useEffect(() => {
    const q = role.trim(); if (!q) { setJobs([]); setOccs([]); setRoleSearched(''); return; }
    const t = setTimeout(async () => { const j = await (await fetch(`/api/work/companies?role_q=${encodeURIComponent(q)}${picked ? `&company_id=${picked.id}` : ''}`)).json().catch(() => null); setJobs(j?.jobs || []); setOccs(j?.occupations || []); setRoleSearched(q); }, 250);
    return () => clearTimeout(t);
  }, [role, picked]);
  const roleHitJob = jobs.find(j => j.title === role.trim()); const roleHitOcc = occs.find(o => o.name === role.trim());
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
      <AutoComplete value={role} size={size} style={{ width: '100%' }} placeholder={picked ? `岗位：输入名字，会匹配 ${picked.name} 在招的岗位和职业库` : '岗位 / 职业：输入名字，会匹配职业库（如 供应链计划）'}
        options={[
          ...(jobs.length ? [{ label: <span style={{ fontSize: 11, color: '#999' }}>这家在招</span>, options: jobs.map(j => ({ value: j.title, label: <div style={{ display: 'flex', gap: 8 }}><span>{j.title}</span><span style={{ color: '#888', fontSize: 12 }}>{[j.job_function, j.city].filter(Boolean).join(' · ')}</span></div> })) }] : []),
          ...(occs.length ? [{ label: <span style={{ fontSize: 11, color: '#999' }}>职业库</span>, options: occs.filter(o => !jobs.some(j => j.title === o.name)).map(o => ({ value: o.name, label: <div style={{ display: 'flex', gap: 8 }}><span>{o.name}</span><span style={{ color: '#888', fontSize: 12 }}>{o.category}</span></div> })) }] : []),
        ]}
        onChange={v => onRole(v)} />
      {role.trim().length >= 2 && roleSearched === role.trim() && <div style={{ marginTop: -4 }}>
        {roleHitJob ? <Tag color="purple">已匹配 · {picked?.name} 在招「{roleHitJob.title}」{roleHitJob.job_function ? ` · ${roleHitJob.job_function}` : ''}</Tag> : null}
        {roleHitOcc ? <Tag color="blue">职业库 · {roleHitOcc.name}{roleHitOcc.category ? `（${roleHitOcc.category}）` : ''}</Tag> : null}
        {!roleHitJob && !roleHitOcc && <><Tag color="orange">新岗位「{role.trim()}」</Tag><span style={{ fontSize: 12, color: '#888' }}>{jobs.length || occs.length ? '下拉里有相近的，也可以直接用你写的' : '库里没有对应岗位 / 职业，照样出题，典型任务那层会缺'}</span></>}
      </div>}
    </>
  );
}
