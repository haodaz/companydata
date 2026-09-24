'use client';

/** 公开报告页的外壳：顶部导航 + 滚动进度 + 页脚。两份报告共用。 */
import React from 'react';
import { Logo } from '@/components/brand/Logo';
import { ScrollProgress } from './primitives';

export function ReportNav({ sections }: {
  sections: { id: string; label: string }[];
}) {
  return (
    <div className="rp-nav">
      <div className="rp-nav-in">
        <a className="rp-nav-brand" href="/report" aria-label="平方创想 VisionSquare">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/report/visionsquare.png" alt="平方创想 VisionSquare" />
        </a>
        <div className="rp-nav-links">
          {sections.map(s => <a key={s.id} href={`#${s.id}`} className="rp-nav-sec">{s.label}</a>)}
        </div>
      </div>
      <ScrollProgress />
    </div>
  );
}

export function ReportFoot({ generatedAt }: { generatedAt: string }) {
  const d = new Date(generatedAt);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (
    <footer className="rp-foot">
      <div className="rp-wrap rp-foot-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Logo size={32} />
          <div>
            <div style={{ color: 'var(--rp-ink)', fontWeight: 650, fontSize: 14 }}>智能企业数据工厂 · 企业都有数</div>
            <div style={{ marginTop: 3 }}>平方创想旗下企业数据平台 · 报告数据取自平台实际运行结果，统计口径截至 {stamp}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 18 }}>
            <a href="/report">企业数据底座答卷</a>
            <a href="https://collegedataai.com/report" target="_blank" rel="noreferrer">院校数据底座答卷 ↗</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/report/visionsquare.png" alt="平方创想 VisionSquare" style={{ height: 24, width: 'auto', opacity: .9 }} />
            <span style={{ fontSize: 12 }}>教育科技人才一体化领域可信任的基础设施、工具与服务</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
