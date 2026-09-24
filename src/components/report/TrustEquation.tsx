/**
 * 「可信任」等式：可信任知识 + 可信任数据 = 行业级知识图谱。
 * 平方创想的定位区块，两份报告开头共用。
 */
import React from 'react';
import { Reveal } from './primitives';

export function TrustEquation({ role }: { role: React.ReactNode }) {
  return (
    <section className="rp-section" id="s-position">
      <div className="rp-wrap">
        <Reveal>
          <div className="rp-brandbar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/report/visionsquare.png" alt="平方创想 VisionSquare" />
            <span>科技求真 · 构建教育科技人才一体化领域的「可信任」基础设施</span>
          </div>
        </Reveal>

        <Reveal>
          <div className="rp-eq">
            <div className="rp-eq-item">
              <div className="rp-eq-en">TRUE KNOWLEDGE</div>
              <div className="rp-eq-cn">可信任知识</div>
              <p>政策理论、教育理论、评价理论、业务逻辑与流程——十年持续的行业智库建设，形成完整的教育科技人才知识体系。它决定了「什么该被记录、什么才是关键字段」。</p>
            </div>
            <div className="rp-eq-op">+</div>
            <div className="rp-eq-item">
              <div className="rp-eq-en">TRUE DATA</div>
              <div className="rp-eq-cn">可信任数据</div>
              <p>全球教育科技人才垂直领域的结构化与半结构化数据，经过清洗、转换、标记、分级与质量把控，成为可支撑决策的可用数据底座。</p>
            </div>
            <div className="rp-eq-op">=</div>
            <div className="rp-eq-item rp-eq-result">
              <div className="rp-eq-en">KNOWLEDGE GRAPH</div>
              <div className="rp-eq-cn">行业级知识图谱</div>
              <p>知识图谱（物连物）、认知图谱（物连人）、关系图谱（人连人）——用数据与知识的编织，让机器可以快速、深度地理解真实世界的教育科技人才共同体。</p>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="rp-quote" style={{ marginTop: 26 }}>{role}</div>
        </Reveal>
      </div>
    </section>
  );
}
