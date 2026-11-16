/**
 * 数据部门 11-16（姜贺）#88 续：会刊以外、从厂商官网抓来的科研产品里没封面的（约 250 件）再补一次。
 * 本机 Chrome 重开产品页、滚到底让懒加载图出来，收集页上像产品图的图（og:image + 够大的 <img>，带 alt 和附近文字），
 * 千问看图模型（qwen3-vl-plus）看候选图挑「就是这件产品」的；对不上就留空（数据部门 10-22：不放占位图、不拿别的图凑）。来源链接本身就是图片的直接用。
 *   npx tsx scripts/research/vendor-images-1116.mts [--apply] [--limit N] [--ids 1,2,3]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { isBlankImage } = await import('@/lib/image-blank');
const { logTokenUsage } = await import('@/lib/token-logger');
const { parseJsonLoose } = await import('@/lib/agents/search-llm');
const APPLY = process.argv.includes('--apply'), LIMIT = process.argv.includes('--limit') ? Number(process.argv[process.argv.indexOf('--limit') + 1]) : 0;
const VL = 'qwen3-vl-plus', UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';
const SKIP = /logo|icon|ewm|qrcode|qr-code|sprite|avatar|wechat|weixin|button|btn[-_]|placeholder|loading|flag|social|\.svg(\?|$)|\.gif(\?|$)/i;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function grab(url: string, referer?: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) } });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !/^image\//.test(ct) || /svg/.test(ct)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1500 || buf.length >= 8 * 1024 * 1024 || await isBlankImage(buf)) return null;
    return { buf, ct };
  } catch { return null; }
}
async function store(p: any, url: string, have?: { buf: Buffer; ct: string }) {
  const got = have || (await grab(url, p.source_url)) || (await grab(url)); if (!got) return null;
  const key = `${p.supplier_id}/${p.external_id}/${crypto.createHash('md5').update(url).digest('hex').slice(0, 12)}.${(got.ct.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '')}`;
  if (!APPLY) return { url };
  const { error } = await db.storage.from('research-images').upload(key, got.buf, { contentType: got.ct, upsert: true });
  return error ? { url } : { url, storage_path: key };
}

const { data } = await selectAll(() => db.from('research_products').select('id, external_id, name, brand, model_no, supplier_id, source_url, images').eq('if_delete', false).order('id'));
let todo = (data as any[]).filter(p => !(p.images || []).length && !String(p.source_url || '').includes('analyticachina') && /^https?:/.test(p.source_url || ''));
const IDS = process.argv.includes('--ids') ? new Set(process.argv[process.argv.indexOf('--ids') + 1].split(',').map(Number)) : null;   // 只重跑这几件（看图超时 / 没返回的）
if (IDS) todo = todo.filter(p => IDS.has(p.id));
if (LIMIT) todo = todo.slice(0, LIMIT);
console.log(`官网来源没封面 ${todo.length} 件${APPLY ? '' : '（试跑不写库）'}`);

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const pageCache = new Map<string, any[]>();   // 同一个页面挂了好几件产品，只开一次
const blocked = new Set<string>();
const hostBusy = new Map<string, Promise<any>>();   // 同一家站一次只开一个页面
async function imagesOn(url: string): Promise<any[]> {
  const h = new URL(url).host, prev = hostBusy.get(h) || Promise.resolve();
  const run = prev.then(() => imagesOn0(url)); hostBusy.set(h, run.catch(() => {})); return run;
}
async function imagesOn0(url: string) {
  if (pageCache.has(url)) return pageCache.get(url)!;
  let out: any[] = [];
  for (let tryN = 0; tryN < 2 && !out.length; tryN++) {
  const pg = await b.newPage(); const seen = new Map<string, { buf: Buffer; ct: string }>();
  // 浏览器自己加载到的图直接留下（防盗链 / 要 cookie 的站，脚本再去下常常下不来）
  pg.on('response', async r => { const ct = r.headers()['content-type'] || ''; if (/^image\//.test(ct) && !/svg/.test(ct)) { try { seen.set(r.url(), { buf: Buffer.from(await r.buffer()), ct }); } catch { /* 忽略 */ } } });
  try {
    await pg.setUserAgent(UA); await pg.setViewport({ width: 1400, height: 1000 });
    await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
    // 有的站一直有请求在跑、等不到网络空闲（阿拉丁）：页上出现图就往下
    for (let w = 0; w < 20; w++) { const n = await pg.evaluate(() => document.images.length).catch(() => -1); if (n > 3) break; await sleep(1000); }
    await sleep(2000);
    for (let i = 0; i < 8; i++) { await pg.evaluate(() => window.scrollBy(0, 900)).catch(() => {}); await sleep(500); }
    await sleep(1500);
    out = await pg.evaluate(() => {
      const res: any[] = [];
      const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      if (og) res.push({ url: new URL(og, location.href).href, alt: 'og:image（页面分享图）', ctx: document.title, w: 0, h: 0 });
      for (const im of [...document.images]) {
        const src = im.currentSrc || im.src || im.getAttribute('data-src') || ''; if (!src || src.startsWith('data:')) continue;
        const w = im.naturalWidth, h = im.naturalHeight; if (w && (w < 200 || h < 150)) continue;
        const box = im.closest('a,li,figure,div'); const ctx = (box?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        res.push({ url: new URL(src, location.href).href, alt: (im.alt || im.title || '').slice(0, 100), ctx, w, h });
      }
      return res;
    });
  } catch (e: any) { if (process.env.DEBUG) console.log('读页失败', url, e.message); }
  // 站点弹人机验证就停（不绕过反爬，人在环里：要补的话人过验证后再来）
  if (/verification|captcha|安全验证|人机验证|访问验证/i.test(await pg.title().catch(() => ''))) { blocked.add(url); out = []; await pg.close().catch(() => {}); break; }
  for (const i of out) i.got = seen.get(i.url);
  await pg.close().catch(() => {});
  if (!out.length) await sleep(3000);
  }
  // 去重（同一张图不同缓存尺寸的只留大的），og:image 排前，再按面积排，候选最多 8 张
  const big = new Map<string, any>();
  for (const i of out.filter(i => !SKIP.test(i.url))) { const k = i.url.replace(/\/cache\/[0-9a-f]+\//, '/'); const o = big.get(k); if (!o || i.w * i.h > o.w * o.h) big.set(k, i); }
  out = [...big.values()].sort((a, b) => Number(b.alt.startsWith('og:')) - Number(a.alt.startsWith('og:')) || b.w * b.h - a.w * a.h).slice(0, 8);
  pageCache.set(url, out); return out;
}

async function askVL(p: any, imgs: any[], text: string): Promise<any> {
  const base = (process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com').replace(/\/compatible-mode\/v1\/?$/, '').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/compatible-mode/v1/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ model: VL, temperature: 0, messages: [{ role: 'user', content: [...imgs.map(c => ({ type: 'image_url', image_url: { url: `data:${c.got.ct.split(';')[0]};base64,${c.got.buf.toString('base64')}` } })), { type: 'text', text }] }] }),
    });
    const j: any = await res.json(); const u = j.usage || {};
    await logTokenUsage({ tool_name: 'company-pipeline', task_name: 'Research Product Images Backfill', institution: String(p.supplier_id), model_id: VL, usageMetadata: { promptTokenCount: u.prompt_tokens || 0, candidatesTokenCount: u.completion_tokens || 0, totalTokenCount: u.total_tokens || 0 } }).catch(() => {});
    return parseJsonLoose(String(j.choices?.[0]?.message?.content || '')) || { error: j.error?.message || '看图没返回' };
  } catch (e: any) { return { error: '看图失败 ' + e.message }; }
}
const who = (p: any) => `「${p.name}」${p.brand ? `（品牌 ${p.brand}）` : ''}${p.model_no ? `，型号 ${p.model_no}` : ''}`;
async function confirmOne(p: any, c: any) {
  const v = await askVL(p, [c], `这张图是不是科研产品${who(p)}本身的图（仪器 / 设备外观、试剂耗材瓶子包装、软件界面都算）？横幅、场景氛围图、只有文字的宣传图、别的产品或别的型号、公司 logo、占位图都答 false。拿不准答 false。只返回 JSON：{"ok":true|false}`);
  return v?.ok === true;
}

