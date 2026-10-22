'use client';

/**
 * 用 LinkedIn 交档案（2026-10-23 探索页，不挂在任何地方）：面向 LinkedIn 账号的主人。
 * 真活插件只打开 linkedin.com/in/me/——LinkedIn 会跳到当前登录账号自己的主页，所以只能交本人的；
 * 本人先预览、勾选要交的版块，确认后才整理成人才档案。不入库：整理结果只在这一页，可复制 / 下载。
 */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { WorkLogo } from '@/components/work/WorkLogo';

type Sec = { key: string; label: string; text: string };
const NEED = '0.2.0';
const newer = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return true; };

export default function LinkedinPage() {
  const [ver, setVer] = useState<string | null>(null);
  const [step, setStep] = useState<'idle' | 'reading' | 'preview' | 'parsing' | 'done'>('idle');
  const [read, setRead] = useState<{ slug: string; url: string; sections: Sec[] } | null>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [prof, setProf] = useState<any>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const check = () => { window.postMessage({ source: 'zhenhuo-page', type: 'ping' }, location.origin); if (document.documentElement.dataset.zhenhuo) setVer(document.documentElement.dataset.zhenhuo); };
    check(); const id = setInterval(check, 1500);
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.data?.source !== 'zhenhuo-ext') return;
      if (e.data.type === 'pong') { setVer(e.data.version || '0'); return; }
      if (e.data.type === 'linkedin') {
        if (!e.data.ok) { setErr(e.data.error || '没读到'); setStep('idle'); return; }
        setRead(e.data); setPick(Object.fromEntries(e.data.sections.map((s: Sec) => [s.key, true]))); setStep('preview'); setErr('');
      }
      if (e.data.type === 'error') { setErr(e.data.error); setStep('idle'); }
    };
    window.addEventListener('message', onMsg);
    return () => { clearInterval(id); window.removeEventListener('message', onMsg); };
  }, []);

  const ok = !!ver && newer(ver, NEED);
  const start = () => { setErr(''); setStep('reading'); window.postMessage({ source: 'zhenhuo-page', type: 'linkedin' }, location.origin); };
  const parse = async () => {
    if (!read) return;
    setStep('parsing'); setErr('');
    const j = await fetch('/api/work/linkedin/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections: read.sections.filter(s => pick[s.key]) }) }).then(r => r.json()).catch(() => ({ ok: false, error: '整理失败，再试一次' }));
    if (!j.ok) { setErr(j.error); setStep('preview'); return; }
    setProf({ ...j.profile, source: { linkedin: read.url, read_at: new Date().toISOString(), sections: read.sections.filter(s => pick[s.key]).map(s => s.label) } }); setStep('done');
  };
  const json = prof ? JSON.stringify(prof, null, 2) : '';
  const copy = async () => { try { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} };
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `档案-${prof?.name || read?.slug || 'linkedin'}.json`; a.click(); };

  return (
    <div className="li">
      <style>{CSS}</style>
      <div className="li-top"><WorkLogo size="md" /><span>用 LinkedIn 交档案</span></div>
      <section className="li-hero"><div className="li-in">
        <div className="li-k">只能交你自己的</div>
        <h1>把你的 LinkedIn，<br />一键整理成一份档案</h1>
        <p>真活插件只打开 <code>linkedin.com/in/me</code>。LinkedIn 会自动跳到你当前登录账号自己的主页，所以这里只能交你本人的档案，别人的交不了。读到什么你先看一遍，勾选要交的部分，确认后才整理。</p>
      </div></section>

      <div className="li-in li-body">
        {/* ① 插件 */}
        <div className="li-card">
          <div className="li-k">① 真活插件</div>
          {ok ? <div className="li-ok">已检测到真活插件 v{ver}</div>
            : ver ? <div className="li-warn">真活插件是 v{ver}，这个功能要 v{NEED} 以上：到 <Link href="/work/plugin" target="_blank">插件页</Link> 下载新版，在扩展程序页点「重新加载」后刷新本页。</div>
            : <div className="li-warn">还没检测到真活插件：到 <Link href="/work/plugin" target="_blank">插件页</Link> 下载，三步装好后刷新本页。</div>}
          <div className="li-small">读之前先在这个浏览器里登录你自己的 LinkedIn。</div>
        </div>

        {/* ② 读取 */}
        <div className="li-card">
          <div className="li-k">② 读取我的 LinkedIn</div>
          <p className="li-p">插件会打开一个 LinkedIn 标签页：先是你的主页，再依次打开经历、教育、技能等详情页，读完自动关掉，大约 20–40 秒，期间别切走。只读名片、简介和这些版块；右栏「看过的人也看了」「你可能认识的人」这类别人的信息不读。</p>
          <button className="li-btn" disabled={!ok || step === 'reading' || step === 'parsing'} onClick={start}>{step === 'reading' ? '读取中…（别关那个标签页）' : read ? '重新读取' : '读取我的 LinkedIn'}</button>
          {err && <div className="li-bad">{err}</div>}
        </div>

        {/* ③ 预览 */}
        {read && (step === 'preview' || step === 'parsing' || step === 'done') && (
          <div className="li-card">
            <div className="li-k">③ 先看一遍：这些会交上去</div>
            <div className="li-small">读到的是 <a href={read.url} target="_blank" rel="noreferrer">{read.url}</a>（你登录的账号）。不想交的版块取消勾选。</div>
            <div className="li-secs">
              {read.sections.map(s => (
                <div key={s.key} className="li-sec">
                  <label><input type="checkbox" checked={!!pick[s.key]} onChange={e => setPick(p => ({ ...p, [s.key]: e.target.checked }))} /> <b>{s.label}</b> <span>{s.text.length} 字</span></label>
                  <button className="li-link" onClick={() => setOpen(open === s.key ? null : s.key)}>{open === s.key ? '收起' : '看原文'}</button>
                  {open === s.key && <pre>{s.text}</pre>}
                </div>
              ))}
            </div>
            <button className="li-btn" disabled={step === 'parsing' || !Object.values(pick).some(Boolean)} onClick={parse}>{step === 'parsing' ? '整理中…（约 30 秒）' : '确认，整理成档案'}</button>
          </div>
        )}

        {/* ④ 档案 */}
        {prof && step === 'done' && (
          <div className="li-card li-prof">
            <div className="li-k">④ 你的档案</div>
            <h2>{prof.name}<small>{prof.headline}{prof.location ? ` · ${prof.location}` : ''}</small></h2>
            {prof.summary && <p className="li-sum">{prof.summary}</p>}
            {!!prof.open_to?.length && <Row k="想找的机会">{prof.open_to.join('；')}</Row>}
            {!!prof.experience?.length && <Row k="经历">{prof.experience.map((x: any, i: number) => <div key={i} className="li-item"><b>{x.org}</b> · {x.title}<span> {x.period}{x.location ? ` · ${x.location}` : ''}</span>{!!x.highlights?.length && <ul>{x.highlights.map((h: string, j: number) => <li key={j}>{h}</li>)}</ul>}</div>)}</Row>}
            {!!prof.education?.length && <Row k="教育">{prof.education.map((x: any, i: number) => <div key={i}>{x.school} · {[x.degree, x.major].filter(Boolean).join(' ')}{x.period ? ` · ${x.period}` : ''}</div>)}</Row>}
            {!!prof.projects?.length && <Row k="项目">{prof.projects.map((x: any, i: number) => <div key={i}><b>{x.name}</b>：{x.what}{x.link ? <> · <a href={/^https?:/.test(x.link) ? x.link : `https://${x.link}`} target="_blank" rel="noreferrer">{x.link}</a></> : null}</div>)}</Row>}
            {!!prof.skills?.length && <Row k="技能">{prof.skills.join('、')}</Row>}
            {!!prof.languages?.length && <Row k="语言">{prof.languages.join('、')}</Row>}
            {!!prof.verifiable?.length && <Row k="可核验的说法">{prof.verifiable.map((x: any, i: number) => <div key={i} className="li-item"><b>{x.claim}</b><div className="li-small">怎么核实：{x.how}</div></div>)}</Row>}
            {!!prof.gaps?.length && <Row k="建档还缺">{prof.gaps.join('；')}</Row>}
            {prof.work_task_hint && <Row k="出一道真活验证">{prof.work_task_hint}</Row>}
            <div className="li-acts"><button className="li-btn" onClick={copy}>{copied ? '已复制' : '复制档案'}</button><button className="li-btn ghost" onClick={download}>下载 JSON</button></div>
            <div className="li-small">档案只在这一页，没有存到任何地方；关掉页面就没了。</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return <div className="li-row"><div>{k}</div><div>{children}</div></div>;
}

const CSS = `
.li { --p: #0a66c2; --ink: #1a1a2e; --ink2: #4a4f66; --ink3: #8a8fa3; --line: #e8e9f0; min-height: 100vh; background: #f6f7fb; color: var(--ink); font: 15px/1.75 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.li-top { display: flex; align-items: center; gap: 12px; padding: 12px clamp(16px, 4vw, 28px); background: #fff; border-bottom: 1px solid var(--line); } .li-top > span { color: var(--ink3); font-size: 13px; }
.li-in { max-width: 920px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 28px); }
.li-hero { background: linear-gradient(135deg, #0a3d74, #0a66c2); color: #fff; padding: clamp(36px, 6vw, 60px) 0; }
.li-hero h1 { font-size: clamp(26px, 4vw, 40px); line-height: 1.3; margin: 0 0 12px; } .li-hero p { max-width: 720px; color: rgba(255,255,255,.9); margin: 0; }
.li-hero code { background: rgba(255,255,255,.15); padding: 1px 6px; border-radius: 6px; }
.li-k { font-size: 12px; letter-spacing: 2px; color: var(--p); font-weight: 700; margin-bottom: 8px; } .li-hero .li-k { color: #cfe3ff; }
.li-body { padding-top: 22px; padding-bottom: 60px; display: grid; gap: 14px; }
.li-card { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; }
.li-p { margin: 0 0 12px; color: var(--ink2); }
.li-btn { border: 0; border-radius: 10px; padding: 10px 18px; background: var(--p); color: #fff; font-weight: 700; cursor: pointer; font-size: 14.5px; } .li-btn:disabled { opacity: .5; cursor: default; }
.li-btn.ghost { background: #eef3fa; color: var(--p); }
.li-ok { color: #237a45; } .li-warn { color: #ad6800; } .li-bad { color: #cf1322; margin-top: 8px; }
.li-small { font-size: 12.5px; color: var(--ink3); margin-top: 6px; }
.li-secs { display: grid; gap: 8px; margin: 12px 0; }
.li-sec { border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; } .li-sec label { cursor: pointer; } .li-sec span { color: var(--ink3); font-size: 12.5px; }
.li-sec pre { white-space: pre-wrap; font: inherit; font-size: 13px; color: var(--ink2); background: #fafbff; border-radius: 8px; padding: 10px; margin: 8px 0 0; max-height: 320px; overflow: auto; }
.li-link { border: 0; background: none; color: var(--p); cursor: pointer; float: right; font-size: 13px; }
.li-prof h2 { font-size: 22px; margin: 0 0 6px; } .li-prof h2 small { display: block; font-size: 13.5px; color: var(--ink3); font-weight: 400; margin-top: 2px; }
.li-sum { background: #f3f7fc; border-left: 3px solid var(--p); padding: 8px 12px; border-radius: 0 8px 8px 0; color: var(--ink2); }
.li-row { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; padding: 10px 0; border-top: 1px solid #f0f0f5; font-size: 14px; } .li-row > div:first-child { color: var(--p); font-weight: 600; font-size: 13px; }
.li-item { margin-bottom: 8px; } .li-item span { color: var(--ink3); font-size: 12.5px; } .li-item ul { margin: 4px 0 0; padding-left: 18px; color: var(--ink2); }
.li-acts { display: flex; gap: 10px; margin-top: 12px; }
@media (max-width: 640px) { .li-row { grid-template-columns: 1fr; gap: 2px; } }
`;
