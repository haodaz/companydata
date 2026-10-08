/**
 * 招聘平台适配：有些平台渲染出来的页面拿不全，换一条更可靠的路。
 *
 * - hotjob（wecruit.hotjob.cn，立讯、华泰等）：列表页能渲染出岗位名，但岗位卡片不是链接，
 *   详情页又会把渲染服务认成「旧版浏览器」只回一句提示——于是库里只有岗位名、没有职责要求。
 *   它前端用的列表 / 详情接口是公开的明文 JSON，直接调，每个岗位整理成一段「详情页」文本交给结构化。
 * - 飞书招聘（*.jobs.feishu.cn，蓝箭航天等）：列表一页只出 10 个、翻页靠按钮。
 *   改写成 /<站点>/position/list?current=1&limit=100，一次列全。
 * - moka 不在这里：它的岗位接口返回的是加密数据（平台有意的反爬，不去破解），
 *   但把渲染请求改成 POST（见 fetcher.ts）之后，#/jobs、#/job/<id> 这些前端路由都能正常渲染。
 */

const HOTJOB = /(^|\.)hotjob\.cn$/i;
const FEISHU = /\.jobs\.feishu\.cn$/i;

export function atsOf(url: string): 'hotjob' | 'feishu' | 'moka' | null {
  try {
    const h = new URL(url).hostname;
    if (HOTJOB.test(h)) return 'hotjob';
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
  } catch { /* 原样 */ }
  return url;
}

const strip = (v: unknown) => String(v ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

/** hotjob 并发打快了会直接断开连接（fetch failed），每个请求最多试 3 次、间隔递增 */
async function hotjobPost(path: string, suite: string, form: Record<string, string>): Promise<any> {
  let last: any;
  for (let i = 0; i < 3; i++) {
    try { return await hotjobOnce(path, suite, form); } catch (e) { last = e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
  throw last;
}

async function hotjobOnce(path: string, suite: string, form: Record<string, string>): Promise<any> {
  const r = await fetch(`https://wecruit.hotjob.cn/wecruit/positionInfo/${path}/SU${suite}?iSaJAx=isAjax&request_locale=zh_CN`, {
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
export async function hotjobMarkdown(url: string, scope: 'campus' | 'all'): Promise<{ markdown: string; count: number } | null> {
  const m = url.match(/\/SU([0-9a-f]{16,})\//i);
  if (!m) return null;
  const suite = m[1];
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
      const d = await hotjobPost('listPosition', suite, { isFrompb: 'true', recruitType: t, pageSize: String(size), currentPage: String(p) });
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
      try { details[i + k] = await hotjobPost('listPositionDetail', suite, { postId: r.postId }); } catch { details[i + k] = null; }
    }));
  }

  const blocks = rows.map((r, i) => {
    const d = details[i] || {};
    const link = `https://wecruit.hotjob.cn/SU${suite}/pb/posDetail.html?postId=${r.postId}&postType=${r._type}`;
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
