/**
 * 给没有形象的空间补一张「从业者本人」立绘：npx tsx scripts/lab-fill-avatar.mts [--dry]
 * 外形描述一次性让大模型写完（省调用），再逐个出图；人物立绘走素材库复用。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { generateContent } = await import('../src/lib/llm-client');
const { parseJsonLoose } = await import('../src/lib/agents/search-llm');
const { npcAssetReusing } = await import('../src/lib/lab-art');
const dry = process.argv.includes('--dry');

const FAMILY: [RegExp, string][] = [
  [/焊|铸|熔炼|机械|制造|工艺|装备|材料|数控|复材|半导体|箭|航天/, '制造与工程'],
  [/咖啡|餐饮|门店|零售|烘焙|厨|调酒|烹调|奶茶|打荷/, '餐饮零售'],
  [/医|护|药|针灸|推拿|康复|营养|月嫂|母婴|宠物/, '医疗健康'],
  [/教育|教学|培训|教师|导游|教练/, '教育培训'],
  [/会计|财务|审计|税|金融|证券|保险|精算|投资|分析师/, '金融财会'],
  [/数据|互联网|算法|软件|产品|运营|研发|无人机/, '互联网与科技'],
  [/建筑|土木|施工|造价|结构|装修|工长/, '建筑与土木'],
  [/物流|运输|航空|驾驶|仓储|潜水/, '交通与物流'],
  [/农|养殖|种植|畜牧|温室/, '农业与食品'],
  [/设计|品牌|营销|广告|内容|游戏|影视|策划|艺术|心理/, '文化创意'],
  [/消防|公务|政务|社工|公共|律师/, '公共服务'],
];
const famOf = (s: string) => FAMILY.find(([re]) => re.test(s))?.[1] || '其他';

const { data } = await supabaseAdmin.from('skill_tasks').select('id, profile, jd_snapshot').order('created_at', { ascending: true });
const todo = (data || []).filter((t: any) => !t.profile?.avatar).map((t: any) => ({
  id: t.id, profile: t.profile || {},
  prof: t.jd_snapshot?.career?.profession || t.jd_snapshot?.title || t.profile?.role || '从业者',
}));
if (!todo.length) { console.log('每个空间都有形象了'); process.exit(0); }
console.log(`${todo.length} 个空间缺形象：${todo.map(t => t.prof).join('、')}\n`);

const res = await generateContent(`为下面每个职业各写一句「数字人立绘」的外形描述，用于文生图。
要求：一位正在一线干这行、年轻、状态好的从业者；写性别、年龄、发型、这个职业真实的工作装束与随身器具、神情。不要写背景。每句 40 字以内。
职业：${todo.map((t, i) => `${i + 1}. ${t.prof}`).join('\n')}
返回 JSON：{ "list": ["<第1个的描述>", "<第2个>", …] }`, 'gemini-3.8-flash', { jsonMode: true });
const descs: string[] = parseJsonLoose(res.text).list || [];

let ok = 0, reused = 0;
for (const [i, t] of todo.entries()) {
  const d = descs[i] || `一位${t.prof}，穿这个职业的工作装束，神情专注`;
  console.log(`[${i + 1}/${todo.length}] ${t.profile.name || ''} ${t.prof} — ${d.slice(0, 30)}…`);
  if (dry) continue;
  try {
    const hit = await npcAssetReusing(d, `self-${t.id.slice(0, 8)}`, { family: famOf(t.prof), slot: '从业者本人', domain: t.prof, profession: t.prof });
    await supabaseAdmin.from('skill_tasks').update({ profile: { ...t.profile, avatar: hit.url } }).eq('id', t.id);
    console.log(`   ${hit.reused ? '♻ 复用素材库' : '✅ 新生成'}`);
    ok++; if (hit.reused) reused++;
  } catch (e: any) { console.log(`   ❌ ${e?.message || e}`); }
}
console.log(`\n补上 ${ok} 个形象（其中复用素材库 ${reused} 个）`);
