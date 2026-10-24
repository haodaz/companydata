/**
 * 百业 Bench v0 报告页：读 scripts/.college-bench.json → docs/百业Bench-v0.html（学院气质：象牙底、深蓝金；协议条 + 模型 × 课程热力矩阵 + 结论卡 + 平方智能 × 方略研究院落款）
 * → 1920×1080 PNG + 横版 PDF，放桌面「AI百业演示」。
 *   npx tsx scripts/college-bench-report.mts
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const st = JSON.parse(fs.readFileSync('scripts/.college-bench.json', 'utf8'));
const COURSES = ['b0614543', 'a35a662d', '065fd7f4', 'a7f8f2e7', 'f9add4b9', 'adcf442a'];   // 和 college-bench.mts 的默认课程一致；别的格子不进报告
const cells: any[] = Object.values(st.cells).filter((c: any) => COURSES.some(p => c.course_id.startsWith(p))).sort((a: any, b: any) => COURSES.findIndex(p => a.course_id.startsWith(p)) - COURSES.findIndex(p => b.course_id.startsWith(p)));
const courses = [...new Map(cells.map(c => [c.course_id, c.course])).entries()] as [string, string][];
const models = [...new Set(cells.map(c => c.model))] as string[];
const LABEL: Record<string, [string, string]> = { 'qwen-plus': ['通义千问 Plus', 'Alibaba'], 'deepseek-v4-pro': ['DeepSeek V4 Pro', 'DeepSeek'], 'gpt-5.6-terra': ['GPT-5.6', 'OpenAI'], 'claude-sonnet-5-5': ['Claude Sonnet 5.5', 'Anthropic'], 'qwen3.7-plus': ['通义千问 3.7 Plus', 'Alibaba'] };
const COURSE_EN: Record<string, string> = { '火箭总装工程师': 'Rocket Assembly Engineer', '行业分析师': 'Investment Analyst', '数据分析师': 'Data Analyst', '机械设计工程师': 'Mechanical Design Engineer', '电气维修技术员': 'Electrical Maintenance', '应急指挥调度员': 'Emergency Dispatcher', '焊工师傅': 'Aerospace Welder' };
const COURSE_CN: Record<string, string> = { '焊工师傅': '航天焊工', '行业分析师': '投资行业分析师' };
const tone = (v: number | null) => v == null ? ['#eceef4', '#9aa0b4'] : v >= 80 ? ['#16204a', '#fff'] : v >= 60 ? ['#2c3768', '#fff'] : v >= 45 ? ['#b08d57', '#fff'] : ['#d9c9a8', '#4a3b1e'];
const pill = (v: number | null) => { const [bg, fg] = tone(v); return `<span class="pill" style="background:${bg};color:${fg}">${v ?? '—'}</span>`; };
const avg = (arr: (number | null | undefined)[]) => { const v = arr.filter((x): x is number => typeof x === 'number'); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const cellHtml = (x: any) => {
  if (!x || (x.entrance == null && x.final == null)) return `<td class="c"><div class="na">${x?.error ? '未完成' : '—'}</div></td>`;
  const gain = x.entrance != null && x.final != null ? x.final - x.entrance : null;
  return `<td class="c"><div class="row">${pill(x.entrance)}<i class="arr"></i>${pill(x.final)}${gain != null ? `<span class="g ${gain >= 0 ? 'up' : 'dn'}">${gain >= 0 ? '+' : ''}${gain}</span>` : ''}</div>${x.work != null ? `<div class="w">真活 <b>${x.work}</b><span>／100</span></div>` : '<div class="w muted">— 暂无相关真活 —</div>'}</td>`;
};
const rows = models.map(m => { const xs = courses.map(([cid]) => st.cells[`${cid}|${m}`]); const e = avg(xs.map(x => x?.entrance)), f = avg(xs.map(x => x?.final)), w = avg(xs.map(x => x?.work)); return `<tr><th class="m"><b>${LABEL[m]?.[0] || m}</b><small>${LABEL[m]?.[1] || ''} · ${m}</small></th>${xs.map(cellHtml).join('')}<td class="c avg"><div class="row">${pill(e)}<i class="arr"></i>${pill(f)}${e != null && f != null ? `<span class="g ${f - e >= 0 ? 'up' : 'dn'}">${f - e >= 0 ? '+' : ''}${f - e}</span>` : ''}</div><div class="w">真活均 <b>${w ?? '—'}</b></div></td></tr>`; }).join('');
// 结论卡
const done = cells.filter(c => c.entrance != null && c.final != null);
const byModel = models.map(m => { const xs = done.filter(c => c.model === m); return { m, e: avg(xs.map(x => x.entrance)), f: avg(xs.map(x => x.final)), gain: avg(xs.map(x => x.final - x.entrance)), w: avg(xs.map(x => x.work)) }; }).filter(x => x.f != null);
const bestGain = [...byModel].sort((a, b) => (b.gain ?? -99) - (a.gain ?? -99))[0];
const bestFinal = [...byModel].sort((a, b) => (b.f ?? -1) - (a.f ?? -1))[0];
const byCourse = courses.map(([cid, name]) => { const xs = done.filter(c => c.course_id === cid); return { name, e: avg(xs.map(x => x.entrance)), f: avg(xs.map(x => x.final)) }; }).filter(x => x.e != null);
const hardest = [...byCourse].sort((a, b) => (a.e ?? 99) - (b.e ?? 99))[0];
const workCells = done.filter(c => c.work != null);
const workAvg = avg(workCells.map(c => c.work));
const bestWork = [...byModel].sort((a, b) => (b.w ?? -1) - (a.w ?? -1))[0];
const overallE = avg(done.map(c => c.entrance)), overallF = avg(done.map(c => c.final));
const n = done.length;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>百业 Bench v0 · 通用模型的行业进入能力</title><style>
  @page { size: 1920px 1080px; margin: 0; }
  html, body { margin: 0; background: #f7f4ec; color: #16204a; font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }
  .page { width: 1920px; height: 1080px; box-sizing: border-box; padding: 54px 72px 40px; position: relative; overflow: hidden; background: #f7f4ec radial-gradient(1100px 600px at 85% -10%, rgba(176,141,87,.18), transparent 60%); }
  .frame { position: absolute; inset: 26px; border: 1.5px solid rgba(176,141,87,.5); pointer-events: none; } .frame::after { content: ''; position: absolute; inset: 7px; border: 1px solid rgba(22,32,74,.14); }
  .top { display: flex; align-items: flex-start; justify-content: space-between; }
  .crest { display: flex; align-items: center; gap: 16px; } .crest img { width: 64px; height: 64px; } .crest b { display: block; font: 900 22px "Songti SC", "STSong", serif; letter-spacing: .14em; } .crest small { color: #6b7190; font-size: 12px; letter-spacing: .22em; }
  .eyebrow { font: 700 13px/1 ui-monospace, Menlo, monospace; letter-spacing: .3em; color: #b08d57; text-align: right; }
  h1 { font: 900 50px/1.2 "Songti SC", "STSong", serif; margin: 22px 0 6px; letter-spacing: .02em; } h1 em { font-style: normal; color: #b08d57; }
  .sub { font-size: 20px; color: #4a5070; margin: 0 0 20px; }
  .proto { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin: 0 0 20px; border: 1px solid rgba(22,32,74,.15); border-radius: 14px; overflow: hidden; background: rgba(255,255,255,.7); }
  .proto div { padding: 12px 18px; border-right: 1px solid rgba(22,32,74,.1); font-size: 14px; color: #3b405a; line-height: 1.5; } .proto div:last-child { border-right: 0; }
  .proto b { display: block; font-size: 16px; color: #16204a; margin-bottom: 2px; } .proto i { font-style: normal; font: 700 11px ui-monospace, Menlo, monospace; letter-spacing: .2em; color: #b08d57; margin-right: 8px; }
  table { border-collapse: separate; border-spacing: 0; width: 100%; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 6px 30px rgba(22,32,74,.08); }
  th { text-align: left; padding: 14px 18px; background: #16204a; color: #fff; font-size: 16px; font-weight: 700; } th.h small { display: block; font-weight: 400; color: rgba(255,255,255,.6); font-size: 12px; margin-top: 2px; }
  th.m { background: #fff; color: #16204a; width: 250px; border-top: 1px solid #ebe7dc; } th.m b { font-size: 19px; } th.m small { display: block; font-weight: 400; color: #8a8fa6; font-size: 12px; margin-top: 2px; }
  thead th.m { background: #16204a; color: #fff; }
  td.c { padding: 14px 18px; border-top: 1px solid #ebe7dc; vertical-align: middle; } td.avg { background: #fbf8f1; }
  .row { display: flex; align-items: center; gap: 8px; } .pill { display: inline-block; min-width: 50px; text-align: center; font-weight: 800; font-size: 22px; padding: 5px 8px; border-radius: 9px; }
  .arr { width: 18px; height: 2px; background: #c9c3b4; position: relative; } .arr::after { content: ''; position: absolute; right: -1px; top: -4px; border: 5px solid transparent; border-left-color: #c9c3b4; }
  .g { font-size: 15px; font-weight: 800; } .g.up { color: #0d7a52; } .g.dn { color: #b42318; }
  .w { margin-top: 7px; font-size: 14px; color: #4a5070; } .w b { font-size: 17px; color: #16204a; } .w span { color: #9aa0b4; } .w.muted { color: #c3c7d6; } .na { color: #c3c7d6; font-size: 18px; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 18px; }
  .card { background: rgba(255,255,255,.8); border: 1px solid rgba(22,32,74,.12); border-radius: 14px; padding: 14px 18px; } .card i { font-style: normal; font: 700 11px ui-monospace, Menlo, monospace; letter-spacing: .22em; color: #b08d57; } .card b { display: block; font: 900 26px "Songti SC", "STSong", serif; margin: 4px 0 2px; } .card p { margin: 0; font-size: 14px; color: #4a5070; line-height: 1.55; }
  .foot { position: absolute; left: 72px; right: 72px; bottom: 34px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 13px; color: #6b7190; }
  .sign { font: 700 15px "Songti SC", "STSong", serif; color: #16204a; letter-spacing: .12em; } .sign small { display: block; font: 400 11px ui-monospace, Menlo, monospace; letter-spacing: .22em; color: #8a8fa6; margin-top: 3px; }
  .legend span { display: inline-block; width: 13px; height: 13px; border-radius: 3px; margin: 0 5px 0 12px; vertical-align: -2px; }
</style></head><body><div class="page"><div class="frame"></div>
  <div class="top"><div class="crest"><img src="../public/college/crest.svg" alt=""><div><b>百业学院</b><small>BAIYE AI COLLEGE</small></div></div><div class="eyebrow">BAIYE BENCH · v0 · ${new Date().toISOString().slice(0, 10)}</div></div>
  <h1>通用模型的<em>行业进入能力</em>：六门课 × 四个模型</h1>
  <p class="sub">同一个模型来上学：先按老师傅的尺子裸考，上完课再考同一章，全过了做一道企业的真活。入学分是「通用能力的行业进入线」，入学到毕业的差是「学院的培养增益」，真活分是「能不能上岗」。</p>
  <div class="proto"><div><i>01</i><b>入学考</b>不上课、不装技能卡，老师傅规则当尺子</div><div><i>02</i><b>上课</b>每章教案提炼成笔记，装进上下文</div><div><i>03</i><b>毕业考</b>装技能卡与笔记，再考同一章</div><div><i>04</i><b>真活实习</b>做一道企业真活，按 rubric 逐条评</div></div>
  <table><thead><tr><th class="m">模型 ＼ 课程</th>${courses.map(([, name]) => `<th class="h">${COURSE_CN[name] || name}<small>${COURSE_EN[name] || ''} · 入学 → 毕业 · 真活</small></th>`).join('')}<th class="h">平均<small>AVERAGE</small></th></tr></thead><tbody>${rows}</tbody></table>
  <div class="cards">
    <div class="card"><i>ENTRY LINE · 行业进入线</i><b>${overallE ?? '—'} → ${overallF ?? '—'}</b><p>${n} 格平均：裸考 ${overallE ?? '—'} 分，学院培养后 ${overallF ?? '—'} 分。${hardest ? `最难进的行业是「${COURSE_CN[hardest.name] || hardest.name}」，裸考均 ${hardest.e} 分。` : ''}</p></div>
    <div class="card"><i>COLLEGE GAIN · 培养增益</i><b>${bestGain ? `${LABEL[bestGain.m]?.[0] || bestGain.m} ${(bestGain.gain ?? 0) >= 0 ? '+' : ''}${bestGain.gain}` : '—'}</b><p>${bestGain ? `上课前后提升最大；` : ''}${bestFinal ? `毕业分最高是 ${LABEL[bestFinal.m]?.[0] || bestFinal.m}（${bestFinal.f}）。` : ''}增益来自教案与老师傅技能卡，不是换模型。</p></div>
    <div class="card"><i>ON THE JOB · 真活</i><b>${workAvg != null ? `${workAvg} / 100` : '—'}</b><p>${workCells.length} 道真活的平均分${bestWork && bestWork.w != null ? `，最高 ${LABEL[bestWork.m]?.[0] || bestWork.m}（${bestWork.w}）` : ''}。真活按企业此刻的真实问题出，评分逐条带证据，是上岗前最真实的一关。</p></div>
  </div>
  <div class="foot"><div class="legend">${n} / ${cells.length} 格 · 评分按百业学院评价体系（学院口径 v1）· 色阶：<span style="background:#16204a"></span>≥80 <span style="background:#2c3768"></span>60–79 <span style="background:#b08d57"></span>45–59 <span style="background:#d9c9a8"></span>&lt;45 · v0 每格一次，正式榜每格三次取中位数；课程与技能卡不公开，只公开协议与分数</div><div class="sign">平方智能 × 方略研究院<small>PINGFANG INTELLIGENCE · FANGLUE INSTITUTE</small></div></div>
</div></body></html>`;
fs.writeFileSync('docs/百业Bench-v0.html', html);
const png = `${process.env.HOME}/Desktop/AI百业演示/百业Bench-v0.png`, pdf = `${process.env.HOME}/Desktop/AI百业演示/百业Bench-v0.pdf`;
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', url = `file://${process.cwd()}/docs/百业Bench-v0.html`;
execFileSync(CH, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1920,1080', '--force-device-scale-factor=2', `--screenshot=${png}`, url], { stdio: 'ignore' });
execFileSync(CH, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, url], { stdio: 'ignore' });
console.log('→', png, '·', pdf, '·', n, '格');
