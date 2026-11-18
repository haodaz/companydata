'use client';

/**
 * 护照精灵「签签」：原创 SVG 画的 Q 版小姑娘——大头、大眼睛、圆框眼镜、头发扎成丸子带碎发、深色小西装，抱着一本小人才护照，身边几颗小星光。
 * 渐变做出立体和柔光。四个状态（CSS 控制，不重画）：
 *   idle 待机：上下轻轻浮动 + 眨眼；talk 说话：嘴巴一张一合 + 点头；happy 开心：举起护照、眼睛弯成月牙；think 思考：手托下巴、头上冒小点。
 * crop="head" 只取头部，用在右下角的小圆窗入口。
 */
import React, { useId } from 'react';

import { SPRITE_TITLE } from './sprite-name';
export { SPRITE_NAME, SPRITE_TITLE } from './sprite-name';
export type SpriteState = 'idle' | 'talk' | 'happy' | 'think';

const star = (x: number, y: number, r: number) => `M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;

export function Sprite({ state = 'idle', crop = 'full', className, title }: { state?: SpriteState; crop?: 'full' | 'head'; className?: string; title?: string }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = (n: string) => `${u}${n}`;
  const url = (n: string) => `url(#${g(n)})`;
  const vb = crop === 'head' ? '30 4 140 140' : '0 0 200 250';
  return (
    <svg className={`tp-sp ${state} ${crop === 'head' ? 'head' : ''} ${className || ''}`} viewBox={vb} role="img" aria-label={title || SPRITE_TITLE}>
      <defs>
        <radialGradient id={g('sk')} cx=".42" cy=".38" r=".75"><stop offset="0" stopColor="#FFF1E8" /><stop offset=".55" stopColor="#FCD6C2" /><stop offset="1" stopColor="#EFB397" /></radialGradient>
        <linearGradient id={g('hr')} x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stopColor="#7A4B39" /><stop offset=".55" stopColor="#4E2D22" /><stop offset="1" stopColor="#2F1A13" /></linearGradient>
        <linearGradient id={g('hh')} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#FFE2C9" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <linearGradient id={g('su')} x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stopColor="#4A53A8" /><stop offset=".5" stopColor="#2C3375" /><stop offset="1" stopColor="#1A1E4A" /></linearGradient>
        <radialGradient id={g('ir')} cx=".5" cy=".62" r=".6"><stop offset="0" stopColor="#B07A4E" /><stop offset=".55" stopColor="#6A3E26" /><stop offset="1" stopColor="#2A1610" /></radialGradient>
        <linearGradient id={g('pp')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2F3680" /><stop offset="1" stopColor="#151944" /></linearGradient>
        <linearGradient id={g('au')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C49A48" /><stop offset=".45" stopColor="#FBE8B2" /><stop offset="1" stopColor="#C39648" /></linearGradient>
        <radialGradient id={g('gl')} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#FFF6D8" stopOpacity=".95" /><stop offset="1" stopColor="#FFE7A6" stopOpacity="0" /></radialGradient>
        <radialGradient id={g('ch')} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#FF8E8E" stopOpacity=".55" /><stop offset="1" stopColor="#FF8E8E" stopOpacity="0" /></radialGradient>
      </defs>

      {crop === 'full' && <ellipse className="sp-shadow" cx="100" cy="243" rx="36" ry="5.5" fill="#1D2450" opacity=".16" />}
      <g className="sp-float">
        {crop === 'full' && (
          <>
            {/* 腿和小皮鞋 */}
            <rect x="85" y="214" width="12" height="20" rx="6" fill="#262B5C" />
            <rect x="103" y="214" width="12" height="20" rx="6" fill="#262B5C" />
            <ellipse cx="90" cy="236" rx="10" ry="5.5" fill="#3A2722" /><ellipse cx="110" cy="236" rx="10" ry="5.5" fill="#3A2722" />
            <ellipse cx="87" cy="234" rx="3.5" ry="1.4" fill="#fff" opacity=".35" /><ellipse cx="107" cy="234" rx="3.5" ry="1.4" fill="#fff" opacity=".35" />
            {/* 小西装 */}
            <path d="M60 222Q56 172 80 157L120 157Q144 172 140 222Q100 230 60 222Z" fill={url('su')} />
            <path d="M88 157L100 183L112 157Z" fill="#fff" />
            <path d="M96 165L100 172L104 165L100 161Z" fill="#C94A4A" />
            <path d="M80 157L100 192L91 160ZM120 157L100 192L109 160Z" fill="#1A1E4A" opacity=".45" />
            <path d="M70 168Q66 190 68 214" stroke="#fff" strokeOpacity=".12" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="124" cy="182" r="3.2" fill={url('au')} />
          </>
        )}

        {/* 手和护照：三种姿势，按状态显示 */}
        {crop === 'full' && (
          <>
            <g className="sp-arms hold">
              <path d="M72 166Q66 186 84 200" stroke={url('su')} strokeWidth="13" strokeLinecap="round" fill="none" />
              <path d="M128 166Q134 186 116 200" stroke={url('su')} strokeWidth="13" strokeLinecap="round" fill="none" />
              <g transform="rotate(-6 100 202)">
                <rect x="83" y="181" width="34" height="44" rx="4" fill={url('pp')} />
                <rect x="86" y="184" width="28" height="38" rx="2.5" fill="none" stroke={url('au')} strokeWidth="1" opacity=".8" />
                <circle cx="100" cy="199" r="7" fill="none" stroke={url('au')} strokeWidth="1.6" />
                <path d="M100 194L105 199L100 204L95 199Z" fill="none" stroke={url('au')} strokeWidth="1.2" />
                <rect x="91" y="212" width="18" height="2" rx="1" fill={url('au')} />
              </g>
              <circle cx="85" cy="203" r="6.5" fill={url('sk')} /><circle cx="115" cy="203" r="6.5" fill={url('sk')} />
            </g>
            <g className="sp-arms up">
              <path d="M72 166Q64 186 86 198" stroke={url('su')} strokeWidth="13" strokeLinecap="round" fill="none" />
              <circle cx="88" cy="199" r="6.5" fill={url('sk')} />
              <path d="M128 166Q146 150 150 128" stroke={url('su')} strokeWidth="13" strokeLinecap="round" fill="none" />
              <g transform="rotate(14 156 104)">
                <rect x="139" y="84" width="34" height="44" rx="4" fill={url('pp')} />
                <rect x="142" y="87" width="28" height="38" rx="2.5" fill="none" stroke={url('au')} strokeWidth="1" opacity=".8" />
                <circle cx="156" cy="102" r="7" fill="none" stroke={url('au')} strokeWidth="1.6" />
                <path d="M156 97L161 102L156 107L151 102Z" fill="none" stroke={url('au')} strokeWidth="1.2" />
              </g>
              <circle cx="150" cy="126" r="6.5" fill={url('sk')} />
            </g>
            <g className="sp-arms think">
              <path d="M72 166Q66 188 86 204" stroke={url('su')} strokeWidth="13" strokeLinecap="round" fill="none" />
              <g transform="rotate(-14 98 210)">
                <rect x="82" y="190" width="32" height="40" rx="4" fill={url('pp')} />
                <circle cx="98" cy="207" r="6.5" fill="none" stroke={url('au')} strokeWidth="1.5" />
              </g>
              <circle cx="88" cy="206" r="6.5" fill={url('sk')} />
              <path d="M128 166Q140 168 124 148" stroke={url('su')} strokeWidth="13" strokeLinecap="round" fill="none" />
              <circle cx="121" cy="143" r="7" fill={url('sk')} />
            </g>
          </>
        )}

        {/* 头 */}
        <g className="sp-head">
          <path d="M38 104Q32 40 100 34Q168 40 162 104Q166 146 150 156L50 156Q34 146 38 104Z" fill={url('hr')} />
          <circle cx="100" cy="26" r="17" fill={url('hr')} />
          <path d="M88 18Q100 10 112 18" stroke={url('hh')} strokeWidth="3" fill="none" strokeLinecap="round" />
          <ellipse cx="100" cy="41" rx="12" ry="3.5" fill="#E9B44C" />
          <path d="M113 22Q126 14 128 4M89 22Q78 16 79 6" stroke="#4E2D22" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <circle cx="45" cy="108" r="8" fill={url('sk')} /><circle cx="155" cy="108" r="8" fill={url('sk')} />
          <ellipse cx="100" cy="102" rx="55" ry="52" fill={url('sk')} />
          <path d="M44 96Q46 48 100 44Q154 48 156 96Q146 72 124 66Q118 80 100 74Q86 84 72 72Q56 80 44 96Z" fill={url('hr')} />
          <path d="M60 60Q80 48 104 50" stroke={url('hh')} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M46 96Q42 124 52 146M154 96Q158 124 148 146" stroke={url('hr')} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M72 74Q70 84 74 90M124 68Q130 78 128 86" stroke="#4E2D22" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".7" />
          {/* 眉毛 */}
          <path d="M68 84Q77 79 86 83M114 83Q123 79 132 84" stroke="#5A3427" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          {/* 眼睛：睁着 / 月牙 */}
          <g className="sp-eyes open">
            <g className="sp-eye"><ellipse cx="78" cy="104" rx="11" ry="13" fill="#2A1610" /><ellipse cx="78" cy="106" rx="8.6" ry="10.2" fill={url('ir')} /><circle cx="82" cy="99" r="4" fill="#fff" /><circle cx="74.5" cy="110" r="1.8" fill="#fff" opacity=".9" /></g>
            <g className="sp-eye"><ellipse cx="122" cy="104" rx="11" ry="13" fill="#2A1610" /><ellipse cx="122" cy="106" rx="8.6" ry="10.2" fill={url('ir')} /><circle cx="126" cy="99" r="4" fill="#fff" /><circle cx="118.5" cy="110" r="1.8" fill="#fff" opacity=".9" /></g>
          </g>
          <g className="sp-eyes happy">
            <path d="M68 107Q78 95 88 107M112 107Q122 95 132 107" stroke="#2A1610" strokeWidth="3.6" fill="none" strokeLinecap="round" />
          </g>
          {/* 圆框眼镜 */}
          <g fill="none" stroke="#5B3E33" strokeWidth="2.6">
            <circle cx="78" cy="104" r="18" fill="#fff" fillOpacity=".08" />
            <circle cx="122" cy="104" r="18" fill="#fff" fillOpacity=".08" />
            <path d="M96 101Q100 97 104 101M60 100L48 98M140 100L152 98" strokeLinecap="round" />
          </g>
          <path d="M66 94Q70 89 76 88M110 94Q114 89 120 88" stroke="#fff" strokeOpacity=".7" strokeWidth="2" fill="none" strokeLinecap="round" />
          <ellipse cx="64" cy="124" rx="10" ry="6" fill={url('ch')} /><ellipse cx="136" cy="124" rx="10" ry="6" fill={url('ch')} />
          <path d="M98 117Q100 119 102 117" stroke="#D08A72" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {/* 嘴：微笑 / 张开 */}
          <path className="sp-mouth smile" d="M91 128Q100 136 109 128" stroke="#A44B3F" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <g className="sp-mouth open"><ellipse cx="100" cy="131" rx="6.5" ry="5.5" fill="#8E3434" /><ellipse cx="100" cy="134" rx="4" ry="2.2" fill="#F08A86" /></g>
        </g>

        {/* 思考的小点 */}
        <g className="sp-dots">
          <circle cx="152" cy="44" r="3" fill="#fff" stroke="#C9C2F2" strokeWidth="1.2" />
          <circle cx="164" cy="32" r="4" fill="#fff" stroke="#C9C2F2" strokeWidth="1.2" />
          <circle cx="179" cy="20" r="5.5" fill="#fff" stroke="#C9C2F2" strokeWidth="1.2" />
        </g>
      </g>

      {/* 星光：表示是「精灵」 */}
      <g className="sp-stars">
        <circle cx="30" cy="70" r="9" fill={url('gl')} /><path d={star(30, 70, 6)} fill="#FFE08A" />
        <circle cx="172" cy="150" r="8" fill={url('gl')} /><path d={star(172, 150, 5)} fill="#FFE08A" />
        <circle cx="40" cy="176" r="6" fill={url('gl')} /><path d={star(40, 176, 4)} fill="#FFF3C4" />
        <circle cx="170" cy="62" r="6" fill={url('gl')} /><path d={star(170, 62, 3.6)} fill="#FFF3C4" />
      </g>
    </svg>
  );
}
