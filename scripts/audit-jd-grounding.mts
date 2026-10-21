/**
 * 岗位职责 / 要求是不是原文里有的（只读）：拿入库的 responsibilities / overview 去抓下来的页面原文里比对，重合度低的算「疑似编造」。
 * 起因：数据部门 10-21 反馈商汤「算法工程师-SCG」——原文写 SDK 封装 / 异构计算，库里却是「参与核心算法模型设计与开发」这种泛泛的话。
 *   npx tsx scripts/audit-jd-grounding.mts [--out reports/jd-grounding.json]
 * 方法：去空白标点后取 4 字片段，统计有多少片段出现在原文里（职责 / 要求各算）；< 0.35 记为疑似编造。
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = opt('out', 'reports/jd-grounding.json');
const norm = (s: string) => String(s || '').replace(/[\s\p{P}\p{S}0-9a-zA-Z]+/gu, '');   // 只比中文（英文 JD 另算）
const normEn = (s: string) => String(s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
function overlap(text: string, src: string) {
  const zh = norm(text);
  if (zh.length >= 12) { const S = norm(src); let hit = 0, n = 0; for (let i = 0; i + 4 <= zh.length; i += 2) { n++; if (S.includes(zh.slice(i, i + 4))) hit++; } return n ? hit / n : 1; }
  const w = normEn(text).split(' '), S = ' ' + normEn(src) + ' ';
  if (w.length < 6) return 1;
  let hit = 0, n = 0; for (let i = 0; i + 3 <= w.length; i += 2) { n++; if (S.includes(' ' + w.slice(i, i + 3).join(' ') + ' ')) hit++; } return n ? hit / n : 1;
}
const { data: jobs } = await selectAll(() => db.from('jobs').select('id, name, institute_or_company_name, responsibilities, overview, source_log_id, human_locked_fields').not('if_delete', 'is', true).not('source_log_id', 'is', null).order('id'));
const byLog = new Map<number, any[]>(); for (const j of jobs as any[]) { if (!j.responsibilities && !j.overview) continue; (byLog.get(j.source_log_id) || byLog.set(j.source_log_id, []).get(j.source_log_id)!).push(j); }
console.log(`有职责 / 要求、带来源日志的岗位 ${[...byLog.values()].flat().length} 个，涉及 ${byLog.size} 份原文`);
const bad: any[] = []; let checked = 0, noRaw = 0;
const ids = [...byLog.keys()];
for (let i = 0; i < ids.length; i += 20) {
  const { data: logs } = await db.from('job_crawl_logs').select('id, raw_markdown').in('id', ids.slice(i, i + 20));
  for (const lg of logs || []) {
    const src = String(lg.raw_markdown || '');
    for (const j of byLog.get(lg.id) || []) {
      if (src.length < 200) { noRaw++; continue; }
      checked++;
      const r = j.responsibilities ? overlap(j.responsibilities, src) : 1, o = j.overview ? overlap(j.overview, src) : 1;
      if (r < 0.35 || o < 0.35) bad.push({ id: j.id, name: j.name, company: j.institute_or_company_name, resp: +r.toFixed(2), req: +o.toFixed(2), locked: (j.human_locked_fields || []).some((k: string) => ['responsibilities', 'overview'].includes(k)) });
    }
  }
  if (i % 400 === 0) process.stdout.write(`\r比对了 ${Math.min(i + 20, ids.length)}/${ids.length} 份原文，疑似 ${bad.length}`);
}
const byCo = new Map<string, number>(); for (const b of bad) byCo.set(b.company, (byCo.get(b.company) || 0) + 1);
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ checked, noRaw, bad: bad.length, byCompany: [...byCo].sort((a, b) => b[1] - a[1]), items: bad }, null, 1));
console.log(`\n比对 ${checked} 个岗位（另 ${noRaw} 个原文没存下来）：疑似编造 ${bad.length} 个（${(bad.length / Math.max(1, checked) * 100).toFixed(1)}%）→ ${OUT}`);
console.log('最多的企业：', [...byCo].sort((a, b) => b[1] - a[1]).slice(0, 15).map(x => x.join(':')).join('  '));
console.log('例子：'); for (const b of bad.slice(0, 10)) console.log(`  #${b.id} ${b.company}｜${b.name}｜职责重合 ${b.resp}、要求重合 ${b.req}`);
