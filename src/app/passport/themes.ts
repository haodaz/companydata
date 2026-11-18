/**
 * 定制我的人才护照（迁移 075）：封面颜色、内页纸张、封面烫印纹样、封面一句话。
 * 颜色都走 CSS 变量，挂在 .tp-root（或预览的小护照）上：封面、烫金、书皮、纸面一起换，纸面换色有平滑过渡。
 * 纯数据模块：服务端接口也引它做白名单校验。
 */
import type React from 'react';

export type CoverTheme = 'navy' | 'wine' | 'green' | 'black' | 'brown' | 'royal';
export type PaperTheme = 'cream' | 'sepia' | 'gray' | 'mint' | 'pink';
export type CoverPattern = 'plain' | 'fret' | 'wave' | 'stars';
export interface Look { cover: CoverTheme; paper: PaperTheme; pattern: CoverPattern; motto: string }
export const DEFAULT_LOOK: Look = { cover: 'navy', paper: 'cream', pattern: 'plain', motto: '' };
export const MOTTO_MAX = 12;

const GOLD = { foil: ['#B98E3E', '#F6E1A6', '#D2A95A', '#FFF3CC', '#C39648'], text: '#E6C987', line: '212, 180, 110', soft: '230, 201, 135', owner: '#F6E1A6' };
const SILVER = { foil: ['#8E949C', '#E8ECF0', '#B4BAC2', '#FFFFFF', '#9AA0A8'], text: '#D6DBE0', line: '196, 202, 210', soft: '214, 219, 224', owner: '#EEF1F4' };
export const COVERS: Record<CoverTheme, { name: string; c: [string, string, string]; metal: typeof GOLD }> = {
  navy: { name: '深藏青', c: ['#2C3266', '#1A1D44', '#0F1130'], metal: GOLD },
  wine: { name: '酒红', c: ['#74243A', '#4E1424', '#2E0A14'], metal: GOLD },
  green: { name: '墨绿', c: ['#245441', '#163A2C', '#0B2119'], metal: GOLD },
  black: { name: '曜石黑', c: ['#38383C', '#1C1C1F', '#0C0C0D'], metal: SILVER },
  brown: { name: '深棕', c: ['#66432A', '#43291A', '#26170C'], metal: GOLD },
  royal: { name: '皇家蓝', c: ['#2A4FA8', '#183478', '#0B1C4A'], metal: GOLD },
};
export const PAPERS: Record<PaperTheme, { name: string; paper: string }> = {
  cream: { name: '奶白', paper: '#FBF8F1' },
  sepia: { name: '米黄', paper: '#F5ECD7' },
  gray: { name: '浅灰', paper: '#F1F1EF' },
  mint: { name: '淡青绿', paper: '#ECF5F1' },
  pink: { name: '淡粉', paper: '#F9EEEE' },
};
export const PATTERNS: Record<CoverPattern, string> = { plain: '素面', fret: '经典回纹', wave: '波浪防伪纹', stars: '星点' };

export const isCover = (v: unknown): v is CoverTheme => typeof v === 'string' && v in COVERS;
export const isPaper = (v: unknown): v is PaperTheme => typeof v === 'string' && v in PAPERS;
export const isPattern = (v: unknown): v is CoverPattern => typeof v === 'string' && v in PATTERNS;
export const cleanMotto = (v: unknown) => Array.from(String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim()).slice(0, MOTTO_MAX).join('');
/** 库里读出来的任何值 → 合法的定制（没跑 075 / 值不认识就用默认） */
export function toLook(v: Partial<Record<keyof Look, unknown>> | null | undefined): Look {
  return {
    cover: isCover(v?.cover) ? v!.cover as CoverTheme : DEFAULT_LOOK.cover,
    paper: isPaper(v?.paper) ? v!.paper as PaperTheme : DEFAULT_LOOK.paper,
    pattern: isPattern(v?.pattern) ? v!.pattern as CoverPattern : DEFAULT_LOOK.pattern,
    motto: cleanMotto(v?.motto),
  };
}

/** 定制 → CSS 变量 */
export function lookVars(l: Look): React.CSSProperties {
  const c = COVERS[l.cover], m = c.metal;
  return {
    ['--paper' as string]: PAPERS[l.paper].paper,
    ['--cv1' as string]: c.c[0], ['--cv2' as string]: c.c[1], ['--cv3' as string]: c.c[2],
    ['--f1' as string]: m.foil[0], ['--f2' as string]: m.foil[1], ['--f3' as string]: m.foil[2], ['--f4' as string]: m.foil[3], ['--f5' as string]: m.foil[4],
    ['--ftext' as string]: m.text, ['--fline' as string]: m.line, ['--fsoft' as string]: m.soft, ['--fowner' as string]: m.owner,
  };
}
