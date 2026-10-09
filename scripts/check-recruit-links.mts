/**
 * 招聘入口体检：企业的校招官网 / 招聘总入口逐个打开看一眼，失效的（页面不存在 / 已关停）
 *   - 信息源库里同一链接标 health_status = dead
 *   - 企业字段里清掉（人工锁定的字段、已定论的企业不动），刷新完整度
 *   npx tsx scripts/check-recruit-links.mts --dry     # 只看不改
 *   npx tsx scripts/check-recruit-links.mts           # 改
 * 断点续跑：进度记在 scripts/.check-recruit-links.json（7 天内查过的跳过）。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { recruitLinkHealth } = await import('../src/lib/agents/link-health');
const { refreshCompleteness } = await import('../src/lib/company-store');
const { FROZEN_REVIEW_STATUSES } = await import('../src/lib/review-status');

const DRY = process.argv.includes('--dry');
const CONC = Number(process.argv.find(a => a.startsWith('--conc='))?.slice(7) || 5);
const PROG = 'scripts/.check-recruit-links.json';
const prog: Record<string, { status: string; at: number; title?: string; reason?: string }> = fs.existsSync(PROG) ? JSON.parse(fs.readFileSync(PROG, 'utf8')) : {};
const ts = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

const { data: cos } = await selectAll(() => supabaseAdmin.from('companies').select('id, name, campus_url, careers_url, human_locked_fields, human_review_status').order('id'));
const byUrl = new Map<string, { id: number; field: 'campus_url' | 'careers_url'; name: string; locked: boolean }[]>();
for (const c of cos as any[]) for (const f of ['campus_url', 'careers_url'] as const) {
  const u = c[f]; if (!u) continue;
  const locked = (c.human_locked_fields || []).includes(f) || FROZEN_REVIEW_STATUSES.has(c.human_review_status || '');
  byUrl.set(u, [...(byUrl.get(u) || []), { id: c.id, field: f, name: c.name, locked }]);
}
const urls = [...byUrl.keys()].filter(u => !prog[u] || Date.now() - prog[u].at > 7 * 86_400_000);
console.log(`[${ts()}] ${byUrl.size} 个招聘链接，要查 ${urls.length} 个${DRY ? '（只看不改）' : ''}`);

const tally: Record<string, number> = { alive: 0, dead: 0, unknown: 0, cleared: 0, login: 0 };
let n = 0;
const one = async (u: string) => {
  const h = await recruitLinkHealth(u);
  tally[h.status]++;
  prog[u] = { status: h.status, at: Date.now(), title: h.title, reason: h.reason };
  if (!DRY) await supabaseAdmin.from('url_sources').update({ health_status: h.status === 'unknown' ? 'unknown' : h.status, last_checked_at: new Date().toISOString(), url_health: { title: h.title, reason: h.reason || null, by: 'check-recruit-links' }, ...(h.status === 'unknown' ? {} : { requires_login: !!h.loginRequired, login_reason: h.loginReason || null, login_checked_at: new Date().toISOString() }) }).eq('url', u);
  if (h.loginRequired) { tally.login = (tally.login || 0) + 1; console.log(`[${ts()}] 需登录：${byUrl.get(u)!.map(r => r.name).join('、')}　${u}　（${h.loginReason}）`); }
  if (h.status === 'dead') {
    for (const r of byUrl.get(u)!) {
      if (r.locked) { console.log(`           ${r.name} 的 ${r.field} 失效，但人工锁定 / 已定论，没动`); continue; }
      if (!DRY) { await supabaseAdmin.from('companies').update({ [r.field]: null }).eq('id', r.id).eq(r.field, u); await refreshCompleteness(r.id).catch(() => {}); }
      tally.cleared++;
    }
    console.log(`[${ts()}] 失效：${byUrl.get(u)!.map(r => r.name).join('、')}　${u}　（${h.reason}）`);
  }
  if (++n % 50 === 0) { fs.writeFileSync(PROG, JSON.stringify(prog)); console.log(`[${ts()}] ── ${n}/${urls.length}：正常 ${tally.alive} · 失效 ${tally.dead} · 打不开 ${tally.unknown} · 清掉字段 ${tally.cleared}`); }
};
for (let i = 0; i < urls.length; i += CONC) await Promise.all(urls.slice(i, i + CONC).map(u => one(u).catch(e => console.log(`[${ts()}] ${u} 出错：${e.message}`))));
fs.writeFileSync(PROG, JSON.stringify(prog));
console.log(`[${ts()}] ══ 完成：正常 ${tally.alive}（其中需登录 ${tally.login}）· 失效 ${tally.dead} · 打不开 ${tally.unknown} · 清掉企业字段 ${tally.cleared}${DRY ? '（只看不改）' : ''}`);
