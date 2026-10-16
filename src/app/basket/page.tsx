'use client';

/**
 * 数据外采篮：宣传 + 使用说明 + 下载 + 篮子口令 + 待采清单。
 * 给两种人看：投资人（为什么「人 + AI」才拿得到数据）和数据同事（三步装好、四步采完）。
 * 案例数字来自 2026-10-16 百度校招 / 实习的真实采集（用户在自己的 Chrome 里翻页，篮子只读）。
 */
import { useEffect, useState } from 'react';

type QueueItem = { id: number; name: string; entry: string | null };

const WALLS = [
  { site: '傅利叶智能', wall: '入口藏在按钮后面', what: '官网「加入我们」是一个 JS 跳转，岗位其实在 Moka 招聘系统上。模型顺着链接找，永远找不到。', human: '同事点开一下，指出「在 Moka 上」', got: '25 个岗位' },
  { site: '百度', wall: '一看是机器就关门', what: '检测到无头浏览器直接跳空白页；自动翻十几页就会被请出去。', human: '同事在自己的 Chrome 里过「我是人类」、一页一页翻', got: '360 个在招岗位' },
  { site: '中国太平', wall: '反爬保护', what: '直接请求返回 412，页面要先过一道人机校验。', human: '同事打开页面、过校验', got: '待采' },
];

const STEPS_INSTALL = [
  { t: '下载插件', d: '点上面的「下载数据外采篮」，得到 data-basket.zip，双击解压，得到一个 data-basket 文件夹。' },
  { t: '打开扩展程序页', d: '在 Chrome 地址栏输入 chrome://extensions ，打开右上角的「开发者模式」。' },
  { t: '加载插件', d: '点「加载已解压的扩展程序」，选中 data-basket 文件夹。工具栏上会出现一个橙色小篮子，把它固定在工具栏上更方便。' },
];

const STEPS_USE = [
  { t: '连接工厂', d: '在本页登录后点「生成篮子口令」，复制；点开插件的 ⚙︎，粘贴口令、保存，显示「连上了」就好。' },
  { t: '选企业', d: '在插件里搜这一篮要采的企业（打开招聘站时插件会按网址先猜一个）。' },
  { t: '你来打开、翻页', d: '打开招聘站，该登录登录、该过验证过验证，翻到职位列表。打开「跟着我翻页」，之后你每翻一页、每点开一个详情，篮子自动读一次。' },
  { t: '看收获', d: '侧边栏实时显示每一篮提炼了几个岗位、入了多少库。岗位以「待审核」进岗位库，带「数据外采篮」「仅列表信息 / 详情已补」标记，信息源库同时记下真实的职位列表页。' },
];

