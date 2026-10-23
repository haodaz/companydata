'use client';

/**
 * 一份学籍：学员 × 课程。顶部是学籍卡；中间是学习路径（下一步 / 连做几步）；
 * 下面是每一章（上课 / 入学考 / 毕业考 / 反思，每个都能单独点）、装进去的东西（技能卡 / 教材要点 / 错题本 / 真活经验）、真活、去向。
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Modal, Select, Input } from 'antd';
import { api, Btn, Card, Empty, Face, fmtTime, PageHead, Pill, Rule, score, STATUS_TONE, useToast } from '../../ui';

const STEP_LABEL: Record<string, string> = { entrance: '入学考', class: '上课', exam: '毕业考 / 补考', reflect: '反思', work: '真活实习', done: '已达毕业要求', blocked: '卡住了' };

export default function EnrollmentPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const t = useToast();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');          // 正在跑哪个动作（显示在按钮上）
  const [log, setLog] = useState<string[]>([]);   // 这一页里跑过的动作结果
  const [workPick, setWorkPick] = useState<string>('');
  const [place, setPlace] = useState<any | null>(null);
  const load = useCallback(() => api(`/enrollments/${id}`).then(j => { setD(j.data); setErr(''); }).catch(e => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (key: string, action: string, body: any = {}, label?: string) => {
    setBusy(key);
    try {
      const j = await api(`/enrollments/${id}`, { method: 'POST', json: { action, ...body } }); const r = j.result;
      const line = action === 'entrance' || action === 'exam' ? `${label || STEP_LABEL[action]} · ${r.chapter}：${r.score} 分${r.match != null ? `，与示范吻合 ${r.match}%` : ''}${r.passed ? ' ✓' : ''}`
        : action === 'class' ? `上课 · ${r.chapter}：记下 ${r.points.length} 条要点` : action === 'reflect' ? `反思 · ${r.chapter}：${r.lesson}${r.rules.length ? `；记住 ${r.rules.length} 条规则` : ''}`
        : action === 'work' ? `真活 · ${r.title}：${r.score} 分${r.baseline != null ? `（AI 基线 ${r.baseline}）` : ''}` : action === 'regrade' ? `重评 ${r.length} 份作答：${r.map((x: any) => `${x.before ?? '—'}→${x.after}`).join('、')}` : action === 'lessons' ? `补教案：生成 ${r.generated.length} 章` : action === 'advance' ? r.steps.map((s: any) => `${s.step.label} → ${s.error ? '出错：' + s.error : s.result?.score != null ? `${s.result.score} 分` : s.result?.points ? `${s.result.points.length} 条要点` : s.result?.rules ? `${s.result.rules.length} 条规则` : '完成'}`).join('；') + `。下一步：${r.next.label}` : '完成';
      setLog(l => [`${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} ${line}`, ...l].slice(0, 12));
      t.ok(line.slice(0, 80)); await load();
    } catch (e) { t.err(e); } finally { setBusy(''); }
  };
  const doPlace = async () => { if (!place?.target) return t.err('先选一个去向'); setBusy('place'); try { await api('/placements', { method: 'POST', json: { enrollment_id: id, target_kind: place.kind, target_id: place.target.id, target_name: place.target.name, note: place.note } }); t.ok('已记一笔去向'); setPlace(null); load(); } catch (e) { t.err(e); } finally { setBusy(''); } };
  const searchTargets = async (q: string) => { try { const j = await api(`/targets?q=${encodeURIComponent(q)}`); setPlace((p: any) => p && { ...p, options: j.data }); } catch (e) { t.err(e); } };

  if (err) return <div className="ca-note" style={{ color: '#b42318' }}>{err}</div>;
  if (!d) return <div className="ca-mute">正在调学籍档案…</div>;
  const nb = d.notebook || {}; const canRun = !!d.model_id; const next = d.next;
  const stepIdx = d.status === 'graduated' ? 5 : next?.kind === 'entrance' ? 0 : next?.kind === 'class' ? 1 : next?.kind === 'exam' && d.chapters.some((c: any) => c.after != null && !c.passed) ? 3 : next?.kind === 'exam' ? 2 : next?.kind === 'reflect' ? 3 : next?.kind === 'work' ? 4 : 2;
  return (
    <div>
      <PageHead eyebrow="III · Training · Record" zh={<>{d.course?.role}<span style={{ display: 'inline', fontSize: 18, color: 'var(--ink3)', marginLeft: 10 }}>{d.nova_name}</span></>} en={d.model_label && d.model_label !== d.student_name ? `${d.student_name} · ${d.model_label}` : d.student_name || 'no model endpoint'}
        extra={<><Link href="/college/admin/training"><Btn kind="ghost">← 学籍一览</Btn></Link><a href={`/lab/${d.space_id}`} target="_blank" rel="noreferrer"><Btn kind="ghost">看这门课 ↗</Btn></a>{d.status === 'graduated' && <a href={`/college/g/${d.space_id}`} target="_blank" rel="noreferrer"><Btn kind="gold">毕业生档案 ↗</Btn></a>}</>} />

      <div className="ca-hero">
        <img className="bg" src="/college/crest.svg" alt="" />
        <Face src={d.course?.avatar} size={72} />
        <div>
          <div className="en">{d.course?.research ? 'School of Research' : 'School of Professions'}{d.demand_id ? ' · Commissioned' : ''}</div>
          <h2>{d.nova_name} <Pill tone={STATUS_TONE[d.status]}>{d.status_label}</Pill></h2>
          <div className="sub">课程「{d.course?.title}」{d.course?.company ? ` · ${d.course.company}` : ''} · {d.chapters.length} 章{d.teacher ? ` · ${d.teacher.expert ? `师承 ${d.teacher.expert_name}（${d.teacher.place || ''}）` : '技能卡为 AI 草案，等老师傅校正'} · ${d.teacher.rules} 条判断规则` : ' · 还没有技能卡'}</div>
          <div className="sub">学员 {d.student_name}{d.student_org ? ` · ${d.student_org}` : ''}{d.model_label && d.model_label !== d.student_name ? ` · ${d.model_label}` : d.model_id ? '' : ' · 未接模型接口'}</div>
        </div>
        <div className="nums"><div><b>{d.entrance_score ?? '—'}</b><span>入学考</span></div><div><b>{d.final_score ?? '—'}</b><span>毕业考</span></div><div><b>{d.chapters.filter((c: any) => c.passed).length}/{d.chapters.length}</b><span>通过章节</span></div><div><b>{(nb.rules || []).length}</b><span>学到的规则</span></div></div>
      </div>

      <Card eyebrow="Curriculum Path" title="学习路径" extra={<>
        {next && next.kind !== 'done' && next.kind !== 'blocked' && <Btn kind="gold" busy={busy === 'next'} disabled={!canRun || !!busy} onClick={() => run('next', 'advance', { steps: 1 })}>做下一步 · {next.label}</Btn>}
        {next && next.kind !== 'done' && next.kind !== 'blocked' && <Btn kind="navy" busy={busy === 'adv'} disabled={!canRun || !!busy} onClick={() => run('adv', 'advance', { steps: 3 })}>连做 3 步</Btn>}
        <Btn kind="ghost" sm busy={busy === 'regrade'} disabled={!!busy} title="同一份答案、同一把尺：对照老师傅的技能卡和示范逐条重评" onClick={() => run('regrade', 'regrade')}>按学院口径重评</Btn>
        <Btn kind="ghost" sm busy={busy === 'recompute'} onClick={() => run('recompute', 'recompute')}>重算成绩</Btn></>}>
        <div className="ca-steps">{[['入学考', '裸考看底子'], ['上课', '要点进笔记'], ['毕业考', '技能卡 + 笔记'], ['补训', '反思再考'], ['真活', '企业的活'], ['毕业', '全章 ≥ 60']].map(([a, b], i) => <div key={a} className={`ca-step${i === stepIdx ? ' on' : i < stepIdx ? ' done' : ''}`}><i>{['I', 'II', 'III', 'IV', 'V', 'VI'][i]}</i><b>{a}</b>{b}</div>)}</div>
        {next && <div className="ca-note" style={{ marginTop: 12 }}>{next.kind === 'done' ? '已达到毕业要求。' : next.kind === 'blocked' ? `暂时做不了：${next.label}` : <>下一步：<b>{next.label}</b>。</>}{!canRun && ' 这位学员还没接上模型接口，去学员管理里先选一个平台模型代跑。'}</div>}
        {log.length > 0 && <div className="ca-log">{log.map((l, i) => <div key={i}>{l}</div>)}</div>}
      </Card>

      <Card eyebrow="Chapters" title={`课程章节 · ${d.chapters.length}`} extra={<>{d.lessons.done < d.lessons.total && <Btn kind="ghost" sm busy={busy === 'lessons'} onClick={() => run('lessons', 'lessons')}>补教案（{d.lessons.total - d.lessons.done} 章没有）</Btn>}<span className="ca-mute" style={{ fontSize: 12.5 }}>每一步都能单独点</span></>}>
        <table className="ca-table"><thead><tr><th>#</th><th>章节</th><th>材料</th><th className="num">入学考</th><th className="num">毕业考</th><th>最近</th><th>动作</th></tr></thead>
          <tbody>{d.chapters.map((c: any) => { const last = c.latest.find((x: any) => x.after) || c.latest[0]; return (
            <tr key={c.id}>
              <td className="ca-mute">{c.seq}</td>
              <td><span className="serif">{c.title}</span><div className="ca-mute" style={{ fontSize: 12 }}>{c.slot || ''}{c.kind === 'assessment' ? ' · 考核章' : c.kind === 'incident' ? ' · 突发' : ''}{c.bench ? ' · 有工位' : ''}</div></td>
              <td><div className="ca-row" style={{ gap: 6 }}>{c.lesson ? <Pill tone="ok">教案</Pill> : <Pill tone="mute">无教案</Pill>}{nb.lessons?.[c.id] ? <Pill tone="ok">要点 {nb.lessons[c.id].length}</Pill> : <Pill tone="mute">未上课</Pill>}</div></td>
              <td className="num">{score(c.before)}</td>
              <td className="num">{score(c.after)}{c.after != null && (c.passed ? <span className="ca-ok" style={{ marginLeft: 4 }}>✓</span> : <span className="ca-bad" style={{ marginLeft: 4 }}>✗</span>)}</td>
              <td className="ca-mute" style={{ fontSize: 12, minWidth: 200 }}>{c.runs ? <>{c.runs} 次 · {fmtTime(c.latest[0]?.at)}{(() => { const l = c.latest.find((x: any) => x.after) || c.latest[0]; return l?.moves ? <div style={{ color: l.moves.done * 2 < l.moves.total ? '#b42318' : '#0d7a52' }}>老师傅的关键动作 {l.moves.done}/{l.moves.total}{l.caps?.length ? ' · 封顶' : ''}</div> : null; })()}</> : '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}><div className="ca-row" style={{ gap: 6 }}>
                <Btn kind="ghost" sm busy={busy === `en${c.id}`} disabled={!canRun || !!busy} onClick={() => run(`en${c.id}`, 'entrance', { chapter_id: c.id })}>入学考</Btn>
                <Btn kind="ghost" sm busy={busy === `cl${c.id}`} disabled={!canRun || !!busy} onClick={() => run(`cl${c.id}`, 'class', { chapter_id: c.id })}>上课</Btn>
                <Btn kind="navy" sm busy={busy === `ex${c.id}`} disabled={!canRun || !!busy || !d.teacher} title={d.teacher ? '' : '这门课还没有技能卡'} onClick={() => run(`ex${c.id}`, 'exam', { chapter_id: c.id })}>毕业考</Btn>
                {last && <Btn kind="ghost" sm busy={busy === `rf${c.id}`} disabled={!canRun || !!busy} title="对最近一次作答反思，写进错题本" onClick={() => run(`rf${c.id}`, 'reflect', { submission_id: last.id })}>反思</Btn>}
              </div></td>
            </tr>); })}</tbody></table>
      </Card>

      <div className="ca-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <Card eyebrow="What's installed" title="装进考试的东西">
          <div className="ca-notebook">
            <div><div className="ca-eyebrow sm">I · 技能卡</div>{d.teacher ? <div className="ca-kv">「{d.teacher.name}」· {d.teacher.rules} 条判断规则{d.teacher.expert ? `，学自 ${d.teacher.expert_name}` : '（AI 草案）'}</div> : <div className="ca-mute">还没有</div>}</div>
            <div><div className="ca-eyebrow sm">II · 教材要点</div><div className="ca-kv">{Object.keys(nb.lessons || {}).length} / {d.chapters.length} 章已上课</div>{Object.entries(nb.lessons || {}).slice(0, 1).map(([k, v]: any) => <ul key={k}>{v.slice(0, 3).map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>)}</div>
            <div><div className="ca-eyebrow sm">GAP · 量出来的差距</div>{(() => { const l = d.chapters.flatMap((c: any) => c.latest).sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)))[0]; return l?.moves ? <><div className="ca-kv">最近一次：关键动作 {l.moves.done}/{l.moves.total}{l.caps?.length ? `（${l.caps[0]}）` : ''}</div>{l.missed?.length ? <ul>{l.missed.slice(0, 4).map((m: string, i: number) => <li key={i}>没做：{m}</li>)}</ul> : null}{l.summary && <div className="ca-mute" style={{ fontSize: 12.5, marginTop: 4 }}>{l.summary}</div>}</> : <div className="ca-mute">还没按学院口径考过</div>; })()}</div>
            <div><div className="ca-eyebrow sm">III · 错题本</div>{(nb.rules || []).length ? <ul>{nb.rules.slice(-6).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul> : <div className="ca-mute">还没有反思过</div>}{(nb.mistakes || []).length > 0 && <div className="ca-mute" style={{ fontSize: 12, marginTop: 4 }}>最近：{nb.mistakes[nb.mistakes.length - 1].chapter} · {nb.mistakes[nb.mistakes.length - 1].lesson}</div>}</div>
            <div><div className="ca-eyebrow sm">V · 真活经验</div>{(nb.work || []).length ? <ul>{nb.work.slice(-3).map((w: any, i: number) => <li key={i}>{w.task}（{w.score} 分）：{w.lesson}</li>)}</ul> : <div className="ca-mute">还没做过真活</div>}</div>
          </div>
        </Card>
        <Card eyebrow="Real Work" title={`真活 · ${d.work.length}`} extra={<div className="ca-row" style={{ gap: 6 }}><Select showSearch size="small" style={{ minWidth: 260 }} placeholder="挑一道真活" value={workPick || undefined} optionFilterProp="label" onChange={v => setWorkPick(v)} options={d.work_options.map((w: any) => ({ value: w.id, label: `${w.related ? '★ ' : ''}${w.title} · ${w.role}@${w.company}${w.baseline != null ? ` · 基线 ${w.baseline}` : ''}` }))} /><Btn kind="navy" sm busy={busy === 'work'} disabled={!canRun || !workPick || !!busy} onClick={() => run('work', 'work', { work_task_id: workPick })}>做这道</Btn></div>}>
          {!d.work.length ? <Empty>还没做过真活。★ 的是和这门课同岗位 / 同企业的。</Empty> : <table className="ca-table"><thead><tr><th>真活</th><th className="num">得分</th><th className="num">AI 基线</th><th>When</th></tr></thead><tbody>{d.work.map((w: any) => <tr key={w.id}><td><span className="serif">{w.title}</span><div className="ca-mute" style={{ fontSize: 12 }}>{w.role} · {w.company}</div>{w.summary && <div className="ca-mute" style={{ fontSize: 12.5 }}>{w.summary}</div>}</td><td className="num">{score(w.score)}</td><td className="num">{w.baseline ?? '—'}</td><td className="ca-mute" style={{ whiteSpace: 'nowrap' }}>{fmtTime(w.at)}</td></tr>)}</tbody></table>}
        </Card>
      </div>

      <Card eyebrow="Placement" title={`去向 · ${d.placements.length}`} extra={<Btn kind="gold" sm onClick={() => { setPlace({ kind: 'ws_org', q: '', options: null, target: null, note: '' }); searchTargets(''); }}>派去…</Btn>}>
        {!d.placements.length ? <Empty>{d.status === 'graduated' ? '毕业了，还没安排去向。' : '毕业后再安排去向；也可以先记一笔拟派。'}</Empty> : <table className="ca-table"><thead><tr><th>去向</th><th>Type</th><th>Status</th><th>备注</th></tr></thead><tbody>{d.placements.map((p: any) => <tr key={p.id}><td className="serif">{p.target_name}</td><td><Pill tone="navy">{p.kind_label}</Pill></td><td><Pill tone={STATUS_TONE[p.status]}>{p.status_label}</Pill></td><td className="ca-mute">{p.note || ''}</td></tr>)}</tbody></table>}
      </Card>

      <Modal open={!!place} onCancel={() => setPlace(null)} onOk={doPlace} okText="记下去向" confirmLoading={busy === 'place'} title={`把 ${d.nova_name} 派去…`} width={620}>
        {place && <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <div className="ca-tabs">{[['ws_org', '工作台机构'], ['company', '企业库企业'], ['demand', '培养需求单']].map(([v, l]) => <button key={v} className={place.kind === v ? 'on' : ''} onClick={() => setPlace({ ...place, kind: v, target: null })}>{l}</button>)}</div>
          <Input placeholder="搜名字" value={place.q} onChange={e => { setPlace({ ...place, q: e.target.value }); searchTargets(e.target.value); }} />
          <div style={{ display: 'grid', gap: 4, maxHeight: 240, overflow: 'auto' }}>{(place.options?.[place.kind] || []).map((o: any) => <div key={o.id} onClick={() => setPlace({ ...place, target: o })} className="ca-kv" style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: place.target?.id === o.id ? 'rgba(176,141,87,.14)' : 'rgba(22,32,74,.03)' }}><b>{o.name}</b><span className="ca-mute">{o.hint}</span></div>)}{place.options && !(place.options[place.kind] || []).length && <div className="ca-mute" style={{ padding: 8 }}>没找到</div>}</div>
          <Input placeholder="备注（可选）" value={place.note} onChange={e => setPlace({ ...place, note: e.target.value })} />
        </div>}
      </Modal>
    </div>
  );
}
