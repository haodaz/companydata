/**
 * 招聘平台适配：有些平台渲染出来的页面拿不全，换一条更可靠的路。
 *
 * - hotjob（wecruit.hotjob.cn，立讯、华泰等）：列表页能渲染出岗位名，但岗位卡片不是链接，
 *   详情页又会把渲染服务认成「旧版浏览器」只回一句提示——于是库里只有岗位名、没有职责要求。
 *   它前端用的列表 / 详情接口是公开的明文 JSON，直接调，每个岗位整理成一段「详情页」文本交给结构化。
 * - 飞书招聘（*.jobs.feishu.cn，蓝箭航天等）：列表一页只出 10 个、翻页靠按钮。
 *   改写成 /<站点>/position/list?current=1&limit=100，一次列全。
 * - 北森（*.zhiye.com，汇川、埃斯顿、东方雨虹、日丰、亚厦等大企业）：页面是 SPA，岗位接口 /api/Jobad/GetJobAdPageList
 *   是公开 JSON，直接带职责 / 要求 / 地点 / 学历；Category 1 社招 / 2 校招 / 3 实习。
 * - moka 不在这里：它的岗位接口返回的是加密数据（平台有意的反爬，不去破解），
 *   但把渲染请求改成 POST（见 fetcher.ts）之后，#/jobs、#/job/<id> 这些前端路由都能正常渲染。
 */

const HOTJOB = /(^|\.)hotjob\.cn$/i;
const FEISHU = /\.jobs\.feishu\.cn$/i;
const BEISEN = /\.zhiye\.com$/i;

export function atsOf(url: string): 'hotjob' | 'feishu' | 'moka' | 'beisen' | null {
  try {
    const h = new URL(url).hostname;
    if (HOTJOB.test(h)) return 'hotjob';
    if (BEISEN.test(h)) return 'beisen';
    if (FEISHU.test(h)) return 'feishu';
    if (/mokahr\.com$/i.test(h)) return 'moka';
  } catch { /* 不是合法网址 */ }
  return null;
}

