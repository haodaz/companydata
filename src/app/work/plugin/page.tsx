'use client';

/**
 * 真活插件：介绍 + 下载 + 启动（2026-10-22）。和「数据外采篮」是两个东西。
 * 每道选了「真活插件」的题都链到这一页：/work/plugin?code=<真活码>——装过插件就一键关联这次作答，没装就先装。
 * 给两种人看：候选人（装好、关联、开始记录）和投资人 / 出题人（为什么比录屏轻、读什么不读什么）。
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { WorkLogo } from '@/components/work/WorkLogo';

type Bound = { ok: boolean; title?: string; error?: string; submitted?: boolean };

/** 四步做完一道题：每步配真实截图（[图, 说明, 是否竖长的侧边栏图]） */
const FLOW: { t: string; d: string; imgs: [string, string, boolean?][] }[] = [
  { t: '拿到真活码，去关联', d: '打开出题人发的参与链接，留个名字点「开始做」。答题页会给一个 6 位真活码，点「去装插件 / 关联」来到这一页，点「关联这次作答」。看到「已关联」就好。', imgs: [['/work/plugin/02-launch-bound.jpg', '插件页：真活码、已检测到插件、关联好了']] },
  { t: '打开侧边栏，同意并开始记录', d: '点浏览器右上角的真活图标，打开侧边栏。上面是题目和剩余时间，中间说清楚会记什么。看完点「同意并开始记录」。', imgs: [['/work/plugin/03-panel-before.jpg', '侧边栏：还没开始记录，同意并开始记录', true]] },
  { t: '用自己的工具做，交付说明写在侧边栏', d: '在线文档、表格、设计工具、各家 AI 随你用。侧边栏一直显示剩余时间和记了多少，剩 5 分钟、1 分钟各提醒一次。交付物链接和说明写在侧边栏里，自动保存，答题页上也能看到同一份。', imgs: [['/work/plugin/04-panel-recording.jpg', '侧边栏：记录中、倒计时、交付说明', true], ['/work/plugin/05-answer-page.jpg', '答题页：真活码、记录状态、任务书与材料、交付说明']] },
  { t: '结束作答，等报告', d: '点侧边栏底下的「结束作答（交卷）」。时间到还没交，会自动交卷。交卷后记录停止，报告页自动打开，AI 一段一段回看你的过程，看完出报告。', imgs: [['/work/plugin/06-panel-submitted.jpg', '侧边栏：已交卷，AI 正在回看过程', true]] },
];

