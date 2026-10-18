/**
 * 千问记账重算：qwen-flash / qwen3.x 以前没登记价目，按 Gemini 1.5 Flash 美元价兜底记错了（2026-10-18 核对发现）。
 * 按 model_pricing（没登记的按同档千问价）重算 total_cost_usd / search_cost_usd。可重复跑。
 *   npx tsx scripts/reprice-qwen.mts [--dry]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const rate = parseFloat(process.env.USD_CNY_RATE || '7.2');
const { data: pr } = await db.from('model_pricing').select('model_id, currency, input_per_m, output_per_m, search_per_k').like('model_id', 'qwen%');
const P = new Map((pr || []).map((r: any) => [r.model_id, r]));
const price = (m: string) => P.get(m) || (/flash|turbo/.test(m) ? (P.get('qwen-flash') || { currency: 'CNY', input_per_m: 0.15, output_per_m: 1.5, search_per_k: 4 }) : (P.get('qwen-plus') || { currency: 'CNY', input_per_m: 0.8, output_per_m: 2, search_per_k: 4 }));
const { data } = await selectAll(() => db.from('token_usage_logs').select('id, model_id, total_input_tokens, total_output_tokens, search_calls, total_cost_usd').like('model_id', 'qwen%').order('id'));
let before = 0, after = 0, changed = 0;
const ups: { id: number; c: number; s: number }[] = [];
for (const r of data as any[]) {
  const p: any = price(r.model_id);
  const k = p.currency === 'CNY' ? 1 / rate : 1;
  const s = ((r.search_calls || 0) / 1000) * +p.search_per_k * k;
  const c = ((r.total_input_tokens || 0) / 1e6 * +p.input_per_m + (r.total_output_tokens || 0) / 1e6 * +p.output_per_m) * k + s;
  before += Number(r.total_cost_usd || 0); after += c;
  if (Math.abs(c - Number(r.total_cost_usd || 0)) > 1e-7) ups.push({ id: r.id, c, s });
}
console.log(`千问记录 ${(data as any[]).length} 条，原记 $${before.toFixed(2)}（¥${(before * rate).toFixed(2)}）→ 重算 $${after.toFixed(2)}（¥${(after * rate).toFixed(2)}），要改 ${ups.length} 条`);
if (!process.argv.includes('--dry')) {
  for (let i = 0; i < ups.length; i += 50) await Promise.all(ups.slice(i, i + 50).map(u => db.from('token_usage_logs').update({ total_cost_usd: u.c, search_cost_usd: u.s }).eq('id', u.id)));
  console.log('已改');
}