export default function BasketPage() {
  const [token, setToken] = useState('');
  const [tokenMsg, setTokenMsg] = useState('');
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [ver, setVer] = useState('');

  useEffect(() => {
    fetch('/downloads/data-basket.json').then(r => r.json()).then(j => setVer(j.version)).catch(() => {});
    fetch('/api/basket/queue').then(async r => {
      if (r.status === 401) { setLoggedIn(false); return; }
      const j = await r.json(); setLoggedIn(true); setQueue(j.data || []);
    }).catch(() => setLoggedIn(false));
  }, []);

  const makeToken = async () => {
    setTokenMsg('生成中…');
    const r = await fetch('/api/basket/token', { method: 'POST' });
    const j = await r.json();
    if (!j.ok) { setTokenMsg(j.error || '生成失败'); return; }
    setToken(j.token); setTokenMsg(`口令 30 天有效（${j.email}）`);
  };
  const copy = async () => { await navigator.clipboard.writeText(token); setTokenMsg('已复制，去插件 ⚙︎ 里粘贴'); };

  return (
    <div className="bk">
      <style>{CSS}</style>

      <section className="bk-hero">
        <div className="bk-wrap">
          <div className="bk-tag">智能企业数据工厂 · 人机协同采集</div>
          <h1><span className="bk-basket">🧺</span>数据外采篮</h1>
          <p className="bk-lead">人点点点，AI 啃啃啃。</p>
          <p className="bk-sub">有些数据只给真人看：入口藏在按钮后面、一看是机器就关门、要先过「我是人类」。数据同事挎着篮子去采，篮子把人看到的页面交给 AI 工厂，提炼成结构化数据、对着原文核对、直接入库。</p>
          <div className="bk-cta">
            <a className="bk-btn" href="/downloads/data-basket.zip" download>下载数据外采篮{ver ? ` v${ver}` : ''}</a>
            <a className="bk-btn ghost" href="#how">三步装好 · 四步采完</a>
          </div>
        </div>
      </section>

      <section className="bk-wrap bk-sec">
        <h2>为什么光靠 AI 拿不到这些数据</h2>
        <p className="bk-p">信息的世界是攻防：网站越来越会挡机器。模型自己一路检索、一路试，最后得到的是「0 个岗位」。人在几个关键点出手——打开、过验证、指路、翻页——天平就倾斜了。</p>
        <div className="bk-walls">
          {WALLS.map(w => (
            <div key={w.site} className="bk-wall">
              <div className="bk-wall-h"><b>{w.site}</b><span>{w.wall}</span></div>
              <p>{w.what}</p>
              <div className="bk-wall-f"><span>👤 {w.human}</span><b>{w.got}</b></div>
            </div>
          ))}
        </div>
      </section>

      <section className="bk-wrap bk-sec">
        <h2>人做判断，AI 干体力活</h2>
        <div className="bk-split">
          <div className="bk-col human">
            <h3>👤 数据同事</h3>
            <ul><li>打开招聘站、登录</li><li>过「我是人类」和人机校验</li><li>指路：岗位在哪个系统、哪一页</li><li>翻页、点开值得看的详情</li></ul>
          </div>
          <div className="bk-arrow">🧺<small>篮子只读<br />人看到的字</small></div>
          <div className="bk-col ai">
            <h3>🤖 AI 工厂</h3>
            <ul><li>读页面、认出每一张岗位卡片</li><li>提炼成岗位库字段（城市、届别、学历、职责…）</li><li>名称、链接逐条对着原文核对</li><li>入库、打采集标记、把真实入口记进信源库</li></ul>
          </div>
        </div>
      </section>

      <section className="bk-wrap bk-sec">
        <h2>真实案例：百度校园招聘</h2>
        <p className="bk-p">2026 年 10 月 16 日。百度招聘站会把无头浏览器跳成空白页，自动翻十几页就被请出去。改成「同事在自己的 Chrome 里翻页，篮子只读」之后：</p>
        <div className="bk-nums">
          <div><b>162</b><span>校招岗位</span></div>
          <div><b>196</b><span>9 月以来的在招实习</span></div>
          <div><b>100%</b><span>岗位名称能在原网页找到</span></div>
          <div><b>0</b><span>次绕过网站的拦截</span></div>
        </div>
        <p className="bk-note">一边抱着孩子一边单手翻页也能干：同事翻一页，篮子读一页，十几分钟采完一家大厂的一个招聘季。</p>
      </section>

      <section className="bk-wrap bk-sec">
        <h2>篮子的规矩</h2>
        <div className="bk-rules">
          <div><b>只读不点</b><span>不点按钮、不翻页、不填表——这些都是人做的</span></div>
          <div><b>不碰验证码</b><span>验证、登录永远由人完成，篮子不绕任何拦截</span></div>
          <div><b>不伪装、不并发</b><span>人看一页，篮子读一页，节奏就是人的节奏</span></div>
          <div><b>全程留痕</b><span>每一条数据都记着谁、哪天、从哪一页采的</span></div>
        </div>
      </section>

      <section id="how" className="bk-wrap bk-sec">
        <h2>三步装好</h2>
        <ol className="bk-steps">{STEPS_INSTALL.map((s, i) => <li key={i}><b>{s.t}</b><span>{s.d}</span></li>)}</ol>
        <h2 style={{ marginTop: 28 }}>四步采完</h2>
        <ol className="bk-steps">{STEPS_USE.map((s, i) => <li key={i}><b>{s.t}</b><span>{s.d}</span></li>)}</ol>
      </section>

      <section className="bk-wrap bk-sec">
        <h2>连接我的篮子</h2>
        {loggedIn === false && <p className="bk-p">请先 <a href="/login?next=/basket">登录数据工厂</a>，再回来生成篮子口令。</p>}
        {loggedIn && (
          <div className="bk-token">
            <button className="bk-btn" onClick={makeToken}>生成篮子口令</button>
            {token && <><textarea readOnly value={token} rows={3} /><button className="bk-btn ghost" onClick={copy}>复制</button></>}
            <span className="bk-muted">{tokenMsg}</span>
          </div>
        )}
      </section>

      {loggedIn && (
        <section className="bk-wrap bk-sec">
          <h2>待采清单 <small className="bk-muted">AI 自己啃不动的企业（有入口、0 个在招岗位）</small></h2>
          {!queue ? <p className="bk-muted">加载中…</p> : (
            <div className="bk-queue">
              {queue.map(q => (
                <div key={q.id} className="bk-q"><b>{q.name}</b>{q.entry ? <a href={q.entry} target="_blank" rel="noreferrer">打开入口 ↗</a> : <span className="bk-muted">暂无入口</span>}</div>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="bk-foot">智能企业数据工厂 · 数据外采篮 · 人 + AI，一起把数据拿回来</footer>
    </div>
  );
}

const CSS = `
.bk { --ink:#1c1917; --ink2:#57534e; --ink3:#a8a29e; --line:#e7e5e4; --brand:#c2410c; --brand2:#ea580c; --soft:#fff7ed; --bg:#fafaf9; background:var(--bg); color:var(--ink); min-height:100vh; font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif; }
.bk a { color:var(--brand); }
.bk-wrap { max-width:1040px; margin:0 auto; padding:0 20px; }
.bk-hero { background:radial-gradient(1200px 400px at 20% 0%, #ffedd5, transparent), linear-gradient(180deg,#fff7ed,#fafaf9); padding:72px 0 56px; border-bottom:1px solid var(--line); }
.bk-tag { display:inline-block; padding:4px 12px; border-radius:999px; background:#fff; border:1px solid #fed7aa; color:var(--brand); font-size:12px; letter-spacing:.04em; }
.bk-hero h1 { font-size:52px; margin:18px 0 6px; letter-spacing:.02em; }
.bk-basket { margin-right:10px; }
.bk-lead { font-size:24px; font-weight:700; color:var(--brand); margin:0 0 14px; }
.bk-sub { font-size:16px; line-height:1.9; color:var(--ink2); max-width:720px; margin:0; }
.bk-cta { display:flex; gap:12px; flex-wrap:wrap; margin-top:26px; }
.bk-btn { display:inline-block; padding:11px 20px; border-radius:12px; background:var(--brand); color:#fff !important; font-weight:700; text-decoration:none; border:0; cursor:pointer; font-size:14px; }
.bk-btn.ghost { background:#fff; color:var(--brand) !important; border:1px solid #fed7aa; }
.bk-sec { padding:48px 20px 8px; }
.bk-sec h2 { font-size:24px; margin:0 0 12px; }
.bk-p { color:var(--ink2); line-height:1.9; max-width:820px; }
.bk-walls { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin-top:16px; }
.bk-wall { background:#fff; border:1px solid var(--line); border-radius:16px; padding:16px; display:flex; flex-direction:column; }
.bk-wall-h { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
.bk-wall-h span { font-size:12px; color:var(--brand); background:var(--soft); padding:2px 8px; border-radius:999px; }
.bk-wall p { color:var(--ink2); font-size:13.5px; line-height:1.8; flex:1; }
.bk-wall-f { display:flex; justify-content:space-between; gap:8px; font-size:12.5px; border-top:1px dashed var(--line); padding-top:10px; color:var(--ink2); }
.bk-wall-f b { color:var(--brand); white-space:nowrap; }
.bk-split { display:grid; grid-template-columns:1fr auto 1fr; gap:16px; align-items:stretch; margin-top:12px; }
.bk-col { background:#fff; border:1px solid var(--line); border-radius:16px; padding:16px 20px; }
.bk-col.human { border-color:#fed7aa; }
.bk-col.ai { border-color:#bae6fd; }
.bk-col h3 { margin:0 0 8px; font-size:16px; }
.bk-col ul { margin:0; padding-left:18px; color:var(--ink2); line-height:2; }
.bk-arrow { display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:34px; text-align:center; }
.bk-arrow small { font-size:12px; color:var(--ink3); line-height:1.5; }
.bk-nums { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin:16px 0; }
.bk-nums div { background:#fff; border:1px solid var(--line); border-radius:16px; padding:16px; }
.bk-nums b { display:block; font-size:32px; color:var(--brand); }
.bk-nums span { color:var(--ink2); font-size:13px; }
.bk-note { color:var(--ink2); font-size:14px; background:var(--soft); border-radius:12px; padding:10px 14px; display:inline-block; }
.bk-rules { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
.bk-rules div { background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px; }
.bk-rules b { display:block; margin-bottom:4px; }
.bk-rules span { color:var(--ink2); font-size:13px; }
.bk-steps { margin:8px 0 0; padding:0; list-style:none; counter-reset:s; display:grid; gap:10px; }
.bk-steps li { counter-increment:s; display:grid; grid-template-columns:36px 1fr; column-gap:12px; background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px; }
.bk-steps li::before { content:counter(s); grid-row:span 2; width:30px; height:30px; border-radius:50%; background:var(--soft); color:var(--brand); font-weight:800; display:flex; align-items:center; justify-content:center; }
.bk-steps span { color:var(--ink2); font-size:13.5px; line-height:1.8; }
.bk-token { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
.bk-token textarea { flex:1 1 100%; font-family:ui-monospace,monospace; font-size:11px; padding:8px; border:1px solid var(--line); border-radius:10px; }
.bk-muted { color:var(--ink3); font-size:13px; font-weight:400; }
.bk-queue { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:8px; }
.bk-q { display:flex; justify-content:space-between; gap:8px; background:#fff; border:1px solid var(--line); border-radius:10px; padding:8px 12px; font-size:13px; }
.bk-q a { white-space:nowrap; }
.bk-foot { text-align:center; color:var(--ink3); font-size:12px; padding:48px 0 32px; }
@media (max-width:720px) { .bk-hero h1 { font-size:38px; } .bk-split { grid-template-columns:1fr; } .bk-arrow { flex-direction:row; gap:8px; font-size:26px; } }
`;
