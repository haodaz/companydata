'use client';

/**
 * 导师校正 · 科研能力测评题（迁移 060，2026-11-03）。用户口径：人只做校正，不做起草。
 * AI 代导师已经出好完整初稿、另一个模型对照原文核对过；导师逐项看：对的不用动，不对就在原处改（或作废这一条），
 * 改动署导师的名字逐条留痕。不用注册，凭链接进来。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const DESIGN = [['question', '研究问题'], ['independent', '自变量 / 被比较的条件'], ['dependent', '因变量 / 主要指标'], ['baselines', '对照 / 基线'], ['data', '数据集 / 任务'], ['scale', '规模与重复']] as const;
const LIST = ['independent', 'dependent', 'baselines', 'data'];
const KIND: Record<string, string> = { number: '数字前后矛盾', overclaim: '结论超出证据', fake_reference: '编造的参考文献' };
const VERDICT: Record<string, [string, string]> = { supported: ['原文支持', '#0d7a52'], contradicted: ['原文相反', '#b42318'], not_in_text: ['原文没提', '#8a5a00'] };
const asText = (v: any) => Array.isArray(v) ? v.join('\n') : String(v ?? '');

export default function Review() {
  const { token } = useParams<{ token: string }>();
  const [r, setR] = useState<any>(null); const [err, setErr] = useState('');
  const [me, setMe] = useState({ name: '', org: '', contact: '' });
  const [design, setDesign] = useState<Record<string, string>>({});
  const [brief, setBrief] = useState('');
  const [props, setProps] = useState<any[]>([]);
  const [planted, setPlanted] = useState<any[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const load = async () => {
    const j = await (await fetch(`/api/college/review/${token}`, { cache: 'no-store' })).json();
    if (!j.ok) { setErr(j.error); return; }
    const d = j.data, ex = d.exam || {};
    setR(d); setBrief(ex.blind_brief || '');
    setDesign(Object.fromEntries(DESIGN.map(([k]) => [k, asText(ex.design_key?.[k])])));
    setProps((ex.propositions || []).map((p: any) => ({ ...p })));
    setPlanted((ex.planted || []).map((p: any) => ({ ...p })));
    if (d.reviewer?.name) setMe({ name: d.reviewer.name, org: d.reviewer.org || '', contact: d.reviewer.contact || '' });
    else try { const m = JSON.parse(localStorage.getItem('college:reviewer') || 'null'); if (m) setMe(m); } catch { /* 无痕模式 */ }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);
  const ex = r?.exam || {};
  const check = ex.check || {};

  // 和载入时比，改了哪些 → 一组 edit
  const edits = useMemo(() => {
    if (!r) return [];
    const out: any[] = [];
    for (const [k] of DESIGN) if (design[k] !== asText(ex.design_key?.[k])) out.push({ part: 'design', item: k, value: design[k], note: notes[`d:${k}`] });
    if (brief !== (ex.blind_brief || '')) out.push({ part: 'brief', value: brief, note: notes.brief });
    for (const p of props) { const o = (ex.propositions || []).find((x: any) => x.i === p.i) || {}; for (const f of ['statement', 'truth', 'discard']) if ((p[f] ?? (f === 'discard' ? false : '')) !== (o[f] ?? (f === 'discard' ? false : ''))) out.push({ part: 'prop', item: p.i, field: f, value: p[f], note: notes[`p:${p.i}`] }); }
    planted.forEach((p, i) => { const o = (ex.planted || [])[i] || {}; for (const f of ['changed', 'why_wrong', 'discard']) if ((p[f] ?? (f === 'discard' ? false : '')) !== (o[f] ?? (f === 'discard' ? false : ''))) out.push({ part: 'planted', item: i, field: f, value: p[f], note: notes[`c:${i}`] }); });
    return out;
  }, [r, design, brief, props, planted, notes, ex]);

  const save = async (done: boolean) => {
    if (!me.name.trim()) { setMsg('先在上面写上你的名字：每一处修改都会署名'); return; }
    setBusy(done ? 'done' : 'save'); setMsg('');
    try { localStorage.setItem('college:reviewer', JSON.stringify(me)); } catch { /* 无痕模式 */ }
    const j = await (await fetch(`/api/college/review/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewer: me, edits, done }) })).json();
    setBusy('');
    if (!j.ok) { setMsg(j.error); return; }
    setMsg(done ? `校正完成，谢谢！这次改了 ${j.changed} 处。` : `已保存 ${j.changed} 处修改。`); setNotes({}); await load();
  };

  if (err) return <div className="rv"><style>{CSS}</style><div className="rv-in"><h1>校正链接不对</h1><p>{err}</p></div></div>;
  if (!r) return <div className="rv"><style>{CSS}</style><div className="rv-in"><p>载入中…</p></div></div>;
  const vOf = (i: number) => (check.props || []).find((x: any) => x.i === i);
  const note = (k: string) => <input className="rv-note" placeholder="（选填）为什么改" value={notes[k] || ''} onChange={e => setNotes(n => ({ ...n, [k]: e.target.value }))} />;

  return (
    <div className="rv"><style>{CSS}</style><div className="rv-in">
      <div className="rv-eb">百业学院 · 科研能力测评 · 导师校正</div>
      <h1>{r.title}</h1>
      <div className="rv-meta">
        <a href={r.url} target="_blank" rel="noreferrer">看论文原文 ↗</a><span>{r.license}</span><span>{r.field}</span><span>{r.scope === 'private' ? `私域课 · ${r.org || ''}` : '公共课'}</span>
        <span className={`rv-st ${r.status}`}>{r.status === 'mentor_reviewed' ? '导师已校正' : 'AI 初稿，待导师校正'}</span>
      </div>
      <div className="rv-lead">
        这份题由 <b>{r.mentor}</b> 出完整初稿，<b>{r.checker}</b> 对照原文逐条核对过。请您逐项看：<b>对的不用动，不对就在原处改</b>，或者作废这一条。每一处修改都会署上您的名字。三道题都有标准答案：A 还原研究设计、B 盲测预测、C 找出稿件里埋下的错。
      </div>
      <div className="rv-me">
        <label>您的名字<input value={me.name} onChange={e => setMe({ ...me, name: e.target.value })} placeholder="必填" /></label>
        <label>单位<input value={me.org} onChange={e => setMe({ ...me, org: e.target.value })} placeholder="选填" /></label>
        <label>联系方式<input value={me.contact} onChange={e => setMe({ ...me, contact: e.target.value })} placeholder="选填" /></label>
      </div>

      <section>
        <h2><i>A</i>读懂：还原研究设计</h2>
        <p className="rv-d">学员只看到下面这段方法摘录。标准答案只能按摘录定：摘录里没有的，答案写「摘录未给出」。</p>
        <details className="rv-src"><summary>给学员的方法摘录</summary><pre>{ex.method_excerpt}</pre></details>
        {DESIGN.map(([k, label]) => {
          const changed = design[k] !== asText(ex.design_key?.[k]);
          return <div key={k} className={`rv-item ${changed ? 'ch' : ''}`}><b>{label}{LIST.includes(k) ? <small>一行一项</small> : null}</b>
            <textarea rows={LIST.includes(k) ? 3 : 2} value={design[k] || ''} onChange={e => setDesign(d => ({ ...d, [k]: e.target.value }))} />{changed && note(`d:${k}`)}</div>;
        })}
      </section>

      <section>
        <h2><i>B</i>盲测预测</h2>
        <p className="rv-d">学员只看到这段简介（不含任何结果），对每条论断给出为真的概率。请确认：简介没有泄露结果；每条论断的真假标对了；没有靠常识就能猜对的题。</p>
        <div className={`rv-item ${brief !== (ex.blind_brief || '') ? 'ch' : ''}`}><b>给学员的研究简介</b>
          {(check.brief_leaks || []).length > 0 && <div className="rv-warn">核对模型认为这几句泄露了结果：{check.brief_leaks.join('；')}</div>}
          <textarea rows={7} value={brief} onChange={e => setBrief(e.target.value)} />{brief !== (ex.blind_brief || '') && note('brief')}</div>
        {props.map((p, idx) => {
          const v = vOf(p.i); const o = (ex.propositions || [])[idx] || {};
          const changed = p.statement !== o.statement || p.truth !== o.truth || !!p.discard !== !!o.discard;
          return <div key={p.i} className={`rv-item ${changed ? 'ch' : ''} ${p.discard ? 'off' : ''}`}>
            <div className="rv-row"><b>论断 {p.i}</b>
              <div className="rv-tf"><button className={p.truth ? 'on t' : ''} onClick={() => setProps(ps => ps.map(x => x.i === p.i ? { ...x, truth: true } : x))}>真</button><button className={!p.truth ? 'on f' : ''} onClick={() => setProps(ps => ps.map(x => x.i === p.i ? { ...x, truth: false } : x))}>假</button></div>
              {v && <span className="rv-v" style={{ color: VERDICT[v.verdict]?.[1] }}>核对：{VERDICT[v.verdict]?.[0] || v.verdict}{v.label_ok ? ' ✓ 和标注一致' : ' ⚠ 和标注不一致'}</span>}
              <label className="rv-x"><input type="checkbox" checked={!!p.discard} onChange={e => setProps(ps => ps.map(x => x.i === p.i ? { ...x, discard: e.target.checked } : x))} />作废这一条</label>
            </div>
            <textarea rows={2} value={p.statement} onChange={e => setProps(ps => ps.map(x => x.i === p.i ? { ...x, statement: e.target.value } : x))} />
            <div className="rv-q"><span>原文依据</span>{p.quote || '—'}</div>
            {!p.truth && p.true_statement && <div className="rv-q"><span>原文说的其实是</span>{p.true_statement}</div>}
            {changed && note(`p:${p.i}`)}
          </div>;
        })}
      </section>

      <section>
        <h2><i>C</i>埋错审稿</h2>
        <p className="rv-d">学员拿到一段稿件节选，里面悄悄埋了下面几处错。请确认每一处确实是错、读者凭节选能看出来；不合适就改或作废。</p>
        <details className="rv-src"><summary>给学员的稿件节选（埋错后）</summary><pre>{ex.review_excerpt}</pre></details>
        {planted.map((p, i) => {
          const o = (ex.planted || [])[i] || {}; const okc = (check.planted_ok || [])[i];
          const changed = p.changed !== o.changed || p.why_wrong !== o.why_wrong || !!p.discard !== !!o.discard;
          return <div key={i} className={`rv-item ${changed ? 'ch' : ''} ${p.discard ? 'off' : ''}`}>
            <div className="rv-row"><b>第 {i + 1} 处 · {KIND[p.kind] || p.kind}</b>
              {okc && <span className="rv-v" style={{ color: okc.ok ? '#0d7a52' : '#b42318' }}>核对：{okc.ok ? '确实是错 ✓' : '⚠ 核对认为不算错'}{okc.note ? `（${okc.note}）` : ''}</span>}
              <label className="rv-x"><input type="checkbox" checked={!!p.discard} onChange={e => setPlanted(ps => ps.map((x, j) => j === i ? { ...x, discard: e.target.checked } : x))} />作废这一处</label></div>
            {p.kind !== 'fake_reference' && <div className="rv-q"><span>原文</span>{p.original}</div>}
            <small className="rv-l">改成</small><textarea rows={2} value={p.changed} onChange={e => setPlanted(ps => ps.map((x, j) => j === i ? { ...x, changed: e.target.value } : x))} />
            <small className="rv-l">为什么是错的、读者靠什么发现</small><textarea rows={2} value={p.why_wrong} onChange={e => setPlanted(ps => ps.map((x, j) => j === i ? { ...x, why_wrong: e.target.value } : x))} />
            {changed && note(`c:${i}`)}
          </div>;
        })}
      </section>

      <div className="rv-bar">
        <span>{edits.length ? `改了 ${edits.length} 处，还没保存` : '没有改动'}</span>
        {msg && <span className="rv-msg">{msg}</span>}
        <button disabled={!!busy || !edits.length} onClick={() => save(false)}>{busy === 'save' ? '保存中…' : '保存修改'}</button>
        <button className="pri" disabled={!!busy} onClick={() => save(true)}>{busy === 'done' ? '提交中…' : '校正完成'}</button>
      </div>

      {(r.corrections || []).length > 0 && <section><h2>修改记录</h2>
        <ul className="rv-log">{[...r.corrections].reverse().map((c: any, i: number) => <li key={i}><b>{c.by}</b> · {new Date(c.at).toLocaleString('zh-CN', { hour12: false })} · {c.part === 'design' ? `A ${c.item}` : c.part === 'brief' ? 'B 简介' : c.part === 'prop' ? `B 论断 ${c.item} ${c.field}` : `C 第 ${Number(c.item) + 1} 处 ${c.field}`}{c.note ? `：${c.note}` : ''}</li>)}</ul></section>}
      <p className="rv-foot">百业学院 · 一所 AI 学院 · 题目只用公开授权（CC BY）的论文；私域课的数据只给提供方用。</p>
    </div></div>
  );
}

const CSS = `
.rv { min-height: 100vh; background: #f7f5ef; color: #1b2340; font: 15px/1.75 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.rv-in { max-width: 920px; margin: 0 auto; padding: 40px 20px 120px; }
.rv-eb { font-size: 12.5px; letter-spacing: .14em; color: #a8802f; font-weight: 700; }
.rv h1 { font-family: "Songti SC", "Noto Serif SC", serif; font-size: 30px; line-height: 1.3; margin: 8px 0 10px; color: #14204a; }
.rv-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; font-size: 13.5px; color: #5b6380; }
.rv-meta a { color: #14204a; font-weight: 700; }
.rv-st { padding: 2px 10px; border-radius: 999px; background: #fff1d6; color: #8a5a00; font-weight: 700; } .rv-st.mentor_reviewed { background: #dcfce7; color: #166534; }
.rv-lead { margin: 18px 0; padding: 14px 18px; background: #fff; border-left: 4px solid #14204a; font-size: 15px; color: #3a4260; }
.rv-me { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 8px; }
.rv-me label { display: grid; gap: 4px; font-size: 13px; color: #5b6380; font-weight: 600; }
.rv input, .rv textarea { font: inherit; font-size: 14.5px; border: 1px solid #d8d4c6; border-radius: 8px; padding: 7px 10px; background: #fff; color: #1b2340; width: 100%; box-sizing: border-box; }
.rv textarea { resize: vertical; line-height: 1.6; }
.rv section { margin-top: 34px; }
.rv h2 { display: flex; align-items: center; gap: 10px; font-family: "Songti SC", "Noto Serif SC", serif; font-size: 23px; margin: 0 0 6px; color: #14204a; border-bottom: 2px solid #a8802f; padding-bottom: 8px; }
.rv h2 i { font-style: normal; width: 32px; height: 32px; display: grid; place-items: center; background: #14204a; color: #fff; border-radius: 8px; font-size: 16px; font-family: inherit; }
.rv-d { color: #5b6380; margin: 8px 0 14px; }
.rv-src { margin-bottom: 14px; } .rv-src summary { cursor: pointer; color: #14204a; font-weight: 700; }
.rv-src pre { white-space: pre-wrap; font: 13px/1.7 ui-monospace, Menlo, monospace; background: #fff; border: 1px solid #e6e1d2; padding: 12px 14px; max-height: 340px; overflow: auto; }
.rv-item { background: #fff; border: 1px solid #e6e1d2; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; display: grid; gap: 8px; }
.rv-item.ch { border-color: #a8802f; box-shadow: 0 0 0 3px rgba(168,128,47,.15); }
.rv-item.off { opacity: .55; } .rv-item.off textarea { text-decoration: line-through; }
.rv-item > b small { font-weight: 400; color: #8a8fa8; margin-left: 8px; font-size: 12.5px; }
.rv-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.rv-tf { display: inline-flex; border: 1px solid #d8d4c6; border-radius: 8px; overflow: hidden; }
.rv-tf button { border: 0; background: #fff; padding: 3px 14px; font: inherit; font-size: 13.5px; cursor: pointer; color: #5b6380; }
.rv-tf button.on.t { background: #0d7a52; color: #fff; } .rv-tf button.on.f { background: #b42318; color: #fff; }
.rv-v { font-size: 13px; font-weight: 600; }
.rv-x { margin-left: auto; display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: #5b6380; } .rv-x input { width: auto; }
.rv-q { font-size: 13.5px; color: #3a4260; background: #faf8f2; padding: 8px 12px; border-radius: 8px; } .rv-q span { display: inline-block; font-weight: 700; color: #a8802f; margin-right: 8px; }
.rv-l { color: #8a8fa8; font-size: 12.5px; margin-bottom: -4px; }
.rv-warn { font-size: 13.5px; color: #b42318; background: #fff1f0; padding: 8px 12px; border-radius: 8px; }
.rv-note { font-size: 13px !important; border-style: dashed !important; }
.rv-bar { position: sticky; bottom: 0; margin-top: 30px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: flex-end; padding: 14px 16px; background: rgba(247,245,239,.95); border-top: 1px solid #e6e1d2; backdrop-filter: blur(6px); }
.rv-bar span { color: #5b6380; font-size: 14px; margin-right: auto; } .rv-msg { color: #0d7a52 !important; font-weight: 700; margin-right: 0 !important; }
.rv-bar button { border: 1px solid #14204a; background: #fff; color: #14204a; border-radius: 8px; padding: 9px 18px; font: inherit; font-weight: 700; cursor: pointer; }
.rv-bar button.pri { background: #14204a; color: #fff; } .rv-bar button:disabled { opacity: .45; cursor: default; }
.rv-log { padding-left: 18px; color: #3a4260; font-size: 14px; }
.rv-foot { margin-top: 40px; color: #8a8fa8; font-size: 12.5px; text-align: center; }
@media (max-width: 680px) { .rv-me { grid-template-columns: 1fr; } .rv-x { margin-left: 0; } }
`;
