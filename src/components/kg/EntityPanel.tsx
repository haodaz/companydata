'use client';

/**
 * 和我聊 · 资料面板（浅色）：点对话里的来源 / 编号，右侧滑出这条数据的完整内容——
 * 职业介绍、发展图谱（技能树 + 阶梯 + 升迁）、薪资、场所与工具、在招岗位、岗位详情、企业、行业标准、典型任务。
 * 数据来自 {endpoint}/entity（只给这段对话引用过的实体）。
 */
import React, { useEffect, useState } from 'react';
import { OccupationCareerGraph } from '@/components/admin/OccupationCareerGraph';
import { CAREER_CATEGORY_LABELS, SALARY_CN_REGIONS, SALARY_COUNTRIES, SALARY_YEAR_LABELS, SALARY_YEARS } from '@/lib/occupation-fields';
import { ITEM_KIND_LABELS, TASK_DIFFICULTY_LABELS } from '@/lib/entity-fields';
import { JOB_TYPE_LABELS, formatSalary } from '@/lib/job-fields';
import type { ChatSource } from '@/components/kg/PersonaChat';

const C = { ink: '#1f2233', ink2: '#4b5064', ink3: '#8a8fa3', border: '#e8eaf2', soft: '#f6f7fb', v: '#6055f5', chip: 'rgba(96,85,245,.08)' };
const SECTION_TITLE: Record<string, string> = { intro: '职业介绍', graph: '发展与升迁', salary: '薪资', context: '在哪干 · 用什么', jobs: '在招岗位', eco: '我的行当 · 上下游' };
const KIND_TITLE: Record<string, string> = { job: '岗位', company: '企业', standard: '行业标准', task: '典型任务' };

