/**
 * 科研产品批量打标签：照数据部门给的单个产品提示词（labelPrompt）的规则，一次给模型 10 个产品，回 JSON。
 * 只补 labels 为空的。默认只处理某个来源（--source 会刊链接里的关键词），3 路并发。
 *   npx tsx scripts/research/label-products-batch.mts --source analyticachina [--model qwen-plus] [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { cleanLabels, kindOf } = await import('@/lib/research-products');
const { generateContent } = await import('@/lib/llm-client');
const { parseJsonLoose } = await import('@/lib/agents/search-llm');
const { logTokenUsage } = await import('@/lib/token-logger');
const { isKnownModel } = await import('@/lib/model-options');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', 'qwen-plus'), SRC = opt('source', ''), APPLY = process.argv.includes('--apply');
if (!isKnownModel(MODEL)) { console.error('--model 要用模型选单里的'); process.exit(1); }
const { data } = await selectAll(() => {
  let q = db.from('research_products').select('id, name, kind, description, supplier:companies(name)').is('labels', null).eq('if_delete', false).order('id');
  if (SRC) q = q.like('source_url', `%${SRC}%`);
  return q;
});
const rows = data as any[];
console.log(`要打标签 ${rows.length} 个`);
if (!APPLY) process.exit(0);
const strip = (h: string) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
const batches: any[][] = []; for (let i = 0; i < rows.length; i += 10) batches.push(rows.slice(i, i + 10));
let done = 0, bad = 0;
async function worker() {
  while (batches.length) {
    const b = batches.shift()!;
    const list = b.map((p, i) => `【${i}】产品名称：${p.name}｜生产/销售公司：${p.supplier?.name || '无'}｜产品类型：${kindOf(p.kind)?.name || '无'}｜产品介绍：${strip(p.description) || '无'}`).join('\n');
    const prompt = `你是一个专业的产品标签生成专家。请为下面每个产品各生成 3-5 个产品标签。

要求：
1. 每个产品 3-5 个标签，覆盖产品的应用领域、技术特点、材质/性能等维度。
2. 每个标签 8 个字以内（含 8 个字）。
3. 同一产品的多个标签用中文分号（；）分隔。
4. 标签要具体、专业、准确，能体现产品的核心卖点。

参考示例：
产品：电感耦合等离子体质谱仪 (ICP-MS)
输出：元素分析；地质环境；半导体级；快速装机

产品列表：
${list}

只返回 JSON：{"labels":{"0":"标签1；标签2；标签3", "1":"…"}}`;
    try {
      const r = await generateContent(prompt, MODEL, { jsonMode: true, temperature: 0 });
      await logTokenUsage({ tool_name: 'research-products' as any, task_name: 'Research Product Labels (batch)', institution: SRC, model_id: r.model || MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
      const got = parseJsonLoose(r.text)?.labels || {};
      for (const [i, p] of b.entries()) { const l = cleanLabels(got[String(i)] || ''); if (l) { await db.from('research_products').update({ labels: l }).eq('id', p.id); done++; } else bad++; }
    } catch (e: any) { bad += b.length; console.log('✗', e.message?.slice(0, 120)); }
    if (done % 500 < 10) console.log(`已打 ${done}，没打上 ${bad}`);
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`完成：打上 ${done}，没打上 ${bad}`);
