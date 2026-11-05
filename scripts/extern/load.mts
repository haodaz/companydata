/**
 * Extern 入库（2026-11-04）：
 *   programs  data/extern/programs.json → work_external_simulations（source = extern，迁移 051 的表，不用新迁移）
 *   works     data/extern/works.json    → work_external_works（迁移 063，脱敏后的学员作品，按项目挂）
 *   npx tsx scripts/extern/load.mts programs|works [--apply]
 * 企业挂库口径同 Forage：规范化后名字严格相等才挂 company_id，对不上不新建（宁空不错）。
 */
import fs from 'node:fs';
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');

const [cmd] = process.argv.slice(2); const APPLY = process.argv.includes('--apply');
const REGION = /\b(u\.?s\.?a?|uk|inc|ltd|llp|llc|plc|group|global|co|the)\b\.?/g;
const norm = (s: string) => (s || '').toLowerCase().replace(/&/g, 'and').replace(REGION, '').replace(/[^a-z0-9一-龥]+/g, '');
const { programs, fetched_at } = JSON.parse(fs.readFileSync('data/extern/programs.json', 'utf8'));

/** 作品里的项目名 → 项目 external_id（作品块里写的是项目标题，可能少「Externship」或带「&」差异） */
const key = (s: string) => norm(s).replace(/externship|extern$/g, '');
const byTitle = new Map<string, string>(programs.map((p: any) => [key(p.title), p.external_id]));
// 作品里写的项目名常和项目页略有出入（「Amazon Operational Strategy …」vs「Amazon Fulfillment Center Operational Strategy …」）：
// 先精确对；对不上再在同一家公司的项目里按标题用词重合度挑（≥0.5，或这家只有一个项目）
const STOP = new Set(['externship', 'extern', 'with', 'and', 'the', 'for', 'of', 'in', 'a', 'an', 'to', 'advanced', 'by']);
const words = (s: string) => new Set(String(s || '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w)));
const sim = (a: Set<string>, b: Set<string>) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / Math.max(1, Math.min(a.size, b.size)); };
// 人工对照（11-04 看过）：改过名的同一项目挂上；名字像但其实是另一个（已下线）项目的不挂
const MANUAL: [RegExp, string | null][] = [
  [/Snap Inc\. Augmented Reality/i, 'snap-ar-lens-creator'],
  [/Khan Academy Monetization Strategy/i, 'khan-academy-strategic-partnerships-earned-revenue'],
  [/Outamation:? AI-Powered Workflow Automation/i, null],
];
const matchProgram = (title: string, brand: string) => {
  const man = MANUAL.find(([re]) => re.test(title)); if (man) return man[1];
  const exact = byTitle.get(key(title)); if (exact) return exact;
  const bk = norm(brand); const bw = words(brand);
  const tw = new Set([...words(title)].filter(w => !bw.has(w)));   // 去掉公司名本身的词，看真正说明项目的词
  if (!tw.size) return null;
  const cands = programs.filter((p: any) => bk && [p.company, p.title, p.external_id].some((x: string) => { const n = norm(String(x).replace(/-/g, ' ')); return n.includes(bk) || (n.length >= 4 && bk.includes(norm(p.company))); }));
  const scored = cands.map((p: any) => { const pw = new Set([...words(p.title), ...words(p.external_id.replace(/-/g, ' '))]); let hit = 0; for (const w of tw) if (pw.has(w)) hit++; return { p, s: hit / tw.size }; }).sort((x: any, y: any) => y.s - x.s);
  const top = scored[0]; if (!top) return null;
  if (scored[1] && scored[1].s === top.s && top.s < 1) return null;                 // 两个项目一样像：不猜
  return top.s >= 0.6 || (cands.length === 1 && top.s >= 0.4) ? top.p.external_id : null;
};

if (cmd === 'programs') {
  const { data: cs0 } = await selectAll(() => db.from('companies').select('id, name, name_en, brief_name, aliases, entity_level').not('if_delete', 'is', true).order('id'));
  const cs = [...(cs0 as any[])].sort((a, b) => (a.entity_level === 'group' ? 0 : 1) - (b.entity_level === 'group' ? 0 : 1));
  const byName = new Map<string, number>();
  for (const c of cs) for (const n of [c.name, c.name_en, c.brief_name, ...(c.aliases || [])]) { const k = norm(n); if (k.length >= 3 && !byName.has(k)) byName.set(k, c.id); }
  const rows = programs.map((p: any) => ({
    source: 'extern', external_id: p.external_id, url: p.url, company_name: p.company || null, company_slug: null,
    company_id: byName.get(norm(p.company)) ?? null,
    title: p.title, tagline: p.tagline || null,
    career_areas: p.chips.slice(0, 2), skills: p.chips,
    role_summary: p.description || null,                       // 项目背景：你进去干什么
    goal_summary: (p.outputs || []).join('\n') || null,        // 交付什么
    difficulty: null, time_guidance: p.weeks ? `${p.weeks} 周 · 企业导师带、每周直播` : null, rating: null, review_samples: [],
    task_structure: (p.schedule || []).map((s: string, i: number) => { const m = s.match(/^(Project|Week|Module|Phase) (\d+)\s*—\s*(.*)$/); return { position: m ? +m[2] : i + 1, title: m ? m[3] : s, type: 'normal' }; }),
    achievements: [p.opportunity && ({ 'Internship Opportunity': '实习机会', 'Interview Opportunity': '面试机会', 'Referral Opportunity': '内推机会' } as any)[p.opportunity] || p.opportunity, '企业认证的作品集'].filter(Boolean),
    company_type: null, launch_date: null,
    meta: { overview: p.description, outputs: p.outputs, skill_sentences: p.skills, host_title: p.host_title, ai_tools: p.ai_tools, cohorts: p.cohorts, latest_start: p.start, cohort_slugs: p.cohort_slugs, kind: '企业导师带的线上实习（多周）' },
    fetched_at, updated_at: new Date().toISOString(),
  }));
  console.log(`项目 ${rows.length} 个，${new Set(rows.map((r: any) => r.company_name)).size} 家公司，对上企业库 ${rows.filter((r: any) => r.company_id).length} 个：${rows.filter((r: any) => r.company_id).map((r: any) => r.company_name).join('、')}`);
  if (APPLY) { const { error } = await db.from('work_external_simulations').upsert(rows, { onConflict: 'source,external_id' }); if (error) throw error; console.log('已写库'); }
}

if (cmd === 'works') {
  const { works, fetched_at: wAt } = JSON.parse(fs.readFileSync('data/extern/works.json', 'utf8'));
  const miss: Record<string, number> = {};
  const rows = works.map((w: any) => { const pid = matchProgram(w.program, w.brand); if (!pid) { miss[w.program] = (miss[w.program] || 0) + 1; return null; }
    return { source: 'extern', program_id: pid, program_title: w.program, cohort: w.cohort || null, in_progress: !!w.in_progress, top_performer: !!w.top_performer, tags: w.tags, overview: w.overview || null, accomplished: w.accomplished || null, breakdown: w.breakdown || null, artifact_kinds: w.artifact_kinds, fetched_at: wAt };
  }).filter(Boolean).filter((r: any) => r.overview || r.accomplished || r.breakdown);   // 只挂了徽章、没写内容的不要
  console.log(`作品 ${works.length} 份 → 对上项目、有内容的 ${rows.length} 份；Top performer ${rows.filter((r: any) => r.top_performer).length} 份`);
  console.log('对不上项目的（多是已下线的老项目）：', Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} ${n}`).join('；'));
  if (APPLY) {
    await db.from('work_external_works').delete().eq('source', 'extern');
    for (let i = 0; i < rows.length; i += 200) { const { error } = await db.from('work_external_works').insert(rows.slice(i, i + 200)); if (error) throw error; }
    console.log('已写库');
  }
}
