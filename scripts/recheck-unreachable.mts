/** 对体检里「超时 / fetch failed」的信源用更长超时 + GET + 浏览器 UA 复检一次，结果写回 url_sources。npx tsx scripts/recheck-unreachable.mts */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { data } = await db.from('url_sources').select('id, url, url_health').eq('health_status', 'dead').limit(2000);
const todo = (data || []).filter(r => { const h: any = r.url_health || {}; return !h.httpCode || h.httpCode === 0; });
console.log('recheck', todo.length);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sum: Record<string, number> = { alive: 0, redirect: 0, dead: 0 };
const check = async (r: any) => {
  const start = Date.now();
  let res: any;
  try {
    const resp = await fetch(r.url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(25000), headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' } });
    const code = resp.status; const status = code < 300 ? 'alive' : code < 400 ? 'redirect' : 'dead';
    res = { url: r.url, status, httpCode: code, latencyMs: Date.now() - start, redirectUrl: resp.headers.get('location') || undefined, recheck: true };
  } catch (e: any) { res = { url: r.url, status: 'dead', httpCode: 0, latencyMs: Date.now() - start, error: String(e?.message || e).slice(0, 80), recheck: true }; }
  sum[res.status]++;
  await db.from('url_sources').update({ health_status: res.status, url_health: res, last_checked_at: new Date().toISOString() }).eq('id', r.id);
};
const C = 12;
for (let i = 0; i < todo.length; i += C) { await Promise.all(todo.slice(i, i + C).map(check)); if ((i / C) % 5 === 0) console.log(i + C, JSON.stringify(sum)); }
console.log('DONE', JSON.stringify(sum));
