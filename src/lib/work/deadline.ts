/**
 * 真活作答的时限（2026-11-09）：时间从开始作答算起，离开、刷新都不暂停，到点自动交卷。
 * 时间由服务器说了算，页面上的倒计时只是显示。超时后回来不能接着做，要重做找出任务的公司要新链接。
 */
/** 到点后还收多久（页面自动交卷的请求在路上） */
export const GRACE_MS = 60_000;
/** 这个时间之后开始的作答，人走了才由管理页代为收卷（更早的弃考不拿去花钱评分） */
export const AUTO_FROM = Date.parse('2026-11-10T00:00:00+08:00');

export const limitSec = (task: any) => (Number(task?.time_minutes) || 60) * 60;

/** elapsed 已用秒数；limit 时限秒数（出任务的人预览不限时，为 null）；expired 到点；closed 过了宽限，内容一律不再收 */
export function timing(task: any, s: { started_at: string; participant?: any }, now = Date.now()) {
  const ms = Math.max(0, now - new Date(s.started_at).getTime());
  const limit = s.participant?.preview ? null : limitSec(task);
  return { elapsed: Math.round(ms / 1000), limit, expired: limit != null && ms >= limit * 1000 - 5000, closed: limit != null && ms >= limit * 1000 + GRACE_MS };
}
