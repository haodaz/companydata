/**
 * Extern（extern.com）外部实习：项目外层 + 学员作品墙（2026-11-04）。
 * 用户口径：像美术班外面挂的一百张热带鱼——不要学员是谁，只看这一期教了什么、学员做出了什么、怎么做的。
 *   programs   项目页（sitemap 里 /externships/*，同一项目多期取最新一期）→ data/extern/programs.json
 *   works      学员作品集（sitemap-portfolios.xml）→ 只留和 Extern 项目有关的作品块，脱敏后 → data/extern/works.json
 * 脱敏：不存作品集地址、姓名、邮箱、电话、学校、经历、简历；作品外链只记类型不记网址；文字里出现本人名字换成「学员」。
 * 不并发、每页隔 1.5 秒；原始页面不落盘。
 *   npx tsx scripts/extern/crawl.mts programs | works [--limit=N]
 */
import fs from 'node:fs';
const DIR = 'data/extern'; fs.mkdirSync(DIR, { recursive: true });
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const get = async (u: string) => { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.text(); };
const ent = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const text = (h: string) => ent(h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<(br|\/p|\/div|\/h\d|\/li|\/section)[^>]*>/g, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const [cmd] = process.argv.slice(2);
const limit = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || 0;

/** 一份作品集 → 和 Extern 有关的作品块（脱敏） */
export function worksOf(html: string) {
  const name = ent((html.match(/<title>([^|<]+)\|/) || [])[1] || '').trim();
  const parts = name.split(/\s+/).filter(x => x.length >= 2);
  const scrub = (s: string) => { let t = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[邮箱]').replace(/\+?\d[\d\s().-]{8,}\d/g, '[电话]').replace(/https?:\/\/\S+/g, '[链接]'); for (const p of parts) t = t.replace(new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), '学员'); return t.trim(); };
  const out: any[] = [];
  for (const m of html.matchAll(/<section[^>]*id="work-([^"]+)"[^>]*>([\s\S]*?)(?=<section[^>]*id="work-|<footer|$)/g)) {
    const raw = m[2]; const t = text(raw);
    if (!/Verified by Extern/.test(t)) continue;                      // 只要 Extern 项目（不要学员自己学校的课程作品）
    const h1 = text((raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
    const cohort = (t.match(/·\s*([A-Z][a-z]{2} \d{4})/) || [])[1] || '';
    const brand = (t.match(/Back to work\s*([^·\n↗]+?)\s*(·|↗)/) || [])[1]?.trim() || '';
    const sec = (a: string, b: string[]) => { const i = t.indexOf(a); if (i < 0) return ''; let j = t.length; for (const x of b) { const k = t.indexOf(x, i + a.length); if (k > 0 && k < j) j = k; } return t.slice(i + a.length, j).trim(); };
    const overview = sec('Overview', ['Open Link', "What I've accomplished", 'Project breakdown', 'View all work']);
    const done = sec("What I've accomplished", ['Top performer', 'View certificate', 'Project breakdown', 'View all work']);
    const brk = sec('Project breakdown', ['View all work']);
    const tags = [...raw.matchAll(/<span[^>]*rounded-pf-pill[^>]*>([^<]{2,40})<\/span>/g)].map(x => ent(x[1]).trim()).filter((x, i, a) => a.indexOf(x) === i && !/Top performer/.test(x)).slice(0, 10);
    const links = [...raw.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(x => x[1]).filter(x => !/extern\.com|app\.extern/.test(x));
    const kind = (u: string) => /claude\.ai/.test(u) ? 'claude 作品页' : /docs\.google|drive\.google/.test(u) ? 'Google 文档' : /canva/.test(u) ? 'Canva' : /github/.test(u) ? 'GitHub' : /tableau|powerbi|lookerstudio/.test(u) ? '看板' : /figma/.test(u) ? 'Figma' : /\.pdf/.test(u) ? 'PDF' : '其他网页';
    out.push({ program: h1, brand, cohort, verified: true, in_progress: /In progress/.test(t), top_performer: /Top performer/.test(t), tags,
      overview: scrub(overview).slice(0, 1500), accomplished: scrub(done).slice(0, 1500), breakdown: scrub(brk).slice(0, 3000), artifact_kinds: [...new Set(links.map(kind))] });
  }
  return out;
}

if (cmd === 'works') {
  const sm = await get('https://extern.com/sitemap-portfolios.xml');
  let urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => !/test|demo/i.test(u));
  if (limit) urls = urls.slice(0, limit);
  const F = `${DIR}/works.json`; const prev = fs.existsSync(F) && !limit ? JSON.parse(fs.readFileSync(F, 'utf8')) : { done: 0, works: [] };
  let n = 0;
  for (let i = prev.done; i < urls.length; i++) {
    try { const w = worksOf(await get(urls[i])); prev.works.push(...w); n += w.length; } catch (e: any) { console.log('  跳过', String(e.message).slice(0, 60)); }
    prev.done = i + 1;
    if (prev.done % 50 === 0 || i === urls.length - 1) { fs.writeFileSync(F, JSON.stringify({ ...prev, fetched_at: new Date().toISOString() })); console.log(`${prev.done}/${urls.length} 份作品集，作品 ${prev.works.length}`); }
    await sleep(1500);
  }
}

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const baseOf = (slug: string) => slug.replace(/-(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(-\d{1,2})?-\d{2,4}$/, '').replace(/---/g, '-');
const dateOf = (slug: string) => { const m = slug.match(/-(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:-\d{1,2})?-(\d{2,4})$/); if (!m) return 0; const y = +m[2] < 100 ? 2000 + +m[2] : +m[2]; return y * 100 + MON[m[1]]; };
const TOOLS = ['Claude', 'ChatGPT', 'Perplexity', 'Gemini', 'Copilot', 'Canva', 'Python', 'SQL', 'Tableau', 'Power BI', 'Excel', 'Google Sheets', 'Google Slides', 'Google Colab', 'Figma', 'Flourish', 'Looker', 'R ', 'Notion', 'Zapier', 'n8n'];

/** 一个项目页 → 外层（只要谁家、做什么、交什么、学什么、几周、给什么机会；导师只记职位不记姓名） */
export function programOf(html: string, url: string) {
  const t = text(html).replace(/‍/g, '');
  const lines = t.split('\n').map(x => x.trim()).filter(Boolean);
  const h1 = text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
  const iTop = lines.findIndex(l => /All Externships/.test(l)), iH = lines.findIndex((l, i) => i > iTop && l === h1);
  const chips = lines.slice(iTop + 1, iH > iTop ? iH : iTop + 1).filter(l => l.length < 50);
  const opp = chips.find(c => /Opportunity$/i.test(c)) || '';
  const between = (a: RegExp, b: RegExp) => { const i = lines.findIndex(l => a.test(l)); if (i < 0) return [] as string[]; const j = lines.findIndex((l, k) => k > i && b.test(l)); return lines.slice(i + 1, j > i ? j : i + 40); };
  const desc = between(/^Start Onboarding Today|^Live Sessions Start|^Starts?:?$/, /^Project Output/).filter(l => l.length > 80).join('\n');
  const outputs = between(/^Project Output/, /^(Get Started|This Externship has passed|Start Project Today|What past Externs|Sign up for this)/).filter(l => l.length > 3);
  const skills = between(/^Skills You'?ll Gain/, /^Your Schedule/);
  const sched = between(/^Your Schedule/, /^(About |Meet Your Host)/).filter(l => !/^\d+ WEEKS$/i.test(l)).join(" ").replace(/\s*—\s*/g, " — ").split(/(?=(?:Project|Week|Module|Phase) \d+\b)/).map(x => x.trim()).filter(Boolean);
  const host = between(/^Meet Your Host/, /^(This Externship|Explore More|Sign Up|Start)/);
  const iSch = lines.findIndex(l => /^Your Schedule/.test(l));
  const about = lines.find((l, i) => i > iSch && /^About /.test(l) && l.length < 60)?.replace(/^About /, '') || '';
  const all = [desc, ...outputs, ...skills].join(' ');
  return {
    title: h1, tagline: lines[iH + 1] || '', chips: chips.filter(c => c !== opp), opportunity: opp,
    weeks: Number((t.match(/(\d+)\s*weeks/i) || [])[1]) || null, start: (t.match(/(?:Live Sessions Start|Starts?:)\s*\n?\s*([A-Z][a-z]+ \d{1,2}, \d{4})/) || [])[1] || '',
    company: about, description: desc.slice(0, 4000), outputs: outputs.slice(0, 14), skills: skills.slice(0, 12), schedule: sched.slice(0, 14),
    host_title: host[1] && host[1].length < 160 ? host[1] : '', ai_tools: TOOLS.filter(x => new RegExp(`\\b${x.trim()}\\b`).test(all)).map(x => x.trim()), url,
  };
}

if (cmd === 'programs') {
  const sm = await get('https://www.extern.com/sitemap.xml');
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => /\/externships\/[^/]+$/.test(u));
  const groups = new Map<string, string[]>();
  for (const u of urls) { const b = baseOf(u.split('/').pop()!); groups.set(b, [...(groups.get(b) || []), u]); }
  const out: any[] = [];
  const seen = new Map<string, any>();   // 换过网址的同一项目按标题合并
  for (const [b, us] of groups) {
    const latest = [...us].sort((x, y) => dateOf(y.split('/').pop()!) - dateOf(x.split('/').pop()!))[0];
    try {
      const p = programOf(await get(latest), latest); if (!p.title) continue;
      const was = seen.get(p.title);
      if (was) { was.cohorts += us.length; was.cohort_slugs.push(...us.map(u => u.split('/').pop())); continue; }
      const row = { external_id: b, cohorts: us.length, cohort_slugs: us.map(u => u.split('/').pop()), ...p }; seen.set(p.title, row); out.push(row); console.log(`${out.length}. ${p.title}（${us.length} 期）`);
    }
    catch (e: any) { console.log('  跳过', b, String(e.message).slice(0, 60)); }
    await sleep(1500);
  }
  fs.writeFileSync(`${DIR}/programs.json`, JSON.stringify({ fetched_at: new Date().toISOString(), programs: out }, null, 1));
  console.log(`共 ${out.length} 个项目`);
}