/** 列表页的「一次列全」写法；不是已知平台就原样返回 */
export function listAllUrl(url: string): string {
  try {
    const u = new URL(url);
    if (FEISHU.test(u.hostname)) {
      const seg = u.pathname.split('/').filter(Boolean)[0] || 'index';
      if (/\/position\/\d+\/detail/.test(u.pathname)) return url; // 已经是单个岗位
      return `${u.origin}/${seg}/position/list?current=1&limit=100`;
    }
    // moka 老写法 / 手机版（/m/campus_apply/、/campus_apply/、/apply/<企业>/<项目>）只有宣传栏目或已停用，换成电脑版的岗位列表；
    // /apply/ 是老的社招写法
    const mm = /(^|\.)mokahr\.com$/i.test(u.hostname) && u.pathname.match(/^\/(?:m\/)?(?:(campus|social)_)?apply\/([^/]+)\/(\d+)/);
    if (mm && !/^#\/job\//.test(u.hash)) return `${u.origin}/${mm[1] || 'social'}-recruitment/${mm[2]}/${mm[3]}#/jobs`;
    // moka 招聘首页（#/ 或没有路由）只有企业介绍和宣传图，岗位列表在 #/jobs
    if (/(^|\.)mokahr\.com$/i.test(u.hostname) && /\/(campus|social)[-_]recruitment\//.test(u.pathname) && /^(#!?\/?)?$/.test(u.hash)) {
      u.hash = '#/jobs';
      return u.toString();
    }
  } catch { /* 原样 */ }
  return url;
}

/**
 * 需要先看一眼页面才能确定的列表地址：飞书招聘站根域名（infinigence.jobs.feishu.cn/）的站点路径不一定是 index，
 * 要从首页里读 website_path。其余情况等同 listAllUrl。
 */
export async function resolveListUrl(url: string): Promise<string> {
  try {
    const u = new URL(url);
    // 根地址或内推入口（/referral/…）：从首页读主站点路径。页面里的 "path" 是主站点（生数是 index、云启是 yunqijobs），
    // "website_path" 可能是另一个没岗位的入口（生数的 692892），只在没有主路径时兜底
    const first = u.pathname.split('/').filter(Boolean)[0];
    if (FEISHU.test(u.hostname) && (!first || first === 'referral')) {
      const html = await fetch(u.origin + '/', { signal: AbortSignal.timeout(15000) }).then(r => r.text());
      const seg = html.match(/(?<!website_)path\\?"\s*:\s*\\?"(?!https)([a-z0-9_-]+)/i)?.[1] || html.match(/website_path\\?"\s*:\s*\\?"([a-z0-9_-]+)/i)?.[1];
      if (seg) return `${u.origin}/${seg}/position/list?current=1&limit=100`;
    }
  } catch { /* 读不到就按默认写法 */ }
  return listAllUrl(url);
}

const strip = (v: unknown) => String(v ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

/** hotjob 并发打快了会直接断开连接（fetch failed），每个请求最多试 3 次、间隔递增 */
async function hotjobPost(origin: string, path: string, suite: string, form: Record<string, string>): Promise<any> {
  let last: any;
  for (let i = 0; i < 3; i++) {
    try { return await hotjobOnce(origin, path, suite, form); } catch (e) { last = e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
  throw last;
}

/**
 * 老版 hotjob 站点（faw-vw.hotjob.cn 这种）首页只是个跳转壳，内容装在 iframe 里，渲染服务拿到的是空白。
 * 它自己是调 /wecruit/common/getSLD 拿真实地址再跳过去的，这里照做。
 */
async function hotjobResolve(url: string): Promise<string> {
  if (/\/SU[0-9a-f]{16,}\//i.test(url)) return url;
  // /wt/<企业>/web/index 这类老入口多数会 302 到新站（纬创）：先跟一次跳转
  try {
    // 只读第一跳的 Location：自动跟随时连 wecruit 偶尔超时，而新站地址第一跳就给了
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36' } });
    const loc = r.headers.get('location') || '';
    if (/\/SU[0-9a-f]{16,}\//i.test(loc)) return new URL(loc, url).toString();
  } catch { /* 跟不过去就试 getSLD */ }
  try {
    const u = new URL(url);
    const r = await fetch(`${u.origin}/wecruit/common/getSLD`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `sld=${encodeURIComponent(u.host)}`, signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    const link = j?.data?.linkData?.link;
    if (typeof link === 'string' && /\/SU[0-9a-f]{16,}\//i.test(link)) return link;
  } catch { /* 解析不了就原样返回，交给渲染兜底 */ }
  return url;
}

async function hotjobOnce(origin: string, path: string, suite: string, form: Record<string, string>): Promise<any> {
  // 接口跟着站点自己的域名走：企业可能挂在 faw-zhaopin.hotjob.cn 这类自己的子域名上
  const r = await fetch(`${origin}/wecruit/positionInfo/${path}/SU${suite}?iSaJAx=isAjax&request_locale=zh_CN`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (String(j?.state) !== '200') throw new Error(`hotjob ${path} 返回 ${j?.state}`);
  return j.data;
}

/**
 * hotjob：调列表 + 详情接口，拼成 markdown（每个岗位一段 ### Source，链接是它真实的详情页）。
 * 页面是 school / index 取校招（recruitType=1），social 取社招（2）；范围是「全部」时两种都取。
 */
export async function hotjobMarkdown(rawUrl: string, scope: 'campus' | 'all'): Promise<{ markdown: string; count: number } | null> {
  const url = await hotjobResolve(rawUrl);
  const m = url.match(/\/SU([0-9a-f]{16,})\//i);
  if (!m) return null;
  const suite = m[1];
  const origin = new URL(url).origin;
  const page = (new URL(url).pathname.split('/').pop() || '').toLowerCase();
  // 页面本身就说明了是哪类：校招页只取校招、社招页只取社招；认不出的页面才看任务范围
  const types = page.startsWith('social') ? ['2'] : /^(school|campus|index|intern)/.test(page) ? ['1'] : scope === 'all' ? ['1', '2'] : ['1'];

  const rows: any[] = [];
  for (const t of types) {
    // hotjob 分页有个坑：第 1 页不管请求多大，固定按站点设置回（立讯 12、华泰 15）；
    // 从第 2 页起却按请求的 pageSize 算偏移——请求 50 的话第 13～50 条整段被跳过（华泰 105 个只拿到 70）。
    // 所以先看第 1 页实际回了几条，后面就用这个数当每页大小，偏移才对得上；只认总条数判断结束。
    const before = rows.length;
    let size = 50;
    for (let p = 1; p <= 200; p++) {
      const d = await hotjobPost(origin, 'listPosition', suite, { isFrompb: 'true', recruitType: t, pageSize: String(size), currentPage: String(p) });
      const list = d?.pageForm?.pageData || [];
      if (p === 1 && list.length) size = list.length;
      rows.push(...list.map((x: any) => ({ ...x, _type: t })));
      const total = Number(d?.pageForm?.dataCount ?? d?.positonNum ?? 0);
      if (!list.length || (total && rows.length - before >= total)) break;
    }
  }
  if (!rows.length) return { markdown: '', count: 0 };

  // 详情 3 个一组：并发再高 hotjob 会断开连接
  const details: any[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i += 3) {
    await Promise.all(rows.slice(i, i + 3).map(async (r, k) => {
      try { details[i + k] = await hotjobPost(origin, 'listPositionDetail', suite, { postId: r.postId }); } catch { details[i + k] = null; }
    }));
  }

  const blocks = rows.map((r, i) => {
    const d = details[i] || {};
    const link = `${origin}/SU${suite}/pb/posDetail.html?postId=${r.postId}&postType=${r._type}`;
    const lines = [
      `### Source: [${r.postName}](${link})`, '',
      `# ${r.postName}`,
      r._type === '2' ? '招聘类型：社会招聘' : `招聘类型：校园招聘${r.projectName ? `（${r.projectName}）` : ''}`,
      r.workTypeStr && `工作性质：${r.workTypeStr}`,
      r.postTypeName && `职位类别：${r.postTypeName}`,
      r.company && `所属：${r.company}`,
      (d.workPlaceStr || r.workPlaceStr) && `工作地点：${d.workPlaceStr || r.workPlaceStr}`,
      r.educationStr && `学历要求：${r.educationStr}`,
      r.workYears && `经验要求：${r.workYears}`,
      r.recruitNumStr && `招聘人数：${r.recruitNumStr}`,
      r.postCode && `岗位编号：${r.postCode}`,
      r.publishFirstDate && `发布时间：${r.publishFirstDate}`,
      r.endDate && `截止时间：${r.endDate}`,
      (d.subject || r.subject) && `专业要求：${strip(d.subject || r.subject)}`,
      d.workContent && `\n## 工作职责\n${strip(d.workContent)}`,
      d.serviceCondition && `\n## 任职要求\n${strip(d.serviceCondition)}`,
    ].filter(Boolean);
    return lines.join('\n');
  });
  return { markdown: blocks.join('\n\n'), count: rows.length };
}


// ─────────── 北森（zhiye.com）───────────
const BEISEN_KIND: Record<string, string> = { '1': '社会招聘', '2': '校园招聘', '3': '实习生招聘' };

/** 北森招聘站：一个站点的岗位全拉下来，每个岗位整理成一段「详情页」文本。scope=campus 只要校招 + 实习 */
export async function beisenMarkdown(url: string, scope: 'campus' | 'all'): Promise<{ markdown: string; count: number } | null> {
  let origin: string;
  try { origin = new URL(url).origin; } catch { return null; }
  const rows: any[] = [];
  for (let page = 0; page < 30; page++) {
    const body: Record<string, unknown> = { PageIndex: page, PageSize: 100, DisplayFields: ['Category', 'Kind', 'LocId', 'ClassificationOne'] };
    // 社招先不管：除非给的就是社招页，只拉校招 + 实习（东方雨虹这种站点社招上千个）
    if (scope === 'campus' || !/\/social/i.test(new URL(url).pathname)) body.Category = ['2', '3'];
    let data: any[] = [];
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(`${origin}/api/Jobad/GetJobAdPageList`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
        const j = await r.json();
        data = Array.isArray(j?.Data) ? j.Data : [];
        break;
      } catch (e) { if (i === 2) { if (page === 0) return null; data = []; } else await new Promise(r => setTimeout(r, 800 * (i + 1))); }
    }
    rows.push(...data);
    if (data.length < 100) break;
  }
  if (!rows.length) return null;
  const blocks = rows.map(r => {
    const cat = String(r.CategoryId || '');
    const link = `${origin}/${cat === '1' ? 'social' : 'campus'}/detail?jobAdId=${r.Id}`;
    const locs = Array.isArray(r.LocNames) ? r.LocNames.join('；') : (r.LocNames || '');
    const meta = [
      BEISEN_KIND[cat] || r.Category ? `招聘类型：${BEISEN_KIND[cat] || r.Category}` : '',
      locs ? `工作地点：${locs}` : '',
      r.ClassificationOne ? `职位类别：${r.ClassificationOne}` : '',
      r.Kind ? `工作性质：${r.Kind}` : '',
      r.Degree ? `学历要求：${r.Degree}` : '',
      r.HeadCount ? `招聘人数：${r.HeadCount}` : '',
      r.PostDate && !/^0001/.test(r.PostDate) ? `发布日期：${String(r.PostDate).slice(0, 10)}` : '',
      r.EndTime && !/^0001/.test(r.EndTime) ? `截止日期：${String(r.EndTime).slice(0, 10)}` : '',
      r.Org ? `所属组织：${r.Org}` : '',
    ].filter(Boolean).join('\n');
    return `### Source: [${r.JobAdName}](${link})\n\n# ${r.JobAdName}\n\n${meta}\n\n## 工作职责\n${strip(r.Duty)}\n\n## 任职要求\n${strip(r.Require)}\n`;
  });
  return { markdown: blocks.join('\n---\n'), count: rows.length };
}

/**
 * 同一个招聘站的「站点键」：北森 / hotjob 一次接口就拉全站，同站点的几个入口网址（首页、校招页、实习页、自定义页）
 * 抓一个就够；moka 按项目编号、飞书按站点路径区分。社招页单独算一个站点（抓取范围不同）。不是已知平台就返回网址本身。
 */
export function siteKey(url: string): string {
  try {
    const u = new URL(url);
    const social = /social/i.test(u.pathname + u.hash) ? ':social' : ':campus';
    switch (atsOf(url)) {
      case 'beisen': return `beisen:${u.host}${social}`;
      case 'hotjob': return `hotjob:${u.host}:${url.match(/SU([0-9a-f]{16,})/i)?.[1] || u.pathname.split('/').slice(0, 3).join('/')}${social}`;
      case 'feishu': return /\/position\/\d+\/detail/.test(u.pathname) ? url : `feishu:${u.host}:${u.pathname.split('/').filter(Boolean)[0] || 'index'}`;
      case 'moka': { const m = u.pathname.match(/\/(?:m\/)?(?:(?:campus|social)[-_])?(?:recruitment|apply)\/([^/]+)\/(\d+)/); return m && !/^#\/job\//.test(u.hash) ? `moka:${m[1]}:${m[2]}` : url; }
    }
  } catch { /* 原样 */ }
  return url;
}
