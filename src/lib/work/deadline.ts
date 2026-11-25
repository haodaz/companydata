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

/**
 * 时间方式（11-24，三种并列、出任务时选，都可以发布后再改）：
 *   limit   限时：到点自动提交（默认，task 上什么都不标）
 *   suggest 建议时长：到点不收、可以接着做，用时照实记（task.soft_limit）
 *   none    不限时（像 Kaggle）：不写时长、不计时、不标超时，谁来做、做多久都行（task.soft_limit + task.no_limit）
 * 另外几样和时间方式独立、都可选：
 *   open_until 任务开放到某个时间（ISO）：过了不再开始新的作答，没提交的到点收；页面倒计时按它
 *   resubmit   候选人自己可以重新打开、再提交几次（0 / 不写 = 不允许）；每次重新评估、重排同题名次
 *   show_rank  候选人看得到自己「同题第几 / 共几人」
 *   public_board 公开排行榜 /work/<链接>/board（只显示名次和打码的名字）
 */
export type TimeMode = 'limit' | 'suggest' | 'none';
export const timeModeOf = (task: any): TimeMode => (task?.no_limit ? 'none' : task?.soft_limit ? 'suggest' : 'limit');
export const withTimeMode = (task: any, mode: TimeMode) => { const { soft_limit: _s, no_limit: _n, ...rest } = task || {}; return mode === 'none' ? { ...rest, soft_limit: true, no_limit: true } : mode === 'suggest' ? { ...rest, soft_limit: true } : rest; };
export const isTimeMode = (v: any): v is TimeMode => v === 'limit' || v === 'suggest' || v === 'none';
/** 任务整体截止的时间戳（没设为 null） */
export const untilOf = (task: any): number | null => { const t = task?.open_until ? Date.parse(task.open_until) : NaN; return Number.isFinite(t) ? t : null; };
/** 任务已经过了开放时间 */
export const taskClosed = (task: any, now = Date.now()) => { const u = untilOf(task); return u != null && now >= u; };
/** 候选人自己最多能重新提交几次 */
export const resubmitMax = (task: any) => Math.max(0, Math.min(50, Math.round(Number(task?.resubmit) || 0)));
/** 投入时长（秒）：过程事件之间的间隔，超过 5 分钟的按 5 分钟算（隔几天回来接着做的，不把中间几天算进去） */
export function activeSec(events: { t?: number }[] | null | undefined, endS?: number): number {
  const ts = (events || []).map(e => Number(e?.t)).filter(t => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
  if (endS != null) ts.push(endS);
  let sum = 0; for (let i = 1; i < ts.length; i++) sum += Math.min(300, Math.max(0, ts[i] - ts[i - 1]));
  return Math.round(sum);
}

/** elapsed 已用秒数；limit 时限秒数（出任务的人预览、或不卡时间又没设截止，为 null；设了任务截止的按「离截止还有多久」封顶）；expired 到点；closed 过了宽限，内容一律不再收 */
export function timing(task: any, s: { started_at: string; participant?: any }, now = Date.now()) {
  const start = new Date(s.started_at).getTime();
  const ms = Math.max(0, now - start);
  const own = s.participant?.preview || task?.soft_limit ? null : limitSec(task) + extraSec(s);
  const u = s.participant?.preview ? null : untilOf(task);
  const rel = u == null ? null : Math.max(0, Math.floor((u - start) / 1000));
  const limit = own == null ? rel : rel == null ? own : Math.min(own, rel);
  return { elapsed: Math.round(ms / 1000), limit, expired: limit != null && ms >= limit * 1000 - 5000, closed: limit != null && ms >= limit * 1000 + GRACE_MS };
}
