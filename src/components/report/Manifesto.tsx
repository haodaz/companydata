/**
 * 理念区块：平方创想（VisionSquare）在「教育科技人才数据基础设施」里的定位。
 * AI 负责速度，四项内核能力负责这件事到底成不成立。两份报告共用。
 */
import React from 'react';
import { Reveal, SectionHead } from './primitives';

const CAPABILITIES = [
  {
    icon: '🧶',
    title: '数据知识编织能力',
    lead: '把碎片织成网络',
    desc: '信息散落在几十个域名、几十种页面结构里。把它们编织成彼此关联的知识网络——信源指向实体，实体之间有关系，关系带出处——靠的不是抓取，而是对「什么和什么应该连在一起」的设计。',
  },
  {
    icon: '🧭',
    title: '空间的构建能力',
    lead: '不是一张表，是可以生长的数据空间',
    desc: '企业、行业、产品、高管、投资方、动态、岗位、人，是有层次、有边界、能互相导航的空间结构。新增一家企业、一类实体、一座城市，都能挂进同一套空间里，而不是再开一张新表。',
  },
  {
    icon: '🔬',
    title: '垂直的研究能力',
    lead: '知道什么才是关键字段',
    desc: '企业画像要拆到近百个字段、「校招入口」和「官网首页」必须分开存、舆情只认公开报道并把负面单列、融资按轮次归并而不是按新闻条数——这些是行业 know-how，不是换个更大的模型就能得到的东西。',
  },
  {
    icon: '👤',
    title: '以人为本的实体核心',
    lead: '所有底数最终收敛到「人」',
    desc: '一家公司值不值得去，取决于带你的人；一个岗位是什么样，取决于做这件事的人。我们坚持把「人」做成一等实体：高管有名有姓、岗位有具体的技能、技能有真人专家的判断——这是整张数据网的原点。',
  },
];

export function Manifesto({ variant = 'r1' }: { variant?: 'r1' | 'r2' }) {
  return (
    <section className="rp-section rp-section-alt" id="s-manifesto">
      <div className="rp-wrap">
        <Reveal>
          <div className="rp-brandbar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/report/visionsquare.png" alt="平方创想 VisionSquare" />
            <span>构建教育科技人才一体化领域可信任的基础设施、工具与服务</span>
          </div>
        </Reveal>
        <SectionHead
          eyebrow="平方创想 VisionSquare · 教育科技人才数据基础设施"
          title="AI 让我们建得更快，但决定它成不成立的是另外四件事"
          lead={
            variant === 'r1'
              ? '这套流水线里，AI 承担的是规模与速度——它把原本需要几十人月的采集与整理压缩到一天、压缩到几百元。但速度本身不构成壁垒。真正难的，是下面这四项能力。'
              : '前面这张底数表之所以能成立，不是因为用了更强的模型。AI 把建设速度提高了一个数量级，而让这些数据真正可用、可生长、可信赖的，是下面这四项能力。'
          }
        />

        <div className="rp-core">
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.title} delay={i * 90} className={`rp-core-cell pos${i + 1}`}>
              <div className="rp-core-card">
                <div className="rp-core-head">
                  <span className="rp-core-icon">{c.icon}</span>
                  <span>
                    <b>{c.title}</b>
                    <i>{c.lead}</i>
                  </span>
                </div>
                <p>{c.desc}</p>
              </div>
            </Reveal>
          ))}

          <div className="rp-core-hub" aria-hidden>
            <div className="rp-core-ring" />
            <div className="rp-core-ring d2" />
            <div className="rp-core-disc">
              <span className="en">SquareCore</span>
              <span className="cn">「可信任」内核</span>
              <span className="sub">知识 × 数据 × 图谱 × 人</span>
            </div>
          </div>
        </div>

        <Reveal>
          <div className="rp-quote" style={{ marginTop: 26 }}>
            <strong>AI 负责规模与速度，平方创想负责结构与判断。</strong>
            模型每年都会更强，而「什么该被记录、什么和什么应该连起来、最终要收敛到谁身上」——
            这是教育科技人才数据基础设施真正的地基。平方创想在做的，正是这件事——
            构建教育科技人才一体化领域可信任的基础设施、工具与服务。
          </div>
        </Reveal>
      </div>
    </section>
  );
}
