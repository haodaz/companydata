'use client';

/**
 * 真活台 · 公开首页（C 端老板 / 带队的人，不绑 HR、不用登录）：填企业 + 岗位 → 出一道真活 → 拿到参与链接（甩给候选人）和管理链接（看报告）。
 */
import React, { useState } from 'react';
import Link from 'next/link';

const ENVS = [{ v: '', l: '按岗位自动选' }, { v: 'doc', l: '文档 / 对账台' }, { v: 'code', l: '代码台' }, { v: 'sheet', l: '表格 / 数据台' }, { v: 'design', l: '设计台' }];
const ENV_NAME: Record<string, string> = { doc: '文档 / 对账台', code: '代码台', sheet: '表格 / 数据台', design: '设计台' };

export default function WorkLanding() {
  const [f, setF] = useState({ company: '', role: '', env: '', focus: '', name: '', contact: '' });
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [done, setDone] = useState<any>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  const go = async () => {
    setErr(''); if (!f.company.trim() || !f.role.trim()) return setErr('企业和岗位都要填'); if (!f.name.trim() || !f.contact.trim()) return setErr('留个称呼和联系方式，管理链接只给你');
    setBusy('在拼这家企业的材料、出题、做材料包、定标准……约 2–3 分钟，别关页面');
    try {
      const j = await (await fetch('/api/work/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })).json();
      if (!j.ok) throw new Error(j.error);
      setDone(j);
    } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', color: '#1a1a2e', fontFamily: 'var(--font-geist-sans), -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '48px 20px 60px' }}>
        <div style={{ fontSize: 12, letterSpacing: 3, color: '#6055f5', fontWeight: 700 }}>真活台 · 平方智能</div>
        <h1 style={{ fontSize: 34, lineHeight: 1.25, margin: '10px 0 8px' }}>别问他会不会，<br />拿你们真实的活让他做一遍。</h1>
        <p style={{ fontSize: 16, color: '#555', lineHeight: 1.8, margin: '0 0 24px' }}>填企业和岗位，我们从企业画像、岗位、职业典型任务、行业规范里给你出一道<b>此刻真实的业务题</b>：任务书、材料包（故意留坑）、逐条标准（带依据）、AI 先做一遍当基线。链接甩给候选人或团队，做完立刻有报告：结果逐条有证据、过程看得到什么是他自己判断的、什么交给了 AI。</p>
        {!done ? (
          <div style={box}>
            <div style={grid}>
              <L label="企业"><input value={f.company} onChange={set('company')} placeholder="公司名（库里有画像的最好，如 宁德时代）" style={inp} /></L>
              <L label="岗位"><input value={f.role} onChange={set('role')} placeholder="要考的岗位 / 职业，如 供应链计划、后端开发" style={inp} /></L>
              <L label="操作台"><select value={f.env} onChange={set('env')} style={inp}>{ENVS.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}</select></L>
              <L label="你想考什么（选填）"><input value={f.focus} onChange={set('focus')} placeholder="比如：聚焦某条产线的排产冲突；给 3 年以内的人；难一点" style={inp} /></L>
              <L label="你的称呼"><input value={f.name} onChange={set('name')} placeholder="如 王经理" style={inp} /></L>
              <L label="联系方式"><input value={f.contact} onChange={set('contact')} placeholder="手机 / 微信 / 邮箱（管理链接只发给你）" style={inp} /></L>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={go} disabled={!!busy} style={btn}>{busy ? '出题中…' : '出一道真活 →'}</button>
              <span style={{ fontSize: 13, color: '#888' }}>每人每天 3 道 · 出题约 2–3 分钟 · 不用注册</span>
            </div>
            {busy && <div style={{ marginTop: 12, color: '#4c43c9', fontSize: 14 }}>{busy}</div>}
            {err && <div style={{ marginTop: 12, color: '#c0392b', fontSize: 14 }}>{err}</div>}
          </div>
        ) : (
          <div style={box}>
            <div style={{ fontSize: 12, letterSpacing: 2, color: '#12a150', fontWeight: 700 }}>题出好了</div>
            <h2 style={{ margin: '6px 0 4px', fontSize: 22 }}>{done.title}</h2>
            <div style={{ color: '#666', marginBottom: 16 }}>{ENV_NAME[done.env]} · AI 基线 {done.baseline ?? '未跑成（管理页可重跑）'} 分</div>
            <Row label="参与链接（甩给候选人 / 团队）" value={`${origin}/work/${done.share_token}`} />
            <Row label="管理链接（只给你：看每个人的报告、发布 / 下架、重跑基线）" value={`${origin}/work/${done.share_token}/owner?k=${done.owner_key}`} warn />
            {done.notes?.length ? <div style={{ fontSize: 13, color: '#b7791f', marginTop: 10 }}>材料缺口：{done.notes.join('；')}（题里会如实标「示例数据」）</div> : null}
            <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href={`/work/${done.share_token}/owner?k=${done.owner_key}`} style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>先看看题 →</Link>
              <button onClick={() => setDone(null)} style={btnGhost}>再出一道</button>
            </div>
          </div>
        )}
        <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[['生成器先行', '问题 → 任务 → 材料包 → 带依赖的标准 → AI 基线，全部从数据底座长出来，不编'], ['四种操作台', '文档 / 对账、代码（自测用例）、表格 / 数据、设计（参数 + 草图），按岗位自动选'], ['过程比结果重要', '结果人人能用 AI 生成；看他打开了哪些材料、问了 AI 什么、采纳时核没核'], ['只做预筛与练习', '报告写「观察到」，不下定性；行为面试和文化契合还是你自己来']].map(([t, d]) => <div key={t} style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 16px' }}><div style={{ fontWeight: 700, marginBottom: 4 }}>{t}</div><div style={{ fontSize: 13, color: '#666', lineHeight: 1.7 }}>{d}</div></div>)}
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#888', fontWeight: 600 }}>{label}{children}</label>; }
function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  const [c, setC] = useState(false);
  return <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, color: warn ? '#b7791f' : '#888', fontWeight: 600 }}>{label}</div><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><code style={{ fontSize: 13, background: '#fafbff', padding: '6px 10px', borderRadius: 8, border: '1px solid #e8e9f0', wordBreak: 'break-all' }}>{value}</code><button onClick={() => { navigator.clipboard.writeText(value); setC(true); setTimeout(() => setC(false), 1500); }} style={btnGhost}>{c ? '已复制' : '复制'}</button></div></div>;
}
const box: React.CSSProperties = { background: '#fff', border: '1px solid #e8e9f0', borderRadius: 16, padding: '20px 22px' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 };
const inp: React.CSSProperties = { padding: '10px 12px', border: '1px solid #d9dbe6', borderRadius: 10, fontSize: 14, outline: 'none', color: '#1a1a2e', fontWeight: 400, background: '#fff' };
const btn: React.CSSProperties = { padding: '11px 22px', borderRadius: 999, border: 0, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15 };
const btnGhost: React.CSSProperties = { padding: '7px 14px', borderRadius: 999, border: '1px solid #d9dbe6', background: '#fff', color: '#444', cursor: 'pointer', fontSize: 13 };
