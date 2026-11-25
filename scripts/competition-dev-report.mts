/**
 * 技术团队打野食清单（11-25）：开发者赛 / 黑客松里，社会团队能报、还没截止的，按奖励排。
 *   npx tsx scripts/competition-dev-report.mts --task <任务 id>
 * 出 reports/开发比赛黑客松清单-<日期>.xlsx：推荐 / 这次新入库全部 / 只限学生 / 库里原有还在报名
 */
import XLSX from 'xlsx';
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { REWARD_LABELS, COMPETITION_KIND_LABELS } = await import('@/lib/competition-fields');

const i = process.argv.indexOf('--task'), TASKS = i > 0 ? process.argv[i + 1].split(',') : [];
const today = new Date().toISOString().slice(0, 10);
const { data: ss } = TASKS.length ? await db.from('competition_searches').select('id').in('task_id', TASKS) : { data: [] as any[] };
const sids = new Set((ss || []).map((s: any) => s.id));
const { data: all } = await selectAll(() => db.from('competitions').select('*').order('id'));

const DEV = new Set(['hackathon', 'developer', 'data_science']);
const dl = (c: any) => { const m = String(c.registration_deadline_str || '').match(/(20\d\d)[-./年](\d{1,2})(?:[-./月](\d{1,2}))?/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${(m[3] || '28').padStart(2, '0')}` : null; };
const open = (c: any) => { const d = dl(c); return d ? d >= today : !/ended|closed|已结束|已截止/i.test(String(c.status || '')); };
const score = (c: any) => { const r: string[] = c.reward_types || []; return (r.includes('hardware') ? 4 : 0) + (r.includes('cash') ? 3 : 0) + (r.includes('credits') ? 2 : 0) + (/万/.test(c.prize_total || '') ? 1 : 0); };
const row = (c: any) => ({
  id: c.id, 比赛: c.name, 主办: c.organizer, 类型: COMPETITION_KIND_LABELS[c.kind]?.label || c.kind, 形式地点: [c.format, c.location].filter(Boolean).join(' · '),
  报名截止: c.registration_deadline_str, 比赛时间: [c.event_start_str, c.event_end_str].filter(Boolean).join(' ~ '), 总奖金: c.prize_total,
  奖励: (c.reward_types || []).map((x: string) => REWARD_LABELS[x]?.label || x).join('、'), 设备奖品: c.hardware_prize_detail, 奖项: c.prizes,
  参赛资格: c.eligibility, 只限学生: c.student_only === true ? '是' : c.student_only === false ? '否' : '未写明', 队伍人数: c.team_size, 技术栈: Array.isArray(c.tech_stack) ? c.tech_stack.join('、') : c.tech_stack,
  中国大陆能否报: (String(c.note || '').match(/^中国大陆：([^—（\n]+)/) || [])[1] || '', 资格原文: (String(c.note || '').match(/^中国大陆：[^\n]*?——原文：([^\n]+)/) || [])[1] || '',
  适合我们: c.fit_hint, 官网: c.official_url, 报名链接: c.registration_url,
});
const mine = (all as any[]).filter(c => sids.has(c.search_id));
const pick = (list: any[]) => list.filter(c => open(c) && c.student_only !== true).sort((a, b) => score(b) - score(a) || String(dl(a) || '9').localeCompare(String(dl(b) || '9')));
const isOverseas = (c: any) => /^中国大陆：/.test(c.note || '');
const rec = pick(mine.filter(c => (DEV.has(c.kind) || c.kind == null) && !isOverseas(c)));
const abroad = pick(mine.filter(c => isOverseas(c) && !/^中国大陆：不可报/.test(c.note || ''))).sort((a, b) => Number(/^中国大陆：可报/.test(b.note)) - Number(/^中国大陆：可报/.test(a.note)));
const older = pick((all as any[]).filter(c => !sids.has(c.search_id) && DEV.has(c.kind)));

const wb = XLSX.utils.book_new();
const add = (n: string, rows: any[]) => { const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 说明: '无' }]); ws['!cols'] = Object.keys(rows[0] || { 说明: 1 }).map(k => ({ wch: /比赛|奖项|参赛资格|适合|官网|报名链接|设备/.test(k) ? 36 : 12 })); XLSX.utils.book_append_sheet(wb, ws, n); };
add('推荐（社会团队能报·没截止）', rec.map(row));
add('海外·中国能报（线上为主）', abroad.map(row));
add('这次新入库全部', mine.map(row));
add('只限学生', mine.filter(c => c.student_only === true).map(row));
add('库里原有·还在报名', older.map(row));
const out = `reports/开发比赛黑客松清单-${today.replace(/-/g, '')}.xlsx`;
XLSX.writeFile(wb, out);
console.log(out, { 新入库: mine.length, 推荐: rec.length, 海外能报或没写明: abroad.length, 只限学生: mine.filter(c => c.student_only === true).length, 库里原有还在报名: older.length });
for (const c of [...rec.slice(0, 25), ...abroad.slice(0, 25)]) console.log(`- [${(c.reward_types || []).join(',')}] ${c.name} | ${c.organizer || ''} | 截止 ${c.registration_deadline_str || '?'} | ${c.prize_total || ''} | ${c.hardware_prize_detail || ''} | 资格 ${String(c.eligibility || '').slice(0, 40)} | ${String(c.note || '').split('\n')[0].slice(0, 30)}`);

// ── PDF：每个比赛一张卡片，明细全附上（11-25 用户要） ──
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[ch]);
const card = (c: any, n: number) => {
  const r = row(c) as any;
  const kv = [['主办', r.主办], ['类型', r.类型], ['形式 / 地点', r.形式地点], ['报名截止', r.报名截止], ['比赛时间', r.比赛时间], ['总奖金', r.总奖金], ['奖励', r.奖励], ['设备奖品', r.设备奖品], ['奖项', r.奖项], ['参赛资格', r.参赛资格], ['只限学生', r.只限学生], ['队伍人数', r.队伍人数], ['技术栈', r.技术栈],
    ...(r.中国大陆能否报 ? [['中国大陆', r.中国大陆能否报 + (r.资格原文 ? `　原文：${r.资格原文}` : '')]] : []), ['适合我们', r.适合我们], ['简介', c.introduction]].filter(([, v]) => v != null && String(v).trim());
  const links = [['官网', r.官网], ['报名', r.报名链接]].filter(([, v]) => v).map(([k, v]) => `<div class="lk"><b>${k}</b> <a href="${esc(v)}">${esc(v)}</a></div>`).join('');
  return `<div class="card"><h3><span class="n">${n}</span>${esc(r.比赛)}${r.奖励 ? `<span class="tag">${esc(r.奖励)}</span>` : ''}</h3><table>${kv.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table>${links}<div class="id">库内 id ${c.id}</div></div>`;
};
const section = (t: string, d: string, list: any[]) => `<h2>${t}<small>${list.length} 个</small></h2><p class="d">${d}</p>${list.map((c, i) => card(c, i + 1)).join('')}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,"PingFang SC","Hiragino Sans GB",sans-serif;color:#1f2329;font-size:11px;margin:0}
h1{font-size:22px;margin:0 0 4px} .sub{color:#646a73;margin-bottom:14px}
.sum{display:flex;gap:10px;margin:10px 0 18px}.sum div{flex:1;border:1px solid #e5e6eb;border-radius:8px;padding:8px 10px}.sum b{display:block;font-size:20px;color:#3370ff}
h2{font-size:16px;border-left:4px solid #3370ff;padding-left:8px;margin:22px 0 4px;page-break-after:avoid} h2 small{font-weight:normal;color:#8f959e;margin-left:8px;font-size:12px}
.d{color:#646a73;margin:0 0 10px}
.card{border:1px solid #e5e6eb;border-radius:8px;padding:10px 12px;margin-bottom:10px;page-break-inside:avoid}
h3{font-size:13px;margin:0 0 6px}.n{display:inline-block;min-width:18px;color:#3370ff}.tag{font-weight:normal;font-size:10px;background:#eef3ff;color:#3370ff;border-radius:4px;padding:1px 6px;margin-left:8px}
table{border-collapse:collapse;width:100%}th{width:72px;text-align:left;color:#8f959e;font-weight:normal;vertical-align:top;padding:2px 6px 2px 0}td{padding:2px 0;white-space:pre-wrap;word-break:break-word}
.lk{margin-top:4px;word-break:break-all}.lk a{color:#3370ff}.id{color:#bbbfc4;font-size:9px;text-align:right}
</style></head><body>
<h1>开发比赛 / 黑客松清单</h1><div class="sub">数据工厂 · 赛事雷达 · ${today} · 只收原文写着的信息，没写的留空；报名前请以官网为准</div>
<div class="sum"><div><b>${rec.length}</b>国内 · 社会团队能报 · 没截止</div><div><b>${abroad.length}</b>海外 · 中国可报或规则没写明</div><div><b>${mine.length}</b>这次新入库</div><div><b>${older.length}</b>库里原有 · 还在报名</div></div>
${section('一、国内：社会团队能报、还没截止', '给设备 / 给钱 / 给算力的排前面，同档按截止时间先后。', rec)}
${section('二、海外：中国大陆能报（线上为主）', '「可报」= 规则写明不限国家或排除名单里没有中国（附原文）；「规则没写明」的报名前自己再看一眼规则。已排除写明不能报的。', abroad)}
${section('三、库里原有、还在报名的开发类比赛', '之前入库的，截止时间还没过、不只限学生。', older)}
</body></html>`;
const htmlPath = out.replace(/\.xlsx$/, '.html');
(await import('node:fs')).writeFileSync(htmlPath, html);
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('file://' + (await import('node:path')).resolve(htmlPath), { waitUntil: 'load' });
await page.pdf({ path: out.replace(/\.xlsx$/, '.pdf'), format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;color:#999;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
await browser.close();
console.log('PDF', out.replace(/\.xlsx$/, '.pdf'));
