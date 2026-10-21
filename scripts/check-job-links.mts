/**
 * 岗位链接检测（数据部门 10-21 岗位反馈：投递入口打开后不存在、链接指向第三方新闻稿——御风未来 skyfamily.com.cn、潞晨 Moka 打不开）。
 * 写 jobs.link_status / link_issue / link_checked_at：
 *   ok 能打开且页面上找得到岗位名 | dead 打不开 / 404 / 页面提示已下线 | blocked 对方挡机器（真人可能能打开）| third_party 指向资讯站不是招聘页 | suspect 能打开但页面上找不到岗位名
 * 两步：
 *   1. 直接请求（--stage http）：所有链接，打不开 / 404 / 资讯站先挑出来；招聘系统（Moka / 北森 / Hotjob…）的页面是脚本加载的空壳，这一步只记「待渲染」
 *   2. 本机 Chrome 打开（--stage render）：招聘系统的页面，看岗位名在不在、有没有「职位已下线」
 *   npx tsx scripts/check-job-links.mts --stage http|render [--only <上轮状态>] [--par 8] [--limit N] [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { renderMarkdown, localRenderAvailable } = await import('@/lib/agents/local-render');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const STAGE = opt('stage', 'http'), PAR = Number(opt('par', STAGE === 'render' ? '4' : '8')), LIMIT = Number(opt('limit', '0')), APPLY = process.argv.includes('--apply');

/** 脚本加载的招聘系统：直接请求只拿到空壳 */
const SPA = /(^|\.)(mokahr\.com|zhiye\.com|hotjob\.cn|feishu\.cn|jobs\.bytedance\.com|dayee\.com|myworkdayjobs\.com|italent\.cn|beisen\.com|wintalent\.cn|nowcoder\.com|job\.tal\.com|talent\.baidu\.com|campus\.jd\.com|careers\.tencent\.com|join\.qq\.com|zhaopin\.meituan\.com|campus\.alibaba\.com|talent\.alibaba\.com|xiaomi\.jobs\.f\.mioffice\.cn)$/i;
/** 资讯 / 新闻 / 自媒体站：不是招聘页（御风未来指到 skyfamily.com.cn 新闻稿） */
const NEWS = /(^|\.)(skyfamily\.com\.cn|sohu\.com|sina\.com\.cn|sina\.cn|163\.com|qq\.com|toutiao\.com|baijiahao\.baidu\.com|zhihu\.com|weibo\.com|thepaper\.cn|ifeng\.com|36kr\.com|huxiu\.com|cnstock\.com|eastmoney\.com|xinhuanet\.com|people\.com\.cn|chinadaily\.com\.cn|cctv\.com|bilibili\.com|douyin\.com|xiaohongshu\.com|jiemian\.com|yicai\.com|caixin\.com|stcn\.com|cls\.cn)$/i;
const JOB_HOST_OK = /(^|\.)(mp\.weixin\.qq\.com|join\.qq\.com|careers\.tencent\.com)$|^(jobs?|careers?|campus|hr|zhaopin|talent|join|recruit(ment)?|xiaoyuan)[.-]/i;   // 公众号招聘推文、各家自己的招聘站（job.xiaohongshu.com）不算资讯站
const GONE = /职位不存在|职位已下线|职位已关闭|职位已失效|职位已过期|该职位已|岗位已下线|岗位不存在|岗位已关闭|岗位已失效|已停止招聘|招聘已结束|页面不存在|页面已删除|找不到页面|无法找到该页面|404 not found|page not found|job (is )?no longer available|position (has been )?(filled|closed)|this job (has )?expired|job not found/i;
const BLOCK = /验证码|安全验证|人机验证|访问过于频繁|请完成验证|captcha|are you a robot|access denied|cloudflare/i;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';
const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const nameHit = (name: string, text: string) => {
  const t = text.replace(/\s+/g, '').toLowerCase();
  const n = String(name || '').replace(/[（(][^）)]*[）)]|\s+/g, '').toLowerCase();
  return n.length >= 2 && (t.includes(n) || t.includes(n.slice(0, Math.min(8, n.length))));
};

async function httpCheck(url: string): Promise<{ status: string; issue: string; text?: string }> {
  const h = hostOf(url);
  if (!h) return { status: 'dead', issue: '链接格式不对' };
  const jobPath = /\/(careers?|jobs?|campus|join|zhaopin|recruit)(\/|\?|#|$)/i.test(url);   // 资讯站自己的招聘页（zhihu.com/careers）
  if (NEWS.test(h) && !JOB_HOST_OK.test(h) && !jobPath) return { status: 'third_party', issue: `指向资讯站（${h}），不是招聘页` };
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' } });
    const final = hostOf(res.url);
    if (final && NEWS.test(final) && !JOB_HOST_OK.test(final) && !jobPath) return { status: 'third_party', issue: `跳到资讯站（${final}）` };
    if (res.status === 404 || res.status === 410) return { status: 'dead', issue: `打开是 ${res.status}` };
    if (res.status === 403 || res.status === 429 || res.status === 503) return { status: 'blocked', issue: `对方挡了机器访问（${res.status}），真人可能能打开` };
    if (res.status >= 400) return { status: 'dead', issue: `打开出错（${res.status}）` };
    const text = (await res.text()).slice(0, 300_000).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
    if (BLOCK.test(text) && text.length < 20_000) return { status: 'blocked', issue: '对方要验证 / 挡了机器访问' };
    if (GONE.test(text)) return { status: 'dead', issue: '页面提示岗位已下线 / 不存在' };
    // 页面上没几个字：脚本加载的招聘页空壳（job.xiaohongshu.com），留给浏览器打开
    if (text.replace(/\s+/g, '').length < 800) return { status: 'pending_render', issue: '页面是脚本加载的，要用浏览器打开才看得出' };
    return { status: 'ok', issue: '', text };
  } catch (e: any) {
    const m = String(e?.cause?.code || e?.message || e);
    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|CERT|certificate/i.test(m)) return { status: 'dead', issue: `网站打不开（${m.slice(0, 40)}）` };
    return { status: 'blocked', issue: `超时 / 连接被断开（${m.slice(0, 40)}）` };
  }
}

