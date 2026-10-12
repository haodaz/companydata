/**
 * 给一个空间插一章「一线工位」（一天里原来只有指挥 / 办公的活时，补一章真动手的）：
 *   npx tsx scripts/lab-insert-chapter.mts <空间 id 前缀> <时段> <章节标题> <规格名> --brief "一句话" --who "带教的人" --say "台词" [--image <底图>]
 * 规格名 = src/lib/lab-<名>-spec.ts 里的 *Spec。章节 = 带教一句话 → 台面 → 收尾写结论。按时段排进 seq，直接发布。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { sanitizeBenchSpec, simulateScript } = await import('../src/lib/bench');
const argv = process.argv.slice(2);
const opt = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : ''; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const [prefix, slot, title, name] = pos;
if (!prefix || !slot || !title || !name) { console.error('用法见文件头'); process.exit(1); }

const mod: any = await import(`../src/lib/lab-${name}-spec`);
const fn = Object.values(mod).find((v: any) => typeof v === 'function' && /Spec$/.test(v.name)) as any;
const spec = fn(opt('image'));
if (!sanitizeBenchSpec(spec)) throw new Error('规格表达式有问题');
const tr = simulateScript(spec, spec.expertScript || [], Math.max(60, (spec.expertScript || []).slice(-1)[0]?.t || 0) + 12, 0.25);
console.log(`示范：目标 ${tr.metrics.goals_done} / ${tr.metrics.goals_total} 违规 ${tr.metrics.violations} 提醒 ${tr.metrics.warnings}`);

const { data: all } = await db.from('skill_tasks').select('id, title, profile');
const task = (all || []).find(t => t.id.startsWith(prefix));
if (!task) throw new Error('没有这个空间');
const { data: chs } = await db.from('lab_chapters').select('id, seq, slot, line, cover_cast, sim').eq('task_id', task.id).order('seq');
const list = chs || [];
if (list.some(c => c.slot === slot)) throw new Error(`已经有 ${slot} 这一章了`);
const before = list.filter(c => (c.slot || '') < slot);
const neighbor = before[before.length - 1] || list[0];
// 美术（立绘 / 场景）从相邻章借：有 art 才进沉浸模式
const sim = {
  title,
  intro: opt('brief'),
  art: (neighbor as any)?.sim?.art,
  steps: [
    { id: 'bench', type: 'bench', scene: { who: opt('who') || '带教师傅', text: opt('say') || '上手吧，水不等人。', time: slot }, prompt: opt('prompt') || `${title}：按台面上的步骤做。`, bench: spec },
    { id: 'final', type: 'text', scene: { who: opt('who') || '带教师傅', text: '收工。回头说说：哪一步最要命，哪一步你差点漏了？', time: slot }, prompt: '用几句话写下这一段里最关键的两个判断，以及你会怎么跟新来的同事交代。' },
  ],
};
// 排进时间轴：后面的章 seq 往后挪
const seq = before.length;
for (const c of list.slice(seq).reverse()) await db.from('lab_chapters').update({ seq: c.seq + 1 }).eq('id', c.id);
const { data: ins, error } = await db.from('lab_chapters').insert({
  task_id: task.id, seq, slot, title, kind: 'daily', brief: opt('brief'), sim, expert_trace: tr, status: 'published', locked: false,
  line: neighbor?.line ?? 1, cover_cast: neighbor?.cover_cast ?? null,
}).select('id').maybeSingle();
if (error) throw new Error(error.message);
console.log(`已插入 ${task.profile?.role || task.title} · ${slot} ${title} · ${ins?.id}`);
