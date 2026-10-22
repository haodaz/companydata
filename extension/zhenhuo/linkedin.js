// 读本人 LinkedIn（2026-10-23 探索）：只开 linkedin.com/in/me/——LinkedIn 会跳到当前登录账号自己的主页，所以只能交本人的。
// 只读中间栏的名片、简介，再读经历 / 教育 / 技能等详情页；右栏「看过的人也看了」「你可能认识的人」这些别人的信息不读。读完关掉标签页。
const LI = 'https://www.linkedin.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DETAILS = [['experience', '工作经历'], ['education', '教育经历'], ['skills', '技能'], ['certifications', '资质认证'], ['projects', '项目'], ['languages', '语言'], ['honors', '荣誉奖项'], ['publications', '出版物']];

function waitLoaded(tabId, ms = 25000) {
  return new Promise(res => {
    const done = () => { chrome.tabs.onUpdated.removeListener(f); clearTimeout(t); res(); };
    const f = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const t = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(f);
  });
}

// 注入页面跑：滚到底让懒加载的版块出来，按 h2 标题挑版块
async function readProfile() {
  for (let i = 0; i < 10; i++) { window.scrollBy(0, 900); await new Promise(r => setTimeout(r, 400)); }
  window.scrollTo(0, 0);
  const main = document.querySelector('main'); if (!main) return null;
  const SELF = /^(Enhance with AI|Show recruiters|Share that you|Showcase your services|Tell non-profits|Get started|Add section|Enhance profile|Open to$|Add services|Verify|Contact info|\d+\s+connections|向招聘方|开始使用|添加版块|完善个人档案|联系方式)/i;
  const clean = t => t.split('\n').map(l => l.trim()).filter(l => l && !SELF.test(l)).join('\n');
  const hs = [...main.querySelectorAll('h2')];
  const out = {};
  hs.forEach((h, i) => {
    const name = (h.innerText || '').trim().split('\n')[0]; const s = h.closest('section'); if (!s) return;
    if (i === 0) out.card = clean(s.innerText);
    else if (/^(About|关于|简介)$/i.test(name)) out.about = clean(s.innerText.replace(/^(About|关于|简介)\s*/i, ''));
  });
  return out;
}
async function readDetail() {
  for (let i = 0; i < 8; i++) { window.scrollBy(0, 1000); await new Promise(r => setTimeout(r, 400)); }
  if (!/\/details\//.test(location.pathname)) return '';   // 没有这个版块时 LinkedIn 会跳回主页
  const SELF = /^(Enhance with AI|Show all|Edit|Add|添加|编辑|用 AI 完善)$/i;   // 只给本人看的按钮文字
  const s = document.querySelector('main section'); const t = (s?.innerText || '').split('\n').map(l => l.trim()).filter(l => l && !SELF.test(l)).join('\n');
  return /Nothing to see|暂无内容/i.test(t) ? '' : t;
}

async function readLinkedIn() {
  const tab = await chrome.tabs.create({ url: `${LI}/in/me/`, active: true });
  try {
    await waitLoaded(tab.id); await sleep(2500);
    const cur = await chrome.tabs.get(tab.id);
    const u = new URL(cur.url);
    if (/\/(login|authwall|checkpoint|signup|uas)/.test(u.pathname) || u.hostname !== 'www.linkedin.com') return { ok: false, error: '这个浏览器还没登录 LinkedIn：先登录你自己的账号，再点一次' };
    const m = u.pathname.match(/^\/in\/([^/]+)\/?/);
    if (!m || m[1] === 'me') return { ok: false, error: '没跳到你的主页，稍后再试一次' };
    const slug = decodeURIComponent(m[1]);
    const [p] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readProfile });
    const sections = [];
    if (p?.result?.card) sections.push({ key: 'card', label: '名片', text: p.result.card });
    if (p?.result?.about) sections.push({ key: 'about', label: '简介', text: p.result.about });
    for (const [key, label] of DETAILS) {
      await chrome.tabs.update(tab.id, { url: `${LI}/in/${encodeURIComponent(slug)}/details/${key}/` });
      await waitLoaded(tab.id); await sleep(1800);
      const [d] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readDetail }).catch(() => [null]);
      const text = d?.result || '';
      if (text.length > 20) sections.push({ key, label, text: text.slice(0, 12000) });
    }
    return { ok: true, slug, url: `${LI}/in/${slug}/`, sections, read_at: new Date().toISOString() };
  } catch (e) {
    return { ok: false, error: '读取中断：' + String(e?.message || e).slice(0, 120) };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}
