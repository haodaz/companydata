'use client';

/** 真活台 · 一道题的详情（后台和出题人管理页共用）：问题与任务 / 材料包 / rubric / AI 基线 / 作答 */
import React, { useMemo, useEffect, useState } from 'react';
import { timing } from '@/lib/work/deadline';
import { Button, Descriptions, Drawer, Input, InputNumber, Space, Table, Tabs, Tag, Tooltip, Typography, App } from 'antd';
import { WorkReport } from '@/components/work/WorkReport';
import { mainScore } from '@/lib/work/scale';
import { useWorkScale } from '@/lib/work/scale-client';
import { ReportView } from '@/components/work/ReportView';
import { Md } from '@/components/ws/Md';
import { MdView, RulesView } from '@/components/work/WorkText';
import { MODULES, type Module } from '@/lib/work/modules';

const { Text, Paragraph } = Typography;
export const ENV_META: Record<string, { label: string; color: string }> = { doc: { label: '文档 / 对账台', color: 'purple' }, code: { label: '代码台', color: 'geekblue' }, sheet: { label: '表格 / 数据台', color: 'cyan' }, design: { label: '设计台', color: 'orange' }, plugin: { label: '真活插件 · 自己的工具', color: 'magenta' }, open: { label: '自己录制电脑操作', color: 'green' } };
/** 操作台叫法（11-13 潜历：原题直发的题交表格 + 白板 + 文档，标签却是「文档 / 对账台」）：开放 / 插件按做法叫，其余按交付物用的台子叫 */
export function envLabel(T: any) {
  const env = T?.task?.env?.type || 'doc';
  if (env === 'open' || env === 'plugin') return ENV_META[env].label;
  const mods = [...new Set(((T?.task?.deliverables || []) as any[]).map(d => d?.module).filter((m: any) => m && MODULES[m as Module]))] as Module[];
  return mods.length ? mods.map(m => MODULES[m].label).join(' + ') : ENV_META[env]?.label || '文档';
}
/** 原题直发没有问题陈述，生成时填的是占位「出题人给的原题」：显示时跳过 */
export const realStatement = (s?: string) => (s && !/^(出题人给的原题|Task provided by )/.test(s) ? s : '');

