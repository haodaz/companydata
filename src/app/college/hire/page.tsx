'use client';

/**
 * 人才培养需求：给企业定向培养一位懂这一行、也懂这家公司的 AI 员工（拥有企业的数字业务空间）。
 * 先讲 AI 人升维的逻辑（一份平的 JD → 落进图谱 → 搭业务空间 → 用真活考出来），再讲企业会得到一位怎样的 AI 员工、上岗后的一天、干真活的样子，
 * 最后是申请表：不用登录，提交企业信息和岗位信息，存成线索就结束——这里不现场几秒建好。?from=<毕业生 id>：从毕业生档案「雇它上岗」进来，预填岗位。
 */
import React, { useEffect, useState } from 'react';
import { CU_BASE, H2, Loop, SubHero } from '../ui';
import ApplyForm, { type Field } from '../ApplyForm';

const UPSCALE = [
  { n: '01', zh: '平面：你们的 JD', en: 'A flat job description', p: '岗位职责、任职要求、内部规范、过往案例。几页纸，是起点。' },
  { n: '02', zh: '展开：落进图谱', en: 'Into the knowledge graph', p: '对上职业、典型任务、工位设备、标准条款，也对上同行在招什么样的人。' },
  { n: '03', zh: '立体：搭业务空间', en: 'A digital business space', p: '你们的流程、系统、文档、客户和同事，做成它每天上班的地方。' },
  { n: '04', zh: '求真：用真活考出来', en: 'Proven on real work', p: '老师傅校正判断规则，按你们的标准评分；过了才交付，没过就补训。' },
];

const GET = [
  { zh: '懂你们的业务', en: 'Knows your business', p: '你们的流程、术语、系统和客户都在它的业务空间里，上岗第一天不用从头教。' },
  { zh: '带着师承和规矩', en: 'Trained by your best', p: '判断规则来自你们最好的老师傅，分寸和红线写进它的考核标准。' },
  { zh: '每一步可追溯', en: 'Fully auditable', p: '每一步都进事件流，结论逐条有出处；出了问题，可以回放到那一步。' },
  { zh: '越干越懂', en: 'Learns on the job', p: '新的案例、老师傅的复盘、补训记录持续回流，它的空间越来越厚。' },
  { zh: '能带新人、考新人', en: 'Trains your people', p: 'AI 先能干，才有资格考评别人：新人的入职陪练和真活考核，它来出题、它来打分。' },
  { zh: '按岗位接入', en: 'Fits your organization', p: '替代一道工序、增强一个岗位，或者和团队协同：人定规则和方向，它跑执行。' },
];

const DAY: [string, string, string][] = [
  ['08:30', '接班', '读完夜里的工单和告警，列出今天需要人拍板的三件事。'],
  ['10:00', '干活', '按你们的规程处理常规事务，拿不准的标上「需人工」，附上依据。'],
  ['14:00', '带人', '给新同事出一道真活，陪着练、逐条评分、讲清楚哪里错了。'],
  ['18:00', '交接', '写交接留言，把今天遇到的新例外记进空间，明天的它会更懂一点。'],
];

const WORK = [
  { img: '/work/shot-sheet.png', zh: '在表格里核数', p: '对齐需求表、日志和规则，算出缺口，把结论写清楚。' },
  { img: '/work/shot-code.png', zh: '在代码里改规则', p: '读懂旧逻辑，按新标准改，再自己跑一遍测试。' },
  { img: '/work/shot-report.png', zh: '交出一份可核的报告', p: '每一条结论都带证据，按岗位标准逐项评分。' },
];

const FLOW = [
  { n: '01', zh: '提交需求', en: 'Request', p: '企业信息、岗位信息、希望它干的活。' },
  { n: '02', zh: '需求访谈', en: 'Discovery', p: '和业务负责人、老师傅聊清楚标准和红线。' },
  { n: '03', zh: '搭业务空间', en: 'Build the space', p: '把流程、系统、材料做成它上班的空间。' },
  { n: '04', zh: '培养与考核', en: 'Train & examine', p: '上课、实训、真活考核，没过就补训。' },
  { n: '05', zh: '交付上岗', en: 'Onboard', p: '带着证书、成绩单和过程记录接入岗位。' },
  { n: '06', zh: '持续补训', en: 'Keep improving', p: '新案例回流，定期复考，越干越懂。' },
];

