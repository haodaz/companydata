/**
 * 人才护照 · 前后端共用的接口数据形状（纯类型，没有运行时代码）。
 * 服务端（src/lib/passport.ts、/api/passport/*）产出，本人版 / 分享版读。
 */
import type { PageId, Visibility } from './data';
import type { Look } from './themes';

export interface PassportDTO {
  passportNo: string;
  name: string;
  email: string;
  nickname: string;
  bio: string;
  visibility: Visibility;
  avatarColor: string;
  avatarUrl: string | null;     // 本站接口地址（带版本号）；空 = 用默认证件照
  issuedAt: string;             // ISO
  validUntil: string;           // YYYY-MM-DD
  onboarded: boolean;           // 走过第一次引导了没有
  look: Look;                   // 定制我的人才护照（迁移 075）
}
export interface ItemDTO {
  id: string;                   // 行 id（uuid）
  claimNo: string;
  source: 'self' | 'demo';
  page: PageId;
  demoKey: string | null;
  kind: 'exp' | 'work' | 'cert' | null;
  title: string;
  org: string;
  date: string;
  link: string | null;
  status: 'self' | 'review';
  createdAt: string;            // ISO
}
export interface GrantDTO {
  id: string;
  token: string;
  to: string;
  purpose: string;
  pages: PageId[];
  days: number;
  expiresAt: string;
  revokedAt: string | null;
  views: number;
  lastViewAt: string | null;
  createdAt: string;
}
export interface BookingDTO { id: string; dest: string; slot: string; no: string; createdAt: string }
export interface OwnerBundle { passport: PassportDTO; items: ItemDTO[]; grants: GrantDTO[]; bookings: BookingDTO[] }

/** 分享页拿到的：只有被授权的页和必要字段；联系方式按可见范围 */
export interface ShareBundle {
  holder: { passportNo: string; name: string; nickname: string; bio: string; visibility: Visibility; avatarColor: string; avatarUrl: string | null; email: string | null; issuedAt: string; validUntil: string; look: Look };
  grant: { to: string; purpose: string; pages: PageId[]; days: number; expiresAt: string };
  items: ItemDTO[];
}
export type ShareFail = { ok: false; reason: 'invalid' | 'expired' | 'revoked'; at?: string };