const H = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, margin: '18px 0 8px' }}>{children}</div>;
const P = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 14, color: C.ink2, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{children}</div>;
const Chip = ({ children, color = C.v }: { children: React.ReactNode; color?: string }) => <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, background: C.chip, color, fontSize: 12, margin: '0 6px 6px 0' }}>{children}</span>;
const Bar = ({ label, value, max, right }: { label: string; value: number; max: number; right: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
    <span style={{ width: 120, fontSize: 12.5, color: C.ink2, flexShrink: 0 }}>{label}</span>
    <div style={{ flex: 1, background: '#eef0f6', borderRadius: 4, height: 12 }}>{value > 0 && <div style={{ width: `${Math.max(3, (value / max) * 100)}%`, height: 12, borderRadius: 4, background: 'linear-gradient(90deg,#6055f5,#8b5cf6)' }} />}</div>
    <span style={{ width: 110, textAlign: 'right', fontSize: 12.5, fontWeight: 600 }}>{right}</span>
  </div>
);

function Body({ d }: { d: any }) {
  if (d.kind === 'occupation' && d.section === 'eco') {
    // 环节是平方的产业链分析，环节下面的公司全部来自平方企业库
    const Side = ({ label, nodes }: { label: string; nodes: any[] }) => !nodes.length ? null : <>
      <H>{label}</H>
      {nodes.map((n: any, i: number) => <div key={i} style={{ padding: '10px 12px', borderRadius: 12, background: C.soft, marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{n.stage}</div>
        {n.what && <div style={{ fontSize: 12.5, color: C.ink3, lineHeight: 1.6, margin: '2px 0 6px' }}>{n.what}</div>}
        {n.companies.length
          ? n.companies.map((c: any) => <div key={c.id} style={{ fontSize: 13, color: C.ink2, padding: '3px 0' }}><b style={{ color: C.ink }}>{c.name}</b>{[c.industry, c.city].filter(Boolean).length ? <span style={{ color: C.ink3 }}> · {[c.industry, c.city].filter(Boolean).join(' · ')}</span> : null}{c.one_sentence && <div style={{ fontSize: 12, color: C.ink3 }}>{c.one_sentence}</div>}</div>)
          : <div style={{ fontSize: 12, color: C.ink3 }}>平方企业库里暂未匹配到公司</div>}
      </div>)}
    </>;
    return <>
      <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.7 }}>这一行在产业链上的位置：往上是谁给它供东西，往下它的活儿交给谁。环节划分是平方的产业链分析，每个环节下的公司都来自平方企业库。</div>
      <Side label="上游" nodes={d.upstream} />
      <Side label="下游" nodes={d.downstream} />
    </>;
  }
  if (d.kind === 'occupation' && d.section === 'intro') {
    const o = d.occupation;
    return <>
      <div style={{ fontSize: 13, color: C.ink3 }}>{[o.name_lang_en, CAREER_CATEGORY_LABELS[o.career_category]].filter(Boolean).join(' · ')}</div>
      {!!o.aliases?.length && <div style={{ marginTop: 10 }}>{o.aliases.slice(0, 8).map((a: string) => <Chip key={a}>{a}</Chip>)}</div>}
      {o.intro && <><H>简介</H><P>{o.intro}</P></>}
      {o.responsibility && <><H>工作内容</H><P>{o.responsibility}</P></>}
      {o.position_requirement && <><H>职业要求</H><P>{o.position_requirement}</P></>}
      {o.relevant_certificates && <><H>相关证书</H><div>{String(o.relevant_certificates).split(/[、,，]/).filter(Boolean).map((c: string) => <Chip key={c} color="#b45309">{c}</Chip>)}</div></>}
      {!!o.relevant_fos_ids?.length && <><H>相关专业</H><div>{o.relevant_fos_ids.map((f: string) => <Chip key={f}>{f}</Chip>)}</div></>}
      {o.relevant_celebrities && <><H>行业代表人物</H><P>{o.relevant_celebrities}</P></>}
    </>;
  }
  if (d.kind === 'occupation' && d.section === 'graph') {
    return d.career_map ? <OccupationCareerGraph graph={d.career_map} roleLinks={{}} onOpenRole={() => {}} onQueryRole={() => {}} readonly /> : <P>还没有发展图谱</P>;
  }
  if (d.kind === 'occupation' && d.section === 'salary') {
    const max = Math.max(0, ...d.salaries.map((s: any) => s.salary || 0));
    const cn = d.regions.filter((r: any) => r.scope === 'cn_region').sort((a: any, b: any) => b.monthly_cny - a.monthly_cny);
    const ct = d.regions.filter((r: any) => r.scope === 'country').sort((a: any, b: any) => b.monthly_cny - a.monthly_cny);
    const rmax = Math.max(0, ...cn.map((r: any) => r.monthly_cny)), cmax = Math.max(0, ...ct.map((r: any) => r.monthly_cny));
    return <>
      {d.occupation.recent_year_monthly_salary && <div style={{ fontSize: 28, fontWeight: 800 }}>¥{d.occupation.recent_year_monthly_salary.toLocaleString()}<span style={{ fontSize: 13, color: C.ink3, fontWeight: 400 }}> 全国平均月薪（税前）</span></div>}
      {!!d.salaries.length && <><H>按工作年限</H>{SALARY_YEARS.map(y => { const s = d.salaries.find((x: any) => x.year === y); return s ? <Bar key={y} label={SALARY_YEAR_LABELS[y]} value={s.salary} max={max} right={`¥${s.salary.toLocaleString()}`} /> : null; })}</>}
      {!!cn.length && <><H>中国各地区</H>{cn.map((r: any) => <Bar key={r.code} label={SALARY_CN_REGIONS.find(x => x.code === r.code)?.name || r.code} value={r.monthly_cny} max={rmax} right={`¥${r.monthly_cny.toLocaleString()}`} />)}</>}
      {!!ct.length && <><H>各国家 / 地区（折人民币）</H>{ct.map((r: any) => <Bar key={r.code} label={SALARY_COUNTRIES.find(x => x.code === r.code)?.name || r.code} value={r.monthly_cny} max={cmax} right={`¥${r.monthly_cny.toLocaleString()}${r.currency !== 'CNY' ? ` · ${r.currency}` : ''}`} />)}
        <div style={{ fontSize: 11, color: C.ink3 }}>外币按固定汇率折算，仅作横向比较；生活成本与税负差异很大。</div></>}
    </>;
  }
  if (d.kind === 'occupation' && d.section === 'context') {
    const g = (t: string) => d.links.filter((l: any) => l.type === t);
    const items = g('item');
    return <>
      {!!g('place').length && <><H>工作场所</H><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
        {g('place').map((l: any, i: number) => <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {l.image_url ? <img src={l.image_url} alt="" style={{ width: '100%', height: 84, objectFit: 'cover', display: 'block' }} /> : <div style={{ height: 30, background: C.soft }} />}
          <div style={{ padding: '6px 9px', fontSize: 13, fontWeight: 600 }}>{l.name}</div></div>)}
      </div></>}
      {!!g('station').length && <><H>工位 / 操作台</H><div>{g('station').map((l: any, i: number) => <Chip key={i}>{l.name}</Chip>)}</div></>}
      {Object.keys(ITEM_KIND_LABELS).filter(k => items.some((l: any) => l.kind === k)).map(k => <div key={k}>
        <H>{ITEM_KIND_LABELS[k].label}</H>
        {items.filter((l: any) => l.kind === k).map((l: any, i: number) => <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
          {l.image_url && <img src={l.image_url} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover' }} />}
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{l.name}{l.proficiency && <span style={{ fontSize: 11, color: C.v, marginLeft: 6 }}>要{l.proficiency}</span>}</div>
            {l.note && <div style={{ fontSize: 12, color: C.ink3 }}>{l.note}</div>}</div>
        </div>)}
      </div>)}
    </>;
  }
  if (d.kind === 'occupation' && d.section === 'jobs') {
    return <>
      <div style={{ fontSize: 13, color: C.ink3, marginBottom: 8 }}>平方岗位库里实时在招 <b style={{ color: C.ink }}>{d.total}</b> 个（显示最近 {d.jobs.length} 个）</div>
      {d.jobs.map((j: any) => <JobRow key={j.id} j={j} />)}
    </>;
  }
  if (d.kind === 'job') {
    const j = d.job;
    if (!j) return <P>岗位已下线</P>;
    return <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {j.company_ref?.logo_url && <img src={j.company_ref.logo_url} alt="" referrerPolicy="no-referrer" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff' }} />}
        <div><div style={{ fontSize: 14, fontWeight: 600 }}>{j.company_ref?.name || j.institute_or_company_name}</div><div style={{ fontSize: 12, color: C.ink3 }}>{j.company_ref?.industry || ''}</div></div>
      </div>
      <div style={{ marginTop: 10 }}>{[j.city || j.location, JOB_TYPE_LABELS[j.job_type], j.department, formatSalary(j), j.official_publish_date && `${j.official_publish_date} 发布`, j.application_end_date_str && `截止 ${j.application_end_date_str}`].filter(Boolean).map((x: string) => <Chip key={x}>{x}</Chip>)}</div>
      {j.responsibilities && <><H>岗位职责</H><P>{j.responsibilities}</P></>}
      {j.overview && <><H>任职要求</H><P>{j.overview}</P></>}
      {j.welfare && <><H>福利</H><P>{j.welfare}</P></>}
      {j.link && <a href={j.link} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', borderRadius: 10, background: 'linear-gradient(120deg,#6055f5,#8b5cf6)', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>去官方页面看 / 投递 ↗</a>}
    </>;
  }
  if (d.kind === 'company') {
    const c = d.company;
    return <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {c.logo_url && <img src={c.logo_url} alt="" referrerPolicy="no-referrer" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff' }} />}
        <div><div style={{ fontSize: 13, color: C.ink3 }}>{c.registered_name && c.registered_name !== c.name ? c.registered_name : c.name_en || ''}</div>
          <div style={{ fontSize: 12, color: C.ink3 }}>{[c.industry, c.sub_industry, c.city, c.company_scale, c.info_founding_year && `${c.info_founding_year} 年成立`].filter(Boolean).join(' · ')}</div></div>
      </div>
      {(c.one_sentence || c.introduction) && <><H>企业介绍</H><P>{c.introduction || c.one_sentence}</P></>}
      <H>在招的{d.occupation.name}岗位（{d.total}）</H>
      {d.jobs.map((j: any) => <JobRow key={j.id} j={{ ...j, institute_or_company_name: c.name }} />)}
      <div style={{ marginTop: 12, display: 'flex', gap: 14 }}>
        {c.official_website && <a href={c.official_website} target="_blank" rel="noreferrer" style={{ color: C.v, fontSize: 13 }}>官网 ↗</a>}
        {c.campus_url && <a href={c.campus_url} target="_blank" rel="noreferrer" style={{ color: C.v, fontSize: 13 }}>校招官网 ↗</a>}
      </div>
    </>;
  }
  if (d.kind === 'standard') {
    const s = d.standard;
    return <>
      <div style={{ fontSize: 13, color: C.ink3 }}>{[s.code, s.issuer].filter(Boolean).join(' · ')}</div>
      {s.scope && <><H>适用范围</H><P>{s.scope}</P></>}
      {!!s.key_points?.length && <><H>操作要点（转述，以原文为准）</H>
        {s.key_points.map((p: any, i: number) => <div key={i} style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.7, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>{p.clause && <b style={{ color: C.v, marginRight: 6 }}>{p.clause}</b>}{p.point}</div>)}</>}
      {s.official_url && <a href={s.official_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 14, color: C.v, fontSize: 13 }}>官方题录 / 全文 ↗</a>}
    </>;
  }
  if (d.kind === 'task') {
    const t = d.task;
    return <>
      <div>{[TASK_DIFFICULTY_LABELS[t.difficulty], ({ daily: '每天', weekly: '每周', occasional: '偶尔' } as any)[t.frequency], t.duration].filter(Boolean).map((x: string) => <Chip key={x}>{x}</Chip>)}</div>
      {t.summary && <><H>情境</H><P>{t.summary}</P></>}
      {t.goal && <><H>目标</H><P>{t.goal}</P></>}
      {!!t.success_criteria?.length && <><H>验收标准</H>{t.success_criteria.map((c: any, i: number) => <div key={i} style={{ fontSize: 13.5, color: C.ink2, marginBottom: 4 }}>✓ {c.name}{c.target ? `：${c.target}` : ''}</div>)}</>}
      {!!t.process?.length && <><H>怎么做</H>{t.process.map((p: any, i: number) => <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.chip, color: C.v, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
        <div style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.7 }}><b style={{ color: C.ink }}>{p.step}</b>{p.action ? `：${p.action}` : ''}
          {p.checkpoint && <div style={{ fontSize: 12, color: '#b45309' }}>检查点：{p.checkpoint}</div>}</div>
      </div>)}</>}
      {!!t.stakeholders?.length && <><H>要打交道的人</H>{t.stakeholders.map((s: any, i: number) => <div key={i} style={{ fontSize: 13.5, color: C.ink2, marginBottom: 4 }}><b style={{ color: C.ink }}>{s.role}</b>{s.interaction ? `：${s.interaction}` : ''}</div>)}</>}
      {t.common_mistakes && <><H>新手常见失误</H><div style={{ fontSize: 13.5, color: '#b91c1c', lineHeight: 1.7 }}>{t.common_mistakes}</div></>}
    </>;
  }
  return null;
}

function JobRow({ j }: { j: any }) {
  return (
    <a href={j.link || undefined} target="_blank" rel="noreferrer" onClick={e => { if (!j.link) e.preventDefault(); }}
      style={{ display: 'block', padding: '9px 0', borderBottom: `1px solid ${C.border}`, textDecoration: 'none', color: C.ink }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{j.name}{j.link && <span style={{ color: C.v, fontWeight: 400 }}> ↗</span>}</div>
      <div style={{ fontSize: 12, color: C.ink3 }}>{[j.institute_or_company_name, j.city || j.location, JOB_TYPE_LABELS[j.job_type], formatSalary(j), j.official_publish_date].filter(Boolean).join(' · ')}</div>
    </a>
  );
}

export function EntityPanel({ endpoint, source, extraQuery = '', onClose }: { endpoint: string; source: ChatSource; extraQuery?: string; onClose: () => void }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const ref = source.ref!;
  useEffect(() => {
    setD(null); setErr('');
    const q = new URLSearchParams({ kind: ref.kind, id: String(ref.id), ...(ref.section ? { section: ref.section } : {}) }).toString();
    fetch(`${endpoint}/entity?${q}${extraQuery ? `&${extraQuery}` : ''}`).then(r => r.json()).then(j => j.success ? setD(j) : setErr(j.error)).catch(e => setErr(e.message));
  }, [endpoint, ref.kind, ref.id, ref.section, extraQuery]);
  const kindLabel = ref.kind === 'occupation' ? SECTION_TITLE[ref.section || 'intro'] : KIND_TITLE[ref.kind];
  const title = ref.kind === 'occupation' ? (d?.occupation?.name || '') : ref.kind === 'company' ? (d?.company?.name || source.title)
    : ref.kind === 'job' ? (d?.job?.name || source.title) : ref.kind === 'standard' ? (d?.standard?.title || source.title) : (d?.task?.name || source.title.replace(/^典型任务 · /, ''));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#fff', color: C.ink }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: C.v, fontWeight: 700, letterSpacing: 1 }}>{source.id} · {kindLabel}</div>
          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 2, lineHeight: 1.35 }}>{title}</div>
        </div>
        <button onClick={onClose} aria-label="关闭资料" style={{ border: 0, background: 'transparent', fontSize: 22, color: C.ink3, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 28px' }}>
        {err && <div style={{ color: C.ink3, fontSize: 13 }}>{err}</div>}
        {!err && !d && <div style={{ color: C.ink3, fontSize: 13 }}>正在取资料…</div>}
        {d && <Body d={d} />}
        <div style={{ marginTop: 22, fontSize: 11, color: C.ink3 }}>数据来自平方知识库{ref.kind === 'job' || ref.section === 'jobs' ? '（岗位实时）' : ''}</div>
      </div>
    </div>
  );
}