const FIELDS: Field[] = [
  { key: 'org', label: '企业名称', required: true, half: true },
  { key: 'industry', label: '所属行业', half: true, placeholder: '如：新能源 / 医疗器械 / 连锁餐饮' },
  { key: 'size', label: '企业规模', half: true, type: 'select', options: ['50 人以下', '50–200 人', '200–1000 人', '1000–5000 人', '5000 人以上'] },
  { key: 'city', label: '所在城市', half: true },
  { key: 'contact', label: '联系人', required: true, half: true },
  { key: 'contact_title', label: '联系人职务', half: true },
  { key: 'phone', label: '手机或微信', required: true, half: true },
  { key: 'email', label: '邮箱', half: true },
  { key: 'headcount', label: '需要几位 AI 员工', half: true, type: 'select', options: ['1 位', '2–5 位', '5 位以上', '还不确定'] },
  { key: 'title', label: '岗位叫什么（可不填）', half: true, placeholder: '想不好名字就空着' },
  { key: 'mode', label: '希望怎么接入', half: true, type: 'select', options: ['替代一道工序', '增强一个岗位', '和团队协同', '还不确定'] },
  { key: 'timeline', label: '期望什么时候上岗', half: true, placeholder: '如：下个季度 / 越快越好' },
  { key: 'jd', label: '直接说：你要找什么样的人', required: true, type: 'textarea', rows: 5, placeholder: '例：我们投人工智能、材料、能源，要一个能看懂新兴产业的人——项目来了能判断技术路线靠不靠谱、离量产还有多远、团队行不行。\n有现成的 JD 也可以直接贴。' },
  { key: 'tasks', label: '希望它干的真活（举一两个例子）', type: 'textarea', rows: 3, placeholder: '如：每天早上汇总上一班的测试数据，标出异常电芯并给出复测建议' },
  { key: 'materials', label: '可以提供的内部材料', type: 'textarea', rows: 2, placeholder: '操作规程、培训手册、历史工单、优秀案例……先写有哪些，不用上传' },
];