export function WorkTaskDetail({ task: T, sessions, shareLink, notes, defaultTab, ownerKey, inlineEdit = true }: { /** 任务空间把岗位名 / 用时放到上面的「调整这道题」里，这里只显示（11-05） */ inlineEdit?: boolean; task: any; sessions: any[]; shareLink: string; notes?: string[]; defaultTab?: string; /** 有管理密钥才能补算 AI 使用分 */ ownerKey?: string }) {
  // 出题人是不是用一句话说的要找什么样的人（和 lib/work/generator.ts 的 isNeedText 同一判断；那边是服务端模块，这里不能直接引）
  const isNeed = String(T.role || '').trim().length > 14 || /[，,。、]|要一个|能看懂|能把|的人/.test(String(T.role || ''));
  const { message } = App.useApp();
  const [report, setReport] = useState<any>(null);
  const [tab, setTab] = useState<string>(defaultTab || 'p');
  useEffect(() => { const h = (e: Event) => setTab(String((e as CustomEvent).detail || 'p')); window.addEventListener('work-tab', h); return () => window.removeEventListener('work-tab', h); }, []);
  // 打开某人的报告时再取全过程（事件 + 问 AI 原文 + 稿子快照），列表里不带，免得一次拉太大
  const [proc, setProc] = useState<{ id: string; events: any[]; ai_chat: any[] } | null>(null);
  useEffect(() => {
    if (!report?.id || proc?.id === report.id) return;
    fetch(`/api/work/${T.share_token}/sessions/${report.id}?full=1`).then(r => r.json()).then(j => j.ok && setProc({ id: report.id, events: j.session.events || [], ai_chat: j.session.ai_chat || [] })).catch(() => {});
  }, [report?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 一道任务发给一批人（2026-10-28）：交了卷的按分排名；勾 2–4 人并排对比；导出候选名单
  const [picked, setPicked] = useState<string[]>([]);
  const [cmpOpen, setCmpOpen] = useState(false);
  const scale = useWorkScale(), ai = scale === 'ai_use';   // 平台选了「AI 使用与交互」：按 AI 使用分排，没有这项分的排在后面、不算名次
  const graded = sessions.filter((s: any) => s.score != null && !s.participant?.preview).sort((a: any, b: any) => (mainScore(b, scale) ?? -1) - (mainScore(a, scale) ?? -1));
  const rankOf = new Map(graded.filter((s: any) => mainScore(s, scale) != null).map((s: any, i: number) => [s.id, i + 1]));
  const ordered = [...graded, ...sessions.filter((s: any) => !graded.includes(s))];
  // 补算 AI 使用能力（2026-10-30）：老答卷没有这一项，一次 4 份循环补到底，补完刷新
  const [aiBusy, setAiBusy] = useState('');
  const needAi = graded.filter((s: any) => s.report?.result && !('ai_use' in (s.report || {}))).length;
  const backfillAi = async () => {
    const token = (shareLink.match(/\/work\/([^/?#]+)/) || [])[1];
    if (!token || !ownerKey) return;
    try {
      for (let n = 0, left = needAi; left > 0 && n < 30; n++) {
        setAiBusy(`补算中，还剩 ${left} 份`);
        const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(ownerKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_use: true }) })).json();
        if (!j.ok) throw new Error(j.error || '补算失败');
        if (!j.done && j.remaining) throw new Error('有几份没算出来，稍后再试');
        left = j.remaining;
      }
      message.success('AI 使用分补好了'); window.location.reload();
    } catch (e: any) { message.error(e.message); setAiBusy(''); }
  };
  const aiOf = (s: any) => s.report?.ai_use;
  // 同一浏览器用不同的手机或邮箱做过：只标出来，公司自己判断
  const swapped = useMemo(() => { const by = new Map<string, any[]>(); for (const s of sessions) if (s.participant?.device) by.set(s.participant.device, [...(by.get(s.participant.device) || []), s]); return new Set([...by.values()].filter(g => new Set(g.map(x => x.participant?.contact)).size > 1).flat().map(x => x.id)); }, [sessions]);
  const allowRetake = async (s: any) => {
    const token = (shareLink.match(/\/work\/([^/?#]+)/) || [])[1];
    const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(ownerKey || '')}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allow_retake: s.id }) })).json();
    if (!j.ok) return message.error(j.error || '没改成');
    message.success(`${s.participant?.name} 再用这条链接进来就是新的一次，旧的作答和报告都留着`); setTimeout(() => location.reload(), 900);
  };
  // 改限时（20–240 分钟）：计时器和任务书里写的时长一起换（2026-11-03，潜历反馈对 AI 说改 180 改不动）
  const [minutes, setMinutes] = useState<number>(Number(T.task?.time_minutes) || 60);
  const [minEdit, setMinEdit] = useState<number>(minutes);
  const [minBusy, setMinBusy] = useState(false);
  const saveMinutes = async () => {
    const token = (shareLink.match(/\/work\/([^/?#]+)/) || [])[1];
    if (!token || !ownerKey) return;
    setMinBusy(true);
    try {
      const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(ownerKey)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time_minutes: minEdit }) })).json();
      if (!j.ok) throw new Error(j.error || '没改成');
      setMinutes(j.time_minutes); setMinEdit(j.time_minutes); message.success(`限时改成 ${j.time_minutes} 分钟，任务书里写的时长也一起改了`);
    } catch (e: any) { message.error(e.message); } finally { setMinBusy(false); }
  };
  // 改岗位名 / 要找的人（2026-11-05 潜历：对 AI 说改岗位名没反应）——直接改，题面里的旧名字一起换
  const [role, setRole] = useState<string>(T.role || '');
  const [roleEdit, setRoleEdit] = useState<string | null>(null);
  const saveRole = async () => {
    const token = (shareLink.match(/\/work\/([^/?#]+)/) || [])[1];
    if (!token || !ownerKey || roleEdit == null) return;
    try {
      const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(ownerKey)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: roleEdit }) })).json();
      if (!j.ok) throw new Error(j.error || '没改成');
      setRole(j.role); setRoleEdit(null); message.success('岗位名改好了，题面里的旧名字也一起换了');
    } catch (e: any) { message.error(e.message); }
  };
  // 材料包：补传 / 删上传的文件（11-05 潜历：出好任务后还想加文件、换文件）
  const [mats, setMats] = useState<any[]>(T.materials || []); const [matBusy, setMatBusy] = useState(false);
  // 上面「调整这道题」改了之后页面会重新拉数据：这里跟着同步（11-05）
  useEffect(() => { setMats(T.materials || []); setRole(T.role || ''); setMinutes(Number(T.task?.time_minutes) || 60); setMinEdit(Number(T.task?.time_minutes) || 60); }, [T]); // eslint-disable-line react-hooks/exhaustive-deps
  const tokOf = () => (shareLink.match(/\/work\/([^/?#]+)/) || [])[1];
  const addMats = async (list: FileList | null) => {
    const token = tokOf(); if (!list?.length || !token || !ownerKey) return; setMatBusy(true);
    try {
      const atts: any[] = [];
      for (const f of Array.from(list).slice(0, 6)) {
        if (f.size > 20 * 1024 * 1024) { message.error(`${f.name} 超过 20MB`); continue; }
        const fd = new FormData(); fd.append('file', f);
        const j = await (await fetch(`/api/work/${token}/owner/attach?k=${encodeURIComponent(ownerKey)}`, { method: 'POST', body: fd })).json();
        if (!j.ok) { message.error(`${f.name}：${j.error || '没传上'}`); continue; }
        atts.push({ url: j.url, name: j.name, mime: j.mime, text: j.text, image: j.image });
      }
      if (atts.length) {
        const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(ownerKey)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ add_attachments: atts }) })).json();
        if (!j.ok) throw new Error(j.error || '没加进去'); setMats(j.materials); message.success(`加了 ${atts.length} 份素材，候选人刷新就能看到`);
      }
    } catch (e: any) { message.error(e.message); } finally { setMatBusy(false); }
  };
  const delMat = async (m: any) => {
    const token = tokOf(); if (!token || !ownerKey || !confirm(`删掉素材「${m.title}」？候选人就看不到了。`)) return;
    try { const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(ownerKey)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remove_material: m.id }) })).json(); if (!j.ok) throw new Error(j.error); setMats(j.materials); message.success('删掉了'); }
    catch (e: any) { message.error(e.message); }
  };
  const exportCsv = () => {
    const items: any[] = T.rubric || [];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['名次', '姓名', '联系方式', ...(ai ? [] : ['总分']), 'AI 使用', ...(ai ? [] : items.map((r: any) => r.title)), '交卷时间', '个人链接'];
    const lines = graded.map((s: any, i: number) => { const it = s.report?.result?.items || []; return [ai ? rankOf.get(s.id) ?? '' : i + 1, s.participant?.name, s.participant?.contact, ...(ai ? [] : [s.score]), aiOf(s) ? (aiOf(s).score ?? '没用 AI') : '', ...(ai ? [] : items.map((r: any) => it.find((x: any) => x.id === r.id)?.score ?? '')), s.submitted_at ? new Date(s.submitted_at).toLocaleString('zh-CN', { hour12: false }) : '', `${shareLink}?s=${s.id}`].map(esc).join(','); });
    const blob = new Blob(['\ufeff' + [head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `候选名单-${(T.task?.title || '真活').slice(0, 20)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'p', label: '问题与任务', children: <div>
          <Descriptions column={1} size="small" bordered items={[
            { key: 'c', label: isNeed ? '企业 · 要找的人' : '企业 · 岗位', children: roleEdit != null
              ? <Space.Compact size="small" style={{ width: '100%', maxWidth: 520 }}><Input size="small" value={roleEdit} onChange={e => setRoleEdit(e.target.value)} onPressEnter={saveRole} maxLength={120} /><Button size="small" type="primary" onClick={saveRole}>保存</Button><Button size="small" onClick={() => setRoleEdit(null)}>取消</Button></Space.Compact>
              : <Space wrap><span>{T.company_name} · {role}</span>{ownerKey && inlineEdit && <a onClick={() => setRoleEdit(role)}>改岗位名</a>}</Space> },
            { key: 'link', label: '参与链接', children: <Space><code>{shareLink}</code><Button size="small" onClick={() => { navigator.clipboard.writeText(shareLink); message.success('已复制'); }}>复制</Button></Space> },
            // 出题依据（11-10 潜历：「为什么是现在」看不懂、候选人也看不到）：改叫人话，标明谁看得到
            ...(realStatement(T.problem?.statement) ? [{ key: 's', label: <span>要解决的问题<div style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>候选人在标题下看得到</div></span>, children: T.problem?.statement }] : []),
            ...(T.problem?.why_now ? [{ key: 'w', label: <span>为什么现在要做<div style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>出题依据 · 候选人看不到</div></span>, children: T.problem.why_now }] : []),
            { key: 'e', label: <span>材料依据<div style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>候选人看不到</div></span>, children: <ul style={{ margin: 0, paddingLeft: 18 }}>{(T.problem?.evidence || []).map((x: any, i: number) => <li key={i}>{x.text} <Text type="secondary">— {x.source}</Text></li>)}</ul> },
            { key: 'd', label: '交付物', children: <ol style={{ margin: 0, paddingLeft: 18 }}>{(T.task?.deliverables || []).map((d: any) => <li key={d.id}>{d.title} <Text type="secondary">{d.format}</Text></li>)}</ol> },
            { key: 'r', label: '规则', children: <RulesView rules={T.task?.rules || []} fontSize={13.5} /> },
            ...(T.task?.lang === 'en' ? [{ key: 'lang', label: '题目语言', children: <span style={{ fontSize: 13 }}>英文：候选人看到的题面、作答界面、AI 助手、评分标准和报告都是英文；出题依据（为什么现在要做、材料依据）仍是中文</span> }] : []),
            ...(T.task?.style ? [{ key: 'st', label: '出法', children: <span style={{ fontSize: 13 }}>{T.task.style.deep ? '升维解读（可以延伸到更大的问题）' : '按字面出，不升维'} · {T.task.style.steps ? '分步推进' : '不替候选人拆步骤'}</span> }] : []),
            { key: 'm', label: '时间与操作台', children: <Space wrap><span>{T.task?.soft_limit ? '建议' : '限时'} {minutes} 分钟 · 操作台 {envLabel(T)}</span>{ownerKey && inlineEdit && <Space.Compact size="small"><InputNumber size="small" min={20} max={240} step={10} value={minEdit} onChange={v => setMinEdit(Number(v) || minutes)} suffix="分钟" style={{ width: 110 }} /><Button size="small" disabled={minEdit === minutes} loading={minBusy} onClick={saveMinutes}>改用时</Button></Space.Compact>}</Space> },
          ]} />
          <div style={{ marginTop: 12, background: '#fafbff', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>任务书（候选人看到的）</div><MdView text={T.task?.brief || ''} /></div>
          {T.task?.env?.type === 'code' && <Paragraph><b>自测用例</b>：{(T.task.env.tests || []).map((t: any) => t.name).join('、') || '无'}</Paragraph>}
          {notes?.length ? <Paragraph type="warning">材料缺口：{notes.join('；')}</Paragraph> : null}
          {T.sources && <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: '#f3fbf6', border: '1px solid #cfe9d8' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>取材清单 · 这道题从库里拿了什么</div>
            <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              {T.sources.company && <div><Tag color="green">企业画像</Tag>{T.sources.company.name}{T.sources.company.industry ? `（${T.sources.company.industry}）` : ''} · 用到字段：{T.sources.company.fields.join('、') || '—'}</div>}
              <div><Tag color="green">子实体</Tag>产品 {T.sources.products.length} 个{T.sources.products.length ? `（${T.sources.products.slice(0, 5).join('、')}${T.sources.products.length > 5 ? '…' : ''}）` : ''} · 近期动态 {T.sources.news} 条 · 高管 {T.sources.executives} 位</div>
              {!!T.sources.deep?.length && <div><Tag color="geekblue">深度画像</Tag>{T.sources.deep.join('、')}</div>}
              {!!T.sources.related?.length && <div><Tag color="cyan">关联主体</Tag>{T.sources.related.join('；')}</div>}
              {/* 出任务的人用一句话说要找什么样的人时，不查职业库、不配在招岗位：这两行不显示 */}
              {(T.sources.jobs.length > 0 || !isNeed) && <div><Tag color="purple">在招岗位</Tag>{T.sources.jobs.length ? T.sources.jobs.join('、') : '没有对口岗位'}</div>}
              {(T.sources.occupation || !isNeed) && <div><Tag color="blue">职业画像</Tag>{T.sources.occupation || '职业库里没有这个职业'}{T.sources.typical_tasks.length ? ` · 典型任务：${T.sources.typical_tasks.slice(0, 4).join('、')}` : ''}</div>}
              <div><Tag color="gold">行业标准</Tag>{T.sources.standards.length ? T.sources.standards.slice(0, 4).join('；') : '没有挂到的标准'}</div>
            </div>
          </div>}
          {!!T.task?.revisions?.length && <div style={{ marginTop: 12 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>修订记录</div>{T.task.revisions.map((r: any, i: number) => <div key={i} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid #f0f0f5' }}><Text type="secondary">{new Date(r.at).toLocaleString('zh-CN', { hour12: false })}</Text> · 意见：{r.feedback}<div style={{ color: '#12a150' }}>改动：{r.changelog}</div></div>)}</div>}
        </div> },
        ...(T.task?.stages?.length ? [{ key: 'q', label: `推进步骤（${T.task.stages.length}）`, children: <div>
          <Paragraph type="secondary" style={{ fontSize: 13 }}>照深度样本出的案例推进式真活：候选人一步一步看信息、作答；参考答案和算式只有这里和评卷 AI 看得到。测算的数都由平台按算式重算过。</Paragraph>
          {T.task.stages.map((st: any) => <div key={st.id} style={{ marginBottom: 16, padding: '12px 14px', background: '#fafbff', borderRadius: 10 }}>
            <div><Tag color="purple">{st.id}</Tag><Tag>{({ structuring: '搭框架', judgement: '判断与洞察', numeracy: '测算', creativity: '出主意', synthesis: '综合建议' } as any)[st.type] || st.type}</Tag><b>{st.question}</b></div>
            {st.reveal && <details style={{ marginTop: 6 }}><summary style={{ cursor: 'pointer', color: '#6055f5', fontSize: 13 }}>这一步给候选人的信息</summary><div style={{ fontSize: 13, marginTop: 6 }}><Md text={st.reveal} /></div></details>}
            <div style={{ marginTop: 6, fontSize: 13 }}><Text type="secondary">参考答案</Text><Md text={st.expected} /></div>
            {!!st.calc?.length && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>{st.calc.map((c: any, i: number) => <li key={i}>{c.label}：<code>{c.expr}</code> = <b>{c.value}</b>{c.verified === false && <Tag color="orange" style={{ marginLeft: 6 }}>算式没核上</Tag>}</li>)}</ul>}
          </div>)}
        </div> }] : []),
        { key: 'm', label: `材料包（${mats.length}）`, children: <>{ownerKey && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 12px', border: '1px dashed #d9dbe6', borderRadius: 10, flexWrap: 'wrap' }}>
            <label style={{ cursor: 'pointer', color: '#6055f5', fontWeight: 600 }}>{matBusy ? '上传中…' : '＋ 上传素材'}<input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.gif" style={{ display: 'none' }} disabled={matBusy} onChange={e => { addMats(e.target.files); e.target.value = ''; }} /></label>
            <Text type="secondary" style={{ fontSize: 12 }}>给候选人的文件：PDF / Word(docx) / Excel / CSV / TXT / 图片，单个 20MB 内。图片会让 AI 看一遍写说明，文档会抽出文字。改文件就是删掉再传新的；AI 写的材料用「按意见修订」改。</Text>
          </div>}
          {mats.map((m: any) => <div key={m.id} style={{ marginBottom: 14 }}><b>{m.id} {m.title}</b> <Tag>{m.kind === 'file' ? '附件' : m.kind}</Tag>{m.kind === 'file' && m.url && <a href={m.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>打开 ↗</a>}{ownerKey && m.kind === 'file' && <a onClick={() => delMat(m)} style={{ marginRight: 8, color: '#c0392b' }}>删除</a>}<Tag color={m.source === 'db' ? 'green' : m.source === 'generated' ? 'orange' : 'gold'}>{m.source === 'db' ? '来自材料' : m.source === 'generated' ? '补写' : '混合'}</Tag>{m.basis && <Text type="secondary"> 依据：{m.basis}</Text>}<MdView text={m.content} style={{ background: '#fafbff', padding: 10, borderRadius: 8, fontSize: 13, marginTop: 6 }} /></div>)}</> },
        { key: 'r', label: `rubric（${(T.rubric || []).length}）`, children: <Table size="small" rowKey="id" pagination={false} dataSource={T.rubric || []} columns={[
          { title: '#', dataIndex: 'id', width: 50 }, { title: '条目', dataIndex: 'title', render: (v: string, r: any) => <div><b>{v}</b><div style={{ fontSize: 12, color: '#666' }}>{r.desc}</div></div> },
          { title: '权重', dataIndex: 'weight', width: 60 }, { title: '依赖', dataIndex: 'depends_on', width: 80, render: (v: string[]) => v?.join('、') || '–' },
          { title: '依据', dataIndex: 'basis', width: 200, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
          { title: 'BARS', dataIndex: 'levels', width: 320, render: (l: any) => <div style={{ fontSize: 12 }}>{['L1', 'L2', 'L3', 'L4'].map(k => <div key={k}><b>{k}</b> {l?.[k]}</div>)}</div> },
        ]} /> },
        ...(ai ? [] : [{ key: 'b', label: `AI 基线${T.baseline ? ` · ${T.baseline.result?.total} 分` : ''}`, children: T.baseline ? <div><Paragraph>AI 先做了一遍，用同一套 rubric 评：<b>{T.baseline.result?.total}</b> 分。{T.baseline.result?.summary}</Paragraph><Table size="small" rowKey="id" pagination={false} dataSource={T.baseline.result?.items || []} columns={[{ title: '条目', dataIndex: 'title' }, { title: '等级', dataIndex: 'level', width: 60 }, { title: '分', dataIndex: 'score', width: 60 }, { title: '证据 / 说明', render: (_: any, i: any) => <span style={{ fontSize: 12 }}>{i.evidence && <i>“{i.evidence}” </i>}{i.note}</span> }]} /><details style={{ marginTop: 12 }}><summary>AI 的答卷</summary><MdView text={T.baseline.answer || ''} style={{ fontSize: 13, background: '#fafbff', padding: 10, borderRadius: 8 }} /></details></div> : <Text type="secondary">AI 基线还没出来。出任务后它在后台跑，约一分钟，刷新这页就有；也可以点上面的「重跑 AI 基线」现在跑。基线 = 一个通用 AI 直接做这道题能得几分，是候选人分数的参照。</Text> }]),
        { key: 'ai', label: 'AI 使用标准', children: <AiPolicyView task={T} shareLink={shareLink} ownerKey={ownerKey} /> },
        { key: 's', label: `做题情况与评分（${sessions.filter((s: any) => !s.participant?.preview).length}）`, children: <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>交卷 {graded.length} 人，按分数排名；勾 2–4 人可以并排对比</Text>
            <span style={{ flex: 1 }} />
            <Button size="small" type="primary" disabled={picked.length < 2} onClick={() => setCmpOpen(true)}>对比所选（{picked.length}）</Button>
            {!!needAi && ownerKey && <Button size="small" loading={!!aiBusy} onClick={backfillAi}>{aiBusy || `补算 AI 使用分（${needAi} 份）`}</Button>}
            <Button size="small" disabled={!graded.length} onClick={exportCsv}>导出候选名单</Button>
          </div>
          <Table size="small" rowKey="id" pagination={false} dataSource={ordered}
            rowSelection={{ selectedRowKeys: picked, onChange: k => setPicked((k as string[]).slice(0, 4)), getCheckboxProps: (s: any) => ({ disabled: !s.report?.result }) }} columns={[
          { title: '#', width: 44, render: (_: any, s: any) => (rankOf.has(s.id) ? <b style={{ color: rankOf.get(s.id)! <= 3 ? '#6055f5' : '#888' }}>{rankOf.get(s.id)}</b> : <Text type="secondary">–</Text>) },
          { title: '谁', render: (_: any, s: any) => <span>{s.participant?.name} {s.participant?.preview && <Tag color="orange" style={{ marginLeft: 4 }}>预览</Tag>}{s.participant?.mode === 'ai' && <Tag style={{ marginLeft: 4 }}>AI 学员</Tag>}<Text type="secondary">{s.participant?.contact}</Text>{swapped.has(s.id) && <Tag color="orange" style={{ marginLeft: 4 }} title="同一个浏览器用不同的手机或邮箱做过这道题">同一浏览器换过联系方式</Tag>}{s.participant?.retake_allowed && <Tag style={{ marginLeft: 4 }}>已允许重做</Tag>}</span> },
          { title: '开始', dataIndex: 'started_at', render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false }) },
          { title: '交卷', dataIndex: 'submitted_at', render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : <Text type="secondary">做着呢</Text>) },
          ...(ai ? [] : [{ title: '结果', dataIndex: 'score', width: 70, render: (v: number) => (v == null ? '–' : <b>{v}</b>) }]),
          { title: 'AI 使用', width: 80, render: (_: any, s: any) => { const u = aiOf(s); return !u ? <Text type="secondary">–</Text> : u.score == null ? <Text type="secondary" style={{ fontSize: 12 }}>没用</Text> : <b style={{ color: '#6055f5' }}>{u.score}</b>; } },
          { title: '', width: 260, render: (_: any, s: any) => <Space>{s.report && <Button size="small" type="primary" ghost onClick={() => setReport(s)}>看报告</Button>}<Button size="small" onClick={() => { navigator.clipboard.writeText(`${shareLink}?s=${s.id}`); message.success('个人链接已复制'); }}>个人链接</Button>{ownerKey && s.participant?.contact_key && (s.submitted_at || timing(T.task, s).closed) && <Button size="small" onClick={() => allowRetake(s)}>允许重做</Button>}</Space> },
        ]} /></> },
      ]} />
      <Drawer open={cmpOpen} onClose={() => setCmpOpen(false)} size={Math.min(1100, typeof window !== 'undefined' ? window.innerWidth - 40 : 1100)} title="并排对比">
        {cmpOpen && <Compare rubric={T.rubric || []} people={picked.map(id => sessions.find((s: any) => s.id === id)).filter(Boolean)} baseline={T.baseline} rankOf={rankOf} />}
      </Drawer>
      <Drawer open={!!report} onClose={() => setReport(null)} size={Math.min(900, typeof window !== 'undefined' ? window.innerWidth - 60 : 900)} title={report ? `${report.participant?.name} 的报告` : ''}>
        {/* 在这一批人里的位置（11-13 宇宁：想在报告里看到和竞争者比、和最好的比、和 AI 比；排名和并排对比在列表上，单份报告里也给一行） */}
        {report && (() => {
          const me = mainScore(report, scale); const k = graded.findIndex((s: any) => s.id === report.id);
          if (me == null || k < 0) return null;
          const top = mainScore(graded[0], scale); const base = scale === 'ai_use' ? null : T.baseline?.result?.total;
          return <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fafaff', border: '1px solid #eeeefa', fontSize: 13, color: '#555' }}>
            这道题 {graded.length} 人交卷，{report.participant?.name || '他'}排第 {k + 1}（{me} 分）{k > 0 && top != null ? ` · 最高 ${top} 分，差 ${Math.round(Number(top) - Number(me))}` : graded.length > 1 ? ' · 目前最高' : ''}{base != null ? ` · AI 基线 ${base} 分` : ''}{graded.length > 1 && <> · <a onClick={() => { setReport(null); }}>回列表勾选并排对比</a></>}
          </div>;
        })()}
        {/* 三栏：交了什么 / 怎么做的 / 评得怎样；出任务的人先看交了什么（产品负责人 10-24：先看提交的答案本身，AI 只是辅助评价） */}
        {report && <ReportView report={report.report} participant={report.participant} deliverable={report.deliverable} events={proc && proc.id === report.id ? proc.events : null} aiChat={proc && proc.id === report.id ? proc.ai_chat : []} materials={T.materials} deliverables={T.task?.deliverables} defaultTab="deliv" />}
      </Drawer>
    </>
  );
}

/**
 * 这道任务的 AI 使用标准（2026-10-30）：企业对 AI 的态度、各环节能不能用、什么算用得好、治理红线、五项权重——每条都标出处（悬停看原文）。
 * 评「AI 使用能力」照它评。没有就点生成（第一次有人交卷时也会自动生成）。
 */
const USE: Record<string, { t: string; c: string }> = { encourage: { t: '鼓励用', c: 'green' }, allow: { t: '可以用', c: 'blue' }, caution: { t: '慎用', c: 'orange' }, forbid: { t: '不能用', c: 'red' } };
const STANCE: Record<string, string> = { ai_native: 'AI-native：默认深度用 AI', digitalizing: '数字化中：鼓励在合适环节用', traditional: '传统企业：谨慎用、重合规' };
const W_LABEL: Record<string, string> = { ask: '提问', verify: '核验', select: '取舍', divide: '分工', integrate: '整合' };
function AiPolicyView({ task: T, shareLink, ownerKey }: { task: any; shareLink: string; ownerKey?: string }) {
  const { message } = App.useApp();
  const [pol, setPol] = useState<any>(T.task?.ai_policy || null);
  const [busy, setBusy] = useState(false);
  const gen = async (force = false) => {
    const token = (shareLink.match(/\/work\/([^/?#]+)/) || [])[1];
    if (!token || !ownerKey) return message.warning('要从出任务的人的管理页打开才能生成');
    setBusy(true);
    try { const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(ownerKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_policy: true, force }) })).json(); if (!j.ok) throw new Error(j.error); setPol(j.policy); }
    catch (e: any) { message.error(e.message || '没生成出来'); } finally { setBusy(false); }
  };
  if (!pol) return <div style={{ padding: '20px 4px', color: '#666', lineHeight: 1.8 }}>
    <div>还没有这道任务的 AI 使用标准。生成时会读这家企业的画像和动态、这个岗位在职业库里的职责和典型任务、相关行业规范、任务书和材料，以及适用的法规，每一条都标出处。</div>
    <div style={{ marginTop: 6, color: '#999', fontSize: 13 }}>不点也行：第一位候选人交卷时会自动生成，评「AI 使用能力」照它评。</div>
    <Button type="primary" style={{ marginTop: 12 }} loading={busy} onClick={() => gen()}>生成 AI 使用标准</Button>
  </div>;
  const B = ({ ids }: { ids: string[] }) => <>{(ids || []).map(id => <Tooltip key={id} title={pol.sources?.[id] || id}><Tag style={{ marginLeft: 4, fontSize: 11, cursor: 'help' }}>{id.startsWith('G:') ? '法规' : id.startsWith('X:') ? '案例' : id}</Tag></Tooltip>)}</>;
  const sec: React.CSSProperties = { fontSize: 12, color: '#888', letterSpacing: 1, fontWeight: 600, margin: '16px 0 6px' };
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.75 }}>
      <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f6f5ff', border: '1px solid #e4e1ff' }}>
        <b style={{ fontSize: 15 }}>{STANCE[pol.stance?.level] || pol.stance?.level}</b><B ids={pol.stance?.basis} />
        <div style={{ color: '#444', marginTop: 2 }}>{pol.stance?.why}</div>
        {!!pol.stance?.signals?.length && <div style={{ color: '#888', fontSize: 12.5, marginTop: 4 }}>企业资料里的 AI 信号 {pol.stance.signals.length} 条：{pol.stance.signals.slice(0, 3).map((x: string) => `「${x}」`).join(' ')}</div>}
        <div style={{ marginTop: 6 }}>{pol.summary}</div>
      </div>
      <div style={sec}>各环节能不能用 AI</div>
      {(pol.stages || []).map((x: any, i: number) => <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f2f2f6' }}><Tag color={USE[x.use]?.c}>{USE[x.use]?.t || x.use}</Tag><b>{x.stage}</b> <span style={{ color: '#555' }}>{x.why}</span><B ids={x.basis} /></div>)}
      <div style={sec}>这个岗位里「AI 用得好」的样子</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>{(pol.good || []).map((x: any, i: number) => <li key={i}>{x.text}<B ids={x.basis} /></li>)}</ul>
      <div style={sec}>治理红线</div>
      {(pol.red_lines || []).length ? <ul style={{ margin: 0, paddingLeft: 18, color: '#b42318' }}>{pol.red_lines.map((x: any, i: number) => <li key={i}>{x.text}<B ids={x.basis} /></li>)}</ul> : <div style={{ color: '#999' }}>这道任务没有特别的治理红线（材料里没有个人信息、受监管数据）</div>}
      <div style={sec}>五项怎么算（按这个岗位调的权重）</div>
      <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden', fontSize: 12, color: '#fff' }}>{Object.entries(pol.weights || {}).map(([k, v]: any, i) => <div key={k} style={{ width: `${v}%`, background: ['#6055f5', '#12a150', '#2f80ed', '#b7791f', '#12b5cb'][i], display: 'grid', placeItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>{W_LABEL[k]} {v}%</div>)}</div>
      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}><Text type="secondary" style={{ fontSize: 12 }}>生成于 {new Date(pol.built_at).toLocaleString('zh-CN', { hour12: false })} · 出处标签悬停看原文</Text>{ownerKey && <Button size="small" loading={busy} onClick={() => gen(true)}>重新生成</Button>}</div>
    </div>
  );
}

/** 并排对比：逐条得分（每行最高分加粗）+ AI 基线 + 各人做得好的 / 差的 */
function Compare({ rubric, people, baseline: base0, rankOf }: { rubric: any[]; people: any[]; baseline: any; rankOf: Map<string, number> }) {
  const ai = useWorkScale() === 'ai_use', baseline = ai ? null : base0;
  const sc = (p: any, id: string) => p.report?.result?.items?.find((x: any) => x.id === id)?.score;
  const base = (id: string) => baseline?.result?.items?.find((x: any) => x.id === id)?.score;
  const cell: React.CSSProperties = { padding: '8px 10px', borderTop: '1px solid #f0f0f5', textAlign: 'center', fontVariantNumeric: 'tabular-nums' };
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead><tr>
          <th style={{ ...cell, textAlign: 'left', borderTop: 0, color: '#888', fontWeight: 500 }}>评分条目</th>
          {people.map(p => <th key={p.id} style={{ ...cell, borderTop: 0 }}><div style={{ fontWeight: 800 }}>{p.participant?.name}</div><div style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>第 {rankOf.get(p.id) ?? '–'} 名</div></th>)}
          {baseline && <th style={{ ...cell, borderTop: 0, color: '#999', fontWeight: 500 }}>AI 基线</th>}
        </tr></thead>
        <tbody>
          {!ai && <tr style={{ background: '#faf9ff' }}><td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>总分</td>{people.map(p => <td key={p.id} style={{ ...cell, fontSize: 20, fontWeight: 900, color: '#4c43c9' }}>{p.score}</td>)}{baseline && <td style={{ ...cell, color: '#999' }}>{baseline.result?.total}</td>}</tr>}
          <tr style={{ background: '#faf9ff' }}><td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>AI 使用能力</td>{people.map(p => { const u = p.report?.ai_use; return <td key={p.id} style={{ ...cell, fontSize: 17, fontWeight: 800, color: '#6055f5' }} title={u?.verdict || ''}>{!u ? '–' : u.score ?? '没用 AI'}</td>; })}{baseline && <td style={{ ...cell, color: '#999' }}>–</td>}</tr>
          {(ai ? [] : rubric).map((r: any) => { const vals = people.map(p => sc(p, r.id)).filter((v: any) => typeof v === 'number'); const top = vals.length ? Math.max(...vals) : null; return (
            <tr key={r.id}><td style={{ ...cell, textAlign: 'left' }}>{r.title}<span style={{ color: '#aaa', fontSize: 12, marginLeft: 6 }}>权重 {r.weight}</span></td>
              {people.map(p => { const v = sc(p, r.id); return <td key={p.id} style={{ ...cell, fontWeight: v != null && v === top ? 800 : 400, color: v != null && v === top ? '#12a150' : '#333' }}>{v ?? '–'}</td>; })}
              {baseline && <td style={{ ...cell, color: '#999' }}>{base(r.id) ?? '–'}</td>}</tr>
          ); })}
        </tbody>
      </table>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${people.length}, minmax(0, 1fr))`, gap: 12, marginTop: 18 }}>
        {people.map(p => <div key={p.id} style={{ border: '1px solid #ececf4', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{p.participant?.name}</div>
          {!ai && !!p.report?.result?.strengths?.length && <><div style={{ color: '#12a150', fontWeight: 700, fontSize: 12 }}>做得好的</div><ul style={{ margin: '2px 0 6px', paddingLeft: 16 }}>{p.report.result.strengths.slice(0, 3).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
          {!ai && !!p.report?.result?.gaps?.length && <><div style={{ color: '#c0392b', fontWeight: 700, fontSize: 12 }}>差的地方</div><ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>{p.report.result.gaps.slice(0, 3).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
        </div>)}
      </div>
    </div>
  );
}
