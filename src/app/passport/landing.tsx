'use client';

/** /passport 落地页：一两句话讲清定位（ATA 签发和认证、场景平台来用、本人拿着按页授权、从高中带到职场）+ 护照封面 + 两个入口。 */
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
          <div className="tp-eyebrow">ATA 人才护照 · TALENT PASSPORT</div>
          <h1 className="tp-h1">一本护照<br /><em>从高中带到职场</em></h1>
          <p className="tp-lede">ATA 签发和认证，升学、校招、企业、实验室这些场景平台来用、来盖章。护照在你自己手里，给谁看、看哪几页、看几天，由你授权。</p>

          <div className="tp-hero">
            <div className="tp-hero-book"><Cover owner={`${HOLDER.name}的可信人才档案`} /></div>
            <div className="tp-float-st" style={{ left: '-22%', top: '19%', transform: 'rotate(-12deg)', width: '46%' }}>
              <Stamp s={{ shape: 'tag', top: 'ISSUED · 领到护照', icon: 'star', main: '高二', date: '高中', color: '#D80C18' }} seedKey="l1" />
            </div>
            <div className="tp-float-st" style={{ right: '-22%', top: '18%', transform: 'rotate(12deg)', width: '42%' }}>
              <Stamp s={{ shape: 'round', top: 'PRE-COLLEGE · 先修', bottom: '大中衔接', icon: 'book', main: 'A', sub: '微观经济', color: '#7A3FA0' }} seedKey="l2" />
            </div>
            <div className="tp-float-st" style={{ left: '-22%', bottom: '4%', transform: 'rotate(8deg)', width: '48%' }}>
              <Stamp s={{ shape: 'cham', top: 'INTERNSHIP · 校招', icon: 'plane', main: '实习', date: '某校招平台', color: '#C8323C' }} seedKey="l3" />
            </div>
            <div className="tp-float-st" style={{ right: '-20%', bottom: '-2%', transform: 'rotate(-10deg)', width: '42%' }}>
              <Stamp s={{ shape: 'round', top: 'ATA · 全美在线', bottom: 'AI CAPABILITY', icon: 'ata', main: 'LEVEL 4', color: '#D80C18' }} seedKey="l4" />
            </div>
          </div>

          <div className="tp-ctas">
            <Link className="tp-btn v" href="/passport/login?next=/passport/me">登录，管理我的护照</Link>
            <Link className="tp-btn ghost" href={`/passport/s/${SHARE_SID}?${DEMO_SHARE_QUERY}`}>看别人分享给我的</Link>
            <small>内测账号登录后进自己的护照（一人一本）· 右边是演示人物{HOLDER.name}分享给某猎头的链接</small>
          </div>

          <div className="tp-three">
            <div><b>ATA 签发</b><span>护照和考试、能力认证都由 ATA 来做</span></div>
            <div><b>平台盖章</b><span>升学、校招、企业、实验室，走到哪儿盖到哪儿</span></div>
            <div><b>本人授权</b><span>按页给人看，到期失效，随时撤回</span></div>
          </div>
          <div className="tp-foot">ATA 全美在线 签发 · ATA TALENT PASSPORT · 2026.11</div>
        </div>
      </div>
    </div>
  );
}
