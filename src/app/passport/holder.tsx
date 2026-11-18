'use client';

/**
 * 护照持有人：演示护照是郝大壮（public/passport/dazhuang.png 插画证件照），
 * 管理员的真实护照是本人（账号信息 + 自己上传的证件照；没传就用中性的剪影 + 姓氏首字）。
 * 用 context 往下传，证件照、身份页、抽屉里的「本人」都从这里读，不用一层层传参数。
 */
import React, { createContext, useContext } from 'react';
import { HOLDER } from './data';
import { DEFAULT_LOOK, type Look } from './themes';

export interface HolderInfo {
  demo: boolean;          // true = 郝大壮演示护照
  name: string;
  nameEn: string;         // 机读区用的拉丁字母
  passportNo: string;
  issuedAt: string;       // 2026.11.08
  validUntil: string;
  phone?: string;
  email?: string;
  photo?: string | null;  // 证件照地址；空 = 中性默认
  initial: string;        // 默认证件照上的姓氏首字
  look: Look;             // 定制我的人才护照：封面 / 纸张 / 纹样 / 一句话
}

export const DEMO_HOLDER: HolderInfo = {
  demo: true, name: HOLDER.name, nameEn: HOLDER.nameEn, passportNo: HOLDER.passportNo, issuedAt: HOLDER.issuedAt, validUntil: HOLDER.validUntil,
  phone: HOLDER.phone, email: HOLDER.email, photo: '/passport/dazhuang.png', initial: '郝', look: DEFAULT_LOOK,
};

const Ctx = createContext<HolderInfo>(DEMO_HOLDER);
export const HolderProvider = ({ holder, children }: { holder: HolderInfo; children: React.ReactNode }) => <Ctx.Provider value={holder}>{children}</Ctx.Provider>;
export const useHolder = () => useContext(Ctx);

/** 名字 → 证件照上的首字：中文取第一个字，西文取首字母大写 */
export const initialOf = (name: string) => { const ch = Array.from(name.trim())[0] || '人'; return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch; };
/** 名字 → 机读区：只留 A–Z，空格换成 <<；没有拉丁字母就用护照号 */
export const mrzName = (s: string, fallback: string) => { const t = s.toUpperCase().replace(/[^A-Z ]+/g, ' ').trim().replace(/\s+/g, '<<'); return t || fallback.replace(/[^A-Z0-9]/g, ''); };
/** 机读区第二行：护照号 + 国家 + 签发 / 到期日 */
export const mrzLine2 = (h: HolderInfo) => `${h.passportNo.replace(/[^A-Z0-9]/g, '')}CHN${h.issuedAt.replace(/\D/g, '').slice(2, 8)}<${h.validUntil.replace(/\D/g, '').slice(2, 8)}TALENTPASS`;
