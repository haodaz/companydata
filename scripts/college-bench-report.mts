/**
 * 百业 Bench v0 结果页：读 scripts/.college-bench.json → docs/百业Bench-v0.html（模型 × 课程热力表：入学 → 毕业，真活 / 基线）→ 1920 宽 PNG。
 *   npx tsx scripts/college-bench-report.mts
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const st = JSON.parse(fs.readFileSync('scripts/.college-bench.json', 'utf8'));
const cells: any[] = Object.values(st.cells);
const courses = [...new Map(cells.map(c => [c.course_id, c.course])).entries()];
const models = [...new Set(cells.map(c => c.model))];
const LABEL: Record<string, string> = { 'qwen-plus': '通义千问 Plus', 'deepseek-v4-pro': 'DeepSeek V4 Pro', 'gpt-5.6-terra': 'GPT-5.6', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'qwen3.7-plus': '通义千问 3.7 Plus' };
const color = (v: number | null) => v == null ? '#f3f3f6' : v >= 80 ? '#1f9d55' : v >= 60 ? '#7fb800' : v >= 45 ? '#f2a516' : '#d9534f';
const cellHtml = (x: any) => {
  if (!x || (x.entrance == null && x.final == null)) return `<td class="c"><div class="na">${x?.error ? '失败' : '—'}</div></td>`;
  const gain = x.entrance != null && x.final != null ? x.final - x.entrance : null;
  return `<td class="c"><div class="row"><span class="s" style="background:${color(x.entrance)}">${x.entrance ?? '—'}</span><span class="arr">→</span><span class="s" style="background:${color(x.final)}">${x.final ?? '—'}</span>${gain != null ? `<span class="g ${gain >= 0 ? 'up' : 'dn'}">${gain >= 0 ? '+' : ''}${gain}</span>` : ''}</div>${x.work != null ? `<div class="w">真活 <b>${x.work}</b> <span>/ 基线 ${x.work_baseline ?? '—'}</span></div>` : '<div class="w muted">无相关真活</div>'}</td>`;
};
const avg = (arr: (number | null)[]) => { const v = arr.filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const rows = models.map(m => { const xs = courses.map(([cid]) => st.cells[`${cid}|${m}`]); return `<tr><th class="m">${LABEL[m] || m}<small>${m}</small></th>${xs.map(cellHtml).join('')}<td class="c avg"><div class="row"><span class="s" style="background:${color(avg(xs.map(x => x?.entrance ?? null)))}">${avg(xs.map(x => x?.entrance ?? null)) ?? '—'}</span><span class="arr">→</span><span class="s" style="background:${color(avg(xs.map(x => x?.final ?? null)))}">${avg(xs.map(x => x?.final ?? null)) ?? '—'}</span></div><div class="w">真活均 <b>${avg(xs.map(x => x?.work ?? null)) ?? '—'}</b></div></td></tr>`; }).join('');
const n = cells.filter(c => c.final != null).length;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>百业 Bench v0</title><style>
  body { margin: 0; background: #f6f7fb; font-family: -apple-system, "PingFang SC", sans-serif; color: #1a1a2e; }
  .wrap { width: 1920px; box-sizing: border-box; padding: 56px 72px 48px; }
  .eyebrow { font-size: 15px; letter-spacing: 4px; color: #6055f5; font-weight: 700; }
  h1 { font-size: 46px; margin: 8px 0 6px; } .sub { font-size: 19px; color: #555; margin-bottom: 26px; line-height: 1.6; max-width: 1500px; }
  table { border-collapse: separate; border-spacing: 0; width: 100%; background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 2px 14px rgba(20,24,60,.06); }
  th { text-align: left; padding: 16px 18px; background: #f3f2ff; font-size: 17px; } th.m { width: 230px; font-size: 19px; } th.m small { display: block; font-weight: 400; color: #888; font-size: 13px; }
  th.h { font-size: 16px; } th.h small { display: block; font-weight: 400; color: #888; font-size: 13px; margin-top: 2px; }
  td.c { padding: 16px 18px; border-top: 1px solid #eee; vertical-align: middle; } td.avg { background: #fafbff; }
  .row { display: flex; align-items: center; gap: 8px; } .s { display: inline-block; min-width: 52px; text-align: center; color: #fff; font-weight: 800; font-size: 22px; padding: 6px 8px; border-radius: 10px; }
  .arr { color: #999; font-size: 18px; } .g { font-size: 15px; font-weight: 700; } .g.up { color: #1f9d55; } .g.dn { color: #d9534f; }
  .w { margin-top: 8px; font-size: 15px; color: #444; } .w b { font-size: 18px; } .w span { color: #999; } .w.muted { color: #bbb; } .na { color: #bbb; font-size: 18px; }
  .foot { display: flex; justify-content: space-between; margin-top: 18px; font-size: 14px; color: #777; line-height: 1.7; }
  .legend span { display: inline-block; width: 14px; height: 14px; border-radius: 4px; margin: 0 6px 0 14px; vertical-align: -2px; }
</style></head><body><div class="wrap">
  <div class="eyebrow">百业学院 · BAIYE BENCH · v0 示意</div>
  <h1>通用模型进入行业的能力：入学考 → 毕业考，再做一道真活</h1>
  <div class="sub">每一格：模型不上课、不装技能卡，按老师傅的尺子考一次（入学考）；上完课、装上技能卡与笔记再考同一章（毕业考）；全过后做一道相关的真活，和 AI 基线比。全部按百业学院评价体系评分（学院口径 v1：行话与行规 / 具体执行 / 现场判断 / 交付可用，关键动作不足一半封顶 59）。${n} / ${cells.length} 格已跑。</div>
  <table><thead><tr><th class="m">模型 ＼ 课程</th>${courses.map(([, name]) => `<th class="h">${name}<small>入学 → 毕业 · 真活 / 基线</small></th>`).join('')}<th class="h">平均</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="foot"><div class="legend">分数色阶：<span style="background:#1f9d55"></span>≥80 <span style="background:#7fb800"></span>60–79 <span style="background:#f2a516"></span>45–59 <span style="background:#d9534f"></span>&lt;45</div><div>v0：每格一次；正式榜每格三次取中位数 · 课程内容与技能卡不公开，只公开协议与分数 · ${new Date().toLocaleDateString('zh-CN')}</div></div>
</div></body></html>`;
fs.writeFileSync('docs/百业Bench-v0.html', html);
const out = `${process.env.HOME}/Desktop/AI百业演示/百业Bench-v0.png`;
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1920,1180', '--force-device-scale-factor=1.5', `--screenshot=${out}`, `file://${process.cwd()}/docs/百业Bench-v0.html`], { stdio: 'ignore' });
console.log('→ docs/百业Bench-v0.html ·', out, '·', n, '格');
