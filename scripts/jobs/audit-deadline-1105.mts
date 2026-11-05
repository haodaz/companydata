/**
 * 数据部门 10-30 / 11-05（周赞灵）：官网没写截止日期，系统里却有。存量复查：
 * 网申起止日期要在这条岗位抓取时的原文（job_crawl_logs.raw_markdown）里写着；原文里找不到、或来源是联网检索的，清空。
 *   npx tsx scripts/jobs/audit-deadline-1105.mts [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { isDateGrounded } = await import('@/lib/jd-grounding');
const APPLY = process.argv.includes('--apply');
const { data: js } = await selectAll(() => db.from('jobs').select('id, name, institute_or_company_name, application_start_date_str, application_end_date_str, source_log_id, source_url, link, ai_sources').or('application_end_date_str.not.is.null,application_start_date_str.not.is.null').not('if_delete', 'is', true).order('id'));
console.log('有起止日期的岗位', (js as any[]).length);
const logIds = [...new Set((js as any[]).map(j => j.source_log_id).filter(Boolean))];
const raw = new Map<number, string>();
for (let i = 0; i < logIds.length; i += 20) {
  const { data } = await db.from('job_crawl_logs').select('id, raw_markdown').in('id', logIds.slice(i, i + 20));
  for (const l of data || []) raw.set(l.id, l.raw_markdown || '');
}
const bad: any[] = []; const st: Record<string, number> = {};
for (const j of js as any[]) {
  const src = raw.get(j.source_log_id) || '';
  const fix: any = {};
  for (const k of ['application_start_date_str', 'application_end_date_str']) {
    if (!j[k]) continue;
    const from = j.ai_sources?.[k];
    const fromSearch = from && from !== j.link && from !== j.source_url && !String(from).startsWith(j.source_url || '\u0000');
    let why = '';
    if (fromSearch && /联网检索/.test(from)) why = '联网检索补的';
    else if (src.length >= 200 && !isDateGrounded(j[k], src)) why = '原文里没写';
    else if (src.length < 200) { st['没有原文，没法判'] = (st['没有原文，没法判'] || 0) + 1; continue; }
    if (why) { fix[k] = null; st[`${k} ${why}`] = (st[`${k} ${why}`] || 0) + 1; bad.push({ id: j.id, 企业: j.institute_or_company_name, 岗位: j.name, 字段: k, 原值: j[k], 原因: why, 链接: j.link || j.source_url }); }
  }
  if (APPLY && Object.keys(fix).length) { const { error } = await db.from('jobs').update(fix).eq('id', j.id); if (error) console.log('✗', j.id, error.message); }
}
console.log(st);
fs.writeFileSync('reports/1105-截止日期复查.json', JSON.stringify(bad, null, 1));
console.log('要清', bad.length, APPLY ? '已清' : '（试跑）');
