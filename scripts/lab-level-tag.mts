/**
 * 老空间（没选形态的）按内容归进建空间那四档难度（11-19 用户：档位拉开，别只有 2 档；要落在同一个 frame 里）。
 * 看章节标题、题型、操作台、样题，对照 FORMS 四档定义挑一档，存 jd_snapshot.level_tag（只管标记和筛选，不改生成 / 评分规则）。
 *   npx tsx --env-file=.env.local scripts/lab-level-tag.mts [--apply]
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { FORMS, LEVEL_ORDER, formOf, isForm } from '@/lib/lab-spec';
const apply = process.argv.includes('--apply');
const { data: spaces } = await db.from('skill_tasks').select('id, title, profile, jd_snapshot').order('created_at');
const todo = (spaces || []).filter((s: any) => !formOf(s.jd_snapshot));
const defs = LEVEL_ORDER.map(f => `- ${f}「${FORMS[f].label}」：${FORMS[f].essence}。体验者：${FORMS[f].who.slice(0, 60)}。评分：${FORMS[f].score}`).join('\n');
const out: Record<string, number> = {};
const one = async (s: any) => {
  const { data: chs } = await db.from('lab_chapters').select('slot, title, kind, sim').eq('task_id', s.id).order('seq');
  const lines = (chs || []).map((c: any) => { const st = c.sim?.steps || []; return `${c.slot || ''} ${c.title}（${st.length} 步：${st.map((x: any) => x.type).join('/')}）`; }).join('\n');
  const sample = (chs || []).flatMap((c: any) => (c.sim?.steps || []).filter((x: any) => x.type !== 'bench').slice(0, 1).map((x: any) => String(x.prompt || '').slice(0, 120))).slice(0, 4).join('\n');
  const jd = s.jd_snapshot || {};
  // 按难度打分再落档（第一次按「形式」判，71 个全是职业虚拟考核——老空间都是「新人上岗的一天」格式；用户要按难度拉开）
  const r = await generateContent(`下面是一个职业模拟空间。请只看它实际有多难（题目要多少专业知识、操作要多精准、评分多严、容错多少），打 1–10 分。

分数对照建空间时的四档难度口径：
- 1–3「生涯体验」：看懂这一行、说出理由就算过；操作宽松，大致在合理范围就给分；不考数值和规范条文
- 4–5「模拟实践」：练会一道工序 / 一套流程，顺序和关键参数要对，允许小偏差；专业学生能上手
- 6–8「职业虚拟考核」：按岗位真实要求，关键操作要准，违规扣分；要入职第一年的专业判断
- 9–10「资质考核」：精密、限时、按细则严格打分、有一票否决；要很深的专业知识（如手术、高危工艺）

空间：${s.profile?.role || jd.title || s.title}${jd.company ? `（${jd.company}）` : ''}
章节：
${lines || '（只有一章）'}
样题：
${sample}

只返回 JSON：{"score": <1-10>, "why": "<一句话：难在哪 / 浅在哪>"}`, 'claude-sonnet-5-5', { jsonMode: true });
  const j = (() => { try { return JSON.parse(String(r.text).replace(/^```json|```$/g, '').trim()); } catch { return {}; } })();
  const sc = Math.max(1, Math.min(10, Math.round(Number(j.score) || 0)));
  const f = !Number(j.score) ? null : sc <= 3 ? 'career' : sc <= 5 ? 'training' : sc <= 8 ? 'assess' : 'certify';
  console.log(`${sc}分 ${f ? FORMS[f].label : '??'}｜${s.profile?.role || jd.title || s.title}｜${String(j.why || '').slice(0, 50)}`);
  if (f) { out[f] = (out[f] || 0) + 1; if (apply) await db.from('skill_tasks').update({ jd_snapshot: { ...jd, level_tag: f, level_score: sc } }).eq('id', s.id); }
};
for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(s => one(s).catch(e => console.log('失败', s.id, String(e?.message).slice(0, 80)))));
console.log(`${apply ? '已写' : '试算'} ${todo.length} 个：`, JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [FORMS[k as keyof typeof FORMS].label, v]))));
