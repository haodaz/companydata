'use client';

/**
 * 真活插件：介绍 + 下载 + 启动（2026-10-22）。和「数据外采篮」是两个东西。
 * 每道选了「真活插件」的题都链到这一页：/work/plugin?code=<真活码>——装过插件就一键关联这次作答，没装就先装。
 * 给两种人看：候选人（装好、关联、开始记录）和投资人 / 出题人（为什么比录屏轻、读什么不读什么）。
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { WorkLogo } from '@/components/work/WorkLogo';
import { pick, type Lang } from '@/lib/work/i18n';

const LANG_KEY = 'work-plugin-lang';

type Bound = { ok: boolean; title?: string; error?: string; submitted?: boolean };

/** 四步做完一道题：每步配真实截图（[图, 说明, 是否竖长的侧边栏图]） */
const FLOW: { t: string; d: string; imgs: [string, string, boolean?][] }[] = [
  { t: '拿到真活码，去关联', d: '打开出任务的人发的参与链接，留个名字点「开始做」。答题页会给一个 6 位真活码，点「去装插件 / 关联」来到这一页，点「关联这次作答」。看到「已关联」就好。', imgs: [['/work/plugin/02-launch-bound.jpg', '插件页：真活码、已检测到插件、关联好了']] },
  { t: '打开侧边栏，同意并开始记录', d: '点浏览器右上角的真活图标，打开侧边栏。上面是题目和剩余时间，中间说清楚会记什么。看完点「同意并开始记录」。', imgs: [['/work/plugin/03-panel-before.jpg', '侧边栏：还没开始记录，同意并开始记录', true]] },
  { t: '用自己的工具做，交付说明写在侧边栏', d: '在线文档、表格、设计工具、各家 AI 随你用。侧边栏一直显示剩余时间和记了多少，剩 5 分钟、1 分钟各提醒一次。交付物链接和说明写在侧边栏里，自动保存，答题页上也能看到同一份。', imgs: [['/work/plugin/04-panel-recording.jpg', '侧边栏：记录中、倒计时、交付说明', true], ['/work/plugin/05-answer-page.jpg', '答题页：真活码、记录状态、任务书与材料、交付说明']] },
  { t: '结束作答，等报告', d: '点侧边栏底下的「结束作答（交卷）」。时间到还没交，会自动交卷。交卷后记录停止，报告页自动打开，AI 一段一段回看你的过程，看完出报告。', imgs: [['/work/plugin/06-panel-submitted.jpg', '侧边栏：已交卷，AI 正在回看过程', true]] },
];
/** FLOW 的英文版（?lang=en）：顺序、截图和 FLOW 一一对应 */
const FLOW_EN: typeof FLOW = [
  { t: 'Get your work code and link it', d: 'Open the link you were sent, enter your name and click "Start". The task page shows a 6-character work code. Click "Install / link the extension" to come to this page, then click "Link this attempt". Once you see "Linked", you\'re set.', imgs: [['/work/plugin/02-launch-bound.jpg', 'Extension page: work code, extension detected, attempt linked']] },
  { t: 'Open the sidebar, agree and start recording', d: 'Click the True Work icon at the top right of your browser to open the sidebar. The task and time left are at the top; the middle explains exactly what gets recorded. Once you\'ve read it, click "Agree and start recording".', imgs: [['/work/plugin/03-panel-before.jpg', 'Sidebar: not recording yet, "Agree and start recording"', true]] },
  { t: 'Work with your own tools; write your hand-in notes in the sidebar', d: 'Use any online docs, spreadsheets, design tools or AI assistants you like. The sidebar always shows the time left and how much has been recorded, with reminders at 5 minutes and 1 minute left. Put your deliverable links and notes in the sidebar. They save automatically and also show up on the task page.', imgs: [['/work/plugin/04-panel-recording.jpg', 'Sidebar: recording, countdown, hand-in notes', true], ['/work/plugin/05-answer-page.jpg', 'Task page: work code, recording status, brief and materials, hand-in notes']] },
  { t: 'Finish and wait for your report', d: 'Click "Finish and submit" at the bottom of the sidebar. If time runs out before you submit, it submits automatically. Recording stops when you submit and the report page opens. AI goes back over your process step by step, then writes the report.', imgs: [['/work/plugin/06-panel-submitted.jpg', 'Sidebar: submitted, AI is reviewing your process', true]] },
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
  // 语言：URL ?lang=en 优先，其次本机记住的选择，默认中文
  const urlLang = sp.get('lang');
  const [lang, setLang] = useState<Lang>(urlLang === 'en' ? 'en' : 'zh');
  const L = (zh: string, en: string) => pick(lang, zh, en);
  const zhDoc = useRef<{ title: string; lang: string } | null>(null);
  useEffect(() => { if (urlLang === 'en' || urlLang === 'zh') return; try { if (localStorage.getItem(LANG_KEY) === 'en') setLang('en'); } catch {} }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!zhDoc.current) zhDoc.current = { title: document.title, lang: document.documentElement.lang };
    document.title = lang === 'en' ? 'Work-sample extension · Baiye AI · True Work' : zhDoc.current.title;
    document.documentElement.lang = lang === 'en' ? 'en' : zhDoc.current.lang;
  }, [lang]);
  const switchLang = () => {
    const next: Lang = lang === 'en' ? 'zh' : 'en';
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch {}
    const u = new URL(location.href);
    if (next === 'en') u.searchParams.set('lang', 'en'); else u.searchParams.delete('lang');
    history.replaceState(history.state, '', u.toString());
  };

  useEffect(() => {
    fetch('/downloads/zhenhuo-plugin.json').then(r => r.json()).then(j => setVer(j.version)).catch(() => {});
    // 插件装好后会回 pong（0.1.0 的老版本在 <html> 上留标记）
    const check = () => { window.postMessage({ source: 'zhenhuo-page', type: 'ping' }, location.origin); if (document.documentElement.dataset.zhenhuo) setInstalled(document.documentElement.dataset.zhenhuo); };
    check(); const id = setInterval(check, 1500);
    const onMsg = (e: MessageEvent) => { if (e.source === window && e.data?.source === 'zhenhuo-ext' && e.data.type === 'pong') setInstalled(e.data.version || '0'); if (e.source === window && e.data?.source === 'zhenhuo-ext' && (e.data.type === 'bound' || e.data.type === 'error')) { setBusy(false); setBound(e.data.type === 'error' ? { ok: false, error: e.data.error } : e.data); } };
    window.addEventListener('message', onMsg);
    return () => { clearInterval(id); window.removeEventListener('message', onMsg); };
  }, []);
  useEffect(() => { if (code) fetch(`/api/work/plugin/${code}`).then(r => r.json()).then(setTask).catch(() => setTask({ ok: false })); }, [code]);

  const bind = useCallback(() => { setBusy(true); setBound(null); window.postMessage({ source: 'zhenhuo-page', type: 'bind', code }, location.origin); setTimeout(() => setBusy(false), 8000); }, [code]);
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} };

  return (
    <div className="zp">
      <style>{CSS}</style>
      <div className="zp-top"><WorkLogo size="md" /><span>{L('真活插件', 'Work-sample extension')}</span><Link href="/work/about" className="zp-toplink">{L('关于真活', 'About True Work')}</Link><button className="zp-lang" onClick={switchLang} title={L('切换语言', 'Switch language')}>{lang === 'en' ? '中文' : 'EN'}</button></div>

      {/* ── 启动：带着真活码来的 ── */}
      {code && (
        <section className="zp-launch">
          <div className="zp-in">
            <div className="zp-k">{L('启动 · 关联这次作答', 'Get started · Link this attempt')}</div>
            {task?.ok ? <h2>{task.task.title}<small>{task.task.company} · {lang === 'en' ? `${task.deadline ? 'Time limit' : 'Suggested time'}: ${task.task.time_minutes} min${task.submitted ? ' · Submitted' : ''}` : <>{task.deadline ? '限时' : '建议'} {task.task.time_minutes} 分钟{task.submitted ? ' · 已交卷' : ''}</>}</small></h2> : task ? <h2 className="zp-bad">{lang === 'en' ? <>Work code {code} wasn&apos;t found. Go back to the task page and click &quot;Install / link the extension&quot; again.</> : <>真活码 {code} 没找到：回答题页再点一次「去装插件 / 关联」</>}</h2> : <h2>{L('读取中…', 'Loading…')}</h2>}
            <div className="zp-code"><span>{L('真活码', 'Work code')}</span><b>{code}</b><button onClick={copy}>{copied ? L('已复制', 'Copied') : L('复制', 'Copy')}</button></div>
            {task?.ok && !task.submitted && (installed
              ? <div className="zp-act">
                  <button className="zp-btn" onClick={bind} disabled={busy}>{busy ? L('关联中…', 'Linking…') : bound?.ok ? L('已关联 ✓', 'Linked ✓') : L('关联这次作答', 'Link this attempt')}</button>
                  <span className="zp-ok">{L('已检测到真活插件 v', 'Work-sample extension detected: v')}{installed}</span>
                </div>
              : <div className="zp-act"><a className="zp-btn" href="/downloads/zhenhuo-plugin.zip" download>{L('先下载真活插件', 'Download the extension first')}{ver ? ` v${ver}` : ''}</a><span className="zp-warn">{L('还没检测到插件：按下面「三步装好」装完，刷新本页', 'Extension not detected yet. Follow "Set up in three steps" below, then refresh this page.')}</span></div>)}
            {bound && (bound.ok
              ? <div className="zp-next">{lang === 'en' ? <><b>You&apos;re linked.</b> Click the True Work icon at the top right of your browser (it&apos;s under the puzzle-piece Extensions icon; you can pin it to the toolbar) to open the sidebar. Click &quot;Agree and start recording&quot;, then work with your own tools. Write your hand-in notes in the sidebar, and click &quot;Finish and submit&quot; when you&apos;re done.</> : <><b>关联好了。</b>点浏览器右上角的真活插件图标（在拼图图标里，可以把它固定在工具栏上），打开侧边栏，点「同意并开始记录」，然后就用你自己的工具做。交付说明在侧边栏里写，做完点「结束作答」。</>}</div>
              : <div className="zp-bad">{bound.error || L('关联失败，刷新本页再试', 'Linking failed. Refresh this page and try again.')}</div>)}
            {!installed && <div className="zp-small">{lang === 'en' ? <>Once it&apos;s installed, you don&apos;t have to come back here: open the extension sidebar and paste the work code <b>{code}</b> to link.</> : <>装好以后也可以不回这页：打开插件侧边栏，粘贴真活码 <b>{code}</b> 关联。</>}</div>}
          </div>
        </section>
      )}

      {/* ── 首屏 ── */}
      <section className="zp-hero">
        <div className="zp-in">
          <div className="zp-k light">{L('百业AI｜真活 · 第四种作答方式', 'Baiye AI · True Work · The fourth way to answer')}</div>
          {lang === 'en' ? <h1>Use your own tools<br /><em>to do real work</em></h1> : <h1>用你自己的工具，<br /><em>做一道真活</em></h1>}
          <p>{L('在线文档、表格、设计工具、各家 AI，平时怎么干活，答题就怎么干。真活插件只在答题期间，记下你打开了什么、页面上出现了什么、写了多少。交卷后，AI 照着这份记录回看你是怎么做出来的。', 'Online docs, spreadsheets, design tools, any AI: work on the task the way you normally work. Only while you\'re on the task, the work-sample extension notes what you opened, what appeared on those pages and how much you wrote. After you submit, AI uses that record to look back at how you got to your result.')}</p>
          <div className="zp-acts">
            <a className="zp-btn light" href="/downloads/zhenhuo-plugin.zip" download>{L('下载真活插件', 'Download the extension')}{ver ? ` v${ver}` : ''}</a>
            <a className="zp-btn line" href="#install">{L('三步装好 ↓', 'Set up in three steps ↓')}</a>
          </div>
          <div className="zp-small light">{L('支持 Chrome、Edge（以及基于 Chromium 的浏览器）。不用登录，不用注册。', 'Works with Chrome, Edge and other Chromium-based browsers. No login, no sign-up.')}</div>
        </div>
      </section>

      {/* ── 三种作答方式 ── */}
      <section className="zp-sec">
        <div className="zp-in">
          <div className="zp-k">{L('为什么要有插件', 'Why an extension')}</div>
          <h3>{L('同一道真活，三种做法，出任务的人选', 'One task, three ways to do it: the person who set the task picks one')}</h3>
          <div className="zp-cols">
            {(lang === 'en' ? [
              ['On-site workbench', 'Materials, editor and AI are all on the task page. Every step is recorded automatically. The easiest option.', 'You can only use the tools we provide'],
              ['Screen recording upload', 'Work in software on your own computer, record your screen in the browser, then upload the file.', 'AI has to sample frames from the video: slow, costly and low on detail'],
              ['Work-sample extension', 'Work with the tools in your own browser. The extension reads the text on the page, not the picture.', 'Lighter than screen recording and more detailed, down to the full text of your AI chats'],
            ] : [
              ['站内操作台', '材料、编辑区、AI 都在答题页里。每一步自动记，最省事。', '工具只能用我们给的'],
              ['录屏上传', '用自己电脑上的软件做，浏览器录屏，最后上传文件。', '视频要抽帧给 AI 看，慢、贵、看不细'],
              ['真活插件', '用自己浏览器里的工具做；插件读的是页面上的文字，不是画面。', '比录屏轻，过程看得更细，连 AI 对话原文都在'],
            ]).map(([t, d, n], i) => (
              <div key={t} className={`zp-col ${i === 2 ? 'hi' : ''}`}><b>{t}</b><p>{d}</p><span>{n}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 读什么 / 不读什么 ── */}
      <section className="zp-sec alt">
        <div className="zp-in">
          <div className="zp-k">{L('读什么，不读什么', 'What is and isn\'t recorded')}</div>
          <h3>{L('只在答题期间，只读屏幕上已经显示的东西', 'Only while you\'re on the task, and only what\'s already shown on screen')}</h3>
          <div className="zp-two">
            {lang === 'en' ? <div><b className="yes">Recorded</b><ul>
              <li>Which web pages you open and switch between: the site&apos;s domain and the page title</li>
              <li>The text shown on those pages, including your conversations on AI sites</li>
              <li>How many characters you type, paste and copy</li>
              <li>When you switch away from the browser</li>
              <li>(Optional, only if you turn it on) A screenshot every 10 seconds of the screen or window you choose, so apps outside the browser like Photoshop, Excel or a local AI are visible too. No video, no audio.</li>
            </ul></div> : <div><b className="yes">会记</b><ul>
              <li>你打开、切换了哪些网页：网址的域名和页面标题</li>
              <li>这些页面上显示出来的文字，包括你在 AI 网站上和 AI 的对话</li>
              <li>打字、粘贴、复制了多少字</li>
              <li>什么时候切出了浏览器</li>
              <li>（选填，你点了才有）每 10 秒一张你选的屏幕或窗口截图：PS、Excel、本地 AI 这些浏览器外的软件也看得到；不录视频、不录声音</li>
            </ul></div>}
            {lang === 'en' ? <div><b className="no">Not recorded</b><ul>
              <li>Which keys you press or exactly what you type (only the character count)</li>
              <li>Anything before you click &quot;Agree and start recording&quot; or after you submit</li>
              <li>Apps outside the browser (unless you turn on &quot;Also record your whole screen&quot; yourself)</li>
              <li>It never clicks, scrolls or submits anything, and never operates any page for you</li>
            </ul></div> : <div><b className="no">不记</b><ul>
              <li>你按了哪些键、打的具体内容（只数字数）</li>
              <li>点「同意并开始记录」之前、交卷之后的任何东西</li>
              <li>浏览器以外的软件（除非你自己打开「也记录整个屏幕」）</li>
              <li>不点、不翻、不提交，不替你操作任何页面</li>
            </ul></div>}
          </div>
          <div className="zp-note">{L('开始记录前侧边栏会再说一遍，你点「同意并开始记录」才开始；中途可以暂停（暂停也会记在过程里）。交卷或时间到，自动停止。记录只用于这道题的过程评价，出任务的人在报告里看得到。', 'The sidebar explains this again before recording starts, and nothing is recorded until you click "Agree and start recording". You can pause along the way (pauses also show up in the record). Recording stops automatically when you submit or time runs out. The record is used only to assess your process on this task, and the person who set the task can see it in the report.')}</div>
        </div>
      </section>

      {/* ── 三步装好 ── */}
      <section className="zp-sec" id="install">
        <div className="zp-in">
          <div className="zp-k">{L('三步装好', 'Set up in three steps')}</div>
          <h3>{L('装一次，以后每道题都能用', 'Install once, use it for every task')}</h3>
          {lang === 'en' ? <ol className="zp-steps">
            <li><b>Download and unzip</b><p>Click &quot;Download the extension&quot; to get zhenhuo-plugin.zip. Double-click to unzip it and you&apos;ll get a folder called zhenhuo.</p><a className="zp-btn sm" href="/downloads/zhenhuo-plugin.zip" download>Download the extension{ver ? ` v${ver}` : ''}</a></li>
            <li><b>Open the Extensions page</b><p>In Chrome, type <code>chrome://extensions</code> in the address bar; in Edge, type <code>edge://extensions</code>. Turn on &quot;Developer mode&quot;.</p></li>
            <li><b>Load the extension</b><p>Click &quot;Load unpacked&quot; and select the zhenhuo folder. A purple True Work icon appears in the toolbar (under the puzzle-piece Extensions icon). Pin it to the toolbar so it&apos;s easy to reach.</p></li>
          </ol> : <ol className="zp-steps">
            <li><b>下载并解压</b><p>点「下载真活插件」，得到 zhenhuo-plugin.zip，双击解压，得到一个 zhenhuo 文件夹。</p><a className="zp-btn sm" href="/downloads/zhenhuo-plugin.zip" download>下载真活插件{ver ? ` v${ver}` : ''}</a></li>
            <li><b>打开扩展程序页</b><p>Chrome 在地址栏输入 <code>chrome://extensions</code>，Edge 输入 <code>edge://extensions</code>，打开「开发者模式」。</p></li>
            <li><b>加载插件</b><p>点「加载已解压的扩展程序」（英文界面是 Load unpacked），选中 zhenhuo 文件夹。工具栏上会出现紫色的真活图标，固定在工具栏上更方便。</p></li>
          </ol>}
          <figure className="zp-shot wide"><img src="/work/plugin/00-extensions.jpg" alt={L('扩展程序页：打开开发者模式、加载已解压的扩展程序后，出现真活插件', 'Extensions page: with Developer mode on and the extension loaded via Load unpacked, the work-sample extension appears')} /><figcaption>{L('装好之后，扩展程序页里会出现「真活插件」。右上角「开发者模式」要打开。', 'Once installed, the work-sample extension (真活插件) shows up on the Extensions page. Make sure "Developer mode" at the top right is on.')}</figcaption></figure>
        </div>
      </section>

      {/* ── 四步做完一道题：一步一图（真实截图，2026-10-22 实测流程截的） ── */}
      <section className="zp-sec alt">
        <div className="zp-in">
          <div className="zp-k">{L('四步做完一道题', 'Four steps to finish a task')}</div>
          <h3>{L('答题页拿码，侧边栏记录，自己的工具干活', 'Get the code on the task page, record in the sidebar, work in your own tools')}</h3>
          <div className="zp-flow">
            {(lang === 'en' ? FLOW_EN : FLOW).map((f, i) => (
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
          <div className="zp-k">{L('常见问题', 'FAQ')}</div>
          {lang === 'en' ? <>
            <details><summary>Do I need to reinstall it for my next task?</summary><p>No. Each task has its own work code. Come to this page and click &quot;Link this attempt&quot;, or paste the new code into the sidebar.</p></details>
            <details><summary>Can I use desktop Word or Excel?</summary><p>The extension can only see web pages in your browser. For desktop software, the person who set the task can choose &quot;Screen recording upload&quot; or the on-site workbench instead.</p></details>
            <details><summary>What if my internet drops partway through?</summary><p>The record is saved in your browser first and uploads automatically once you&apos;re back online.</p></details>
            <details><summary>Is this the same extension as the data collection basket?</summary><p>No. The work-sample extension is only for doing tasks and has nothing to do with the data team&apos;s collection tool.</p></details>
          </> : <>
          <details><summary>做下一道题要重装吗？</summary><p>不用。每道题有自己的真活码，来这一页点「关联这次作答」，或者在侧边栏粘贴新码就行。</p></details>
          <details><summary>可以用桌面版 Word / Excel 吗？</summary><p>插件只看得到浏览器里的网页。要用桌面软件，出任务的人可以选「录屏上传」，或者用站内操作台。</p></details>
          <details><summary>中途断网了怎么办？</summary><p>记录先存在你的浏览器里，联网后自动补传。</p></details>
          <details><summary>和数据外采篮是一个插件吗？</summary><p>不是。真活插件只用于答题，和数据部门的采集工具没有关系。</p></details>
          </>}
        </div>
      </section>
      <div className="zp-foot">{L('百业AI｜真活 · TRUE WORK, TRUE TALENT', 'BAIYE AI · TRUE WORK, TRUE TALENT')}</div>
    </div>
  );
}

const CSS = `
.zp { --p: #6055f5; --ink: #1a1a2e; --ink2: #4a4f66; --ink3: #8a8fa3; --line: #e8e9f0; min-height: 100vh; background: #fff; color: var(--ink); font: 15px/1.75 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.zp-top { display: flex; align-items: center; gap: 12px; padding: 12px clamp(16px, 4vw, 28px); border-bottom: 1px solid var(--line); background: #fff; position: sticky; top: 0; z-index: 5; }
.zp-top > span { color: var(--ink3); font-size: 13px; } .zp-toplink { margin-left: auto; color: var(--p); font-size: 13px; }
.zp-lang { border: 1px solid var(--line); background: #fff; color: var(--ink2); border-radius: 8px; padding: 3px 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
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
