// 职业名别写成谜语（用户 2026-10-11：「救火大师」其实是危机公关，会和消防员混淆）。把 profile.role 换成直白的岗位名。
// npx tsx scripts/.rename-roles.mts [--apply]   不带 --apply 只预览；原值备份到 scripts/.roles-backup.json
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const MAP: Record<string, string> = {
  '归因师': '数据分析师', '上市操盘手': '市场营销管培生', '熔炼师': '精铸熔炼工程师', '凝土结构工程师': '混凝土结构工程师',
  '造箭师': '火箭总装工程师', '头车一号员': '消防员', '洗护台搭子': '宠物美容助理', '伴宠巡护员': '上门宠物照护师',
  '婚礼摆渡人': '婚礼策划助理', '执局人': '剧本杀主持人', '山居管家': '民宿管家', '陪诊领路人': '陪诊师', '秩序卫士': '保安员',
  '带飞师傅': '空中乘务员', '古籍补书人': '古籍修复师', '数判官': '数据分析师', '线号侦探': '电气维修技术员', '救火掌柜': '客服主管',
  '打荷师兄': '打荷厨工', '对账小工': '审计助理', '苗苗老师': '幼儿园老师', '直播间中控手': '直播中控', '巡园师傅': '园艺师',
  '吧台搭档': '调饮师', '电路雕刻师': '数字芯片设计工程师', '出图师傅': '机械设计工程师', '道路施工员': '沥青摊铺施工员', '缝合师': '外科住院医师', '管床小中医': '针灸科住院医师', '中试质检员': '中试数据分析工程师',
  '潜导带教': '潜水教练', '月嫂带教官': '月嫂', '导体材料工程师': '半导体材料工程师', '西点学徒工': '西点烘焙学徒', '拉花师傅': '咖啡师（拉花）',
};
const apply = process.argv.includes('--apply');
const { data: all } = await db.from('skill_tasks').select('id, profile');
const backup: Record<string, string> = {};
for (const t of (all || []) as any[]) {
  const role = t.profile?.role; const to = MAP[role];
  if (!to) continue;
  console.log(`${t.id.slice(0, 8)}  ${role} → ${to}`); backup[t.id] = role;
  if (apply) { const { error } = await db.from('skill_tasks').update({ profile: { ...t.profile, role: to } }).eq('id', t.id); if (error) console.log('  失败', error.message); }
}
if (apply) fs.writeFileSync('scripts/.roles-backup.json', JSON.stringify(backup, null, 1));
console.log(apply ? '已改' : '预览（加 --apply 才改）');