async function renderCheck(url: string, name: string): Promise<{ status: string; issue: string }> {
  // 北森这类页面加载慢：读不到先等等再读一次；还读不到也不算打不开（国轩 10-21 实测页面是好的），标 suspect 待复查
  let md = await renderMarkdown(url);
  if (!md || md.split('\n## 页面链接')[0].length < 400) { await new Promise(r => setTimeout(r, 4000)); md = (await renderMarkdown(url)) || md; }
  if (!md) return { status: 'suspect', issue: '浏览器读不到内容（可能加载慢，待复查）' };
  const body = md.split('\n## 页面链接')[0];
  if (BLOCK.test(body) && body.length < 3000) return { status: 'blocked', issue: '对方要验证' };
  if (GONE.test(body)) return { status: 'dead', issue: '页面提示岗位已下线 / 不存在' };
  if (!nameHit(name, body)) return { status: 'suspect', issue: '能打开，但页面上找不到这个岗位名（可能已下线或跳到了列表页）' };
  return { status: 'ok', issue: '' };
}

const { data } = await selectAll(() => db.from('jobs').select('id, name, link, application_website, link_status, link_issue').not('if_delete', 'is', true).order('id'));
let jobs = (data as any[]).filter(j => j.link || j.application_website);
// --only <状态>：只重查上一轮是这个状态的（规则改了以后复查，如 third_party 误判了各家自己的招聘站）
if (opt('only')) jobs = jobs.filter(j => j.link_status === opt('only'));
if (STAGE === 'render') {
  if (!localRenderAvailable()) { console.error('这台机器没有本机 Chrome，跑不了 render'); process.exit(1); }
  jobs = jobs.filter(j => j.link_status === 'pending_render');
}
// 同一个网址只查一次（同一个招聘系统页面常挂好几个城市的岗位）
const byUrl = new Map<string, any[]>();
for (const j of jobs) { const u = j.link || j.application_website; (byUrl.get(u) || byUrl.set(u, []).get(u)!).push(j); }
let urls = [...byUrl.keys()];
if (LIMIT) urls = urls.slice(0, LIMIT);
console.log(`${STAGE === 'http' ? '直接请求' : '浏览器打开'}：${urls.length} 个网址（${urls.reduce((n, u) => n + byUrl.get(u)!.length, 0)} 个岗位），并发 ${PAR}${APPLY ? '' : '（试跑不写库）'}`);

const stat: Record<string, number> = {};
const samples: Record<string, any[]> = {};
const writes: { ids: number[]; status: string; issue: string }[] = [];
let nx = 0, done = 0;
await Promise.all(Array.from({ length: PAR }, async () => {
  while (nx < urls.length) {
    const u = urls[nx++];
    const js = byUrl.get(u)!;
    let r: { status: string; issue: string; text?: string };
    if (STAGE === 'http' && SPA.test(hostOf(u))) r = { status: 'pending_render', issue: '招聘系统页面，要用浏览器打开才看得出' };   // 直接请求只有空壳，Moka 还会断开连接
    else if (STAGE === 'http') {
      r = await httpCheck(u);
      if (r.status === 'blocked' && /超时/.test(r.issue)) { await new Promise(x => setTimeout(x, 3000)); r = await httpCheck(u); }   // 断连的再试一次
      if (r.status === 'ok') {
        if (SPA.test(hostOf(u))) r = { status: 'pending_render', issue: '招聘系统页面，要用浏览器打开才看得出' };
        else if (r.text && !js.some(j => nameHit(j.name, r.text!))) r = { status: 'suspect', issue: '能打开，但页面上找不到这个岗位名（可能已下线或跳到了列表页）' };
      }
    } else r = await renderCheck(u, js[0].name);
    stat[r.status] = (stat[r.status] || 0) + js.length;
    if ((samples[r.status] ||= []).length < 8) samples[r.status].push({ url: u, job: js[0].name, issue: r.issue });
    writes.push({ ids: js.map(j => j.id), status: r.status, issue: r.issue });
    if (++done % 200 === 0) process.stdout.write(`\r${done}/${urls.length}：${Object.entries(stat).map(([k, n]) => `${k} ${n}`).join('，')}`);
  }
}));
console.log(`\n结果（按岗位数）：${Object.entries(stat).map(([k, n]) => `${k} ${n}`).join('，')}`);
for (const [k, v] of Object.entries(samples)) if (k !== 'ok') { console.log(`  ${k}：`); for (const s of v.slice(0, 5)) console.log(`    ${s.job.slice(0, 24)} | ${s.issue} | ${s.url.slice(0, 90)}`); }
fs.writeFileSync(`reports/job-links-${STAGE}.json`, JSON.stringify({ at: new Date().toISOString(), stat, samples }, null, 1));
if (APPLY) {
  const at = new Date().toISOString();
  // 线上共用库：按状态分组批量写，每批 200 个 id，串行
  for (const w of writes) for (let i = 0; i < w.ids.length; i += 200)
    await db.from('jobs').update({ link_status: w.status, link_issue: w.issue || null, link_checked_at: at }).in('id', w.ids.slice(i, i + 200));
  console.log(`已写回 ${writes.reduce((n, w) => n + w.ids.length, 0)} 个岗位`);
}
process.exit(0);
