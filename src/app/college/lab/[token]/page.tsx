'use client';

/**
 * 实验室入口 · 私域课材料（迁移 062，2026-11-03）。用户口径：人只做校正，不做起草。
 * AI 已经按贵组的档案起草了六类材料；实验室的人凭链接进来（不用注册）：对的点「确认无误」，不对的直接改，没有的加一份或上传文件，不要的删掉。
 * 每一处改动署名留痕。材料只给这家实验室培养的 AI 用。
 */
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

const KINDS: [string, string, string][] = [
  ['direction', '研究方向', '在做什么、为什么、今年的目标和卡点'], ['spec', '组内规格', '材料、样品、测试的组内标准（带数字和允许范围）'],
  ['requirement', '实验要求', '安全红线、数据记录与作废规则'], ['literature', '内部文献', '未发表的组内报告与数据——会拿来出只给本组用的测评题'],
  ['equipment', '组内设备', '型号、参数设置、预约规则、已知毛病'], ['knowhow', '私域知识', '老师傅的经验、组里踩过的坑'],
];

export default function LabPortal() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [who, setWho] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<any | null>(null);
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const load = async () => { const j = await (await fetch(`/api/college/lab/${token}`, { cache: 'no-store' })).json(); if (!j.ok) setErr(j.error); else setD(j); };
  useEffect(() => { load(); try { setWho(localStorage.getItem('college:lab-who') || ''); } catch { /* 无痕模式 */ } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);
  const act = async (body: any, ok: string) => {
    if (!who.trim()) { setMsg('先在上面写上你的名字：每一处修改都会署名'); window.scrollTo({ top: 0, behavior: 'smooth' }); return false; }
    try { localStorage.setItem('college:lab-who', who); } catch { /* 无痕模式 */ }
    setBusy(body.action + (body.id || '')); setMsg('');
    const j = await (await fetch(`/api/college/lab/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ who, ...body }) })).json();
    setBusy('');
    if (!j.ok) { setMsg(j.error); return false; }
    setMsg(ok); await load(); return true;
  };
  const upload = async (f: File) => {
    setBusy('upload'); setMsg('');
    const fd = new FormData(); fd.append('file', f);
    const j = await (await fetch(`/api/college/lab/${token}/upload`, { method: 'POST', body: fd })).json();
    setBusy('');
    if (!j.ok) { setMsg(j.error); return; }
    setEdit((e: any) => ({ ...(e || { kind: 'literature' }), title: e?.title || f.name.replace(/\.[^.]+$/, ''), body: j.text || '（这个文件没抽出文字，请把要点贴在这里）', file_url: j.url }));
  };
  const review = async (examId: string) => {
    const j = await (await fetch(`/api/college/lab/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ who, action: 'review', exam_id: examId }) })).json();
    if (j.ok) window.open(`/college/review/${j.token}`, '_blank'); else setMsg(j.error);
  };

  if (err) return <div className="lb"><style>{CSS}</style><div className="lb-in"><h1>链接不对</h1><p>{err}</p></div></div>;
  if (!d) return <div className="lb"><style>{CSS}</style><div className="lb-in"><p>载入中…</p></div></div>;
  const mats: any[] = d.materials || [];
  const left = mats.filter(m => m.source !== 'lab').length;
  return (
    <div className="lb"><style>{CSS}</style><div className="lb-in">
      <div className="lb-eb">百业学院 · 私域课 · 实验室入口</div>
      <h1>{d.org.name}</h1>
      <div className="lb-lead">
        为了培养一位只给贵组用的科研 AI，我们先按贵组的档案<b>起草了下面这些材料</b>（标「AI 起草」）。请逐份看：<b>对的点「确认无误」，不对的直接改，缺的加一份或上传文件，不要的删掉</b>。每一处修改都会署上您的名字。
        <div className="lb-stat">共 {mats.length} 份 · 还有 <b>{left}</b> 份等贵组确认</div>
      </div>
      <div className="lb-me"><label>您的名字<input value={who} onChange={e => setWho(e.target.value)} placeholder="必填，如：张老师 / 李同学" /></label>{msg && <span className="lb-msg">{msg}</span>}</div>

      {(d.exams || []).length > 0 && <section className="lb-exams"><h2>用贵组内部文献出的测评题</h2>
        <p className="lb-d">这些题只给贵组培养的 AI 考。请导师看一遍答案对不对：</p>
        {d.exams.map((e: any) => <div key={e.id} className="lb-ex"><span>{e.title}</span><em className={e.status === 'mentor_reviewed' ? 'ok' : ''}>{e.status === 'mentor_reviewed' ? `已校正${e.reviewer?.name ? ` · ${e.reviewer.name}` : ''}` : 'AI 初稿'}</em><button onClick={() => review(e.id)}>去校正这道题 ↗</button></div>)}
      </section>}

      {KINDS.map(([k, name, desc]) => {
        const xs = mats.filter(m => m.kind === k);
        return <section key={k}>
          <div className="lb-h"><h2>{name}</h2><span>{desc}</span><button onClick={() => setEdit({ kind: k, title: '', body: '' })}>＋ 加一份</button></div>
          {!xs.length && <div className="lb-empty">还没有。</div>}
          {xs.map(m => {
            const editing = edit?.id === m.id;
            return <div key={m.id} className={`lb-m ${m.source === 'lab' ? 'done' : ''}`}>
              <div className="lb-row"><b>{m.title}</b>
                {m.is_demo && <i className="demo">演示虚构</i>}
                {m.source === 'lab' ? <i className="ok">贵组已确认{m.confirmed_by ? ` · ${m.confirmed_by}` : ''}</i> : <i>AI 起草</i>}
                {m.file_url && <a href={m.file_url} target="_blank" rel="noreferrer">原文件 ↗</a>}
              </div>
              {editing ? <>
                <input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} />
                <textarea rows={16} value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} />
                <div className="lb-btns"><button className="pri" disabled={!!busy} onClick={async () => { if (await act({ action: 'update', id: m.id, title: edit.title, body: edit.body }, '已保存修改')) setEdit(null); }}>保存修改</button><button onClick={() => setEdit(null)}>取消</button></div>
              </> : <>
                <div className={`lb-body ${open[m.id] ? 'open' : ''}`}>{m.body}</div>
                <div className="lb-btns">
                  <button className="lnk" onClick={() => setOpen(o => ({ ...o, [m.id]: !o[m.id] }))}>{open[m.id] ? '收起' : '展开全文'}</button>
                  {m.source !== 'lab' && <button className="pri" disabled={!!busy} onClick={() => act({ action: 'confirm', id: m.id }, '已确认')}>确认无误</button>}
                  <button disabled={!!busy} onClick={() => setEdit({ id: m.id, title: m.title, body: m.body })}>改</button>
                  <button className="del" disabled={!!busy} onClick={() => { if (confirm(`删掉「${m.title}」？`)) act({ action: 'delete', id: m.id }, '已删除'); }}>删</button>
                </div>
              </>}
              {(m.history || []).length > 0 && <div className="lb-hist">{m.history.slice(-3).reverse().map((h: any, i: number) => <span key={i}>{h.by} · {new Date(h.at).toLocaleString('zh-CN', { hour12: false })} · {h.action === 'confirm' ? '确认' : h.action === 'update' ? `改了${(h.fields || []).map((f: string) => f === 'body' ? '正文' : f === 'title' ? '标题' : '类型').join('、')}` : h.action}</span>)}</div>}
            </div>;
          })}
          {edit && !edit.id && edit.kind === k && <div className="lb-m new">
            <div className="lb-row"><b>加一份「{name}」</b><button className="lnk" disabled={busy === 'upload'} onClick={() => fileRef.current?.click()}>{busy === 'upload' ? '上传中…' : '从文件导入（PDF / Word / TXT / CSV / Excel）'}</button></div>
            <input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="标题" />
            <textarea rows={12} value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} placeholder="正文：直接贴，或者从文件导入后再改" />
            {edit.file_url && <div className="lb-d">已上传：<a href={edit.file_url} target="_blank" rel="noreferrer">原文件 ↗</a>（上面是抽出来的文字，请看一眼有没有乱码）</div>}
            <div className="lb-btns"><button className="pri" disabled={!!busy} onClick={async () => { if (await act({ action: 'add', kind: k, title: edit.title, body: edit.body, file_url: edit.file_url }, '已加入')) setEdit(null); }}>加入</button><button onClick={() => setEdit(null)}>取消</button></div>
          </div>}
        </section>;
      })}
      <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      <p className="lb-foot">这些材料只用于培养贵组的科研 AI：出只给贵组用的测评题、在考试时作为贵组的知识包，不给其他机构，也不进公共课。链接请只在组内传。</p>
    </div></div>
  );
}

