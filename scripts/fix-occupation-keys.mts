/**
 * 职业的英文 key / 英文名和中文名对不上的，查出来改掉（2026-10-20）：
 *   有的 AI 生成职业套了 O*NET 的泛名当 key（electrical_engineers = 集成电路设计工程技术人员、materials_engineers = 铸造工艺工程师），
 *   key 会作为职业编码（flora_external_id）导给数据部门，也曾误导打标签的模型（错配 1400 多个岗位）。
 *   只改 AI 生成的（source = ai）；数据部门导入的只列出来请他们确认，不擅自改。
 *   改 key 时把岗位 related_career_ids 里的旧 key 一起换掉。
 *   npx tsx scripts/fix-occupation-keys.mts --model qwen-plus [--apply]
 */
process.loadEnvFile('.env.local');
const { toList } = await import('@/lib/list-field');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { generateContent } = await import('@/lib/llm-client');
const { parseJsonLoose } = await import('@/lib/agents/search-llm');
const { logTokenUsage } = await import('@/lib/token-logger');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const APPLY = process.argv.includes('--apply');

const { data } = await selectAll(() => db.from('occupations').select('id, external_id, key, name, name_lang_en, aliases, source').not('if_delete', 'is', true).order('id'));
const all = data as any[];
const taken = new Set(all.map(o => String(o.external_id || '')));
type Verdict = { o: any; ok: boolean; en: string; key: string; why: string };
const verdicts: Verdict[] = [];
for (let i = 0; i < all.length; i += 25) {
  const chunk = all.slice(i, i + 25);
  const r = await generateContent(`下面是职业库里的职业：中文名、当前英文名、当前英文 key。逐个判断英文 key / 英文名指的是不是「同一个职业」，分三种：
- same：同一个职业。单复数、措辞、O*NET 式写法（如 software_developers、elementary_school_teachers_except_special_education）、直译不够地道，都算 same。
- style：同一个职业，只是写法可以更好——也算对得上，不用改。
- different：不是同一个职业，只有这种要改：套了上一级的泛称（如「集成电路设计工程技术人员」配 electrical_engineers、「铸造工艺工程师」配 materials_engineers、「机械绘图员」配 mechanical_engineering_technicians），
  或专业方向不同、完全不相干（如「供应链管理人员」的英文名写成 Construction Project Manager）。
different 的给出准确的英文职业名 en 和 key（小写英文 + 下划线，按中文名的意思起，如 ic_design_engineer、casting_process_engineer）。
只返回 JSON：{"items":[{"n":序号,"verdict":"same|style|different","en":"准确英文名（different 才填）","key":"准确 key（different 才填）","why":"一句话"}]}

${chunk.map((o, j) => `${j + 1}. ${o.name}${(o.aliases || []).length ? `（也叫 ${o.aliases.slice(0, 3).join('/')}）` : ''}｜英文名：${o.name_lang_en || '—'}｜key：${o.external_id}`).join('\n')}`, MODEL, { jsonMode: true, temperature: 0 });
  await logTokenUsage({ tool_name: 'occupation', task_name: 'Occupation Key Check', institution: '', model_id: r.model || MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  for (const it of parseJsonLoose(r.text)?.items || []) {
    const o = chunk[Number(it.n) - 1];
    if (!o || it.verdict !== 'different') continue;   // 单复数 / 措辞 / 写法更好都不改，只改指的不是同一个职业的
    let key = String(it.key || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!key || key === o.external_id) continue;
    for (let n = 2; taken.has(key); n++) key = `${String(it.key).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${n}`;
    taken.add(key);
    verdicts.push({ o, ok: false, en: String(it.en || '').trim(), key, why: String(it.why || '') });
  }
  process.stdout.write(`\r判了 ${Math.min(i + 25, all.length)}/${all.length}，对不上 ${verdicts.length}`);
}
console.log();
const ai = verdicts.filter(v => v.o.source === 'ai'), other = verdicts.filter(v => v.o.source !== 'ai');
console.log(`\nAI 生成的、要改的 ${ai.length} 个：`);
for (const v of ai) console.log(`  #${v.o.id} ${v.o.name}：${v.o.external_id}（${v.o.name_lang_en}）→ ${v.key}（${v.en}）｜${v.why}`);
console.log(`\n数据部门导入 / 官方的、只列出来请他们确认的 ${other.length} 个：`);
for (const v of other) console.log(`  #${v.o.id} ${v.o.name}：${v.o.external_id}（${v.o.name_lang_en}）→ 建议 ${v.key}（${v.en}）｜${v.why}`);
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/occupation-keys-1020.json', JSON.stringify({ ai: ai.map(v => ({ id: v.o.id, name: v.o.name, from: v.o.external_id, from_en: v.o.name_lang_en, to: v.key, to_en: v.en, why: v.why })), other: other.map(v => ({ id: v.o.id, name: v.o.name, from: v.o.external_id, from_en: v.o.name_lang_en, suggest: v.key, suggest_en: v.en, why: v.why })) }, null, 1));

if (APPLY && ai.length) {
  let jobsFixed = 0;
  for (const v of ai) {
    const { error } = await db.from('occupations').update({ external_id: v.key, key: v.key, ...(v.en ? { name_lang_en: v.en } : {}) }).eq('id', v.o.id);
    if (error) { console.log(`✗ #${v.o.id} ${v.o.name}：${error.message}`); continue; }
    // 岗位里引用的旧 key 换成新 key（10-22 起是数组，按整项替换）
    const { data: js } = await selectAll(() => db.from('jobs').select('id, related_career_ids').contains('related_career_ids', [v.o.external_id]).order('id'));
    for (const j of js as any[]) {
      const parts = toList(j.related_career_ids);
      if (!parts.includes(v.o.external_id)) continue;
      await db.from('jobs').update({ related_career_ids: parts.map(p => p === v.o.external_id ? v.key : p) }).eq('id', j.id);
      jobsFixed++;
    }
  }
  console.log(`\n已改 ${ai.length} 个职业的 key，岗位里同步换了 ${jobsFixed} 处`);
}