/** 千问看图：几张候选图一起看，挑出就是这件产品的（OpenAI 兼容接口，图走 data URI，同 company-logo.ts） */
async function pickByEye(p: any, cand: any[]): Promise<any> {
  const v = await askVL(p, cand, `这是科研产品${who(p)}的官网页面 ${p.source_url} 上的 ${cand.length} 张图，按顺序编号 0~${cand.length - 1}（附 alt / 附近文字，可能写错，以看到的为准）：
${cand.map((c, k) => `${k}. ${c.alt}｜${c.ctx}`).join('\n')}
挑出「就是这件产品本身」的图：仪器 / 设备外观、试剂耗材的瓶子包装、软件界面截图都算；横幅、场景氛围图、人物、证书、公司 logo、明显是别的型号或别的产品的不算。主图放第一个，最多 3 张。
看不出是这件产品就返回空——宁空不错。只返回 JSON：{"images":[编号],"reason":"一句话"}`);
  return v.error ? { images: [], reason: v.error } : v;
}

const report: any[] = [];
let done = 0, imgs = 0, n = 0;
const queue = [...todo];
async function worker() {
  while (queue.length) {
    const p = queue.shift()!; let picked: any[] = [], why = '';
    if (/\.(jpe?g|png|webp)(\?|$)/i.test(p.source_url)) { const g = await store(p, p.source_url); if (g) picked = [g]; why = '来源链接就是产品图'; }
    else if (/\.pdf(\?|$)/i.test(p.source_url)) why = '来源是 PDF 资料，没有网页图';
    else {
      const list = await imagesOn(p.source_url);
      if (!list.length) why = blocked.has(p.source_url) ? '官网弹人机验证，需要人工过验证后再补' : '页面打不开或页上没有像样的图';
      else {
        const ok = async (g: any) => g && g.buf.length >= 1500 && g.buf.length < 8 * 1024 * 1024 && !(await isBlankImage(g.buf)) ? g : null;
        const cand = (await Promise.all(list.map(async i => ({ ...i, got: (await ok(i.got)) || (await grab(i.url, p.source_url)) || (await grab(i.url)) })))).filter(i => i.got);
        const v = cand.length ? await pickByEye(p, cand) : { images: [], reason: '页上的图都下载不下来' };
        const idx = [...new Set(((v.images || []) as any[]).map(Number))].filter(i => cand[i]).slice(0, 3);
        why = v.reason || '';
        // 挑中的每张再单独复核一次（一起看时偶尔会把横幅 / 别的型号也带上）
        for (const i of idx) { if (!(await confirmOne(p, cand[i]))) continue; const g = await store(p, cand[i].url, cand[i].got); if (g) picked.push(g); }
        if (idx.length && !picked.length && !/下载/.test(why)) why = `复核没过：${why}`;
      }
    }
    if (picked.length) { done++; imgs += picked.length; if (APPLY) await db.from('research_products').update({ images: picked }).eq('id', p.id); }
    report.push({ id: p.id, name: p.name, supplier_id: p.supplier_id, url: p.source_url, images: picked.length, cover: picked[0]?.storage_path || picked[0]?.url || '', why });
    if (++n % 20 === 0) console.log(`看完 ${n}/${todo.length}，补上 ${done}`);
  }
}
await Promise.all([worker(), worker(), worker()]);
await b.close();
// 重跑几件时合进上一次的结果
const OUT = 'reports/1116-官网产品补封面.json';
const merged = IDS && fs.existsSync(OUT) ? [...JSON.parse(fs.readFileSync(OUT, 'utf8')).filter((r: any) => !IDS.has(r.id)), ...report] : report;
fs.writeFileSync(OUT, JSON.stringify(merged, null, 1));
console.log(`官网来源没封面 ${todo.length} 件，补上 ${done} 件（${imgs} 张）`);
process.exit(0);
