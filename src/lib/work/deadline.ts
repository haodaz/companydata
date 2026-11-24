/**
 * 真活作答的时限（2026-11-09）：时间从开始作答算起，离开、刷新都不暂停，到点自动交卷。
 * 时间由服务器说了算，页面上的倒计时只是显示。超时后回来不能接着做；出任务的企业可以给这个人加时 / 让他接着做（extend.ts），或允许重做。
 */
/** 到点后还收多久（页面自动交卷的请求在路上） */
export const GRACE_MS = 60_000;
/** 这个时间之后开始的作答，人走了才由管理页代为收卷（更早的弃考不拿去花钱评分） */
export const AUTO_FROM = Date.parse('2026-11-10T00:00:00+08:00');

/** 到点自动交卷默认开；出任务的人关掉后 task.soft_limit=true：时长只作建议，超时可以继续、用时如实记录 */
export const withAutoSubmit = (task: any, on: boolean) => { const { soft_limit: _s, ...rest } = task || {}; return on ? rest : { ...rest, soft_limit: true }; };
export const limitSec = (task: any) => (Number(task?.time_minutes) || 60) * 60;
/** 给某个人单独加的时间（11-24：企业可以给某个人加时、或到点收了之后让他接着做；存 participant.extra_min，可以加多次） */
export const extraSec = (s: { participant?: any }) => Math.max(0, Number(s?.participant?.extra_min) || 0) * 60;
/** 新出的任务默认开不开到点交卷（11-24：国内可选，不收束）。设 NEXT_PUBLIC_WORK_DEFAULT_AUTO_SUBMIT=0 则默认只作建议时长 */
export const DEFAULT_AUTO_SUBMIT = process.env.NEXT_PUBLIC_WORK_DEFAULT_AUTO_SUBMIT !== '0';
/** 用时比建议 / 限定时长多出的分钟数（没超为 0）；限时的算上单独加的时间 */
export const overMinutes = (task: any, s: { participant?: any }, usedSec: number) => Math.max(0, Math.floor((usedSec - limitSec(task) - extraSec(s)) / 60));

/** elapsed 已用秒数；limit 时限秒数（出任务的人预览、或这道题关了到点交卷，为 null）；expired 到点；closed 过了宽限，内容一律不再收 */
export function timing(task: any, s: { started_at: string; participant?: any }, now = Date.now()) {
  const ms = Math.max(0, now - new Date(s.started_at).getTime());
  const limit = s.participant?.preview || task?.soft_limit ? null : limitSec(task) + extraSec(s);
  return { elapsed: Math.round(ms / 1000), limit, expired: limit != null && ms >= limit * 1000 - 5000, closed: limit != null && ms >= limit * 1000 + GRACE_MS };
}
