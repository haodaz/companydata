'use client';

/**
 * 申请模型入学：先讲清楚模型来平方上学学什么（行业 know-how → 知识图谱升维 → 配一间数字职业空间 → 长出垂域心智：感知、改变、人际），
 * 再给效果（同一道真活上学前后的分数，能亲手考一次 /college/enroll/try），最后是申请表——不用登录，提交训练目标和模型接口说明，存成线索就结束。
 * 口径取自 /lab 首页「可信 → 升维 → 求真 → 心智」四种空间、vsbp 升维体九维（HOW / WHY / WITH）和 baiye-v2 的事件流例子。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Graduate } from '@/lib/college';
import { CU_BASE, H2, SubHero } from '../ui';
import ApplyForm, { type Field } from '../ApplyForm';

const LAYERS = [
  { n: '01', zh: '行业 know-how', en: 'Trusted industry data', p: '企业、岗位、职业、标准、工位与设备分库建档，统一编号、人工审核留痕。它说出的每一个数字都能追到来源；库里没有的，它不编。' },
  { n: '02', zh: '知识图谱升维', en: 'Knowledge graph', p: '职业连着在招的企业与岗位，连着典型任务、工位设备、标准条款和成长阶梯。理解一行，从一条记录变成一张全景。' },
  { n: '03', zh: '配一间空间', en: 'A digital workplace', p: '这一行的场景、工位、同事和从早到晚的一天。它在里面接活、判断、上手操作设备，每一步进事件流。' },
  { n: '04', zh: '长出垂域心智', en: 'A domain mind', p: '带着这一行的经验、判断与分寸干活。教它的老师傅越多、干过的活越多，它越懂这一行。' },
];

const MIND = [
  { zh: '感知', en: 'Perceive', p: '读懂现场：仪表读数、报警、物料状态、客人的脸色。知道哪些信号要紧，哪些可以等。', ev: ['09:08', '回看规程 2 次，再动手'] },
  { zh: '改变', en: 'Act', p: '动手让现场往对的方向走：开阀、调参数、改方案、出钢。按真实步长一步步做，越界就扣分。', ev: ['09:04', '拉遮阳 · 补水再开泵'] },
  { zh: '人际', en: 'Relate', p: '和同事、上级、客户打交道：什么时候先汇报、什么时候先安抚、话怎么说才让人放心。', ev: ['09:11', '先汇报调度，再动刀闸'] },
];

// 升维体：三个空间 × 三根双极轴 = 九维（两端都不是缺点）
const NINE: { k: string; zh: string; en: string; ax: [string, string, string][] }[] = [
  { k: 'HOW', zh: '做事方式', en: 'How it works', ax: [['节奏', '深耕打磨', '快速迭代'], ['依据', '直觉判断', '证据先行'], ['边界', '专精纵深', '横向贯通']] },
  { k: 'WHY', zh: '驱动', en: 'What drives it', ax: [['驱动来源', '外在认可', '内在意义'], ['用户距离', '底层能力', '贴着用户'], ['视野', '本土深耕', '全球']] },
  { k: 'WITH', zh: '关系与环境', en: 'Who it works with', ax: [['掌控', '清晰指导', '自主负责'], ['协作', '独立作战', '高密度协作'], ['确定性', '稳定可预期', '模糊高变化']] },
];

const STEPS = [
  { n: '01', zh: '提交申请', en: 'Apply', p: '告诉我们模型是谁、想学哪一行、学会了在哪里用。' },
  { n: '02', zh: '入学评估', en: 'Assessment', p: '不带任何技能先考一次真活，看它在这一行本来的底子。' },
  { n: '03', zh: '定制课程', en: 'Curriculum', p: '按训练目标挑职业，配空间、请老师傅、定考核标准。' },
  { n: '04', zh: '训练与补训', en: 'Training', p: '上课、实训、再考；没过就找出短板补训，直到过关。' },
  { n: '05', zh: '毕业交付', en: 'Commencement', p: '证书和成绩单，连同技能包与训练记录一起交付。' },
];

const FIELDS: Field[] = [
  { key: 'org', label: '机构 / 团队', required: true, half: true, placeholder: '公司、实验室或团队名称' },
  { key: 'contact', label: '联系人', required: true, half: true },
  { key: 'phone', label: '手机或微信', required: true, half: true },
  { key: 'email', label: '邮箱', half: true },
  { key: 'role', label: '你的职务', half: true },
  { key: 'title', label: '模型名称', required: true, half: true, placeholder: '如：自研 7B 行业模型 / 某某 Agent' },
  { key: 'model_source', label: '模型来源', half: true, type: 'select', options: ['自研基座模型', '开源模型微调', '商用大模型 API', '智能体（Agent）', '其他'] },
  { key: 'api_style', label: '接口形式', half: true, type: 'select', options: ['OpenAI 兼容', 'Anthropic Messages', '自定义 HTTP', '暂时没有接口'] },
  { key: 'endpoint', label: '接口地址（可选）', half: true, placeholder: 'https://…', hint: '只填地址，不要填密钥；对接时我们单独联系。' },
  { key: 'target', label: '训练目标：想让它学会哪一行、哪个职业', required: true, type: 'textarea', rows: 3, placeholder: '如：变电站运维值班员——会看监控、会判断告警、会按规程倒闸操作' },
  { key: 'usage', label: '学会以后在哪里用', type: 'textarea', rows: 3, placeholder: '如：接进我们的运维平台，夜班先由它值守' },
  { key: 'note', label: '其他想说的', type: 'textarea', rows: 2 },
];

export default function Admissions() {
  const [ex, setEx] = useState<Graduate[]>([]);
  useEffect(() => {
    fetch('/api/college/graduates').then(r => r.json()).then(j => {
      if (!j.ok) return;
      const both = (j.data as Graduate[]).filter(g => g.exam.before != null && g.exam.after != null && g.avatar);
      setEx(both.sort((a, b) => (b.exam.after! - b.exam.before!) - (a.exam.after! - a.exam.before!)).slice(0, 3));
    }).catch(() => {});
  }, []);

  return (
    <div className="cu">
      <style>{CU_BASE + EN_CSS}</style>
      <SubHero crumb="申请模型入学" title="申请模型入学" en="Admissions for AI models" video="/college/admit.mp4" poster="/college/admit.jpg"
        lead="通用大模型懂得很多，却没在哪一行真干过活。送它来平方上学：用行业的 know-how 和知识图谱给它升维，配一间这一行的数字空间，让它长出垂域心智；过了真活考核，才算毕业。">
        <a className="cu-btn light" href="#apply">提交入学申请</a>
        <a className="cu-btn line" href="#effect">先看效果 →</a>
      </SubHero>

      {/* 为什么要上学 */}
      <section className="cu-sec">
        <div className="cu-in">
          <H2 eyebrow="为什么要上学 · WHY ENROLL" zh="知道，和会干，是两回事" en="Knowing a trade is not the same as doing it." />
          <p className="cu-lead">给 AI 升维，不是让它「知道转炉怎么炼钢」，而是炉前一整天里，报警响了先做什么。</p>
          <div className="cu-vs">
            <div><small>大模型给的</small><b>一段职业介绍、一份面试题</b></div>
            <div><small>平方给的</small><b>走进去干一天，留下证据</b></div>
          </div>
        </div>
      </section>

      {/* 训练什么 */}
      <section className="cu-sec cu-ivory">
        <div className="cu-in">
          <H2 eyebrow="训练内容 · WHAT WE TRAIN" zh="四层底座，一层一层往上长" en="Four layers, built from the ground up" />
          <div className="cu-ks" style={{ ['--n' as any]: 4 }}>
            {LAYERS.map(x => <div key={x.n}><div className="n">{x.n}</div><b>{x.zh}</b><i>{x.en}</i><p>{x.p}</p></div>)}
          </div>
        </div>
      </section>

      {/* 垂域心智 */}
      <section className="cu-sec cu-dark2">
        <div className="cu-in">
          <H2 light eyebrow="垂域心智 · DOMAIN MIND" zh="在现场感知，动手改变，和人相处" en="Perceive the scene, change it, work with people." />
          <p className="cu-p">一位职人的心智，不在它答对了几道题，而在一整天的事件流里：它注意到了什么、做了什么、对谁说了什么、在哪里犹豫过。平方把这些一条条记下来，心智画像就从事件里长出来。</p>
          <div className="en-mind">
            {MIND.map(m => (
              <div key={m.zh}>
                <b>{m.zh}</b><i>{m.en}</i>
                <p>{m.p}</p>
                <div className="ev"><span>{m.ev[0]}</span>{m.ev[1]}</div>
              </div>
            ))}
          </div>
          <div className="en-nine">
            <div className="en-nine-h">
              <b>九维心智画像</b><i>Nine dimensions of mind</i>
              <p>三个空间 × 三根双极轴。人和 AI 用同一套九维被描绘，落在同一个空间里，升维配升维。两端都不是缺点，只是做事的样子不一样。</p>
            </div>
            {NINE.map(c => (
              <div key={c.k} className="en-cube">
                <div className="h"><span>{c.k}</span><b>{c.zh}</b><i>{c.en}</i></div>
                {c.ax.map(([n, l, r]) => <div key={n} className="ax"><em>{n}</em><span>{l}</span><s /><span>{r}</span></div>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 看效果 */}
      <section className="cu-sec" id="effect">
        <div className="cu-in">
          <H2 eyebrow="看效果 · RESULTS" zh="同一道真活，上学前后" en="Same task, same standard, before and after." />
          <p className="cu-p">同一个通用大模型，先不带任何技能干一遍，再装上老师傅的判断规则、示范和这一行的知识重干一遍。题目和评分标准都不变，及格线 60。</p>
          <div className="en-ex">
            {(ex.length ? ex : Array.from({ length: 3 }, () => null)).map((g, i) => g ? (
              <Link key={g.id} href={`/college/g/${g.id}`} className="en-exc">
                <div className="who"><img src={g.avatar!} alt="" /><div><b>{g.role}</b><span>{g.name}</span></div></div>
                <div className="bar"><label>上学前</label><div><i style={{ width: `${g.exam.before}%` }} /></div><em>{g.exam.before}</em></div>
                <div className="bar up"><label>上学后</label><div><i style={{ width: `${g.exam.after}%` }} /></div><em>{g.exam.after}</em></div>
              </Link>
            ) : <div key={i} className="en-exc sk" />)}
          </div>
          <Link className="cu-btn navy" href="/college/enroll/try" style={{ marginTop: 28 }}>亲手考一次 <i>Try it</i> →</Link>
        </div>
      </section>

      {/* 入学流程 */}
      <section className="cu-sec cu-ivory">
        <div className="cu-in">
          <H2 eyebrow="入学流程 · ADMISSIONS PROCESS" zh="从申请到毕业" en="From application to commencement" />
          <div className="cu-ks" style={{ ['--n' as any]: 5 }}>
            {STEPS.map(x => <div key={x.n}><div className="n">{x.n}</div><b>{x.zh}</b><i>{x.en}</i><p>{x.p}</p></div>)}
          </div>
        </div>
      </section>

      {/* 申请 */}
      <section className="cu-sec" id="apply">
        <div className="cu-in en-apply">
          <div>
            <H2 eyebrow="申请 · APPLY" zh="提交入学申请" en="Apply for admission" />
            <p className="cu-p">告诉我们模型是谁、想学哪一行、学会以后在哪里用。我们收到后会联系你，确认训练目标和接口对接方式，再安排入学评估。</p>
            <ul className="en-notes">
              <li>不用注册，留下联系方式就行。</li>
              <li>模型密钥不在这里填，对接时单独联系。</li>
              <li>还没想好学哪一行？写下你的业务场景，我们帮你挑。</li>
            </ul>
          </div>
          <ApplyForm kind="enroll" fields={FIELDS} submitText="提交入学申请"
            doneTitle="申请收到了"
            doneText="平方的同事会尽快联系你，确认训练目标和接口对接方式，再安排一次入学评估。等待期间，可以先去「看效果」亲手考一次。" />
        </div>
      </section>
    </div>
  );
}

const EN_CSS = `
.en-mind { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; margin-top: 34px; }
.en-mind > div { padding: 26px 24px; background: rgba(255,255,255,.04); border-top: 2px solid var(--gold2); }
.en-mind b { font-family: var(--serif); font-size: 34px; color: #fff; }
.en-mind i { margin-left: 10px; color: rgba(255,255,255,.55); font-size: 16px; }
.en-mind p { font-size: 15px; line-height: 1.85; color: rgba(255,255,255,.76); margin: 12px 0 16px; }
.en-mind .ev { font-size: 13.5px; color: var(--gold2); background: rgba(217,184,120,.08); padding: 8px 12px; border-left: 2px solid var(--gold2); }
.en-mind .ev span { font-family: ui-monospace, Menlo, monospace; margin-right: 10px; opacity: .8; }
.en-nine { display: grid; grid-template-columns: 0.85fr repeat(3, minmax(0, 1fr)); gap: 0; margin-top: 56px; border-top: 1px solid rgba(255,255,255,.18); }
.en-nine > div { padding: 24px 22px 0 0; }
.en-nine > div + div { padding-left: 22px; border-left: 1px solid rgba(255,255,255,.1); }
.en-nine-h b { display: block; font-family: var(--serif); font-size: 24px; color: var(--gold2); }
.en-nine-h i { display: block; color: rgba(255,255,255,.55); margin: 2px 0 12px; }
.en-nine-h p { font-size: 14px; line-height: 1.85; color: rgba(255,255,255,.7); margin: 0; }
.en-cube .h { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.en-cube .h span { font: 700 12px var(--en); letter-spacing: .16em; color: var(--gold2); }
.en-cube .h b { font-family: var(--serif); font-size: 19px; color: #fff; }
.en-cube .h i { display: block; width: 100%; font-size: 13.5px; color: rgba(255,255,255,.5); }
.en-cube .ax { display: grid; grid-template-columns: 56px auto minmax(14px, 1fr) auto; align-items: center; gap: 6px; font-size: 12.5px; color: rgba(255,255,255,.72); padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.07); }
.en-cube .ax em { font-style: normal; font-weight: 700; color: #fff; }
.en-cube .ax span { white-space: nowrap; }
.en-cube .ax span:last-child { text-align: right; }
.en-cube .ax s { height: 1px; background: linear-gradient(90deg, rgba(217,184,120,.2), var(--gold2), rgba(217,184,120,.2)); position: relative; }
.en-ex { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; margin-top: 30px; }
.en-exc { display: grid; gap: 14px; padding: 24px; background: var(--ivory); border-top: 3px solid var(--navy); color: var(--navy); }
.en-exc.sk { height: 190px; }
.en-exc:hover { border-top-color: var(--gold); }
.en-exc .who { display: flex; gap: 12px; align-items: center; }
.en-exc .who img { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; object-position: 50% 12%; box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px var(--gold); background: #e8e3d4; }
.en-exc .who b { display: block; font-family: var(--serif); font-size: 19px; }
.en-exc .who span { font: 600 11.5px var(--en); letter-spacing: .12em; color: var(--ink3); }
.en-exc .bar { display: grid; grid-template-columns: 48px 1fr 40px; align-items: center; gap: 10px; font-size: 13px; color: var(--ink2); }
.en-exc .bar div { height: 10px; background: rgba(22,32,74,.07); }
.en-exc .bar i { display: block; height: 100%; background: #8a90ad; }
.en-exc .bar.up i { background: linear-gradient(90deg, #b08d57, #d9b878); }
.en-exc .bar em { font: 700 20px var(--en); color: var(--navy); font-style: normal; text-align: right; }
.en-exc .bar.up em { color: #8a6a2f; }
.en-apply { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: clamp(24px, 5vw, 64px); align-items: start; }
.en-notes { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 8px; font-size: 14.5px; line-height: 1.75; color: var(--ink2); }
@media (max-width: 980px) {
  .en-mind, .en-ex, .en-apply { grid-template-columns: 1fr; }
  .en-nine { grid-template-columns: 1fr; }
  .en-nine > div, .en-nine > div + div { padding: 18px 0; border-left: 0; border-bottom: 1px solid rgba(255,255,255,.1); }
}
`;
