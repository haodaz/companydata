/**
 * 3D 场景的 Veo 提示词：模板 + 风险词检查（2026-10-12 从 12 个场景的成败里总结，流水线 make-scene.mjs 用它）。
 *   import { buildPrompt, lintSubject, VARIANTS } from './prompt.mjs'
 *   node scripts/beta3d/prompt.mjs "<场景描述>" ["<锚点物件>"]     打印三档提示词和风险提示
 *
 * 成败记录（详见 runs.jsonl）：
 *   ✅ 手术室 / 咖啡吧台 / 育婴室 / 办公室 / 珊瑚礁 / 指挥大厅 / 变电站 / 火箭发动机段（近景 3 m）
 *   ❌ 手术室第一版：「360° 环绕」→ 鱼眼 + 器械盘帧间变形
 *   ❌ 火箭总装大厅远景两次：大面积白色箭体、大空间没有近处参照
 *   ❌ 转炉车间：炉口辉光 + 烟雾在动
 *   ❌ 温室四次：成排一模一样的番茄架 + 玻璃顶，特征点互相认错；近景那条里采收车自己在动
 *   ⚠ 沥青摊铺：重建成功，但压路机冒的烟训练成了满屏拉丝
 *   ⚠ 咖啡吧台：不锈钢咖啡机反光的地方糊
 */

/** 每档都带的固定要求：静止、35mm、40° 弧线、不要近处小件 */
const BASE = 'Photorealistic, 35mm lens, no fisheye. Completely static scene: no people, no vehicles moving, no smoke, no steam, no haze, no fire, no flowing water, nothing moves at all. Soft even lighting, sharp focus everywhere, no motion blur.';

/** 重试时一档比一档保守：更近、弧线更短、更强调有纹理的硬结构 */
export const VARIANTS = [
  { key: 'arc40', cam: 'The camera glides slowly and smoothly along a gentle 40-degree horizontal arc at eye level, about 3 meters from {anchor}, keeping {anchor} centered; clear parallax between {anchor} and the background.' },
  { key: 'close30', cam: 'The camera is close, about 2 to 3 meters from {anchor}, and moves slowly sideways along a 30-degree arc at chest height, keeping {anchor} large in frame; lots of hard edges, labels, bolts and surface texture visible.' },
  { key: 'slide20', cam: 'A very slow, steady sideways dolly of about 1.5 meters (a 20-degree arc) at eye level, about 2 meters from {anchor}; {anchor} fills the middle third of the frame; richly textured, matte surfaces.' },
];

/** 风险词：命中就提醒（不拦），理由写清楚是哪次踩的坑 */
const RISKS = [
  [/smok|steam|haze|fog|mist|dust|烟|蒸汽|雾|粉尘/i, '会动的烟 / 雾训练成拉丝（沥青摊铺、转炉）'],
  [/fire|flame|glow|spark|molten|火|焰|辉光|火花|钢水/i, '火光和辉光每帧都在变（转炉）'],
  [/water|river|rain|wave|fountain|水流|河|雨|浪/i, '流动的水没法重建（静水面、水下礁石可以）'],
  [/people|person|worker|crowd|staff|人群|工人|行人/i, '人会动；人物用 NPC 立绘贴在前面'],
  [/rows of|row after row|identical|repeating|aisle of|一排排|成排|整齐排列/i, '成排一样的东西会让特征点互相认错（温室）'],
  [/glass roof|glass wall|greenhouse|skylight|玻璃顶|玻璃幕墙|温室/i, '大面积玻璃 / 天光，没有纹理（温室）'],
  [/white .*(rocket|wall|hall)|plain|blank|纯白|白色箭体/i, '大面积纯色没有特征点（火箭大厅）'],
  [/stainless|chrome|mirror|polished|reflect|不锈钢|镜面|抛光/i, '反光的地方会糊（咖啡机）'],
  [/360|orbit|full circle|drone|aerial|fisheye|bird.?s.?eye|环绕一圈|航拍|鱼眼/i, '整圈环绕 / 航拍 / 鱼眼（手术室第一版）'],
  [/huge hall|vast|wide shot|panorama|大厅全景|远景/i, '大空间远景没有近处参照（火箭大厅两次失败，近景一次成功）'],
];

export function lintSubject(text) {
  return RISKS.filter(([re]) => re.test(text)).map(([, why]) => why);
}

/** subject：场景本身（英文更稳）；anchor：镜头围着转的那个有硬结构的物件，比如 "the steel harvest trolley" */
export function buildPrompt(subject, anchor = 'the main piece of equipment', variant = 0) {
  const v = VARIANTS[Math.min(variant, VARIANTS.length - 1)];
  return `${subject.trim().replace(/\.?$/, '.')} ${v.cam.replaceAll('{anchor}', anchor)} ${BASE}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [subject, anchor] = process.argv.slice(2);
  if (!subject) { console.error('用法：node scripts/beta3d/prompt.mjs "<场景描述>" ["<锚点物件>"]'); process.exit(1); }
  const w = lintSubject(subject);
  console.log(w.length ? '⚠ 风险：\n  - ' + w.join('\n  - ') : '✓ 没有已知风险词');
  VARIANTS.forEach((v, i) => console.log(`\n[${i}] ${v.key}\n${buildPrompt(subject, anchor, i)}`));
}
