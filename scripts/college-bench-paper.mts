/**
 * 百业 Bench v0 · 跑分报告（A4 竖版 PDF）：标题与摘要 + 矩阵（课程 × 模型）+ 结论 → 方法与分数含义 → 课程与模型 → 逐门结果与观察 → 局限与正式榜协议。
 * 读 scripts/.college-bench.json；观察文字只陈述数据。横版板子 PNG 由 college-bench-report.mts 另出。
 *   npx tsx scripts/college-bench-paper.mts
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const COURSES = ['b0614543', 'a35a662d', '065fd7f4', 'a7f8f2e7', 'f9add4b9', 'adcf442a'];
const st = JSON.parse(fs.readFileSync('scripts/.college-bench.json', 'utf8'));
const cells: any[] = Object.values(st.cells).filter((c: any) => COURSES.some(p => c.course_id.startsWith(p))).sort((a: any, b: any) => COURSES.findIndex(p => a.course_id.startsWith(p)) - COURSES.findIndex(p => b.course_id.startsWith(p)));
const LABEL: Record<string, [string, string]> = { 'qwen-plus': ['通义千问 Plus', '阿里云百炼 qwen-plus'], 'deepseek-v4-pro': ['DeepSeek V4 Pro', '阿里云百炼 deepseek-v4-pro'], 'gpt-5.6-terra': ['GPT-5.6', 'OpenAI gpt-5.6-terra'], 'claude-sonnet-5-5': ['Claude Sonnet 5.5', 'Anthropic claude-sonnet-5-5'] };
const CN: Record<string, string> = { '焊工师傅': '航天焊工', '行业分析师': '投资行业分析师' };
const EN: Record<string, string> = { '行业分析师': 'Investment Analyst', '数据分析师': 'Data Analyst', '机械设计工程师': 'Mechanical Design Engineer', '焊工师傅': 'Aerospace Welder', '电气维修技术员': 'Electrical Maintenance', '应急指挥调度员': 'Emergency Dispatcher' };
const INFO: Record<string, { cat: string; what: string; teacher: string }> = {
  b0614543: { cat: '投资 / 行业分析', what: '武岳峰资本的行业分析师：一页纸投资备忘，启衡智能 A 轮项目速读。考核章是把项目资料读成投委会用的一页纸。', teacher: 'AI 草案' },
  a35a662d: { cat: '数据分析', what: '电商平台的数据分析师：黑色星期六大盘 GMV 异动 18% 的破案演练。考核章是从多表口径里找异动原因。', teacher: 'AI 草案' },
  '065fd7f4': { cat: '代码 / 工程', what: '智能制造装备公司的机械设计工程师：传送模组首件试装干涉排查与 ECN 变更通知。考核章是干涉定位与变更单。', teacher: 'AI 草案' },
  a7f8f2e7: { cat: '蓝领操作', what: '南京晨光的焊工：第一块试板，在虚拟工位上把一条焊缝焊完。考核在虚拟焊接工位上进行，按老师傅的操作轨迹和规则评。', teacher: '老师傅' },
  f9add4b9: { cat: '蓝领操作 · 电路', what: '智能制造装备公司的电气维修技术员：封箱线突发停机，带电回路的电压追踪排查。考核章是排故顺序与安全规程。', teacher: 'AI 草案' },
  adcf442a: { cat: '安全 · 应急', what: '市应急管理局的应急指挥调度员：暴雨夜突发坍塌，首报信息核实与应急初响。考核章是首报核实与初响调度。', teacher: 'AI 草案' },
};
const models = ['qwen-plus', 'deepseek-v4-pro', 'gpt-5.6-terra', 'claude-sonnet-5-5'].filter(m => cells.some(c => c.model === m));
const courses = [...new Map(cells.map(c => [c.course_id, c.course])).entries()] as [string, string][];
const avg = (arr: (number | null | undefined)[]) => { const v = arr.filter((x): x is number => typeof x === 'number'); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const f = (v: any) => (v == null ? '—' : String(v));
const sg = (v: number | null) => (v == null ? '—' : (v >= 0 ? '+' : '') + v);
const name = (m: string) => LABEL[m]?.[0] || m;
const cn = (c: string) => CN[c] || c;
const info = (cid: string) => INFO[Object.keys(INFO).find(k => cid.startsWith(k)) || ''];
const tone = (v: number | null) => v == null ? ['#eceef4', '#9aa0b4'] : v >= 80 ? ['#16204a', '#fff'] : v >= 60 ? ['#2c3768', '#fff'] : v >= 45 ? ['#b08d57', '#fff'] : ['#d9c9a8', '#4a3b1e'];
const pill = (v: number | null) => { const [bg, fg] = tone(v); return `<span class="pill" style="background:${bg};color:${fg}">${v ?? '—'}</span>`; };

const done = cells.filter(c => c.final != null);
const overall = { e: avg(done.map(c => c.entrance)), f: avg(done.map(c => c.final)), w: avg(done.map(c => c.work)) };
const byModel = models.map(m => { const xs = done.filter(c => c.model === m); return { m, n: xs.length, e: avg(xs.map(x => x.entrance)), f: avg(xs.map(x => x.final)), g: avg(xs.map(x => x.final - x.entrance)), w: avg(xs.map(x => x.work)) }; });
const byCourse = courses.map(([cid, c]) => { const xs = done.filter(x => x.course_id === cid); return { cid, c, e: avg(xs.map(x => x.entrance)), f: avg(xs.map(x => x.final)), w: avg(xs.map(x => x.work)) }; });
const bestGain = [...byModel].filter(x => x.g != null).sort((a, b) => b.g! - a.g!)[0];
const bestFinal = [...byModel].filter(x => x.f != null).sort((a, b) => b.f! - a.f!)[0];
const bestWork = [...byModel].filter(x => x.w != null).sort((a, b) => b.w! - a.w!)[0];
const hardest = [...byCourse].filter(x => x.e != null).sort((a, b) => a.e! - b.e!)[0];
const easiest = [...byCourse].filter(x => x.e != null).sort((a, b) => b.e! - a.e!)[0];

// 矩阵：课程为行，模型为列
const matrix = `<table class="mx"><thead><tr><th class="c1">课程 ＼ 模型</th>${models.map(m => `<th>${name(m)}<small>${LABEL[m]?.[1].split(' ')[0] || ''}</small></th>`).join('')}<th class="avg">课程均分<small>入学 → 毕业</small></th></tr></thead><tbody>${courses.map(([cid, c]) => { const xs = models.map(m => st.cells[`${cid}|${m}`]); const i = info(cid); const e = avg(xs.map(x => x?.entrance)), fn = avg(xs.map(x => x?.final)); return `<tr><th class="c1"><b>${cn(c)}</b><small>${i?.cat || ''}${i?.teacher === '老师傅' ? ' · 老师傅技能卡' : ''}</small></th>${xs.map(x => { if (!x || x.final == null) return `<td><span class="na">${x?.error ? '未完成' : '—'}</span></td>`; const g = x.final - x.entrance; return `<td><div class="row">${pill(x.entrance)}<i class="arr"></i>${pill(x.final)}<span class="g ${g >= 0 ? 'up' : 'dn'}">${sg(g)}</span></div><div class="w">${x.work != null ? `真活 <b>${x.work}</b>` : '<span class="muted">无相关真活</span>'}</div></td>`; }).join('')}<td class="avg"><div class="row">${pill(e)}<i class="arr"></i>${pill(fn)}${e != null && fn != null ? `<span class="g ${fn - e >= 0 ? 'up' : 'dn'}">${sg(fn - e)}</span>` : ''}</div></td></tr>`; }).join('')}<tr class="sum"><th class="c1"><b>模型均分</b><small>入学 → 毕业 · 真活</small></th>${byModel.map(x => `<td><div class="row">${pill(x.e)}<i class="arr"></i>${pill(x.f)}<span class="g ${(x.g ?? 0) >= 0 ? 'up' : 'dn'}">${sg(x.g)}</span></div><div class="w">真活均 <b>${f(x.w)}</b></div></td>`).join('')}<td class="avg"><div class="row">${pill(overall.e)}<i class="arr"></i>${pill(overall.f)}</div><div class="w">真活均 <b>${f(overall.w)}</b></div></td></tr></tbody></table>`;

function observe(cid: string): string {
  const xs = models.map(m => st.cells[`${cid}|${m}`]).filter(x => x && x.final != null);
  if (!xs.length) return '这门课还没有跑完的格子。';
  const es = xs.map(x => x.entrance), fs_ = xs.map(x => x.final);
  const gains = xs.map(x => ({ m: x.model, g: x.final - x.entrance }));
  const up = gains.filter(g => g.g > 0), down = gains.filter(g => g.g < 0);
  const hiF = xs.reduce((a, b) => (b.final > a.final ? b : a)), loF = xs.reduce((a, b) => (b.final < a.final ? b : a));
  const parts = [`${xs.length} 个模型裸考 ${Math.min(...es)}–${Math.max(...es)} 分，上课后 ${Math.min(...fs_)}–${Math.max(...fs_)} 分。`];
  parts.push(`${up.length} 个上课后分数上升（${up.map(g => `${name(g.m)} +${g.g}`).join('、') || '无'}）${down.length ? `，${down.length} 个下降（${down.map(g => `${name(g.m)} ${g.g}`).join('、')}）` : ''}。`);
  parts.push(`毕业分最高 ${name(hiF.model)}（${hiF.final}），最低 ${name(loF.model)}（${loF.final}）。`);
  const ws = xs.filter(x => x.work != null);
  if (ws.length) { const hw = ws.reduce((a, b) => (b.work > a.work ? b : a)), lw = ws.reduce((a, b) => (b.work < a.work ? b : a)); parts.push(`真活：最高 ${name(hw.model)} ${hw.work} 分，最低 ${name(lw.model)} ${lw.work} 分${hw.model !== hiF.model ? '，与毕业分最高的不是同一个模型' : ''}。`); }
  else parts.push('这门课没有相关真活。');
  return parts.join('');
}
const courseTable = (cid: string) => `<table class="t"><thead><tr><th>模型</th><th class="n">入学考</th><th class="n">毕业考</th><th class="n">增益</th><th class="n">真活</th></tr></thead><tbody>${models.map(m => { const x = st.cells[`${cid}|${m}`]; const g = x && x.entrance != null && x.final != null ? x.final - x.entrance : null; return `<tr><td>${name(m)}</td><td class="n">${f(x?.entrance)}</td><td class="n">${f(x?.final)}</td><td class="n">${sg(g)}</td><td class="n">${f(x?.work)}</td></tr>`; }).join('')}</tbody></table>`;

const today = new Date().toISOString().slice(0, 10);
const foot = `<div class="foot"><span>百业 Bench v0 · ${today}</span><b>百业学院 · 平方智能 × 方略研究院</b></div>`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>百业 Bench v0 · 通用模型的行业进入能力</title><style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; color: #16204a; background: #fff; }
  .pg { width: 210mm; height: 297mm; box-sizing: border-box; padding: 16mm 16mm 16mm; page-break-after: always; position: relative; background: #f7f4ec; overflow: hidden; }
  .pg:last-child { page-break-after: auto; }
  .frame { position: absolute; inset: 7mm; border: 1px solid rgba(176,141,87,.5); pointer-events: none; }
  .eyebrow { font: 700 9.5px ui-monospace, Menlo, monospace; letter-spacing: .3em; color: #b08d57; }
  h1 { font: 900 26pt/1.25 "Songti SC", "STSong", serif; margin: 6px 0 6px; } h1 em { font-style: normal; color: #b08d57; }
  h2 { font: 900 17pt "Songti SC", "STSong", serif; margin: 2px 0 8px; } h3 { font-size: 11.5pt; margin: 10px 0 4px; }
  p, li { font-size: 10pt; line-height: 1.7; color: #2c3250; margin: 0 0 6px; text-align: justify; } ul, ol { margin: 0 0 6px; padding-left: 18px; }
  .crest { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; } .crest img { width: 40px; height: 40px; } .crest b { display: block; font: 900 14px "Songti SC", serif; letter-spacing: .14em; } .crest small { color: #6b7190; font-size: 9px; letter-spacing: .22em; }
  .lead { background: rgba(255,255,255,.75); border-left: 3px solid #b08d57; padding: 8px 12px; font-size: 10pt; margin: 0 0 10px; }
  table.mx { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 3px 16px rgba(22,32,74,.07); font-size: 9pt; }
  .mx th { background: #16204a; color: #fff; text-align: left; padding: 7px 8px; font-size: 9.5pt; } .mx th small { display: block; font-weight: 400; color: rgba(255,255,255,.6); font-size: 8pt; }
  .mx th.c1 { width: 24%; } .mx tbody th.c1 { background: #fff; color: #16204a; border-top: 1px solid #ebe7dc; } .mx tbody th.c1 small { color: #8a8fa6; }
  .mx td { padding: 7px 8px; border-top: 1px solid #ebe7dc; vertical-align: middle; } .mx td.avg, .mx th.avg { background: #fbf8f1; } .mx thead th.avg { background: #2c3768; }
  .mx tr.sum th, .mx tr.sum td { background: #f1ede2; border-top: 2px solid #16204a; }
  .row { display: flex; align-items: center; gap: 4px; } .pill { display: inline-block; min-width: 26px; text-align: center; font-weight: 800; font-size: 11pt; padding: 2px 4px; border-radius: 6px; }
  .arr { width: 9px; height: 1.5px; background: #c9c3b4; } .g { font-size: 8.5pt; font-weight: 800; } .g.up { color: #0d7a52; } .g.dn { color: #b42318; }
  .w { margin-top: 3px; font-size: 8.5pt; color: #4a5070; } .w b { font-size: 10pt; color: #16204a; } .muted { color: #c3c7d6; } .na { color: #c3c7d6; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; } .card { background: rgba(255,255,255,.8); border: 1px solid rgba(22,32,74,.12); border-radius: 8px; padding: 8px 10px; } .card i { font-style: normal; font: 700 8.5px ui-monospace, Menlo, monospace; letter-spacing: .2em; color: #b08d57; } .card b { display: block; font: 900 15pt "Songti SC", serif; margin: 2px 0; } .card p { margin: 0; font-size: 8.8pt; line-height: 1.5; }
  .box { background: rgba(255,255,255,.8); border: 1px solid rgba(22,32,74,.12); border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; } .box h3 { margin-top: 0; }
  table.t { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 4px 0 6px; background: #fff; } .t th { text-align: left; padding: 5px 8px; background: #16204a; color: #fff; } .t td { padding: 4px 8px; border-bottom: 1px solid #e6e1d4; } .t td.n, .t th.n { text-align: right; }
  .foot { position: absolute; left: 16mm; right: 16mm; bottom: 9mm; display: flex; justify-content: space-between; font-size: 8.5pt; color: #6b7190; } .foot b { font: 700 9.5pt "Songti SC", serif; color: #16204a; letter-spacing: .08em; }
  .legend span { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin: 0 4px 0 8px; vertical-align: -1px; }
</style></head><body>

<section class="pg"><div class="frame"></div>
  <div class="crest"><img src="../public/college/crest.svg" alt=""><div><b>百业学院</b><small>BAIYE AI COLLEGE · BAIYE BENCH v0</small></div></div>
  <h1>通用模型的<em>行业进入能力</em><br>六门课 × 四个模型跑分</h1>
  <p class="lead">同一个模型来上学：先按老师傅的尺子裸考（入学考），上完课再考同一章（毕业考），全过后做一道企业的真活。入学分是通用能力在这一行的起点，入学到毕业的差是学院的培养增益，真活分是上岗做一件具体工作的得分。满分都是 100，同一把尺。${done.length} / ${cells.length} 格。</p>
  ${matrix}
  <div class="cards">
    <div class="card"><i>ENTRY · 行业进入线</i><b>${f(overall.e)} → ${f(overall.f)}</b><p>${done.length} 格裸考均 ${f(overall.e)}，培养后 ${f(overall.f)}。${hardest ? `裸考最低的课是${cn(hardest.c)}（${hardest.e}）` : ''}${easiest ? `，最高是${cn(easiest.c)}（${easiest.e}）` : ''}。</p></div>
    <div class="card"><i>GAIN · 培养增益</i><b>${bestGain ? `${name(bestGain.m)} ${sg(bestGain.g)}` : '—'}</b><p>上课前后平均提升最大${bestFinal ? `；毕业均分最高 ${name(bestFinal.m)}（${bestFinal.f}）` : ''}。增益来自教案与技能卡，不是换模型。</p></div>
    <div class="card"><i>ON THE JOB · 真活</i><b>${f(overall.w)} / 100</b><p>${done.filter(c => c.work != null).length} 道真活的平均分${bestWork ? `，最高 ${name(bestWork.m)}（${bestWork.w}）` : ''}。真活按企业此刻的真实问题出，逐条带证据评。</p></div>
  </div>
  <p class="legend" style="margin-top:8px;font-size:8.5pt;color:#6b7190">色阶：<span style="background:#16204a"></span>≥80 <span style="background:#2c3768"></span>60–79 <span style="background:#b08d57"></span>45–59 <span style="background:#d9c9a8"></span>&lt;45 · v0 每格一次；正式榜每格三次取中位数。课程与技能卡不公开，只公开协议与分数。</p>
  ${foot}
</section>

<section class="pg"><div class="frame"></div>
  <div class="eyebrow">METHOD · 方法</div>
  <h2>一、怎么考，分数是什么意思</h2>
  <p>百业学院把一个职业做成一门课：若干章节（每章是这个岗位真实的一天里的一段活）、虚拟工位、一张技能卡（老师傅的判断规则与关键动作，或由 AI 起草待校正）、每章的教案。来上学的学员是一个模型。跑分对每个「模型 × 课程」的格子走同一条路径：</p>
  <div class="box"><h3>01 入学考</h3><p>不上课、不装技能卡，直接做这门课的考核章。评分用老师傅的尺子。<b>入学分</b>表示通用能力在这个行业的起点。</p></div>
  <div class="box"><h3>02 上课</h3><p>逐章把教案提炼成要点，写进学员的随身笔记本。上课本身不计分。</p></div>
  <div class="box"><h3>03 毕业考</h3><p>装上技能卡和笔记本，再考同一章。<b>毕业分</b>表示经过学院培养后的水平；<b>增益</b> = 毕业分 − 入学分，是学院（教案 + 技能卡）的作用，不是换模型带来的。</p></div>
  <div class="box"><h3>04 真活实习</h3><p>做一道和这门课同岗位或同企业的真活（企业此刻真实的业务问题，带材料包和逐条评分标准）。<b>真活分</b>表示上岗做一件具体工作的得分。没有相关真活的课不做这一步。</p></div>
  <h3>评价体系</h3>
  <p>章节考按学院口径 v1 评：先列出老师傅在这一章的关键动作，再按四个维度打分——行话与行规 25、具体执行 30、现场判断 25、交付可用 20；关键动作做到不足一半封顶 59，泛泛而谈、换个行业也成立封顶 45。真活按出题时定好的 rubric 逐条评，每条引用交付物原句当证据，前置条目没做到的后置条目封顶。所有分数满分 100，同一把尺，不随学员换；评分由学院评价体系给出，不由学员自己的模型评。</p>
  <h3>怎么读这些分数</h3>
  <ul>
    <li><b>入学分</b>高：这个模型不经训练就接近这一行的做法；低：通用知识和行业做法差得远。</li>
    <li><b>增益</b>大：教案和技能卡对它有用，说明学院的内容能被模型吸收；接近零或为负：这一章的教案没帮上忙，或模型没照笔记做。</li>
    <li><b>真活分</b>和毕业分不一定同向：毕业考是章节内的活，真活是企业整道题，考的是能不能完整交付。</li>
    <li>分数之间的比较只在同一门课内有意义；跨课程的均分只用来看整体趋势。</li>
  </ul>
  ${foot}
</section>

<section class="pg"><div class="frame"></div>
  <div class="eyebrow">SETUP · 课程与模型</div>
  <h2>二、六门课，四个模型</h2>
  <p>课按真活训练集的三类挑：投资 / 行业 / 数据分析，代码 / 工程，蓝领操作与安全。模型取国内外各两个，通过各自官方接口调用，参数默认，不做任何定制。</p>
  <table class="t"><thead><tr><th>课程</th><th>类别</th><th>内容与考核章</th><th>技能卡</th></tr></thead><tbody>${courses.map(([cid, c]) => { const i = info(cid); return `<tr><td><b>${cn(c)}</b><br><span style="color:#8a8fa6;font-size:8.5pt">${EN[c] || ''}</span></td><td>${i?.cat || ''}</td><td>${i?.what || ''}</td><td>${i?.teacher || ''}</td></tr>`; }).join('')}</tbody></table>
  <table class="t"><thead><tr><th>模型</th><th>接口</th><th class="n">跑完</th><th class="n">入学均分</th><th class="n">毕业均分</th><th class="n">平均增益</th><th class="n">真活均分</th></tr></thead><tbody>${byModel.map(x => `<tr><td><b>${name(x.m)}</b></td><td>${LABEL[x.m]?.[1] || ''}</td><td class="n">${x.n}</td><td class="n">${f(x.e)}</td><td class="n">${f(x.f)}</td><td class="n">${sg(x.g)}</td><td class="n">${f(x.w)}</td></tr>`).join('')}</tbody></table>
  <p>全部 ${done.length} 格：入学均分 ${f(overall.e)}，毕业均分 ${f(overall.f)}，真活均分 ${f(overall.w)}。每格一次运行，顺序为入学考、上课、毕业考、真活；上课用的教案是课程生成时预备好的，不在跑分中临时生成。</p>
  ${foot}
</section>

${[[0, '投资与数据'], [2, '工程'], [4, '蓝领操作与安全']].map(([i, t]) => `<section class="pg"><div class="frame"></div>
  <div class="eyebrow">RESULTS · 逐门结果</div>
  <h2>三、${t}</h2>
  ${courses.slice(i as number, (i as number) + 2).map(([cid, c]) => { const inf = info(cid); return `<div class="box"><h3>${cn(c)} <span style="color:#8a8fa6;font-weight:400;font-size:9.5pt">· ${inf?.cat || ''} · 技能卡：${inf?.teacher || ''}</span></h3><p style="color:#4a5070">${inf?.what || ''}</p>${courseTable(cid)}<p>${observe(cid)}</p></div>`; }).join('')}
  ${foot}
</section>`).join('')}

<section class="pg"><div class="frame"></div>
  <div class="eyebrow">NOTES · 局限与正式榜</div>
  <h2>四、这版的边界，正式榜怎么做</h2>
  <ul>
    <li><b>每格只跑了一次。</b>同一份作答两次评分可相差 10 分左右，单次分数有抖动；正式榜每格跑三次取中位数。</li>
    <li><b>考核章只有一章。</b>入学考和毕业考考的是同一章，便于前后对比；正式榜加到每门课全部章节。</li>
    <li><b>六门课里五门的技能卡是 AI 草案</b>，还没经老师傅校正；校正后尺子会更严，分数整体会下移。</li>
    <li><b>真活只有四门课有相关题</b>，且每门一道。真活题库在持续扩。</li>
    <li><b>课程内容、技能卡、题面不公开</b>，只公开协议与分数；模型接口调用不做任何定制。</li>
  </ul>
  <h3>正式榜的协议</h3>
  <ol>
    <li>固定课程集与版本号，课程增减另起版本。</li>
    <li>每个模型、每门课三次独立运行取中位数；入学考与毕业考覆盖全部章节；真活每门课至少两道。</li>
    <li>评分口径版本固定并公开（学院口径 v1）；评分与学员分离。</li>
    <li>新模型可申请入学，按同一协议跑分后进榜；客户自己的模型同样适用。</li>
    <li>每格的作答原文留存，可供复核。</li>
  </ol>
  <h3>成本</h3>
  <p>一格（入学考 + 上课 + 毕业考 + 真活）约 15 次调用；本次 ${cells.length} 格按 Sonnet 5.5 单价折算约 ${Math.round(cells.length * 0.8)} 美元。正式榜三次取中位数，成本按三倍计。</p>
  ${foot}
</section>
</body></html>`;
fs.writeFileSync('docs/百业Bench-v0-报告.html', html);
const pdf = `${process.env.HOME}/Desktop/AI百业演示/百业Bench-v0-跑分报告.pdf`;
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, `file://${process.cwd()}/docs/百业Bench-v0-报告.html`], { stdio: 'ignore' });
console.log('→', pdf, '·', done.length, '格');
