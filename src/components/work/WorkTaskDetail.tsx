'use client';

/** 真活台 · 一道题的详情（后台和出题人管理页共用）：问题与任务 / 材料包 / rubric / AI 基线 / 作答 */
import React, { useState } from 'react';
import { Button, Descriptions, Drawer, Space, Table, Tabs, Tag, Typography, App } from 'antd';
import { WorkReport } from '@/components/work/WorkReport';
import { Md } from '@/components/ws/Md';

const { Text, Paragraph } = Typography;
export const ENV_META: Record<string, { label: string; color: string }> = { doc: { label: '文档 / 对账台', color: 'purple' }, code: { label: '代码台', color: 'geekblue' }, sheet: { label: '表格 / 数据台', color: 'cyan' }, design: { label: '设计台', color: 'orange' }, plugin: { label: '真活插件 · 自己的工具', color: 'magenta' }, open: { label: '自己录制电脑操作', color: 'green' } };

export function WorkTaskDetail({ task: T, sessions, shareLink, notes, defaultTab }: { task: any; sessions: any[]; shareLink: string; notes?: string[]; defaultTab?: string }) {
  // 出题人是不是用一句话说的要找什么样的人（和 lib/work/generator.ts 的 isNeedText 同一判断；那边是服务端模块，这里不能直接引）
  const isNeed = String(T.role || '').trim().length > 14 || /[，,。、]|要一个|能看懂|能把|的人/.test(String(T.role || ''));
  const { message } = App.useApp();
  const [report, setReport] = useState<any>(null);
  // 一道任务发给一批人（2026-10-28）：交了卷的按分排名；勾 2–4 人并排对比；导出候选名单
  const [picked, setPicked] = useState<string[]>([]);
  const [cmpOpen, setCmpOpen] = useState(false);
  const graded = sessions.filter((s: any) => s.score != null && !s.participant?.preview).sort((a: any, b: any) => b.score - a.score);
  const rankOf = new Map(graded.map((s: any, i: number) => [s.id, i + 1]));
  const ordered = [...graded, ...sessions.filter((s: any) => !rankOf.has(s.id))];
  const exportCsv = () => {
    const items: any[] = T.rubric || [];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['名次', '姓名', '联系方式', '总分', ...items.map((r: any) => r.title), '交卷时间', '报告链接'];
    const lines = graded.map((s: any, i: number) => { const it = s.report?.result?.items || []; return [i + 1, s.participant?.name, s.participant?.contact, s.score, ...items.map((r: any) => it.find((x: any) => x.id === r.id)?.score ?? ''), s.submitted_at ? new Date(s.submitted_at).toLocaleString('zh-CN', { hour12: false }) : '', `${shareLink}?s=${s.id}`].map(esc).join(','); });
    const blob = new Blob(['\ufeff' + [head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `候选名单-${(T.task?.title || '真活').slice(0, 20)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <Tabs defaultActiveKey={defaultTab || 'p'} items={[
        { key: 'p', label: '问题与任务', children: <div>
          <Descriptions column={1} size="small" bordered items={[
            { key: 'c', label: isNeed ? '企业 · 要找的人' : '企业 · 岗位', children: `${T.company_name} · ${T.role}` },
            { key: 'link', label: '参与链接', children: <Space><code>{shareLink}</code><Button size="small" onClick={() => { navigator.clipboard.writeText(shareLink); message.success('已复制'); }}>复制</Button></Space> },
            { key: 's', label: '业务问题', children: T.problem?.statement },
            { key: 'w', label: '为什么是现在', children: T.problem?.why_now },
            { key: 'e', label: '依据', children: <ul style={{ margin: 0, paddingLeft: 18 }}>{(T.problem?.evidence || []).map((x: any, i: number) => <li key={i}>{x.text} <Text type="secondary">— {x.source}</Text></li>)}</ul> },
            { key: 'd', label: '交付物', children: <ol style={{ margin: 0, paddingLeft: 18 }}>{(T.task?.deliverables || []).map((d: any) => <li key={d.id}>{d.title} <Text type="secondary">{d.format}</Text></li>)}</ol> },
            { key: 'r', label: '规则', children: <ul style={{ margin: 0, paddingLeft: 18 }}>{(T.task?.rules || []).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul> },
            { key: 'm', label: '时间与操作台', children: `建议 ${T.task?.time_minutes} 分钟 · 操作台 ${ENV_META[T.task?.env?.type]?.label || '文档'}` },
          ]} />
          <Paragraph style={{ marginTop: 12, whiteSpace: 'pre-wrap', background: '#fafbff', padding: 12, borderRadius: 10 }}>{T.task?.brief}</Paragraph>
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
        { key: 'm', label: `材料包（${(T.materials || []).length}）`, children: (T.materials || []).map((m: any) => <div key={m.id} style={{ marginBottom: 14 }}><b>{m.id} {m.title}</b> <Tag>{m.kind === 'file' ? '附件' : m.kind}</Tag>{m.kind === 'file' && m.url && <a href={m.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>打开 ↗</a>}<Tag color={m.source === 'db' ? 'green' : m.source === 'generated' ? 'orange' : 'gold'}>{m.source === 'db' ? '来自材料' : m.source === 'generated' ? '补写' : '混合'}</Tag>{m.basis && <Text type="secondary"> 依据：{m.basis}</Text>}<pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#fafbff', padding: 10, borderRadius: 8, fontSize: 13 }}>{m.content}</pre></div>) },
        { key: 'r', label: `rubric（${(T.rubric || []).length}）`, children: <Table size="small" rowKey="id" pagination={false} dataSource={T.rubric || []} columns={[
          { title: '#', dataIndex: 'id', width: 50 }, { title: '条目', dataIndex: 'title', render: (v: string, r: any) => <div><b>{v}</b><div style={{ fontSize: 12, color: '#666' }}>{r.desc}</div></div> },
          { title: '权重', dataIndex: 'weight', width: 60 }, { title: '依赖', dataIndex: 'depends_on', width: 80, render: (v: string[]) => v?.join('、') || '–' },
          { title: '依据', dataIndex: 'basis', width: 200, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
          { title: 'BARS', dataIndex: 'levels', width: 320, render: (l: any) => <div style={{ fontSize: 12 }}>{['L1', 'L2', 'L3', 'L4'].map(k => <div key={k}><b>{k}</b> {l?.[k]}</div>)}</div> },
        ]} /> },
        { key: 'b', label: `AI 基线${T.baseline ? ` · ${T.baseline.result?.total} 分` : ''}`, children: T.baseline ? <div><Paragraph>AI 先做了一遍，用同一套 rubric 评：<b>{T.baseline.result?.total}</b> 分。{T.baseline.result?.summary}</Paragraph><Table size="small" rowKey="id" pagination={false} dataSource={T.baseline.result?.items || []} columns={[{ title: '条目', dataIndex: 'title' }, { title: '等级', dataIndex: 'level', width: 60 }, { title: '分', dataIndex: 'score', width: 60 }, { title: '证据 / 说明', render: (_: any, i: any) => <span style={{ fontSize: 12 }}>{i.evidence && <i>“{i.evidence}” </i>}{i.note}</span> }]} /><details style={{ marginTop: 12 }}><summary>AI 的答卷</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: '#fafbff', padding: 10, borderRadius: 8 }}>{T.baseline.answer}</pre></details></div> : <Text type="secondary">AI 基线还没出来。出任务后它在后台跑，约一分钟，刷新这页就有；也可以点上面的「重跑 AI 基线」现在跑。基线 = 一个通用 AI 直接做这道题能得几分，是候选人分数的参照。</Text> },
        { key: 's', label: `做题情况与评分（${sessions.length}）`, children: <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>交卷 {graded.length} 人，按分数排名；勾 2–4 人可以并排对比</Text>
            <span style={{ flex: 1 }} />
            <Button size="small" type="primary" disabled={picked.length < 2} onClick={() => setCmpOpen(true)}>对比所选（{picked.length}）</Button>
            <Button size="small" disabled={!graded.length} onClick={exportCsv}>导出候选名单</Button>
          </div>
          <Table size="small" rowKey="id" pagination={false} dataSource={ordered}
            rowSelection={{ selectedRowKeys: picked, onChange: k => setPicked((k as string[]).slice(0, 4)), getCheckboxProps: (s: any) => ({ disabled: !s.report?.result }) }} columns={[
          { title: '#', width: 44, render: (_: any, s: any) => (rankOf.has(s.id) ? <b style={{ color: rankOf.get(s.id)! <= 3 ? '#6055f5' : '#888' }}>{rankOf.get(s.id)}</b> : <Text type="secondary">–</Text>) },
          { title: '谁', render: (_: any, s: any) => <span>{s.participant?.name} {s.participant?.preview && <Tag color="orange" style={{ marginLeft: 4 }}>预览</Tag>}{s.participant?.mode === 'ai' && <Tag style={{ marginLeft: 4 }}>AI 学员</Tag>}<Text type="secondary">{s.participant?.contact}</Text></span> },
          { title: '开始', dataIndex: 'started_at', render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false }) },
          { title: '交卷', dataIndex: 'submitted_at', render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : <Text type="secondary">做着呢</Text>) },
          { title: '结果', dataIndex: 'score', width: 70, render: (v: number) => (v == null ? '–' : <b>{v}</b>) },
          { title: '', width: 180, render: (_: any, s: any) => <Space>{s.report && <Button size="small" type="primary" ghost onClick={() => setReport(s)}>看报告</Button>}<Button size="small" onClick={() => { navigator.clipboard.writeText(`${shareLink}?s=${s.id}`); message.success('报告链接已复制'); }}>报告链接</Button></Space> },
        ]} /></> },
      ]} />
      <Drawer open={cmpOpen} onClose={() => setCmpOpen(false)} size={Math.min(1100, typeof window !== 'undefined' ? window.innerWidth - 40 : 1100)} title="并排对比">
        {cmpOpen && <Compare rubric={T.rubric || []} people={picked.map(id => sessions.find((s: any) => s.id === id)).filter(Boolean)} baseline={T.baseline} rankOf={rankOf} />}
      </Drawer>
      <Drawer open={!!report} onClose={() => setReport(null)} size={Math.min(900, typeof window !== 'undefined' ? window.innerWidth - 60 : 900)} title={report ? `${report.participant?.name} 的报告` : ''}>
        {report && <>
          {/* 先看他交了什么，再看 AI 怎么评（王刚 10-24：出任务的人的视角是先看提交的答案本身，AI 只是辅助评价） */}
          <div style={{ marginBottom: 14, border: '1px solid #e8e9f0', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: '#fafbff', fontWeight: 700, fontSize: 13 }}>交付物原文</div>
            {/* 按 Markdown 渲染：表格、标题、白板 / 画布交卷截图都直接看得到 */}
            <div className="wk-deliv" style={{ padding: 12, fontSize: 13.5, lineHeight: 1.75, maxHeight: 460, overflow: 'auto' }}>{report.deliverable ? <Md text={report.deliverable} /> : <span style={{ color: '#999' }}>（没有交付物文本：开放模式 / 插件作答看上传文件与交付说明）</span>}</div>
          </div>
          <WorkReport report={report.report} participant={report.participant} />
        </>}
      </Drawer>
    </>
  );
}

/** 并排对比：逐条得分（每行最高分加粗）+ AI 基线 + 各人做得好的 / 差的 */
function Compare({ rubric, people, baseline, rankOf }: { rubric: any[]; people: any[]; baseline: any; rankOf: Map<string, number> }) {
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
          <tr style={{ background: '#faf9ff' }}><td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>总分</td>{people.map(p => <td key={p.id} style={{ ...cell, fontSize: 20, fontWeight: 900, color: '#4c43c9' }}>{p.score}</td>)}{baseline && <td style={{ ...cell, color: '#999' }}>{baseline.result?.total}</td>}</tr>
          {rubric.map((r: any) => { const vals = people.map(p => sc(p, r.id)).filter((v: any) => typeof v === 'number'); const top = vals.length ? Math.max(...vals) : null; return (
            <tr key={r.id}><td style={{ ...cell, textAlign: 'left' }}>{r.title}<span style={{ color: '#aaa', fontSize: 12, marginLeft: 6 }}>权重 {r.weight}</span></td>
              {people.map(p => { const v = sc(p, r.id); return <td key={p.id} style={{ ...cell, fontWeight: v != null && v === top ? 800 : 400, color: v != null && v === top ? '#12a150' : '#333' }}>{v ?? '–'}</td>; })}
              {baseline && <td style={{ ...cell, color: '#999' }}>{base(r.id) ?? '–'}</td>}</tr>
          ); })}
        </tbody>
      </table>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${people.length}, minmax(0, 1fr))`, gap: 12, marginTop: 18 }}>
        {people.map(p => <div key={p.id} style={{ border: '1px solid #ececf4', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{p.participant?.name}</div>
          {!!p.report?.result?.strengths?.length && <><div style={{ color: '#12a150', fontWeight: 700, fontSize: 12 }}>做得好的</div><ul style={{ margin: '2px 0 6px', paddingLeft: 16 }}>{p.report.result.strengths.slice(0, 3).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
          {!!p.report?.result?.gaps?.length && <><div style={{ color: '#c0392b', fontWeight: 700, fontSize: 12 }}>差的地方</div><ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>{p.report.result.gaps.slice(0, 3).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
        </div>)}
      </div>
    </div>
  );
}
