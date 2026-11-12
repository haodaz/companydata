/**
 * 生涯体验改成「看师傅做」之后（11-12），老章节台词里还有「你来试试 / 轮到你 / 你操作」：逐句找出来、改成观摩的说法。
 * 只动工位默认只观摩的空间（watchBenchOf），只改说这类话的那几句，其余原样。
 *   npx tsx --env-file=.env.local scripts/lab-career-watch-fix.mts            # 只列出来、给改法，不写库
 *   npx tsx --env-file=.env.local scripts/lab-career-watch-fix.mts --apply    # 写回 lab_chapters.sim
 *   加 --space=<空间 id> 只看一个空间
 */
import { createClient } from '@supabase/supabase-js';
import { generateContent } from '../src/lib/llm-client';
import { watchBenchOf } from '../src/lib/lab-spec';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.find(a => a.startsWith('--space='))?.slice(8);
const MODEL = process.env.LAB_FIX_MODEL || 'qwen-plus';
const RE = /你来试试|你来做|换你|你试试|你操作|你上手|轮到你|你动手|自己动手|上手试/;

async function rewrite(text: string) {
  const prompt = `下面是职业体验课里师傅对来跟岗的学生说的一句台词。现在工位改成学生看师傅做（学生不动手），把台词里让学生动手的说法改成让学生看，比如「轮到你尝试……」改成「你看我做……注意看……」。其余内容、语气、人名、数字一个字都别改。只输出改好的台词。
台词：${text}`;
  const r = await generateContent(prompt, MODEL, { temperature: 0 });
  return r.text.trim().replace(/^台词[:：]\s*/, '');
}

const { data: spaces } = await sb.from('skill_tasks').select('id, title, jd_snapshot').limit(2000);
let total = 0, changed = 0;
for (const t of (spaces || []).filter((x: any) => watchBenchOf(x.jd_snapshot) && (!ONLY || x.id === ONLY))) {
  const { data: chs } = await sb.from('lab_chapters').select('id, title, sim').eq('task_id', t.id);
  for (const c of chs || []) {
    const hits: { path: (string | number)[]; text: string }[] = [];
    const walk = (o: any, path: (string | number)[]) => {
      if (typeof o === 'string') { if (RE.test(o)) hits.push({ path, text: o }); return; }
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k !== 'art' && k !== 'bench') walk(v, [...path, Array.isArray(o) ? Number(k) : k]);
    };
    walk(c.sim, []);
    if (!hits.length) continue;
    const sim = JSON.parse(JSON.stringify(c.sim));
    for (const h of hits) {
      total++;
      const next = await rewrite(h.text);
      console.log(`\n${t.title} · ${c.title} · ${h.path.join('.')}\n  原：${h.text}\n  改：${next}`);
      if (next && next !== h.text && !RE.test(next)) { let o: any = sim; for (const k of h.path.slice(0, -1)) o = o[k]; o[h.path[h.path.length - 1]] = next; changed++; }
    }
    if (APPLY) await sb.from('lab_chapters').update({ sim, updated_at: new Date().toISOString() }).eq('id', c.id);
  }
}
console.log(`\n共 ${total} 句，${changed} 句可改${APPLY ? '，已写回' : '（没写库，加 --apply 才写）'}`);
