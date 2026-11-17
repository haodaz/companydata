'use client';

/** /passport 落地页：一句话说明 + 护照封面 + 两个入口。 */
import React from 'react';
import Link from 'next/link';
import { DEMO_SHARE_QUERY, HOLDER, SHARE_SID } from './data';
import { Cover, Stamp } from './art';

export function Landing() {
  return (
    <div className="tp-root">
      <div className="tp-app">
        <span className="tp-demo-tag">演示数据</span>
        <div className="tp-land">
          <div className="tp-eyebrow">TALENT PASSPORT · 人才护照</div>
          <h1 className="tp-h1">把人才档案<br /><em>交还给本人</em></h1>
          <p className="tp-lede">ATA 签发，平方创想鉴真与画像。护照在你自己手里，一页页签和章都查得到出处；给谁看、看哪几页、看几天，由你授权。</p>

          <div className="tp-hero">
            <div className="tp-hero-book"><Cover owner={`${HOLDER.name}的可信人才档案`} /></div>
            <div className="tp-float-st" style={{ left: '-20%', top: '6%', transform: 'rotate(-12deg)', width: '50%' }}>
              <Stamp s={{ shape: 'tag', top: 'SELF · 本人填写', icon: 'pen', main: '经营分析', date: '想去的方向', color: '#2B4C9B' }} seedKey="l1" />
            </div>
            <div className="tp-float-st" style={{ right: '-22%', top: '18%', transform: 'rotate(12deg)', width: '42%' }}>
              <Stamp s={{ shape: 'round', top: 'VERIFIED · 鉴真', bottom: 'VISIONSQUARE', icon: 'check', main: '5 / 6', sub: '对上', color: '#4B3BD6' }} seedKey="l2" />
            </div>
            <div className="tp-float-st" style={{ left: '-22%', bottom: '4%', transform: 'rotate(8deg)', width: '48%' }}>
              <Stamp s={{ shape: 'cham', top: 'EXPERIENCE', icon: 'case', main: '7.6 胜任', date: '体验签', color: '#B4532A' }} seedKey="l3" />
            </div>
            <div className="tp-float-st" style={{ right: '-20%', bottom: '-2%', transform: 'rotate(-10deg)', width: '42%' }}>
              <Stamp s={{ shape: 'round', top: 'ATA · 全美在线', bottom: 'AI CAPABILITY', icon: 'ata', main: 'LEVEL 4', color: '#D80C18' }} seedKey="l4" />
            </div>
          </div>

          <div className="tp-ctas">
            <Link className="tp-btn v" href="/passport/me">登录，管理我的护照</Link>
            <Link className="tp-btn ghost" href={`/passport/s/${SHARE_SID}?${DEMO_SHARE_QUERY}`}>看别人分享给我的</Link>
            <small>演示：登录后进{HOLDER.name}的护照 · 他分享给某猎头的链接</small>
          </div>

          <div className="tp-three">
            <div><b>签发</b><span>ATA 考试与能力认证，平方核验履历</span></div>
            <div><b>收集</b><span>考试、体验、真活，一枚枚盖进来</span></div>
            <div><b>授权</b><span>按页给人看，到期失效，随时撤回</span></div>
          </div>
          <div className="tp-foot">ATA × 平方创想 VISIONSQUARE · 2026.11</div>
        </div>
      </div>
    </div>
  );
}
