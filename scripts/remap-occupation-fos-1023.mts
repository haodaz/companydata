/**
 * 职业库「相关专业」只用项目库 91 个专业的 key（数据部门 10-23 #31）。
 * 存量里不在 91 个里的 key（automation、materials_science_and_engineering …）先让模型做一张对照表：每个对到 91 个里最接近的 0–2 个，
 * 对不上的给空（不硬凑）；再照表替换，去重，最多 5 个。人工锁定的不动。
 *   npx tsx scripts/remap-occupation-fos-1023.mts --model qwen-plus [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { generateContent } = await import('@/lib/llm-client');
const { parseJsonLoose } = await import('@/lib/agents/search-llm');
const { logTokenUsage } = await import('@/lib/token-logger');
const { isKnownModel } = await import('@/lib/model-options');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', ''), APPLY = process.argv.includes('--apply');
if (!MODEL || !isKnownModel(MODEL)) { console.error('--model 要用模型选单里的'); process.exit(1); }
const FOS = JSON.parse(fs.readFileSync('src/data/fos-91.json', 'utf8')) as { key: string; name: string; name_en: string }[];
const KEYS = new Set(FOS.map(f => f.key));

const { data } = await selectAll(() => db.from('occupations').select('id, name, relevant_fos_ids, human_locked_fields').not('if_delete', 'is', true).order('id'));
const occ = (data as any[]).filter(o => !(o.human_locked_fields || []).includes('relevant_fos_ids'));
const bad = [...new Set(occ.flatMap(o => (o.relevant_fos_ids || []).filter((k: string) => !KEYS.has(k))))] as string[];
console.log(`不在 91 个里的 key ${bad.length} 种`);
const map: Record<string, string[]> = {};
for (let i = 0; i < bad.length; i += 80) {
  const chunk = bad.slice(i, i + 80);
  const r = await generateContent(`把下面这些专业 key 各自对到「91 个标准专业」里最接近的 0–2 个（意思相同或明显被包含才对，实在对不上给空数组，不要硬凑）。
91 个标准专业（key=中文名 / 英文名）：
${FOS.map(f => `${f.key}=${f.name} / ${f.name_en}`).join('\n')}
要对的 key：
${chunk.join('\n')}
只返回 JSON：{"map":{"<要对的 key>":["<标准 key>"]}}`, MODEL, { jsonMode: true, temperature: 0 });
  await logTokenUsage({ tool_name: 'occupation', task_name: 'Remap FOS 91', institution: '职业库', model_id: r.model || MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  const m = parseJsonLoose(r.text)?.map || {};
  for (const k of chunk) map[k] = ((m[k] || []) as string[]).filter(x => KEYS.has(x)).slice(0, 2);
}
fs.writeFileSync('reports/occupation-fos-map-1023.json', JSON.stringify(map, null, 1));
console.log('对不上的：', Object.entries(map).filter(([, v]) => !v.length).map(([k]) => k).join(', '));
let n = 0;
for (const o of occ) {
  const cur = (o.relevant_fos_ids || []) as string[];
  if (cur.every(k => KEYS.has(k))) continue;
  const next = [...new Set(cur.flatMap(k => KEYS.has(k) ? [k] : map[k] || []))].slice(0, 5);
  n++;
  if (n <= 8) console.log(`${o.name}：${cur.join(',')} → ${next.join(',') || '（空）'}`);
  if (APPLY) await db.from('occupations').update({ relevant_fos_ids: next.length ? next : null }).eq('id', o.id);
}
console.log(`${APPLY ? '已改' : '要改'} ${n} 个职业`);
process.exit(0);
