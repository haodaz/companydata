/**
 * 百业 Bench v0 · 跑分报告（多页 PDF）：封面板 + 方法与分数含义 + 课程与模型 + 逐门结果与观察 + 局限与正式榜协议。
 * 读 scripts/.college-bench.json；观察文字只陈述数据，不下定性。先跑 college-bench-report.mts 生成板子页。
 *   npx tsx scripts/college-bench-paper.mts
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const COURSES = ['b0614543', 'a35a662d', '065fd7f4', 'a7f8f2e7', 'f9add4b9', 'adcf442a'];
const st = JSON.parse(fs.readFileSync('scripts/.college-bench.json', 'utf8'));
const cells: any[] = Object.values(st.cells).filter((c: any) => COURSES.some(p => c.course_id.startsWith(p))).sort((a: any, b: any) => COURSES.findIndex(p => a.course_id.startsWith(p)) - COURSES.findIndex(p => b.course_id.startsWith(p)));
const LABEL: Record<string, [string, string]> = { 'qwen-plus': ['通义千问 Plus', '阿里云百炼 qwen-plus'], 'deepseek-v4-pro': ['DeepSeek V4 Pro', '阿里云百炼 deepseek-v4-pro'], 'gpt-5.6-terra': ['GPT-5.6', 'OpenAI gpt-5.6-terra'], 'claude-sonnet-5-5': ['Claude Sonnet 5.5', 'Anthropic claude-sonnet-5-5'] };
const CN: Record<string, string> = { '焊工师傅': '航天焊工', '行业分析师': '投资行业分析师' };
const COURSE_INFO: Record<string, { cat: string; what: string; teacher: string }> = {
  b0614543: { cat: '投资 / 行业分析', what: '武岳峰资本的行业分析师：一页纸投资备忘，启衡智能 A 轮项目速读。考核章是把项目资料读成投委会用的一页纸。', teacher: '技能卡为 AI 草案' },
  a35a662d: { cat: '数据分析', what: '电商平台的数据分析师：黑色星期六大盘 GMV 异动 18% 的破案演练。考核章是从多表口径里找异动原因。', teacher: '技能卡为 AI 草案' },
  '065fd7f4': { cat: '代码 / 工程', what: '智能制造装备公司的机械设计工程师：传送模组首件试装干涉排查与 ECN 变更通知。考核章是干涉定位与变更单。', teacher: '技能卡为 AI 草案' },
  a7f8f2e7: { cat: '蓝领操作', what: '南京晨光的焊工：第一块试板，在虚拟工位上把一条焊缝焊完。考核在虚拟焊接工位上进行，按老师傅的操作轨迹和规则评。', teacher: '老师傅技能卡' },
  f9add4b9: { cat: '蓝领操作 · 电路', what: '智能制造装备公司的电气维修技术员：封箱线突发停机，带电回路的电压追踪排查。考核章是排故顺序与安全规程。', teacher: '技能卡为 AI 草案' },
  adcf442a: { cat: '安全 · 应急', what: '市应急管理局的应急指挥调度员：暴雨夜突发坍塌，首报信息核实与应急初响。考核章是首报核实与初响调度。', teacher: '技能卡为 AI 草案' },
};
const models = ['qwen-plus', 'deepseek-v4-pro', 'gpt-5.6-terra', 'claude-sonnet-5-5'].filter(m => cells.some(c => c.model === m));
const courses = [...new Map(cells.map(c => [c.course_id, c.course])).entries()] as [string, string][];
const avg = (arr: (number | null | undefined)[]) => { const v = arr.filter((x): x is number => typeof x === 'number'); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const f = (v: any) => (v == null ? '—' : String(v));
const name = (m: string) => LABEL[m]?.[0] || m;
const cn = (c: string) => CN[c] || c;

// 逐门观察：只说数据
function observe(cid: string): string {
  const xs = models.map(m => st.cells[`${cid}|${m}`]).filter(x => x && x.final != null);
  if (!xs.length) return '这门课还没有跑完的格子。';
  const es = xs.map(x => x.entrance), fs_ = xs.map(x => x.final);
  const gains = xs.map(x => ({ m: x.model, g: x.final - x.entrance }));
  const up = gains.filter(g => g.g > 0), down = gains.filter(g => g.g < 0);
  const hiF = xs.reduce((a, b) => (b.final > a.final ? b : a)), loF = xs.reduce((a, b) => (b.final < a.final ? b : a));
  const parts = [`四个模型裸考 ${Math.min(...es)}–${Math.max(...es)} 分，上课后 ${Math.min(...fs_)}–${Math.max(...fs_)} 分。`];
  parts.push(`${up.length} 个模型上课后分数上升（${up.map(g => `${name(g.m)} +${g.g}`).join('、') || '无'}）${down.length ? `，${down.length} 个下降（${down.map(g => `${name(g.m)} ${g.g}`).join('、')}）` : ''}。`);
  parts.push(`毕业分最高 ${name(hiF.model)}（${hiF.final}），最低 ${name(loF.model)}（${loF.final}）。`);
  const ws = xs.filter(x => x.work != null);
  if (ws.length) { const hw = ws.reduce((a, b) => (b.work > a.work ? b : a)), lw = ws.reduce((a, b) => (b.work < a.work ? b : a)); parts.push(`真活 ${ws.length} 个模型做了：最高 ${name(hw.model)} ${hw.work} 分，最低 ${name(lw.model)} ${lw.work} 分${hw.model !== hiF.model ? `，与毕业分最高的模型不是同一个` : ''}。`); }
  else parts.push('这门课没有相关真活，没有做实习。');
  return parts.join('');
}
const courseTable = (cid: string) => `<table><thead><tr><th>模型</th><th class="n">入学考</th><th class="n">毕业考</th><th class="n">增益</th><th class="n">真活</th></tr></thead><tbody>${models.map(m => { const x = st.cells[`${cid}|${m}`]; const g = x && x.entrance != null && x.final != null ? x.final - x.entrance : null; return `<tr><td>${name(m)}</td><td class="n">${f(x?.entrance)}</td><td class="n">${f(x?.final)}</td><td class="n">${g == null ? '—' : (g >= 0 ? '+' : '') + g}</td><td class="n">${f(x?.work)}</td></tr>`; }).join('')}</tbody></table>`;

const done = cells.filter(c => c.final != null);
const overall = { e: avg(done.map(c => c.entrance)), f: avg(done.map(c => c.final)), w: avg(done.map(c => c.work)) };
const byModel = models.map(m => { const xs = done.filter(c => c.model === m); return { m, n: xs.length, e: avg(xs.map(x => x.entrance)), f: avg(xs.map(x => x.final)), g: avg(xs.map(x => x.final - x.entrance)), w: avg(xs.map(x => x.work)) }; });
const board = fs.existsSync('docs/百业Bench-v0.html') ? fs.readFileSync('docs/百业Bench-v0.html', 'utf8') : '';
const boardBody = board ? board.slice(board.indexOf('<div class="page">'), board.lastIndexOf('</body>')) : '';
const boardCss = board ? board.slice(board.indexOf('<style>') + 7, board.indexOf('</style>')).replace(/@page\s*\{[^}]*\}/g, '').replace(/html, body \{[^}]*\}/, '') : '';   // 板子页自己的 @page（1920×1080）和 body 底色不能带进来

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>百业 Bench v0 · 跑分报告</title><style>
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0; font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; color: #16204a; background: #fff; }
  .pg { width: 297mm; height: 210mm; box-sizing: border-box; padding: 14mm 18mm 12mm; page-break-after: always; position: relative; background: #f7f4ec; }
  .pg:last-child { page-break-after: auto; }
  .eyebrow { font: 700 10px ui-monospace, Menlo, monospace; letter-spacing: .3em; color: #b08d57; }
  h2 { font: 900 22pt "Songti SC", "STSong", serif; margin: 4px 0 8px; } h3 { font-size: 13pt; margin: 12px 0 4px; }
  p, li { font-size: 11pt; line-height: 1.7; color: #2c3250; margin: 0 0 6px; } ul { margin: 0 0 6px; padding-left: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; margin: 4px 0 8px; background: #fff; } th { text-align: left; padding: 6px 9px; background: #16204a; color: #fff; font-weight: 700; } td { padding: 5px 9px; border-bottom: 1px solid #e6e1d4; } td.n, th.n { text-align: right; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; } .box { background: #fff; border: 1px solid rgba(22,32,74,.12); border-radius: 10px; padding: 10px 14px; }
  .foot { position: absolute; left: 18mm; right: 18mm; bottom: 7mm; display: flex; justify-content: space-between; font-size: 9pt; color: #6b7190; } .foot b { font: 700 10pt "Songti SC", serif; color: #16204a; letter-spacing: .1em; }
  .boardpage { width: 297mm; height: 210mm; overflow: hidden; page-break-after: always; } .boardpage .page { zoom: ${297 / (1920 / 3.7795)}; }
  ${boardCss}
</style></head><body>
<div class="boardpage">${boardBody}</div>

<section class="pg">
  <div class="eyebrow">METHOD · 方法</div>
  <h2>一、怎么考，分数是什么意思</h2>
  <p>百业学院把一个职业做成一门课：若干章节（每章是这个岗位真实的一天里的一段活）、虚拟工位、一张技能卡（老师傅的判断规则与关键动作，或由 AI 起草待校正）、每章的教案。来上学的学员是一个模型。跑分对每个「模型 × 课程」的格子走同一条路径：</p>
  <div class="cols">
    <div class="box"><h3>01 入学考</h3><p>不上课、不装技能卡，直接做这门课的考核章。评分用老师傅的尺子。<b>入学分</b>表示通用能力在这个行业的起点。</p></div>
    <div class="box"><h3>02 上课</h3><p>逐章把教案提炼成要点，写进学员的随身笔记本。上课本身不计分。</p></div>
    <div class="box"><h3>03 毕业考</h3><p>装上技能卡和笔记本，再考同一章。<b>毕业分</b>表示经过学院培养后的水平；<b>增益</b> = 毕业分 − 入学分，是学院（教案 + 技能卡）的作用，不是换模型带来的。</p></div>
    <div class="box"><h3>04 真活实习</h3><p>做一道和这门课同岗位或同企业的真活（企业此刻真实的业务问题，带材料包和逐条评分标准）。<b>真活分</b>表示上岗做一件具体工作的得分。没有相关真活的课不做这一步。</p></div>
  </div>
  <h3>评价体系</h3>
  <p>章节考按学院口径 v1 评：评分员先列出老师傅在这一章的关键动作，再按四个维度打分——行话与行规 25、具体执行 30、现场判断 25、交付可用 20；关键动作做到不足一半封顶 59，泛泛而谈、换个行业也成立封顶 45。真活按出题时定好的 rubric 逐条评，每条引用交付物原句当证据，前置条目没做到的后置条目封顶。所有分数满分 100，同一把尺，不随学员换。评分由学院评价体系给出，不由学员自己的模型评。</p>
  <div class="foot"><span>百业 Bench v0 · ${new Date().toISOString().slice(0, 10)}</span><b>平方智能 × 方略研究院</b></div>
</section>

<section class="pg">
  <div class="eyebrow">SETUP · 课程与模型</div>
  <h2>二、六门课，四个模型</h2>
  <p>课按真活训练集的三类挑：投资 / 行业 / 数据分析，代码 / 工程，蓝领操作与安全。模型取国内外各两个，通过各自官方接口调用，参数默认。</p>
  <table><thead><tr><th>课程</th><th>类别</th><th>内容与考核章</th><th>技能卡</th></tr></thead><tbody>${courses.map(([cid, c]) => { const i = COURSE_INFO[cid.slice(0, 8)] || COURSE_INFO[Object.keys(COURSE_INFO).find(k => cid.startsWith(k)) || '']; return `<tr><td><b>${cn(c)}</b></td><td>${i?.cat || ''}</td><td>${i?.what || ''}</td><td>${i?.teacher || ''}</td></tr>`; }).join('')}</tbody></table>
  <table><thead><tr><th>模型</th><th>接口</th><th class="n">跑完的格子</th><th class="n">入学均分</th><th class="n">毕业均分</th><th class="n">平均增益</th><th class="n">真活均分</th></tr></thead><tbody>${byModel.map(x => `<tr><td><b>${name(x.m)}</b></td><td>${LABEL[x.m]?.[1] || ''}</td><td class="n">${x.n}</td><td class="n">${f(x.e)}</td><td class="n">${f(x.f)}</td><td class="n">${x.g == null ? '—' : (x.g >= 0 ? '+' : '') + x.g}</td><td class="n">${f(x.w)}</td></tr>`).join('')}</tbody></table>
  <p>全部 ${done.length} 格：入学均分 ${f(overall.e)}，毕业均分 ${f(overall.f)}，真活均分 ${f(overall.w)}。</p>
  <div class="foot"><span>百业 Bench v0</span><b>平方智能 × 方略研究院</b></div>
</section>

${[0, 2, 4].map(i => `<section class="pg">
  <div class="eyebrow">RESULTS · 逐门结果</div>
  <h2>三、${i === 0 ? '投资与数据' : i === 2 ? '工程' : '蓝领操作与安全'}</h2>
  <div class="cols">${courses.slice(i, i + 2).map(([cid, c]) => `<div class="box"><h3>${cn(c)}</h3>${courseTable(cid)}<p>${observe(cid)}</p></div>`).join('')}</div>
  <div class="foot"><span>百业 Bench v0</span><b>平方智能 × 方略研究院</b></div>
</section>`).join('')}

<section class="pg">
  <div class="eyebrow">NOTES · 局限与正式榜</div>
  <h2>四、这版的边界，正式榜怎么做</h2>
  <ul>
    <li><b>每格只跑了一次。</b>同一份作答两次评分可相差 10 分左右，单次分数有抖动；正式榜每格跑三次取中位数。</li>
    <li><b>考核章只有一章。</b>入学考和毕业考考的是同一章，便于前后对比；正式榜加到每门课全部章节。</li>
    <li><b>六门课里五门的技能卡是 AI 草案</b>，还没经老师傅校正；校正后尺子会更严，分数整体会下移。</li>
    <li><b>真活只有四门课有相关题</b>，且每门一道。真活题库在持续扩。</li>
    <li><b>课程内容、技能卡、题面不公开</b>，只公开协议与分数；模型接口调用不做任何定制。</li>
    <li>分数之间的比较只在同一门课内有意义；跨课程的均分只用来看整体趋势。</li>
  </ul>
  <h3>正式榜的协议</h3>
  <p>固定课程集与版本号；每个模型、每门课三次独立运行取中位数；入学考与毕业考覆盖全部章节；真活每门课至少两道；评分口径版本固定并公开；新模型可申请入学，按同一协议跑分后进榜。</p>
  <div class="foot"><span>百业 Bench v0 · 方法与数据 · 可复现</span><b>平方智能 × 方略研究院</b></div>
</section>
</body></html>`;
fs.writeFileSync('docs/百业Bench-v0-报告.html', html);
const pdf = `${process.env.HOME}/Desktop/AI百业演示/百业Bench-v0-跑分报告.pdf`;
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, `file://${process.cwd()}/docs/百业Bench-v0-报告.html`], { stdio: 'ignore' });
console.log('→', pdf, '·', done.length, '格');