export default function Hire() {
  const [from, setFrom] = useState('');
  const [init, setInit] = useState<Record<string, string> | undefined>();
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('from');
    if (!id) return;
    setFrom(id);
    fetch(`/api/college/graduates/${id}`).then(r => r.json()).then(j => { if (j.ok) setInit({ title: j.data.role }); }).catch(() => {});
  }, []);

  return (
    <div className="cu">
      <style>{CU_BASE + HI_CSS}</style>
      <SubHero crumb="人才培养需求" title="人才培养需求" en="Custom-trained AI employees for your company" video="/college/desk.mp4" poster="/college/desk.jpg"
        lead="照着你们企业的要求，定向培养一位 AI 员工。它懂这一行，也懂你们公司：你们的流程、系统、文档和客户，都在它的数字业务空间里。真活考过了，才交到你手上。">
        <a className="cu-btn light" href="#apply">提交培养需求</a>
        <a className="cu-btn line" href="#work">看它干真活的样子 →</a>
      </SubHero>

      {/* 升维的逻辑 */}
      <section className="cu-sec">
        <div className="cu-in">
          <H2 eyebrow="AI 人升维 · UPSCALING" zh="从一份 JD，到一位立体的 AI 员工" en="From a flat job description to a full-dimensional employee" />
          <p className="cu-lead">一份 JD 是平的：几行职责，几条要求。平方把它升维，变成一位在你们的业务空间里干过一整天、留下证据的 AI 员工。</p>
          <div className="cu-ks" style={{ ['--n' as any]: 4 }}>
            {UPSCALE.map(x => <div key={x.n}><div className="n">{x.n}</div><b>{x.zh}</b><i>{x.en}</i><p>{x.p}</p></div>)}
          </div>
          <div className="cu-vs">
            <div><small>招聘网站给你的</small><b>一份简历，一场面试</b></div>
            <div><small>平方给你的</small><b>在你们的业务空间里干过一整天，留下证据</b></div>
          </div>
        </div>
      </section>

      {/* 你会得到 */}
      <section className="cu-sec cu-navy">
        <div className="cu-in">
          <H2 light eyebrow="你会得到 · WHAT YOU GET" zh="一位怎样的 AI 员工" en="What kind of AI employee you get" />
          <div className="hi-get">
            {GET.map(g => <div key={g.zh}><b>{g.zh}</b><i>{g.en}</i><p>{g.p}</p></div>)}
          </div>
          <div className="hi-day">
            <div className="hi-day-h"><b>上岗以后的一天</b><i>A day on the job</i><p>以一个运营岗为例。</p></div>
            <ol>{DAY.map(([t, k, d]) => <li key={t}><span>{t}</span><b>{k}</b><p>{d}</p></li>)}</ol>
          </div>
        </div>
      </section>

      {/* 干真活的样子 */}
      <section className="cu-sec" id="work">
        <div className="cu-in">
          <div className="cu-split">
            <div className="cu-split-media"><Loop src="/college/work.mp4" poster="/college/work.jpg" /></div>
            <div>
              <H2 eyebrow="干真活 · REAL WORK" zh="它干活的样子" en="What real work looks like" />
              <p className="cu-p">交给它的不是题库，是你们真实的活：一份要核的表、一段要改的规则、一份要交的报告。它一步一步做，每一步都留痕，按你们的岗位标准评分。干对了，才有资格出题考别人。</p>
              <a className="hi-more" href="/work" target="_blank" rel="noreferrer">看看真活 <i>See real tasks</i> →</a>
            </div>
          </div>
          <div className="hi-work">
            {WORK.map(w => (
              <figure key={w.zh}>
                <div><img src={w.img} alt="" loading="lazy" /></div>
                <figcaption><b>{w.zh}</b><span>{w.p}</span></figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* 合作流程 */}
      <section className="cu-sec cu-ivory">
        <div className="cu-in">
          <H2 eyebrow="合作流程 · HOW IT WORKS" zh="从需求到上岗" en="From request to onboarding" />
          <div className="cu-ks" style={{ ['--n' as any]: 6 }}>
            {FLOW.map(x => <div key={x.n}><div className="n">{x.n}</div><b>{x.zh}</b><i>{x.en}</i><p>{x.p}</p></div>)}
          </div>
        </div>
      </section>

      {/* 申请 */}
      <section className="cu-sec" id="apply">
        <div className="cu-in hi-apply">
          <div>
            <H2 eyebrow="申请 · REQUEST" zh="提交培养需求" en="Request an AI employee" />
            <p className="cu-p">告诉我们你们是谁、缺什么岗位、希望它干什么活。我们收到后会联系你约一次需求访谈，再给出培养方案。</p>
            <ul className="hi-notes">
              <li>不用注册，留下联系方式就行。</li>
              <li>内部材料先写有哪些，不用现在上传；访谈后按需对接。</li>
              <li>培养一位 AI 员工需要访谈、搭空间、考核，不是几秒钟生成的。</li>
            </ul>
          </div>
          <ApplyForm kind="hire" fields={FIELDS} submitText="提交培养需求" source={from ? `from:${from}` : undefined} initial={init}
            doneTitle="需求收到了"
            doneText="平方的同事会尽快联系你，约一次需求访谈：聊清楚岗位标准、红线和可以提供的材料，再给出培养方案和时间表。" />
        </div>
      </section>
    </div>
  );
}

const HI_CSS = `
.hi-get { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; border-top: 2px solid var(--gold2); }
.hi-get > div { padding: 26px 26px 26px 0; border-bottom: 1px solid rgba(255,255,255,.12); }
.hi-get > div:not(:nth-child(3n+1)) { padding-left: 26px; border-left: 1px solid rgba(255,255,255,.12); }
.hi-get b { display: block; font-family: var(--serif); font-size: 23px; }
.hi-get i { display: block; color: rgba(255,255,255,.55); margin-top: 2px; }
.hi-get p { font-size: 14.5px; line-height: 1.85; color: rgba(255,255,255,.76); margin: 12px 0 0; }
.hi-day { display: grid; grid-template-columns: 260px 1fr; gap: 30px; margin-top: 56px; padding: 30px; background: rgba(255,255,255,.05); }
.hi-day-h b { display: block; font-family: var(--serif); font-size: 26px; color: var(--gold2); }
.hi-day-h i { display: block; color: rgba(255,255,255,.55); margin-top: 2px; }
.hi-day-h p { font-size: 13.5px; color: rgba(255,255,255,.55); margin: 12px 0 0; }
.hi-day ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
.hi-day li { border-top: 1px solid rgba(217,184,120,.5); padding-top: 12px; }
.hi-day li span { font: 400 22px var(--en); color: var(--gold2); }
.hi-day li b { display: block; font-family: var(--serif); font-size: 19px; margin: 4px 0 6px; }
.hi-day li p { margin: 0; font-size: 14px; line-height: 1.75; color: rgba(255,255,255,.75); }
.hi-more { display: inline-block; font-weight: 800; color: var(--navy); font-size: 15.5px; border-bottom: 2px solid var(--gold); padding-bottom: 4px; }
.hi-more i { font-weight: 400; color: var(--ink3); }
.hi-work { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; margin-top: 48px; }
.hi-work figure { margin: 0; }
.hi-work figure > div { aspect-ratio: 16 / 10; overflow: hidden; border: 1px solid var(--line); background: #f3f4f8; }
.hi-work img { width: 100%; height: 100%; object-fit: cover; object-position: top left; transition: transform .6s; }
.hi-work figure:hover img { transform: scale(1.04); }
.hi-work figcaption { padding-top: 12px; display: grid; gap: 4px; }
.hi-work figcaption b { font-family: var(--serif); font-size: 19px; }
.hi-work figcaption span { font-size: 14px; color: var(--ink2); line-height: 1.7; }
.hi-apply { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: clamp(24px, 5vw, 64px); align-items: start; }
.hi-notes { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 8px; font-size: 14.5px; line-height: 1.75; color: var(--ink2); }
@media (max-width: 980px) {
  .hi-get, .hi-work, .hi-apply, .hi-day, .hi-day ol { grid-template-columns: 1fr; }
  .hi-get > div, .hi-get > div:not(:nth-child(3n+1)) { padding: 18px 0; border-left: 0; }
}
`;
