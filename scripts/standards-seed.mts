/**
 * 行业标准库打底（迁移 022）：按百业里的职业建一个获取任务，逐条跑「检索 → 补题录与要点 → 入库」。
 *   npx tsx scripts/standards-seed.mts                 建任务并全部跑（并发 2）
 *   npx tsx scripts/standards-seed.mts --only 1        只跑第 1 条（试通链路）
 *   npx tsx scripts/standards-seed.mts --task <id>     续跑：只跑这个任务里还没成功的
 *   npx tsx scripts/standards-seed.mts --from-spaces   按图索骥：百业每个有工位的空间 × （岗位规程 + 设备手册）
 * 记账 tool_name = standard-radar（算数据工厂）。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { runStandardSearch } = await import('../src/lib/standard-run');

// [职业, 行业, 检索重点, 百业空间编号前缀]
const SEED: [string, string, string, string?][] = [
  ['火箭总装工程师', '航天', '液体火箭发动机总装 地面试车 推进剂加注 安全规程', '640f3bc6'],
  ['外科医生', '医疗卫生', '手术安全核查 无菌技术 开腹手术操作规范', '681b5f1c'],
  ['潜水教练', '休闲潜水', '休闲潜水服务 潜水带教 安全规范', '387fcc19'],
  ['应急指挥调度员', '应急管理', '防汛抗旱 应急响应 群众转移 指挥调度', 'adcf442a'],
  ['沥青摊铺施工员', '公路工程', '沥青路面施工 摊铺温度 压实 施工技术规范', '0cfe3233'],
  ['咖啡师', '餐饮服务', '咖啡制作 饮品 餐饮服务食品安全操作规范', '155db8f9'],
  ['数据分析师', '互联网', '数据安全 个人信息保护 数据分析 数据质量', 'a35a662d'],
  ['母婴护理员（月嫂）', '家政服务', '母婴生活护理 新生儿护理 服务规范', '19fd15d1'],
  ['转炉炼钢操作工', '冶金', '转炉炼钢 氧枪 吹炼 炼钢安全规程', '71a6cbf5'],
  ['精铸熔炼工程师', '铸造', '熔模精密铸造 真空感应熔炼 高温合金 铸造安全', 'd9daaaf1'],
  ['机械设计工程师', '机械制造', '机械制图 尺寸标注 几何公差 产品几何技术规范', '065fd7f4'],
  ['数字芯片设计工程师', '集成电路', '数字集成电路设计 验证 时序 跨时钟域 设计规范', '392bcbeb'],
  ['变电站值班员', '电力', '变电站 倒闸操作 验电 接地 电力安全工作规程', 'd571b482'],
  ['农业技术员（设施农业）', '设施农业', '日光温室 连栋温室 环境调控 番茄栽培 技术规程', '7dd9393d'],
  ['古籍修复师', '文博图书馆', '古籍修复技术规范 纸张 补书 定级', '61f1f7fb'],
  ['急诊分诊护士', '医疗卫生', '急诊预检分诊 分级 急诊科建设与管理', 'c9783880'],
  ['审计助理', '审计会计', '注册会计师审计准则 函证 银行存款 货币资金审计', 'fde330a0'],
  ['焊工', '机械制造', '焊接与切割安全 焊接工艺 焊工考试', 'a7f8f2e7'],
  ['电气维修技术员', '电力 / 制造', '低压电气 电工作业安全 设备检修 停电挂牌上锁', 'f9add4b9'],
  ['后厨厨工（打荷）', '餐饮服务', '餐饮服务食品安全操作规范 后厨 刀具 燃气 安全', '09ae7c66'],
  ['幼儿园教师', '学前教育', '幼儿园工作规程 保育 安全 卫生保健', 'dc121c80'],
  ['直播中控', '网络直播', '网络直播营销 主播 直播间运营 行为规范', '92bf01bf'],
  ['客服主管', '客户服务', '客户服务中心 呼叫中心 服务质量 投诉处理 规范', 'd1b7b17d'],
  ['园艺师', '园林绿化', '园林绿化养护 修剪 植保 技术规程', '15f91634'],
  ['律师', '法律服务', '律师执业行为规范 律师业务操作指引', 'c5467cbd'],
];

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
let taskId = arg('--task');
const only = arg('--only');
const conc = parseInt(arg('--conc') || '2');

const { data: spaces } = await db.from('skill_tasks').select('id');
const fullId = (p?: string) => (p ? (spaces || []).find(s => s.id.startsWith(p))?.id || null : null);

// 按图索骥（--from-spaces）：从百业里每个已发布、有工位的空间出发，每个空间两条检索——
//   ① 岗位规程：职业 + 工位名 + 关键规则当线索；② 设备手册：工位上的设备 / 仪器 / 工具（最底层、最细，可能不属于某个行业）
if (process.argv.includes('--from-spaces') && !taskId) {
  const { data: all } = await db.from('skill_tasks').select('id, title, profile, jd_snapshot');
  const { data: chs } = await db.from('lab_chapters').select('task_id, steps:sim->steps').eq('status', 'published');
  const { data: done } = await db.from('standard_searches').select('space_id, doc_types').neq('status', 'failed').not('space_id', 'is', null);   // 已有的（含排队中）不重复加
  const hasJob = new Set((done || []).filter(d => !(d.doc_types || []).includes('manual')).map(d => d.space_id));
  const hasManual = new Set((done || []).filter(d => (d.doc_types || []).includes('manual')).map(d => d.space_id));
  const items: any[] = [];
  for (const s of all || []) {
    const benches = (chs || []).filter((c: any) => c.task_id === s.id).flatMap((c: any) => (c.steps || []).filter((x: any) => x?.type === 'bench').map((x: any) => x.bench));
    if (!benches.length) continue;
    const role = s.profile?.role || s.jd_snapshot?.career?.profession || s.jd_snapshot?.title || s.title;
    const names = Array.from(new Set(benches.map((b: any) => String(b.name || '').replace(/(模拟)?(工位|工作台|操作台|台面)$/, '')))).slice(0, 3).join('；');
    const rules = benches.flatMap((b: any) => (b.rules || []).map((r: any) => String(r.label).split(/[（(]/)[0])).slice(0, 4).join('；');
    const gear = benches.flatMap((b: any) => [...(b.controls || []).map((c: any) => c.label), ...(b.gauges || []).map((g: any) => g.label)]).filter(Boolean).slice(0, 10).join('、');
    if (!hasJob.has(s.id)) items.push({ profession: role, industry: null, query: `${names}；${rules}`.slice(0, 200), space_id: s.id, doc_types: [] });
    if (!hasManual.has(s.id)) items.push({ profession: role, industry: null, query: `设备 / 仪器操作手册：${names}；涉及 ${gear}`.slice(0, 220), space_id: s.id, doc_types: ['manual', 'procedure', 'code'] });
  }
  const { data: t, error } = await db.from('standard_tasks').insert({ name: `百业按图索骥 · ${items.length} 条（岗位规程 + 设备手册）`, notes: '从每个有工位的百业空间出发：工位名 / 规则当线索找规程；工位上的设备 / 仪器找操作手册', model_id: 'gemini-3.8-flash', created_by: 'scripts/standards-seed --from-spaces', status: 'running' }).select().single();
  if (error) throw error;
  taskId = t.id;
  for (let k = 0; k < items.length; k += 100) { const { error: e2 } = await db.from('standard_searches').insert(items.slice(k, k + 100).map(x => ({ ...x, task_id: t.id, count: x.doc_types.length ? 6 : 8, enrich: true, status: 'pending' }))); if (e2) throw e2; }
  console.log('按图索骥任务', taskId, items.length, '条');
}

if (!taskId) {
  const { data: t, error } = await db.from('standard_tasks').insert({ name: `百业打底 · ${SEED.length} 个职业的标准与规程`, notes: '给百业空间的工位规则找依据（可解释性）', model_id: 'gemini-3.8-flash', created_by: 'scripts/standards-seed', status: 'running' }).select().single();
  if (error) throw error;
  taskId = t.id;
  const rows = SEED.map(([profession, industry, query, sp]) => ({ task_id: t.id, profession, industry, query, space_id: fullId(sp), count: 8, enrich: true, status: 'pending' }));
  const { error: e2 } = await db.from('standard_searches').insert(rows);
  if (e2) throw e2;
  console.log('任务', taskId);
}
const { data: items } = await db.from('standard_searches').select('id, profession, status').eq('task_id', taskId).order('id');
let todo = (items || []).filter(i => i.status !== 'success');
if (only) todo = todo.slice(parseInt(only) - 1, parseInt(only));
console.log(`要跑 ${todo.length} 条（并发 ${conc}）`);
let i = 0, ok = 0, fail = 0, saved = 0, cost = 0;
await Promise.all(Array.from({ length: conc }, async () => {
  while (i < todo.length) {
    const it = todo[i++];
    const t0 = Date.now();
    try {
      const r: any = await runStandardSearch(it.id);
      ok++; saved += r.inserted + r.updated; cost += r.cost?.cost_usd || 0;
      console.log(`✓ ${it.profession} · 候选 ${r.found} · 新增 ${r.inserted} · 更新 ${r.updated} · $${(r.cost?.cost_usd || 0).toFixed(4)} · ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e: any) { fail++; console.log(`✗ ${it.profession} · ${e.message}`); }
  }
}));
if (!only) await db.from('standard_tasks').update({ status: fail ? 'failed' : 'completed', updated_at: new Date().toISOString() }).eq('id', taskId);
const { count } = await db.from('industry_standards').select('id', { count: 'exact', head: true });
console.log(`\n完成 ${ok} 条 · 失败 ${fail} · 入库/更新 ${saved} · 本次 $${cost.toFixed(4)} · 库里共 ${count} 条标准 · 任务 ${taskId}`);
process.exit(0);
