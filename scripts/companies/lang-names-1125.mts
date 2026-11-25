/**
 * 企业名称分中英文回填（数据部门 11-25，迁移 077 之后跑）：
 *   名称 (Cn)       ← name 带中文就用 name；否则工商名带中文用工商名；都没有留空（以后跑画像让 AI 补）
 *   公司简称 (Cn/En) ← brief_name 按「;、/」拆开，带中文的进 Cn、其余进 En
 *   曾用名 (Cn/En)   ← historical_name 同样拆（括号里的也拆出来，「香港实体曾用名：」这类说明去掉）
 * 多个值英文「;」隔开。只填空的；人工锁定的字段不动；原来的 brief_name / historical_name 不改。
 *   npx tsx scripts/companies/lang-names-1125.mts          # 只看，不写
 *   npx tsx scripts/companies/lang-names-1125.mts --apply
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin } = await import('../../src/lib/supabase');
const { selectAll } = await import('../../src/lib/supabase-all');
const fs = await import('node:fs');
const { generateContent } = await import('../../src/lib/llm-client');
const { parseJsonLoose } = await import('../../src/lib/agents/search-llm');
const { withCost } = await import('../../src/lib/token-logger');
let llm = 0;

const APPLY = process.argv.includes('--apply');
const NEW = ['name_lang_cn', 'brief_name_lang_cn', 'brief_name_lang_en', 'historical_name_lang_cn', 'historical_name_lang_en'];
const zh = (s: string) => /[一-鿿぀-ヿ]/.test(s);   // 日文假名也算「中文」那一栏（汉字名）

function split(v: string | null, parens: boolean): { cn: string | null; en: string | null } {
  if (!v || !v.trim()) return { cn: null, en: null };
  let s = v;
  if (parens) s = s.replace(/[（(]([^（）()]*)[）)]/g, (m, inner) => zh(inner) !== zh(s.replace(m, '')) ? `;${inner};` : m);   // 括号里语言不同才拆
  const parts = s.split(/[;；、/]|\s+\/\s+/).map(x => x.replace(/^[^：:]{0,12}(曾用名|亦称|又称|原名)[：:]?/, '').replace(/^[，,\s]+|[，,\s]+$/g, '').trim()).filter(Boolean);
  const uniq = (a: string[]) => a.length ? [...new Set(a)].join(';') : null;
  return { cn: uniq(parts.filter(zh)), en: uniq(parts.filter(x => !zh(x) && /[A-Za-z]{2}/.test(x) && !/^\d{6}\.[A-Z]{2}$/.test(x))) };
}
/** 曾用名里夹着说明文字 / 年份 / 两种语言混着括号：规则拆不干净，交给千问只拆不编 */
const messy = (v: string | null) => !!v && (/更名|改名|亦称|又称|至今|含|期间|\d{4}\s*[–\-—~至年]|[（(][^）)]*[\u4e00-\u9fff][^）)]*[A-Za-z]{3}|[A-Za-z]{3}[^（(]*[（(][^）)]*[\u4e00-\u9fff]/.test(v) || (zh(v) && /[A-Za-z]{4}/.test(v)));
async function llmSplit(r: any): Promise<{ cn: string | null; en: string | null }> {
  const res = await generateContent(`企业「${r.name}」的「曾用名」字段原文：
${r.historical_name}

把里面真正的曾用名（这家机构以前正式用过的名称）抄出来，分成中文和英文两组。规则：
- 只照抄原文里的名称，不改字、不翻译、不补充；年份、说明文字（「2025年更名为…」「含拆分后各校」）、股票代码都不要
- 现在的名称「${r.name}」和简称「${r.brief_name || ''}」不算曾用名
- 带汉字的进 cn，纯外文的进 en；多个用英文分号 ; 隔开；没有就 null
只返回 JSON：{"cn": null, "en": null}`, 'qwen3.7-plus', { jsonMode: true, temperature: 0 });
  const v = parseJsonLoose(res.text) || {};
  const clean = (x: any) => typeof x === 'string' && x.trim() ? x.split(/[;；]/).map(s => s.trim()).filter(s => s && r.historical_name.includes(s)).join(';') || null : null;   // 原文里没有的一律扔掉
  return { cn: clean(v.cn), en: clean(v.en) };
}

const base = 'id,name,registered_name,brief_name,historical_name,human_locked_fields';
let { data, error } = await selectAll(() => supabaseAdmin.from('companies').select(`${base},${NEW.join(',')}`).order('id'));
if (error && !APPLY) { console.log('（077 还没跑，先按空列预览）'); ({ data, error } = await selectAll(() => supabaseAdmin.from('companies').select(base).order('id'))); }
if (error) throw error;
const changes: { id: number; name: string; patch: Record<string, string> }[] = [];
for (const r of data as any[]) {
  const locked = new Set<string>(r.human_locked_fields || []);
  const b = split(r.brief_name, false), h = messy(r.historical_name) ? (llm++, await withCost({ tool_name: 'company_lang_names', task_name: '曾用名分中英文 11-25' }, () => llmSplit(r))) : split(r.historical_name, true);
  const same = new Set([r.name, r.brief_name].filter(Boolean).map((x: string) => x.trim()));
  const drop = (x: string | null) => x ? x.split(';').filter(y => !same.has(y)).join(';') || null : null;
  h.cn = drop(h.cn); h.en = drop(h.en);
  const want: Record<string, string | null> = {
    name_lang_cn: zh(r.name || '') ? r.name.trim() : (r.registered_name && zh(r.registered_name) ? r.registered_name.trim() : null),
    brief_name_lang_cn: b.cn, brief_name_lang_en: b.en, historical_name_lang_cn: h.cn, historical_name_lang_en: h.en,
  };
  const patch: Record<string, string> = {};
  for (const [k, v] of Object.entries(want)) if (v && !r[k] && !locked.has(k)) patch[k] = v;
  if (Object.keys(patch).length) changes.push({ id: r.id, name: r.name, patch });
}
const count = Object.fromEntries(NEW.map(k => [k, changes.filter(c => c.patch[k]).length]));
console.log(`企业 ${data.length} 家，要写 ${changes.length} 家（曾用名交给千问拆的 ${llm} 家）`, count);
for (const c of changes.filter(c => c.patch.historical_name_lang_cn || c.patch.historical_name_lang_en).slice(0, 40)) console.log(c.id, c.name, JSON.stringify(c.patch));

fs.writeFileSync('reports/1125-名称分中英文.json', JSON.stringify(changes, null, 1));
if (APPLY) {
  let ok = 0, bad = 0;
  const q = [...changes];
  await Promise.all([0, 1, 2].map(async () => {
    for (let c; (c = q.shift());) {
      const { error } = await supabaseAdmin.from('companies').update(c.patch).eq('id', c.id);
      error ? (bad++, console.log('✗', c.id, error.message)) : ok++;
    }
  }));
  console.log(`写入 ${ok}，失败 ${bad}`);
}
