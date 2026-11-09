/**
 * 专属邀请链接（2026-11-09）：一人一条 /work/<token>?i=<code>，一条只对应一次作答——换浏览器、换设备打开，回到的是同一次作答。
 * 名单存在 work_tasks.context 里（候选人接口读不到）。要重做：出任务的人再给这个人生成一条新的。
 */
import { randomBytes } from 'crypto';

export type Invite = { code: string; label: string; at: string };

export const invitesOf = (t: any): Invite[] => t?.context?.invites || [];
export const inviteOnly = (t: any) => !!t?.context?.invite_only;
export const findInvite = (t: any, code: unknown) => (code ? invitesOf(t).find(i => i.code === String(code)) || null : null);
export const cleanLabels = (v: unknown) => (Array.isArray(v) ? v : []).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 200);
export const newInvites = (labels: string[]): Invite[] => labels.map(label => ({ code: randomBytes(6).toString('base64url'), label, at: new Date().toISOString() }));