export default function PluginPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const sp = useSearchParams();
  const code = (sp.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const [ver, setVer] = useState('');
  const [installed, setInstalled] = useState<string | null>(null);   // 插件版本号；null = 没检测到
  const [task, setTask] = useState<any>(null);
  const [bound, setBound] = useState<Bound | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/downloads/zhenhuo-plugin.json').then(r => r.json()).then(j => setVer(j.version)).catch(() => {});
    // 插件装好后会在本页 <html> 上留一个标记
    const check = () => setInstalled(document.documentElement.dataset.zhenhuo || null);
    check(); const id = setInterval(check, 1500);
    const onMsg = (e: MessageEvent) => { if (e.source === window && e.data?.source === 'zhenhuo-ext' && (e.data.type === 'bound' || e.data.type === 'error')) { setBusy(false); setBound(e.data.type === 'error' ? { ok: false, error: e.data.error } : e.data); } };
    window.addEventListener('message', onMsg);
    return () => { clearInterval(id); window.removeEventListener('message', onMsg); };
  }, []);
  useEffect(() => { if (code) fetch(`/api/work/plugin/${code}`).then(r => r.json()).then(setTask).catch(() => setTask({ ok: false })); }, [code]);

  const bind = useCallback(() => { setBusy(true); setBound(null); window.postMessage({ source: 'zhenhuo-page', type: 'bind', code }, location.origin); setTimeout(() => setBusy(false), 8000); }, [code]);
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} };

  return (
    <div className="zp">
      <style>{CSS}</style>
      <div className="zp-top"><WorkLogo size="md" /><span>真活插件</span><Link href="/work" className="zp-toplink">真活首页</Link></div>

      {/* ── 启动：带着真活码来的 ── */}
      {code && (
        <section className="zp-launch">
          <div className="zp-in">
            <div className="zp-k">启动 · 关联这次作答</div>
            {task?.ok ? <h2>{task.task.title}<small>{task.task.company} · 建议 {task.task.time_minutes} 分钟{task.submitted ? ' · 已交卷' : ''}</small></h2> : task ? <h2 className="zp-bad">真活码 {code} 没找到：回答题页再点一次「去装插件 / 关联」</h2> : <h2>读取中…</h2>}
            <div className="zp-code"><span>真活码</span><b>{code}</b><button onClick={copy}>{copied ? '已复制' : '复制'}</button></div>
            {task?.ok && !task.submitted && (installed
              ? <div className="zp-act">
                  <button className="zp-btn" onClick={bind} disabled={busy}>{busy ? '关联中…' : bound?.ok ? '已关联 ✓' : '关联这次作答'}</button>
                  <span className="zp-ok">已检测到真活插件 v{installed}</span>
                </div>
              : <div className="zp-act"><a className="zp-btn" href="/downloads/zhenhuo-plugin.zip" download>先下载真活插件{ver ? ` v${ver}` : ''}</a><span className="zp-warn">还没检测到插件：按下面「三步装好」装完，刷新本页</span></div>)}
            {bound && (bound.ok
              ? <div className="zp-next"><b>关联好了。</b>点浏览器右上角的真活插件图标（在拼图图标里，可以把它固定在工具栏上），打开侧边栏，点「同意并开始记录」，然后就用你自己的工具做。交付说明在侧边栏里写，做完点「结束作答」。</div>
              : <div className="zp-bad">{bound.error || '关联失败，刷新本页再试'}</div>)}
            {!installed && <div className="zp-small">装好以后也可以不回这页：打开插件侧边栏，粘贴真活码 <b>{code}</b> 关联。</div>}
          </div>
        </section>
      )}

      {/* ── 首屏 ── */}
      <section className="zp-hero">
        <div className="zp-in">
          <div className="zp-k light">百业AI｜真活 · 第四种作答方式</div>
          <h1>用你自己的工具，<br /><em>做一道真活</em></h1>
          <p>在线文档、表格、设计工具、各家 AI，平时怎么干活，答题就怎么干。真活插件只在答题期间，记下你打开了什么、页面上出现了什么、写了多少。交卷后，AI 照着这份记录回看你是怎么做出来的。</p>
          <div className="zp-acts">
            <a className="zp-btn light" href="/downloads/zhenhuo-plugin.zip" download>下载真活插件{ver ? ` v${ver}` : ''}</a>
            <a className="zp-btn line" href="#install">三步装好 ↓</a>
          </div>
          <div className="zp-small light">支持 Chrome、Edge（以及基于 Chromium 的浏览器）。不用登录，不用注册。</div>
        </div>
      </section>

      {/* ── 三种作答方式 ── */}
      <section className="zp-sec">
        <div className="zp-in">
          <div className="zp-k">为什么要有插件</div>
          <h3>同一道真活，三种做法，出题人选</h3>
          <div className="zp-cols">
            {[
              ['站内操作台', '材料、编辑区、AI 都在答题页里。每一步自动记，最省事。', '工具只能用我们给的'],
              ['录屏上传', '用自己电脑上的软件做，浏览器录屏，最后上传文件。', '视频要抽帧给 AI 看，慢、贵、看不细'],
              ['真活插件', '用自己浏览器里的工具做；插件读的是页面上的文字，不是画面。', '比录屏轻，过程看得更细，连 AI 对话原文都在'],
            ].map(([t, d, n], i) => (
              <div key={t} className={`zp-col ${i === 2 ? 'hi' : ''}`}><b>{t}</b><p>{d}</p><span>{n}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 读什么 / 不读什么 ── */}
      <section className="zp-sec alt">
        <div className="zp-in">
          <div className="zp-k">读什么，不读什么</div>
          <h3>只在答题期间，只读屏幕上已经显示的东西</h3>
          <div className="zp-two">
            <div><b className="yes">会记</b><ul>
              <li>你打开、切换了哪些网页：网址的域名和页面标题</li>
              <li>这些页面上显示出来的文字，包括你在 AI 网站上和 AI 的对话</li>
              <li>打字、粘贴、复制了多少字</li>
              <li>什么时候切出了浏览器</li>
            </ul></div>
            <div><b className="no">不记</b><ul>
              <li>你按了哪些键、打的具体内容（只数字数）</li>
              <li>点「同意并开始记录」之前、交卷之后的任何东西</li>
              <li>浏览器以外的软件</li>
              <li>不点、不翻、不提交，不替你操作任何页面</li>
            </ul></div>
          </div>
          <div className="zp-note">开始记录前侧边栏会再说一遍，你点「同意并开始记录」才开始；中途可以暂停（暂停也会记在过程里）。交卷或时间到，自动停止。记录只用于这道题的过程评价，出题人在报告里看得到。</div>
        </div>
      </section>

      {/* ── 三步装好 ── */}
      <section className="zp-sec" id="install">
        <div className="zp-in">
          <div className="zp-k">三步装好</div>
          <h3>装一次，以后每道题都能用</h3>
          <ol className="zp-steps">
            <li><b>下载并解压</b><p>点「下载真活插件」，得到 zhenhuo-plugin.zip，双击解压，得到一个 zhenhuo 文件夹。</p><a className="zp-btn sm" href="/downloads/zhenhuo-plugin.zip" download>下载真活插件{ver ? ` v${ver}` : ''}</a></li>
            <li><b>打开扩展程序页</b><p>Chrome 在地址栏输入 <code>chrome://extensions</code>，Edge 输入 <code>edge://extensions</code>，打开「开发者模式」。</p></li>
            <li><b>加载插件</b><p>点「加载已解压的扩展程序」（英文界面是 Load unpacked），选中 zhenhuo 文件夹。工具栏上会出现紫色的真活图标，固定在工具栏上更方便。</p></li>
          </ol>
          <figure className="zp-shot wide"><img src="/work/plugin/00-extensions.jpg" alt="扩展程序页：打开开发者模式、加载已解压的扩展程序后，出现真活插件" /><figcaption>装好之后，扩展程序页里会出现「真活插件」。右上角「开发者模式」要打开。</figcaption></figure>
        </div>
      </section>

      {/* ── 四步做完一道题：一步一图（真实截图，2026-10-22 实测流程截的） ── */}
      <section className="zp-sec alt">
        <div className="zp-in">
          <div className="zp-k">四步做完一道题</div>
          <h3>答题页拿码，侧边栏记录，自己的工具干活</h3>
          <div className="zp-flow">
            {FLOW.map((f, i) => (
              <div key={f.t} className="zp-flow-row">
                <div className="zp-flow-txt"><span>{i + 1}</span><b>{f.t}</b><p>{f.d}</p></div>
                <div className="zp-flow-imgs">{f.imgs.map(([src, alt, tall]) => <figure key={src} className={`zp-shot ${tall ? 'tall' : ''}`}><img src={src} alt={alt} /></figure>)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="zp-sec">
        <div className="zp-in zp-faq">
          <div className="zp-k">常见问题</div>
          <details><summary>做下一道题要重装吗？</summary><p>不用。每道题有自己的真活码，来这一页点「关联这次作答」，或者在侧边栏粘贴新码就行。</p></details>
          <details><summary>可以用桌面版 Word / Excel 吗？</summary><p>插件只看得到浏览器里的网页。要用桌面软件，出题人可以选「录屏上传」，或者用站内操作台。</p></details>
          <details><summary>中途断网了怎么办？</summary><p>记录先存在你的浏览器里，联网后自动补传。</p></details>
          <details><summary>和数据外采篮是一个插件吗？</summary><p>不是。真活插件只用于答题，和数据部门的采集工具没有关系。</p></details>
        </div>
      </section>
      <div className="zp-foot">百业AI｜真活 · TRUE WORK, TRUE TALENT</div>
    </div>
  );
}

const CSS = `
.zp { --p: #6055f5; --ink: #1a1a2e; --ink2: #4a4f66; --ink3: #8a8fa3; --line: #e8e9f0; min-height: 100vh; background: #fff; color: var(--ink); font: 15px/1.75 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.zp-top { display: flex; align-items: center; gap: 12px; padding: 12px clamp(16px, 4vw, 28px); border-bottom: 1px solid var(--line); background: #fff; position: sticky; top: 0; z-index: 5; }
.zp-top > span { color: var(--ink3); font-size: 13px; } .zp-toplink { margin-left: auto; color: var(--p); font-size: 13px; }
.zp-in { max-width: 1040px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 28px); }
.zp-k { font-size: 12px; letter-spacing: 2px; color: var(--p); font-weight: 700; margin-bottom: 8px; } .zp-k.light { color: #c9c3ff; }
.zp-launch { background: #f6f4ff; border-bottom: 1px solid #e3e0ff; padding: 26px 0; }
.zp-launch h2 { font-size: clamp(20px, 2.6vw, 26px); margin: 0 0 12px; line-height: 1.35; } .zp-launch h2 small { display: block; font-size: 13.5px; color: var(--ink3); font-weight: 400; margin-top: 4px; }
.zp-code { display: inline-flex; align-items: center; gap: 12px; background: #fff; border: 1px solid #d8d4ff; border-radius: 12px; padding: 8px 10px 8px 14px; }
.zp-code span { font-size: 12px; color: var(--ink3); } .zp-code b { font: 800 26px/1 ui-monospace, Menlo, monospace; letter-spacing: 4px; color: var(--p); }
.zp-code button { border: 0; background: #eeecff; color: var(--p); border-radius: 8px; padding: 6px 12px; font-weight: 700; cursor: pointer; }
.zp-act { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 14px; }
.zp-btn { display: inline-block; border: 0; cursor: pointer; background: var(--p); color: #fff; font-weight: 700; padding: 12px 22px; border-radius: 12px; text-decoration: none; font-size: 15px; }
.zp-btn:disabled { opacity: .7; cursor: default; } .zp-btn.sm { padding: 8px 14px; font-size: 13.5px; margin-top: 6px; }
.zp-btn.light { background: #fff; color: #2b2670; } .zp-btn.line { background: transparent; color: #fff; border: 1.5px solid rgba(255,255,255,.6); }
.zp-ok { color: #237a45; font-size: 13.5px; } .zp-warn { color: #ad6800; font-size: 13.5px; } .zp-bad { color: #cf1322; }
.zp-next { margin-top: 14px; background: #fff; border: 1px solid #b7eb8f; border-radius: 12px; padding: 12px 14px; color: #33443a; max-width: 760px; }
.zp-small { font-size: 12.5px; color: var(--ink3); margin-top: 10px; } .zp-small.light { color: rgba(255,255,255,.7); }
.zp-hero { background: linear-gradient(135deg, #2b2463, #0f6c7a); color: #fff; padding: clamp(44px, 8vw, 84px) 0; }
.zp-hero h1 { font-size: clamp(30px, 5vw, 50px); line-height: 1.25; margin: 0 0 16px; font-weight: 900; } .zp-hero h1 em { font-style: normal; color: #7ee0c8; }
.zp-hero p { max-width: 680px; color: rgba(255,255,255,.88); font-size: clamp(15px, 1.4vw, 17px); margin: 0 0 24px; }
.zp-acts { display: flex; gap: 12px; flex-wrap: wrap; }
.zp-sec { padding: clamp(40px, 6vw, 64px) 0; } .zp-sec.alt { background: #f7f8fc; }
.zp-sec h3 { font-size: clamp(22px, 3vw, 30px); margin: 0 0 22px; line-height: 1.35; }
.zp-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.zp-col { border: 1px solid var(--line); border-radius: 14px; padding: 18px; background: #fff; } .zp-col b { font-size: 17px; } .zp-col p { color: var(--ink2); margin: 6px 0 8px; } .zp-col span { font-size: 13px; color: var(--ink3); }
.zp-col.hi { border: 2px solid var(--p); background: #faf9ff; } .zp-col.hi span { color: var(--p); font-weight: 700; }
.zp-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.zp-two > div { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; } .zp-two ul { margin: 6px 0 0; padding-left: 20px; color: var(--ink2); }
.zp-two b.yes { color: #237a45; } .zp-two b.no { color: #cf1322; }
.zp-note { margin-top: 16px; font-size: 14px; color: var(--ink2); border-left: 3px solid var(--p); padding: 8px 14px; background: #fff; border-radius: 0 10px 10px 0; }
.zp-steps { list-style: none; counter-reset: s; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.zp-steps li { counter-increment: s; border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; background: #fff; }
.zp-steps li::before { content: counter(s); display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--p); color: #fff; font-weight: 800; margin-bottom: 8px; }
.zp-steps b { display: block; font-size: 16px; } .zp-steps p { margin: 4px 0 0; color: var(--ink2); font-size: 14px; }
.zp-steps code { background: #f0f0f7; padding: 1px 6px; border-radius: 6px; font-size: 13px; }
.zp-shot { margin: 18px 0 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 8px 28px rgba(30,30,80,.08); }
.zp-shot img { display: block; width: 100%; height: auto; }
.zp-shot figcaption { font-size: 13px; color: var(--ink3); padding: 8px 12px; border-top: 1px solid var(--line); }
.zp-shot.wide { max-width: 900px; }
.zp-flow { display: grid; gap: 26px; }
.zp-flow-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: clamp(16px, 3vw, 36px); align-items: start; padding-bottom: 26px; border-bottom: 1px solid var(--line); }
.zp-flow-row:last-child { border-bottom: 0; }
.zp-flow-txt span { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--p); color: #fff; font-weight: 800; margin-bottom: 8px; }
.zp-flow-txt b { display: block; font-size: 18px; } .zp-flow-txt p { margin: 6px 0 0; color: var(--ink2); }
.zp-flow-imgs { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; } .zp-flow-imgs .zp-shot { margin: 0; flex: 1 1 320px; }
.zp-flow-imgs .zp-shot.tall { flex: 0 0 auto; width: min(260px, 100%); }
@media (max-width: 760px) { .zp-flow-row { grid-template-columns: 1fr; } }
.zp-faq details { border-bottom: 1px solid var(--line); padding: 12px 0; } .zp-faq summary { cursor: pointer; font-weight: 700; } .zp-faq p { margin: 6px 0 0; color: var(--ink2); }
.zp-foot { text-align: center; color: var(--ink3); font-size: 12px; padding: 28px 0 40px; letter-spacing: 2px; }
`;
