/**
 * 赛事雷达批量扫（国内为主）：建一个赛事任务，三步分开跑——找信源（联网检索，只收真实网址）→ 爬网站（每个网址抓一次原文）→ 处理信息（从原文抽比赛）→ 入库（待审核）。
 *   npx tsx scripts/competition-sweep.mts --model qwen-plus [--par 3] [--name "任务名"]
 * 检索条目在下面 QUERIES 里；已在库的同名赛事不重复入库。
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { searchCompetitions, extractCompetitionsFromPage, PLATFORM_SOURCES } = await import('@/lib/agents/competition-radar');
const { fetchJinaUrl } = await import('@/lib/agents/fetcher');
const { upsertCompetitions } = await import('@/lib/competition-store');
const { resolveCompanyId } = await import('@/lib/company-match');
const { isKnownModel } = await import('@/lib/model-options');
const { summarizeCost } = await import('@/lib/company-store');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', process.env.CHEAP_MODEL || '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const PAR = Number(opt('par', '3'));
const Y = new Date().getFullYear();

type Q = { query: string; company?: string; kinds?: string[]; rewards?: string[] };
const QUERIES: Q[] = [
  // 十月：程序员节 / 开源月 / 秋季黑客松
  { query: `1024 程序员节 ${Y} 黑客松 编程挑战 报名`, kinds: ['hackathon', 'developer'] },
  { query: `${Y} 秋季 黑客马拉松 大学生 国内 报名中`, kinds: ['hackathon'] },
  { query: `${Y} AI 黑客松 智能体 Agent 大赛 高校 报名`, kinds: ['hackathon', 'developer'] },
  { query: `开源 编程 活动 ${Y} 10月 11月 大学生 贡献 奖励（开源之夏 / Gitee / OSChina / 开放原子）`, kinds: ['developer', 'hackathon'] },
  { query: `${Y} 大模型 应用开发 大赛 奖金 报名中`, kinds: ['developer'], rewards: ['cash', 'credits'] },
  { query: `${Y} 算法 数据 竞赛 天池 DataFountain 和鲸 报名中`, kinds: ['data_science'] },
  { query: `${Y} 校招 直通 offer 编程 挑战赛 大厂`, rewards: ['offer', 'internship'] },
  { query: `${Y} 大学生 商业案例 挑战赛 企业主办 秋季`, kinds: ['business_case'] },
  { query: `${Y} 大学生 设计 创意 大赛 企业 主办 报名中`, kinds: ['design'] },
  { query: `${Y} 机器人 具身智能 硬件 创新 挑战赛 企业 大学生`, rewards: ['hardware', 'cash'] },
  { query: `${Y} 网络安全 CTF 大赛 企业主办 大学生 报名`, kinds: ['developer'] },
  { query: `${Y} 芯片 集成电路 EDA 设计 竞赛 企业杯 大学生`, kinds: ['developer', 'research'] },
  { query: `${Y} 新能源汽车 智能驾驶 大学生 挑战赛 企业`, kinds: ['developer', 'campus_innovation'] },
  { query: `${Y} 金融科技 银行 券商 大学生 金融 挑战赛 校园`, kinds: ['business_case', 'data_science'] },
  { query: `${Y} 快消 营销 策划 大赛 大学生 企业`, kinds: ['business_case'] },
  { query: `${Y} 游戏 开发 GameJam 大学生 企业`, kinds: ['hackathon', 'design'] },
  // 头部企业逐家查
  ...['腾讯', '阿里巴巴', '字节跳动', '百度', '华为', '美团', '京东', '小米', '网易', '快手', 'vivo', 'OPPO', '蚂蚁集团', '比亚迪', '宁德时代', '大疆', '科大讯飞', '商汤科技', '中兴通讯', '联想', '拼多多', '米哈游', '哔哩哔哩', '招商银行', '中国移动'].map(c => ({ query: `${c} ${Y} 大学生 比赛 / 挑战赛 / 黑客松 / 开发者大赛`, company: c })),
];

const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[·•\-—_()（）【】\[\]「」“”"'：:，,]/g, '').replace(/20\d\d|第.{1,3}届/g, '');
const { data: have } = await selectAll(() => db.from('competitions').select('name').order('id'));
const known = new Set((have as any[]).map(r => norm(r.name)));
const before = known.size;

const { data: task, error: te } = await db.from('competition_tasks').insert({ name: opt('name', `赛事雷达 · ${new Date().toISOString().slice(0, 10)} · 国内（十月 Hacktoberfest）`), notes: '脚本批量扫：国内主题 + 头部企业逐家查；千问联网检索', model_id: MODEL, created_by: 'script', status: 'running' }).select().single();
if (te) throw te;
const rows = [];
// 常驻信源：比赛平台列表页，每个平台记一条（不联网检索，直接抓）
const PLATFORMS = PLATFORM_SOURCES.filter(p => p.region === 'china' || process.argv.includes('--overseas'));
for (const p of PLATFORMS) rows.push({ task_id: task.id, query: `平台列表页 · ${p.name}`, company: null, company_id: null, kinds: [], region: p.region, rewards: [], only_open: true, count: 30, enrich: true, model_id: MODEL, status: 'pending', created_by: 'script' });
const ONLY_PLATFORMS = process.argv.includes('--platforms-only');
if (!ONLY_PLATFORMS) for (const q of QUERIES) rows.push({ task_id: task.id, query: q.query, company: q.company || null, company_id: q.company ? await resolveCompanyId(q.company) : null, kinds: q.kinds || [], region: 'china', rewards: q.rewards || [], only_open: true, count: 12, enrich: true, model_id: MODEL, status: 'pending', created_by: 'script' });
const { data: searches, error: se } = await db.from('competition_searches').insert(rows).select('id, query, company, company_id, kinds, rewards');
if (se) throw se;
console.log(`任务 ${task.id}：${searches!.length} 条检索，模型 ${MODEL}，库里原有 ${before} 个赛事`);

// 三步分开跑（和工具原本的分法一致）：找信源 → 爬网站 → 处理信息
const pool = async <T,>(items: T[], n: number, fn: (x: T) => Promise<void>) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); };
const batchOf = new Map<number, number>();
for (const s of searches!) batchOf.set(s.id, Date.now() * 100 + s.id % 100);

// 1. 找信源：联网检索，只收真实搜到的网址（千问的「搜索来源」+ 模型给的、校对过的链接）
const urlsOf = new Map<number, { url: string; title: string }[]>();
let fails = 0;
await pool(searches!, PAR, async s => {
  await db.from('competition_searches').update({ status: 'running', batch_id: batchOf.get(s.id) }).eq('id', s.id);
  const plat = PLATFORMS.find(p => s.query === `平台列表页 · ${p.name}`);
  if (plat) { urlsOf.set(s.id, [{ url: plat.url, title: plat.name }]); console.log(`① ${plat.name}：常驻信源`); return; }
  try {
    const r = await searchCompetitions({ query: s.query, company: s.company, kinds: s.kinds, rewards: s.rewards, region: 'china', onlyOpen: true, count: 12 }, MODEL, batchOf.get(s.id)!);
    const list = [...r.sources];
    for (const c of r.candidates) for (const u of [c.official_url, c.registration_url, c.source_url]) if (u) list.push({ url: u, title: c.name });
    const uniq = [...new Map(list.map(x => [x.url.replace(/#.*$/, ''), x])).values()];
    urlsOf.set(s.id, uniq);
    await db.from('competition_searches').update({ search_queries: r.searchQueries, raw_candidates: r.candidates, candidates_found: r.candidates.length }).eq('id', s.id);
    console.log(`① ${(s.company || s.query).slice(0, 30)}：信源 ${uniq.length}`);
  } catch (e: any) {
    fails++; urlsOf.set(s.id, []);
    await db.from('competition_searches').update({ status: 'failed', error_message: String(e?.message || e).slice(0, 500) }).eq('id', s.id);
    console.log(`✗ ${(s.company || s.query).slice(0, 30)}：${String(e?.message || e).slice(0, 120)}`);
  }
});

// 2. 爬网站：同一个网址只抓一次
const pageOf = new Map<string, { url: string; title: string; markdown: string; ok: boolean }>();
const allUrls = [...new Map([...urlsOf.values()].flat().map(x => [x.url, x])).values()];
console.log(`② 抓页面：${allUrls.length} 个网址`);
await pool(allUrls, 8, async x => {
  const md = ((await fetchJinaUrl(x.url).catch(() => '')) || '').trim();
  pageOf.set(x.url, { url: x.url, title: x.title, markdown: md, ok: md.length > 400 });
});
console.log(`   抓到 ${[...pageOf.values()].filter(p => p.ok).length} 页`);

// 3. 处理信息：每页抽比赛 → 入库（待审核），按检索条目记账
let ins = 0, upd = 0, found = 0;
const done = new Set<string>();
await pool(searches!.filter(s => urlsOf.get(s.id)?.length), PAR, async s => {
  const pages = urlsOf.get(s.id)!.map(x => pageOf.get(x.url)!).filter(p => p?.ok && !done.has(p.url));
  pages.forEach(p => done.add(p.url));
  const out: any[] = [], sources: Record<string, any> = {};
  for (const pg of pages) {
    try {
      for (const c of await extractCompetitionsFromPage(pg, { query: s.query, company: s.company, onlyOpen: true }, MODEL, batchOf.get(s.id)!)) {
        const k = norm(c.fields.name);
        if (!k || known.has(k)) continue;
        known.add(k); out.push(c.fields); sources[c.fields.name] = c.sources;
      }
    } catch (e: any) { console.log(`   抽取失败 ${pg.url.slice(0, 60)}：${String(e?.message || e).slice(0, 80)}`); }
  }
  found += out.length;
  const saved = out.length ? await upsertCompetitions(out, { searchId: s.id, sources, companyId: s.company_id, companyName: s.company }) : { inserted: 0, updated: 0, skipped: 0, ids: [] };
  ins += saved.inserted; upd += saved.updated;
  const cost = await summarizeCost(batchOf.get(s.id));
  await db.from('competition_searches').update({ status: 'success', raw_pages: pages.map(p => ({ url: p.url, ok: p.ok, len: p.markdown.length, markdown: p.markdown.slice(0, 20000) })), structured_json: { competitions: out }, saved: saved.inserted + saved.updated, ...(cost.llm_calls ? cost : {}), updated_at: new Date().toISOString() }).eq('id', s.id);
  console.log(`③ ${(s.company || s.query).slice(0, 30)}：读 ${pages.length} 页，新比赛 ${out.length}，入库 ${saved.inserted}`);
});
await db.from('competition_searches').update({ status: 'success' }).eq('task_id', task.id).eq('status', 'running');
await db.from('competition_tasks').update({ status: fails === searches!.length ? 'failed' : 'completed', updated_at: new Date().toISOString() }).eq('id', task.id);
console.log(`完成：新比赛 ${found}，新入库 ${ins}，更新 ${upd}，检索失败 ${fails}`);
