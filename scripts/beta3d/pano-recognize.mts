/**
 * 全景要素识别（2026-10-12，用户：「路过的好东西都别放过，加 tag，写介绍，让大家真的进入了工厂」）：
 *   npx tsx scripts/beta3d/pano-recognize.mts <全景.jpg> <key> --scene "锅炉房" [--role "锅炉运行工"] [--model gemini-3.8-flash]
 *     [--kinds "珊瑚,生物,地形,水况,安全注意,环境"] [--focus "要找什么（一段话）"] [--tags "打标签的角度"] [--out <json 路径>]
 *   默认是工业现场（设备 / 仪表 / 阀门管路…）；换领域（水下、医院、户外）就传 kinds / focus / tags。
 * 采集 → 清洗之后的「识别 → 结构化」（见 /lab/logic 第 15 节）：
 *   1. ffmpeg v360 把等距柱状全景切成一圈透视图（水平每 45° 一张 × 平视 / 略往下两圈，视场 90° × 64°）
 *   2. 每张交给视觉模型找行业要素（设备 / 仪表 / 阀门管路 / 电气 / 安全标识 / 文件规程 / 工具 / 环境），框出位置
 *   3. 框的中心按透视投影换算回全景方位（yaw 0 = 全景图正中、向右为正；pitch 向上为正——和 ffmpeg v360 的约定一致，已核对）
 *   4. 不同视角里认出的同一件东西合并（方位相近 + 名字 / 类别相近）
 *   5. 再整体过一遍：统一叫法、打行业标签（岗位 / 工序 / 风险）、写两三句介绍，去掉不值一提的
 * 产出 src/lib/pano-spots/<key>.json（PanoSpot[]，人可以直接改），lab-3d-beta.ts 里的场景 import 它。
 * 每一步的原始结果存在 <工作目录>/<key>/：views/*.jpg、raw.json（逐视角识别）、merged.json——留着当训练样本。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { GoogleGenerativeAI } = await import('@google/generative-ai');
const { logTokenUsage } = await import('../../src/lib/token-logger');

const args = process.argv.slice(2);
const flag = (k: string, d = '') => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const [src, key] = args;
if (!src || !key || src.startsWith('--')) { console.error('用法：npx tsx scripts/beta3d/pano-recognize.mts <全景.jpg> <key> --scene "锅炉房" [--role "…"]'); process.exit(1); }
const scene = flag('scene', key), role = flag('role', ''), modelId = flag('model', 'gemini-3.8-flash');
const W = path.join(flag('work', path.join(os.tmpdir(), 'pano-recognize')), key);
const FF = path.resolve('node_modules/ffmpeg-static/ffmpeg');
const H_FOV = 90, V_FOV = 64, VW = 1280, VH = 853;
const YAWS = [-180, -135, -90, -45, 0, 45, 90, 135], PITCHES = [5, -25];
fs.mkdirSync(path.join(W, 'views'), { recursive: true });

const KINDS = flag('kinds') ? flag('kinds').split(/[,，]/).map(x => x.trim()).filter(Boolean) : ['设备', '仪表', '阀门管路', '电气', '安全标识', '文件规程', '工具', '环境'];
const FOCUS = flag('focus', '设备、机器、仪表盘 / 压力表 / 温度计、阀门、管道与管路走向、泵、控制柜 / 配电箱 / 开关、指示灯、安全标识 / 警示牌、贴着的操作规程 / 记录表、工具、消防器材、特殊的环境特征（操作平台、梯子、地沟）');
const TAG_ANGLES = flag('tags', '用到它的岗位（如 锅炉运行工 / 电工 / 仪表工）、所属工序或系统（如 燃气供应 / 给水 / 配电）、风险点（如 高温 / 高压 / 燃气泄漏 / 触电）、日常动作（如 巡检 / 抄表 / 倒闸）');
const OTHER = KINDS.includes('环境') ? '环境' : KINDS[KINDS.length - 1];
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: modelId, generationConfig: { responseMimeType: 'application/json' } });
const ask = async (parts: any[], tries = 2): Promise<any> => {
  for (let i = 0; ; i++) {
    try {
      const r = await model.generateContent(parts);
      // 记账（迁移 021）：全景识别，--space 可以记到某个空间上
      const u = r.response.usageMetadata;
      await logTokenUsage({ tool_name: 'lab-3d', task_name: parts.length > 1 ? '全景识别 · 找要素' : '全景识别 · 写介绍', model_id: modelId, usageMetadata: { promptTokenCount: u?.promptTokenCount || 0, candidatesTokenCount: u?.candidatesTokenCount || 0, totalTokenCount: u?.totalTokenCount || 0 }, job_id: `pano-${key}`, space_id: flag('space') || null, stage: 'media', actor: 'pano-recognize' }).catch(() => {});
      return JSON.parse(r.response.text());
    }
    catch (e) { if (i >= tries) throw e; await new Promise(r => setTimeout(r, 2000 * (i + 1))); }
  }
};

// ── 1. 切视角 ──
type View = { id: string; yaw: number; pitch: number; file: string };
const views: View[] = [];
for (const pitch of PITCHES) for (const yaw of YAWS) {
  const id = `y${yaw}_p${pitch}`, file = path.join(W, 'views', `${id}.jpg`);
  if (!fs.existsSync(file)) {
    const r = spawnSync(FF, ['-nostdin', '-loglevel', 'error', '-y', '-i', src, '-vf', `v360=input=e:output=flat:h_fov=${H_FOV}:v_fov=${V_FOV}:yaw=${yaw}:pitch=${pitch}:w=${VW}:h=${VH}`, '-q:v', '3', file]);
    if (r.status !== 0) throw new Error(`切视角失败 ${id}：${r.stderr}`);
  }
  views.push({ id, yaw, pitch, file });
}
console.log(`切了 ${views.length} 个视角 → ${path.join(W, 'views')}`);

// ── 2. 逐视角识别 ──
const DETECT = `你在看「${scene}」${role ? `（${role}的工作现场）` : ''}的一张实拍照片（360° 全景里切出来的一个普通视角）。
把画面里所有对这个行业有意义的东西都找出来——路过的好东西都别放过：${FOCUS}。
同一类东西成排出现时，整排算一个（比如「一排控制柜」），但特别显眼的单件可以单独列。看不清、被裁掉大半的不要。
每一件给：name（行业里的叫法，中文，尽量具体：比如「燃气调压阀组」而不是「阀门」）、kind（只能是 ${KINDS.join(' / ')} 之一）、box_2d（[ymin, xmin, ymax, xmax]，0–1000 归一化）、conf（0–1，你有多确定它是这个东西）、seen（一句话：你看到了什么让你这么判断）。
返回 JSON：{ "items": [ ... ] }`;
const rawFile = path.join(W, 'raw.json');
const raw: Record<string, any[]> = fs.existsSync(rawFile) ? JSON.parse(fs.readFileSync(rawFile, 'utf8')) : {};
for (const v of views) {
  if (raw[v.id]) continue;
  const img = fs.readFileSync(v.file).toString('base64');
  const r = await ask([{ text: DETECT }, { inlineData: { mimeType: 'image/jpeg', data: img } }]);
  raw[v.id] = Array.isArray(r?.items) ? r.items : [];
  fs.writeFileSync(rawFile, JSON.stringify(raw, null, 1));
  console.log(`  ${v.id}：${raw[v.id].length} 件`);
}

// ── 3. 框中心 → 全景方位（透视投影的反算：先绕 x 轴转 pitch，再绕 y 轴转 yaw） ──
const rad = (d: number) => d * Math.PI / 180, deg = (r: number) => r * 180 / Math.PI;
function toPano(v: View, u: number, w: number) {
  const x = (2 * u - 1) * Math.tan(rad(H_FOV / 2)), y = (1 - 2 * w) * Math.tan(rad(V_FOV / 2)), z = 1;
  const p = rad(v.pitch), Y = rad(v.yaw);
  const y1 = y * Math.cos(p) + z * Math.sin(p), z1 = -y * Math.sin(p) + z * Math.cos(p);
  const x2 = x * Math.cos(Y) + z1 * Math.sin(Y), z2 = -x * Math.sin(Y) + z1 * Math.cos(Y);
  return { yaw: deg(Math.atan2(x2, z2)), pitch: deg(Math.atan2(y1, Math.hypot(x2, z2))) };
}
type Det = { name: string; kind: string; conf: number; seen: string; yaw: number; pitch: number; view: string; edge: boolean };
const dets: Det[] = [];
for (const v of views) for (const it of raw[v.id] || []) {
  const b = it.box_2d; if (!Array.isArray(b) || b.length !== 4) continue;
  const [y0, x0, y1, x1] = b.map((n: number) => Number(n) / 1000);
  const u = (x0 + x1) / 2, w = (y0 + y1) / 2;
  // 贴着画面边缘的框可能被裁了一半，合并时优先用别的视角
  const edge = x0 < 0.03 || x1 > 0.97 || y0 < 0.03 || y1 > 0.97;
  dets.push({ name: String(it.name || '').trim(), kind: KINDS.includes(it.kind) ? it.kind : OTHER, conf: Math.max(0, Math.min(1, Number(it.conf) || 0.5)), seen: String(it.seen || ''), ...toPano(v, u, w), view: v.id, edge });
}

// ── 4. 合并：方位相近（< 9°）且同类、名字有共同字 ──
const angDist = (a: { yaw: number; pitch: number }, b: { yaw: number; pitch: number }) => {
  const [ay, ap, by, bp] = [a.yaw, a.pitch, b.yaw, b.pitch].map(rad);
  return deg(Math.acos(Math.min(1, Math.sin(ap) * Math.sin(bp) + Math.cos(ap) * Math.cos(bp) * Math.cos(ay - by))));
};
const overlap = (a: string, b: string) => [...new Set(a)].filter(c => b.includes(c) && /[一-龥]/.test(c)).length >= 2;
const groups: Det[][] = [];
for (const d of dets.sort((a, b) => Number(a.edge) - Number(b.edge) || b.conf - a.conf)) {
  const g = groups.find(g => g[0].kind === d.kind && angDist(g[0], d) < 9 && overlap(g[0].name, d.name));
  if (g) g.push(d); else groups.push([d]);
}
const merged = groups.map((g, i) => {
  const best = g[0];
  // 方位取不贴边那几次的平均（同一件东西在相邻视角里各算一次，取平均更准）
  const pool = g.filter(d => !d.edge).length ? g.filter(d => !d.edge) : g;
  const sx = pool.reduce((s, d) => s + Math.sin(rad(d.yaw)), 0), cx = pool.reduce((s, d) => s + Math.cos(rad(d.yaw)), 0);
  return { id: `s${String(i + 1).padStart(2, '0')}`, name: best.name, kind: best.kind, yaw: Math.round(deg(Math.atan2(sx, cx)) * 10) / 10, pitch: Math.round(pool.reduce((s, d) => s + d.pitch, 0) / pool.length * 10) / 10, conf: Math.round(Math.min(1, best.conf + 0.08 * (g.length - 1)) * 100) / 100, seen: best.seen, views: g.length };
});
fs.writeFileSync(path.join(W, 'merged.json'), JSON.stringify(merged, null, 1));
console.log(`识别 ${dets.length} 次 → 合并成 ${merged.length} 件`);

// ── 5. 结构化：统一叫法、行业标签、介绍 ──
const WRITE = `下面是在「${scene}」${role ? `（${role}的工作现场）` : ''}一张 360° 实拍全景里识别出来的东西（id、名字、类别、几个视角看到、识别时的依据）。
要做成「AI 百业」里体验者转着看时可以点开的介绍卡片，让大家像真的走进了这个现场。逐件处理：
- title：行业里的规范叫法（可以改得更准，但别编画面里没有的型号参数）
- kind：保持原类别（${KINDS.join(' / ')}）
- tags：3–5 个行业标签，从这几个角度挑：${TAG_ANGLES}
- desc：两三句、像老师傅在旁边指给新人看：它是什么、干什么用、这一行对它的规矩或常见坑。不写具体数字（压力值、温度值）除非画面上清楚可见。
- keep：值不值得放出来（重复的、太普通看不出门道的给 false）
返回 JSON：{ "spots": [ { "id": "", "title": "", "kind": "", "tags": [], "desc": "", "keep": true } ] }

${merged.map(m => `${m.id} · ${m.name} · ${m.kind} · ${m.views} 个视角 · ${m.seen}`).join('\n')}`;
const out = await ask([{ text: WRITE }]);
const byId = new Map<string, any>((out?.spots || []).map((s: any) => [s.id, s]));
const spots = merged.flatMap(m => {
  const s = byId.get(m.id); if (!s || s.keep === false) return [];
  return [{ id: m.id, yaw: m.yaw, pitch: m.pitch, title: String(s.title || m.name), kind: KINDS.includes(s.kind) ? s.kind : m.kind, tags: (Array.isArray(s.tags) ? s.tags : []).map(String).slice(0, 5), desc: String(s.desc || ''), conf: m.conf }];
});
fs.mkdirSync('src/lib/pano-spots', { recursive: true });
const dst = flag('out', `src/lib/pano-spots/${key}.json`);
fs.writeFileSync(dst, JSON.stringify(spots, null, 1) + '\n');
const kinds = spots.reduce((a: Record<string, number>, s) => (a[s.kind] = (a[s.kind] || 0) + 1, a), {});
console.log(`✅ ${spots.length} 件要素 → ${dst}`);
console.log('   ' + Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(' · '));
for (const s of spots.slice(0, 8)) console.log(`   ${s.id} [${s.kind}] ${s.title}（yaw ${s.yaw}, pitch ${s.pitch}）#${s.tags.join(' #')}`);
