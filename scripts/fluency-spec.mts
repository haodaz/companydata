/**
 * 潜历「AI 驾驭能力评价 7 维度」量表（26b 汇总版 v3）→ src/lib/work/fluency/spec-v3.json
 * 用法：npx tsx scripts/fluency-spec.mts "<xlsx 路径>"
 * 只抽量表本身（维度、25 个行为、正则、窗口、判断标准、易混淆点、1–5 档锚点）；计分规则写在 engine.ts 里，对照 02 / 04 / 05 / 06 / 07 页。
 */
import XLSX from 'xlsx';
import { writeFileSync } from 'fs';

const wb = XLSX.readFile(process.argv[2]);
const sheet = (n: string) => XLSX.utils.sheet_to_json<any[]>(wb.Sheets[n], { header: 1, defval: '' });
const str = (v: any) => String(v ?? '').trim();

const dims: Record<string, any> = {};
for (const r of sheet('00b-七维度与行为映射').slice(1)) {
  if (!/^\d\d$/.test(str(r[0]))) continue;
  dims[str(r[0])] = { name: str(r[1]), en: str(r[2]), desc: str(r[3]), question: str(r[4]), behaviors: str(r[5]).split(/[、,，\s]+/).filter(Boolean) };
}
const dimOf = (bid: string) => Object.keys(dims).find(k => dims[k].behaviors.includes(bid))!;

const anchors: Record<string, any> = {};
for (const r of sheet('03-行为锚点1-5')) {
  if (!/^B\d+$/.test(str(r[0]))) continue;
  anchors[str(r[0])] = { a1: str(r[3]), a2: str(r[4]), a3: str(r[5]), a4: str(r[6]), a5: str(r[7]), hint: str(r[8]) };
}

const OBS: Record<string, string> = { 基线型: 'baseline', 条件型: 'conditional', 风险型: 'risk', 场景外型: 'external' };
const behaviors: Record<string, any> = {};
for (const r of sheet('01-评价体系').slice(1)) {
  const bid = str(r[1]);
  if (!/^B\d+$/.test(bid)) continue;
  const chain = str(r[6]);
  const m = chain.match(/【(强|中|弱|规则)·(基线型|条件型|风险型|场景外型)】/);
  if (!m) throw new Error(`${bid} 读不出级别 / 类型：${chain}`);
  // 正则列：每行「标签：表达式」，标签是 EN / CN / EN1 / CN2 / CN-xxx / 强触发 / PII / 脱敏；其余行是说明
  const patterns: { label: string; re: string }[] = [];
  for (const line of str(r[7]).split(/\r?\n|\r/)) {
    const p = line.match(/^\s*(EN\d?|CN\d?|CN-[^：:]+|强触发[^：:]*|PII|脱敏)[：:](.+)$/);
    if (!p) continue;
    let re = p[2].trim().replace(/（需 ?≥2 个不同平台名?）$/, '').trim();
    if (/^同上/.test(re)) continue;   // B4 CN1「同上平台名」：引擎里借 B3 的 CN1
    try { new RegExp(re, 'i'); } catch { throw new Error(`${bid} ${p[1]} 正则在 JS 里编不过：${re}`); }
    patterns.push({ label: p[1], re });
  }
  behaviors[bid] = {
    dim: dimOf(bid), cn: str(r[3]), en: str(r[2]), point: str(r[4]), evidence: str(r[5]),
    strength: m[1], obs: OBS[m[2]], chain, patterns, pattern_notes: str(r[7]), window: str(r[8]),
    criteria: str(r[9]), confuse: str(r[10]), fallback: str(r[11]), nohit: str(r[14]), anchors: anchors[bid],
  };
  if (!anchors[bid]) throw new Error(`${bid} 03 页没有锚点`);
}
const n = Object.keys(behaviors).length;
if (n !== 25) throw new Error(`行为应为 25 个，读到 ${n}`);
const out = { version: 'v3-26b', source: 'AI驾驭能力评价7维度评价体系(26b)-汇总版v3.xlsx', dimensions: dims, behaviors };
writeFileSync('src/lib/work/fluency/spec-v3.json', JSON.stringify(out, null, 1));
console.log('维度', Object.keys(dims).length, '行为', n, Object.entries(behaviors).map(([k, b]: any) => `${k}:${b.obs[0]}${b.strength}/${b.patterns.length}`).join(' '));
