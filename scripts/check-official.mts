/**
 * 复查「市场新兴」职业是不是其实是官方职业（职业大典 / 人社部新职业 / O*NET）——2026-10-20 用户定：两种来源不能混。
 * 是官方的：origin 改 framework，官方名称记进别名（职业名不改：百业空间按名称 / 别名关联），出处记 emergence.official。
 *   npx tsx scripts/check-official.mts --model qwen-plus [--apply] [--origin market]
 * 不加 --apply 只出清单。注意：模型会把上一级大类、技术员当成同一个职业（10-20 复查 40 个误判 3 个），先看清单再决定，别直接 --apply。
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { checkOfficial } = await import('@/lib/occupation-signals');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const APPLY = process.argv.includes('--apply');
const { data } = await db.from('occupations').select('id, name, aliases, emergence').eq('origin', opt('origin', 'market')).not('if_delete', 'is', true).order('id');
console.log(`复查 ${data?.length || 0} 个职业${APPLY ? '（写库）' : '（只出清单）'}`);
let i = 0, off = 0;
const FW: Record<string, string> = { cn_dadian: '职业大典', cn_new: '人社部新职业', onet: 'O*NET' };
await Promise.all(Array.from({ length: 2 }, async () => {
  while (i < (data || []).length) {
    const o = data![i++];
    const r = await checkOfficial(o.name, o.aliases || [], MODEL).catch(() => null);
    if (!r) { console.log(`✗ ${o.name}：查询失败`); continue; }
    if (!r.official) { console.log(`· ${o.name}：不是官方职业（${r.note.slice(0, 50)}）`); continue; }
    off++;
    console.log(`✓ ${o.name} → ${FW[r.framework!]}「${r.official_name}」${r.code || ''}${r.verified ? '' : '（出处待核实）'}`);
    if (APPLY) {
      const aliases = [...new Set([...(o.aliases || []), ...(r.official_name !== o.name ? [r.official_name!] : [])])];
      await db.from('occupations').update({ origin: 'framework', aliases, emergence: { ...(o.emergence || {}), official: { framework: r.framework, name: r.official_name, code: r.code, url: r.url, verified: r.verified } } }).eq('id', o.id);
    }
  }
}));
console.log(`完成：${off} 个其实是官方职业${APPLY ? '，已改标官方框架' : '（加 --apply 写库）'}`);
