/**
 * 把已经生成过的美术登记进素材库（lab_art_assets），让后面领域相近的空间直接复用。
 *   npx tsx scripts/lab-art-index.mts          登记
 *   npx tsx scripts/lab-art-index.mts --dry     只看会登记什么
 * family / slot 用关键词推断（够用了，匹配本来就是粗粒度的）。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const dry = process.argv.includes('--dry');

const FAMILY: [RegExp, string][] = [
  [/焊|铸|熔炼|机械|制造|工艺|装备|材料|加工/, '制造与工程'],
  [/咖啡|餐饮|门店|零售|烘焙|厨|食品饮料|服务业/, '餐饮零售'],
  [/医|护|药|临床|康复|营养/, '医疗健康'],
  [/教育|教学|培训|教师|课程/, '教育培训'],
  [/会计|财务|审计|税|金融|银行|保险|精算|投资/, '金融财会'],
  [/数据|互联网|算法|软件|产品经理|运营|研发|AI|程序/, '互联网与科技'],
  [/建筑|土木|施工|造价|结构/, '建筑与土木'],
  [/物流|运输|航空|驾驶|仓储|供应链/, '交通与物流'],
  [/农|养殖|种植|畜牧/, '农业与食品'],
  [/设计|品牌|营销|广告|内容|游戏|影视|策划/, '文化创意'],
  [/公务|政务|社工|公共/, '公共服务'],
];
const SCENE_SLOT: [RegExp, string][] = [
  [/offi|desk|workstation|办公/, '办公室'], [/meeting|conference|会议/, '会议室'],
  [/workshop|factory|plant|shop_?floor|hall|车间|产线|厂房/, '车间'], [/lab|实验|检验|inspect/, '实验室'],
  [/store|shop|retail|counter|bar|handoff|门店|吧台|出品/, '门店'], [/kitchen|后厨|厨房/, '后厨'],
  [/site|construction|工地/, '工地'], [/warehouse|仓/, '仓库'], [/server|control_?room|机房|中控/, '机房'],
  [/classroom|教室/, '教室'], [/clinic|诊/, '诊室'], [/field|outdoor|户外/, '户外现场'], [/cockpit|驾驶/, '驾驶舱'],
];
const NPC_SLOT: [RegExp, string][] = [
  [/师傅|班组长|主任|带教|老师傅|主理人/, '带教师傅'], [/经理|主管|总监|厂长|店长|负责人/, '主管'],
  [/检验|质检|督导|评审/, '质检'], [/客户|顾客|甲方/, '客户'], [/老师|讲师|教授/, '老师'], [/专家|顾问/, '专家'],
];
const pick = (table: [RegExp, string][], s: string, dflt: string) => table.find(([re]) => re.test(s))?.[1] || dflt;

const { data: tasks, error } = await supabaseAdmin.from('skill_tasks').select('id, title, sim, skill:skills(name, domain)');
if (error) throw error;

const rows: any[] = [];
for (const t of tasks || []) {
  const art = (t.sim as any)?.art; if (!art) continue;
  const skill: any = Array.isArray(t.skill) ? t.skill[0] : t.skill;
  const domain = `${skill?.domain || ''} ${skill?.name || ''} ${t.title || ''}`;
  const family = pick(FAMILY, domain, '其他');
  const seen = new Set<string>();
  for (const [stepId, url] of Object.entries((art.scenes || {}) as Record<string, string>)) {
    if (!url || seen.has(url)) continue; seen.add(url);
    // 文件名里的场景 key 才是线索（整条 URL 里的 lab-art 会把 slot 带到「实验室」去）
    const base = String(url).split('/').pop()!.replace(/\.[a-z]+$/i, '').replace(/^[a-z0-9]{8,}-/, '');
    if (/^bench/.test(base)) continue;   // 工位底图和设备强绑，不进共用库
    rows.push({ kind: 'scene', family, slot: pick(SCENE_SLOT, `${stepId} ${base}`, '其他'), domain: skill?.domain || '', profession: skill?.name || '', prompt: base, url });
  }
  for (const [who, url] of Object.entries((art.npcs || {}) as Record<string, string>)) {
    if (!url || seen.has(url)) continue; seen.add(url);
    rows.push({ kind: 'npc', family, slot: pick(NPC_SLOT, who, '同事'), domain: skill?.domain || '', profession: skill?.name || '', prompt: who, url });
  }
}

const uniq = [...new Map(rows.map(r => [r.url, r])).values()];
for (const r of uniq) console.log(`${r.kind === 'npc' ? '👤' : '🏭'} ${r.family} / ${r.slot}  ← ${r.profession}  ${String(r.url).slice(-40)}`);
console.log(`\n共 ${uniq.length} 张（场景 ${uniq.filter(r => r.kind === 'scene').length} · 立绘 ${uniq.filter(r => r.kind === 'npc').length}）`);
// 早先误入库的工位底图清掉：它和具体设备强绑，复用到别的工位上就是答非所问
const { data: inDb } = await supabaseAdmin.from('lab_art_assets').select('id, url');
const stale = (inDb || []).filter(r => /\/([a-z0-9]{8,}-)?bench[_.]/.test(r.url));
if (stale.length) {
  console.log(`\n库里有 ${stale.length} 张工位底图该清掉：${stale.map(r => r.url.split('/').pop()).join('、')}`);
  if (!dry) { await supabaseAdmin.from('lab_art_assets').delete().in('id', stale.map(r => r.id)); console.log('已清掉'); }
}
if (dry) { console.log('（--dry，没有写库）'); process.exit(0); }
if (!uniq.length) process.exit(0);
const { error: upErr } = await supabaseAdmin.from('lab_art_assets').upsert(uniq, { onConflict: 'url' });
console.log(upErr ? `❌ ${upErr.message}` : '✅ 已登记进 lab_art_assets');