const CSS = `
.lb { min-height: 100vh; background: #f7f5ef; color: #1b2340; font: 15px/1.75 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.lb-in { max-width: 920px; margin: 0 auto; padding: 40px 20px 80px; }
.lb-eb { font-size: 12.5px; letter-spacing: .14em; color: #a8802f; font-weight: 700; }
.lb h1 { font-family: "Songti SC", "Noto Serif SC", serif; font-size: 32px; margin: 8px 0 12px; color: #14204a; }
.lb-lead { padding: 14px 18px; background: #fff; border-left: 4px solid #14204a; color: #3a4260; }
.lb-stat { margin-top: 8px; font-size: 13.5px; color: #5b6380; } .lb-stat b { color: #a8802f; }
.lb-me { display: flex; flex-wrap: wrap; gap: 14px; align-items: end; margin: 16px 0 6px; }
.lb-me label { display: grid; gap: 4px; font-size: 13px; color: #5b6380; font-weight: 600; min-width: 280px; }
.lb-msg { color: #0d7a52; font-weight: 700; font-size: 14px; }
.lb input, .lb textarea { font: inherit; font-size: 14.5px; border: 1px solid #d8d4c6; border-radius: 8px; padding: 7px 10px; background: #fff; color: #1b2340; width: 100%; box-sizing: border-box; }
.lb textarea { resize: vertical; line-height: 1.65; }
.lb section { margin-top: 30px; }
.lb-h { display: flex; align-items: baseline; gap: 12px; border-bottom: 2px solid #a8802f; padding-bottom: 8px; margin-bottom: 12px; }
.lb-h h2, .lb-exams h2 { font-family: "Songti SC", "Noto Serif SC", serif; font-size: 22px; margin: 0; color: #14204a; }
.lb-h span { color: #8a8fa8; font-size: 13.5px; flex: 1; }
.lb button { border: 1px solid #14204a; background: #fff; color: #14204a; border-radius: 8px; padding: 5px 13px; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; }
.lb button.pri { background: #14204a; color: #fff; } .lb button.del { border-color: #d9a3a0; color: #b42318; } .lb button.lnk { border: 0; padding: 0; color: #14204a; text-decoration: underline; background: none; font-weight: 600; }
.lb button:disabled { opacity: .5; cursor: default; }
.lb-m { background: #fff; border: 1px solid #e6e1d2; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; display: grid; gap: 8px; }
.lb-m.done { border-color: #b7dfc6; } .lb-m.new { border-style: dashed; border-color: #a8802f; }
.lb-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; } .lb-row b { font-size: 15.5px; }
.lb-row i { font-style: normal; font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: #eef0f6; color: #5b6380; }
.lb-row i.ok { background: #dcfce7; color: #166534; } .lb-row i.demo { background: #fff1d6; color: #8a5a00; }
.lb-row a { font-size: 13px; color: #14204a; }
.lb-body { white-space: pre-wrap; font-size: 14px; color: #3a4260; max-height: 88px; overflow: hidden; position: relative; }
.lb-body.open { max-height: none; }
.lb-btns { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.lb-hist { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: #8a8fa8; }
.lb-empty { color: #8a8fa8; font-size: 14px; padding: 4px 0 10px; }
.lb-d { color: #5b6380; font-size: 13.5px; margin: 4px 0 10px; }
.lb-exams { background: #fff; border: 1px solid #e6e1d2; border-radius: 12px; padding: 14px 18px; }
.lb-ex { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 6px 0; border-top: 1px solid #f0ece0; }
.lb-ex span { flex: 1; min-width: 240px; font-weight: 600; } .lb-ex em { font-style: normal; font-size: 12.5px; color: #8a5a00; background: #fff1d6; padding: 2px 9px; border-radius: 999px; } .lb-ex em.ok { color: #166534; background: #dcfce7; }
.lb-foot { margin-top: 36px; color: #8a8fa8; font-size: 12.5px; text-align: center; }
@media (max-width: 640px) { .lb-h { flex-wrap: wrap; } .lb-me label { min-width: 0; width: 100%; } }
`;
