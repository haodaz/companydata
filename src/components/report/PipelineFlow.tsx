'use client';

/**
 * 智能数据工厂产线：八个工位，每个工位有自己的 AI 员工。
 * 工位之间有传送带与流动的数据包，数字全部来自真实运行结果。
 * 形象素材与平方创想「智能企业数据工厂」共用同一套 AI 员工。
 */
import React from 'react';
import { Reveal } from './primitives';

export interface Stage {
  step: string;
  icon: string;
  title: string;
  desc: React.ReactNode;
  metric?: string;
  metricLabel?: string;
  /** 工位上的 AI 员工 */
  agent?: { name: string; role: string; avatar: string; human?: boolean };
}

export function PipelineFlow({ stages }: { stages: Stage[] }) {
  const crew = stages.filter(s => s.agent);
  return (
    <div>
      {/* 工位花名册 */}
      {crew.length > 0 && (
        <Reveal>
          <div className="rp-crew">
            <div className="rp-crew-label">
              <span>本条产线的班组</span>
              <b>{crew.filter(s => !s.agent?.human).length} 位 AI 员工（含 AI 质检）+ {crew.filter(s => s.agent?.human).length} 位人类总质检</b>
            </div>
            <div className="rp-crew-list">
              {crew.map((s, i) => (
                <div className="rp-crew-item" key={s.step} style={{ animationDelay: `${i * 0.12}s` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.agent!.avatar} alt={s.agent!.name} className={s.agent!.human ? 'human' : ''} />
                  <div>
                    <b>{s.agent!.name}</b>
                    <span>{s.agent!.role}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      <div className="rp-pipe">
        {stages.map((s, i) => (
          <React.Fragment key={s.step}>
            <Reveal delay={i * 60}>
              <div className={`rp-pipe-stage ${s.agent?.human ? 'human' : ''}`}>
                <div className="rp-pipe-post">
                  {s.agent ? (
                    <div className="rp-pipe-avatar">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.agent.avatar} alt={s.agent.name} className={s.agent.human ? 'human' : ''} />
                    </div>
                  ) : (
                    <div className="rp-pipe-icon">{s.icon}</div>
                  )}
                  {s.agent && (
                    <div className="rp-pipe-who">
                      <b>{s.agent.name}</b>
                      <span>{s.agent.role}</span>
                    </div>
                  )}
                </div>
                <div>
                  <div className="rp-pipe-title">
                    <span className="rp-pipe-step">工位 {s.step}</span>
                    <span className="rp-pipe-emoji">{s.icon}</span>
                    {s.title}
                  </div>
                  <div className="rp-pipe-desc">{s.desc}</div>
                </div>
                {s.metric ? (
                  <div className="rp-pipe-metric">
                    <div className="v">{s.metric}</div>
                    <div className="k">{s.metricLabel}</div>
                  </div>
                ) : null}
              </div>
            </Reveal>
            {i < stages.length - 1 && <div className="rp-pipe-link" aria-hidden />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
