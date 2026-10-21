'use client';

/**
 * AI 大学申请表（申请模型入学 / 人才培养需求共用）。
 * 不用注册登录：填表直接提交到 /api/college/apply，存成一条线索就结束——平方的同事按留下的联系方式联系，这里不直接训练。
 * 表单不收模型密钥。防刷：隐藏陷阱字段 + 接口按 IP 限频。
 */
import React, { useEffect, useState } from 'react';

export interface Field {
  key: string; label: string; required?: boolean; half?: boolean;
  type?: 'text' | 'textarea' | 'select'; options?: string[]; placeholder?: string; hint?: string; rows?: number;
}

export default function ApplyForm({ kind, fields, submitText, doneTitle, doneText, source, initial }: {
  kind: 'enroll' | 'hire'; fields: Field[]; submitText: string; doneTitle: string; doneText: string; source?: string; initial?: Record<string, string>;
}) {
  const [v, setV] = useState<Record<string, string>>({});
  const [trap, setTrap] = useState('');   // 防刷：人看不见的字段，机器人会填
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => { if (initial) setV(x => ({ ...initial, ...x })); }, [initial]);

  const submit = async () => {
    const miss = fields.filter(f => f.required && !(v[f.key] || '').trim()).map(f => f.label);
    if (miss.length) { setErr(`还差：${miss.join('、')}`); return; }
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) { setErr('邮箱格式不对'); return; }
    setErr(''); setBusy(true);
    try {
      const j = await (await fetch('/api/college/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, fields: v, source, website: trap }) })).json();
      if (!j.ok) throw new Error(j.error || '提交没成功');
      setDone(true);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="af">
      <style>{AF_CSS}</style>
      {done ? (
        <div className="af-card af-done">
          <div className="af-seal">✓</div>
          <b>{doneTitle}</b>
          <p>{doneText}</p>
          <button className="cu-btn ghost" onClick={() => { setDone(false); setV(initial || {}); }}>再提交一份</button>
        </div>
      ) : (
        <div className="af-card">
          <div className="af-step">填写申请<em>带 * 的必填；其余越详细，我们准备得越快。不用注册。</em></div>
          <div className="af-grid">
            {fields.map(f => (
              <label key={f.key} className={f.half ? '' : 'full'}>
                <span>{f.label}{f.required && <b>*</b>}</span>
                {f.type === 'textarea'
                  ? <textarea className="col-input" rows={f.rows || 4} placeholder={f.placeholder} value={v[f.key] || ''} onChange={e => setV({ ...v, [f.key]: e.target.value })} />
                  : f.type === 'select'
                    ? <select className="col-input" value={v[f.key] || ''} onChange={e => setV({ ...v, [f.key]: e.target.value })}>
                        <option value="">请选择</option>
                        {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    : <input className="col-input" type={f.key === 'email' ? 'email' : 'text'} placeholder={f.placeholder} value={v[f.key] || ''} onChange={e => setV({ ...v, [f.key]: e.target.value })} />}
                {f.hint && <small>{f.hint}</small>}
              </label>
            ))}
            <input className="af-trap" tabIndex={-1} autoComplete="off" aria-hidden value={trap} onChange={e => setTrap(e.target.value)} />
          </div>
          {err && <div className="af-err">{err}</div>}
          <button className="cu-btn navy" disabled={busy} onClick={submit}>{busy ? '提交中…' : submitText}</button>
        </div>
      )}
    </div>
  );
}

const AF_CSS = `
.af-card { background: #fff; border: 1px solid var(--line); border-top: 3px solid var(--navy); padding: clamp(22px, 3vw, 36px); display: grid; gap: 16px; }
.af-step { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; font-family: var(--serif); font-size: 22px; font-weight: 900; }
.af-step em { display: block; width: 100%; font: 400 14px/1.6 ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif; font-style: normal; color: var(--ink3); margin-top: -4px; }
.af label { display: grid; gap: 6px; align-content: start; }
.af label > span { font-size: 13.5px; font-weight: 700; color: var(--navy); }
.af label > span b { color: #b42318; margin-left: 3px; }
.af label small { font-size: 12.5px; color: var(--ink3); line-height: 1.6; }
.af .col-input { border-radius: 2px; }
.af textarea.col-input { resize: vertical; line-height: 1.7; }
.af-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 18px; }
.af-grid label.full { grid-column: 1 / -1; }
.af .cu-btn { justify-self: start; border: 0; cursor: pointer; font-family: inherit; }
.af .cu-btn:disabled { opacity: .5; cursor: default; }
.af-err { color: #b42318; font-size: 14px; }
.af-done { justify-items: start; }
.af-seal { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(135deg, #b08d57, #d9b878); color: #fff; font-size: 26px; font-weight: 900; }
.af-done b { font-family: var(--serif); font-size: 26px; }
.af-done p { margin: 0; font-size: 15.5px; line-height: 1.85; color: var(--ink2); max-width: 640px; }
.af-trap { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
@media (max-width: 760px) { .af-grid { grid-template-columns: 1fr; } }
`;
