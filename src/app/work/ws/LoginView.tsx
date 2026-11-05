'use client';

/**
 * 真活工作台的登录视图（2026-11-05，用户：第一批合作方是海归和名校老师，很文艺——单独配一个文艺的登录页）。
 * /work（工作台入口：没登录就是这一页）和 /work/ws/login 共用。左边铜版画作坊街（木匠、织工、陶工、铁匠各自干活——看他干真活），右边纸色一栏。
 * 账号同一套（/api/auth/login），登录完回 next（只认站内路径），默认进工作台首页。配色变量自带，不依赖工作台外壳。
 */
import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginView() {
  const router = useRouter(); const sp = useSearchParams();
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const next = sp.get('next') || '';
  const dest = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/work/ws';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!email.trim() || !pw) { setErr('邮箱和密码都要填'); return; }
    setBusy(true); setErr('');
    try {
      const j = await (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password: pw }) })).json();
      if (!j.success) throw new Error(j.error || '登录失败');
      if (j.user?.must_change_password) { router.push(`/account/password?next=${encodeURIComponent(dest)}`); return; }
      router.push(dest); router.refresh();
    } catch (e: any) { setErr(e.message || '网络错误'); setBusy(false); }
  };
  return (
    <div className="lg">
      <style>{CSS}</style>
      <div className="lg-art" aria-hidden><img src="/work/ws/h-street.jpg" alt="" /></div>
      <div className="lg-col">
        <div className="lg-brand"><span className="mk">真</span><div><b>百业AI｜真活</b><small>TRUE WORK · DESK</small></div></div>
        <div className="lg-body">
          <div className="wws-eyebrow">TRUE WORK, TRUE TALENT</div>
          <h1>看他干真活<span>A quiet desk for real work — and for finding the people who can do it.</span></h1>
          <p>一道此刻真实的业务题，一张考卷，一份看得见过程的报告。</p>
          <form onSubmit={submit}>
            <label>邮箱<input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="username" placeholder="name@institution.edu" /></label>
            <label>密码<input value={pw} onChange={e => setPw(e.target.value)} type="password" autoComplete="current-password" placeholder="密码" /></label>
            {err && <div className="lg-err">{err}</div>}
            <button type="submit" disabled={busy}>{busy ? '进门中…' : '进入工作台'}</button>
          </form>
          <div className="lg-foot">没有账号？请管理员开通　·　做题的人不用登录，点参与链接就能做</div>
        </div>
        <a className="lg-about" href="/work/about">关于真活 →</a>
        <div className="lg-motto">“Every trade has its true work.”<span>百业皆有真活</span></div>
      </div>
    </div>
  );
}

const CSS = `
.lg { --bg: #f7f5f0; --paper: #fffefb; --ink: #1b1d36; --ink2: #575b75; --ink3: #9497ab; --line: #e7e3d9; --line2: #efece4; --acc: #5148d6; --brass: #a88b5c;
  --serif: "Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", serif; --en: var(--font-en-serif), "Source Serif 4", Georgia, serif;
  color: var(--ink); font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; position: fixed; inset: 0; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(380px, 1fr); background: var(--paper); z-index: 20; }
.lg-art { position: relative; overflow: hidden; background: var(--bg); border-right: 1px solid var(--line); }
.lg-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 60%; mix-blend-mode: multiply; filter: saturate(.85); }
.lg-art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 70%, rgba(255,254,251,.7)); }
.lg-col { display: flex; flex-direction: column; padding: 34px clamp(28px, 5vw, 72px); overflow-y: auto; }
.lg-brand { display: flex; align-items: center; gap: 12px; }
.lg-brand .mk { width: 40px; height: 40px; border-radius: 50%; background: var(--acc); color: #fff; display: grid; place-items: center; font: 900 19px var(--serif); box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px rgba(81,72,214,.35); }
.lg-brand b { display: block; font: 900 17px/1.25 var(--serif); letter-spacing: .05em; } .lg-brand small { display: block; font: 600 10.5px var(--en); letter-spacing: .22em; color: var(--brass); margin-top: 3px; }
.lg-body { margin: auto 0; max-width: 400px; padding: 40px 0; }
.lg h1 { font: 900 40px/1.25 var(--serif); letter-spacing: .06em; margin: 12px 0 0; }
.lg h1 span { display: block; font: italic 400 16px/1.5 var(--en); color: var(--ink2); letter-spacing: .005em; margin-top: 10px; }
.lg-body > p { color: var(--ink2); font-size: 14.5px; line-height: 1.9; margin: 16px 0 30px; }
.lg form { display: grid; gap: 18px; }
.lg label { display: grid; gap: 6px; font: 600 11px var(--en), "PingFang SC", sans-serif; letter-spacing: .18em; color: var(--ink2); }
.lg input { border: 0; border-bottom: 1.5px solid var(--line); background: transparent; padding: 8px 2px 9px; font: 15px -apple-system, "PingFang SC", sans-serif; letter-spacing: 0; color: var(--ink); outline: 0; border-radius: 0; }
.lg input:focus { border-bottom-color: var(--acc); }
.lg button { margin-top: 8px; height: 48px; border: 0; border-radius: 10px; background: var(--ink); color: #fff; font: 700 15px "PingFang SC", sans-serif; letter-spacing: .2em; cursor: pointer; }
.lg button:hover { background: var(--acc); } .lg button:disabled { opacity: .6; cursor: default; }
.lg-err { color: #b42318; font-size: 13px; }
.lg-foot { margin-top: 18px; font-size: 12.5px; color: var(--ink3); line-height: 1.8; }
.lg .wws-eyebrow { font: 600 11.5px/1.4 var(--en); letter-spacing: .26em; color: var(--brass); text-transform: uppercase; }
.lg-about { align-self: flex-start; margin-bottom: 14px; color: var(--acc); font-weight: 700; font-size: 13.5px; text-decoration: none; }
.lg-motto { font: italic 400 14px var(--en); color: var(--ink2); border-top: 1px solid var(--line2); padding-top: 14px; }
.lg-motto span { font: 600 12px var(--serif); letter-spacing: .3em; color: var(--brass); margin-left: 12px; font-style: normal; }
@media (max-width: 860px) { .lg { grid-template-columns: 1fr; grid-template-rows: 220px 1fr; } .lg-art { border-right: 0; border-bottom: 1px solid var(--line); } .lg h1 { font-size: 32px; } }
`;
