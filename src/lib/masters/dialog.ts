/**
 * 母版 F 对人应对（2026-10-12）：聊天 / 弹幕线程 + 话术按钮 + 方案 + 事实栏 + 工单；NPC 的情绪量表（怒气 / 信任）是隐藏控件。
 * 搬过来的旧台面：客服 complaint（lab-complaint-dialog.ts）、直播中控 live（lab-live-dialog.ts）。可单用，也能嵌进桌面母版当一个程序（DialogApp）。
 * 约定见 lab-masters.ts 文件头：表达式都走 evalExpr；判分只看规格里的 vars / rules / goals，母版只管画什么、点了拨哪个控件、说什么。
 *
 * 版面：顶栏 + 若干栏（columns），每栏一串积木（blocks）。核心是「一句话」（lines）：
 *   - 发出一句 = 触发控件（trigger.control）记一笔 > 0 的事件；按 trigger.line 控件的值认出是哪一句。
 *     composer（客服）：先在选项里挑这一句做什么（kind），再点发送；instant（直播）：话术卡点一下就发（line.act）。
 *   - 发出去以后：按当时的状态挑第一个命中的 effects 分支拨控件（怒气 / 信任 / 核实过……，演示时不拨，老手脚本自己拨），
 *     挑第一个命中的 replies 当对方的回话（打字 typingDelay 模拟秒后出现）。
 *   - 线程是从事件流推出来的：演示回放（auto）时照样能把对话摆出来。
 * 表达式里除了变量 / 控件 / t，还能读几个母版本地量（LOCALS）：nth 这一句第几次说（含这次）、auto 是否演示、waves 里声明的起伏量。
 * 存库校验时本地量按 0 代入。
 */
import type { MasterAction, MasterDef } from '@/lib/lab-masters';

/** 按状态切的文字 / 颜色：第一个命中的 */
export type When<K extends string> = { when: string } & Record<K, string>;

/** 线程里的一条：who = 'npc' 对方 / 'me' 我 / 'sys' 系统居中小字 / 其他字符串 = 弹幕里的某个人 */
export interface DialogMsg { who: string; text: string; tone?: 'alert' }

/** 一句话（话术）：v 对上 trigger.line 控件的值 */
export interface DialogLine {
  v: number; label: string;
  /** 说出去的话；textWhen 按发出那一刻的状态挑（「给方案」这句的话随选的方案变） */
  text: string; textWhen?: When<'text'>[];
  /** 卡片上高亮（违规词这种「陷阱」卡给个黄底） */
  hot?: boolean;
  /** composer 模式：这句能不能发（「给方案」得先选方案：'offer > 0'） */
  ready?: string;
  /** instant 模式：点卡片拨这些控件（resetAfter 模拟秒后自动拨回 0，像「递话术」松手） */
  act?: { control: string; value?: number | string; resetAfter?: number }[];
  /** 发出后的效果：第一个命中的分支（没有 when 的当兜底）；set 的值都按发出前的状态算，knob 自带夹紧 */
  effects?: { when?: string; set: { control: string; value: number | string }[] }[];
  /** 对方的回话：第一个命中的，否则 reply；空就不回 */
  replies?: When<'text'>[]; reply?: string;
}

/** 选项组：点一个 = 把 control 拨成它的 v（这一句做什么 / 方案 / 讲解的商品） */
export interface DialogChoices {
  kind: 'choices'; title?: string; when?: string; control: string; cols?: number;
  /** chip 居中小按钮 / option 左对齐一行 / card 卡片（名字 + 副行 + 彩色数值） */
  look?: 'chip' | 'option' | 'card';
  disabledWhen?: string;
  options: { v: number; label: string; badge?: string; sub?: string; value?: { text: string; color?: string; colorWhen?: When<'color'>[] } }[];
}

/** 看得见的按钮（上下链接、处理预警、拉黑）：点了走 MasterAction（拦截 / 拨控件 / 说一句） */
export interface DialogButton {
  label: string; labelWhen?: When<'text'>[]; action: MasterAction;
  disabledWhen?: string; when?: string;
  /** solid 实心 / outline 描边；bg / fg 可按状态切 */
  look?: 'solid' | 'outline'; bg?: string; bgWhen?: When<'color'>[]; fg?: string; fgWhen?: When<'color'>[];
}

export type DialogBlock =
  /** 对话 / 弹幕线程：chat 头像气泡（客服），feed 紧凑弹幕（直播，深色栏里） */
  | { kind: 'thread'; look?: 'chat' | 'feed' }
  /** 发送栏（composer 模式）：预览要说的话 + 发送 */
  | { kind: 'composer' }
  | DialogChoices
  /** 话术卡（instant 模式）：点一下就说；不写 lines 就是全部 */
  | { kind: 'lines'; title?: string; lines?: number[]; cols?: number; when?: string }
  /** 事实栏：when 为假时只显示 placeholder（「核实后才看得到」）；hot 的那条标红 */
  | { kind: 'facts'; title?: string; when?: string; items: { text: string; hot?: boolean }[]; placeholder?: string }
  /** 提示 / 权限说明：yellow 黄底，plain 灰字；bottom 贴栏底 */
  | { kind: 'note'; title?: string; text: string; tone?: 'yellow' | 'plain'; bottom?: boolean; when?: string }
  /** 后台读数：一行一个，text 可带模板 */
  | { kind: 'stats'; title?: string; rows: { label: string; text: string }[] }
  | { kind: 'buttons'; title?: string; row?: boolean; buttons: DialogButton[] }
  /** 工单 / 记录：写的字数（去掉空白）写进 control */
  | { kind: 'ticket'; title?: string; control: string; placeholder?: string }
  /** 一行状态字（直播间顶上「● LIVE · 讲解中：…」） */
  | { kind: 'caption'; text: string; textWhen?: When<'text'>[]; dot?: string }
  /** 占位大图（直播画面）：渐变底 + 一个 emoji */
  | { kind: 'hero'; icon: string; height?: number; bg?: string };

export interface DialogColumn {
  /** CSS 宽度：'300px' / '1fr' */
  width: string;
  /** plain 浅灰底 / panel 白底 / dark 深色（直播间） */
  tone?: 'plain' | 'panel' | 'dark';
  /** flush = 不留内边距，线程撑满（对话栏） */
  flush?: boolean; gap?: number;
  blocks: DialogBlock[];
}

export interface DialogConfig {
  master: 'dialog';
  /** 嵌进桌面时区分多个对话（本地状态按它分开存） */
  id?: string;
  title: string; subtitle?: string; subtitleWhen?: When<'text'>[];
  /** 顶栏右侧：情绪 / 告警。pill = 实心胶囊，text = 彩色粗字 */
  badges?: { text: string; textWhen?: When<'text'>[]; color?: string; colorWhen?: When<'color'>[]; when?: string; look?: 'text' | 'pill' }[];
  /** 对方 / 我：名字、头像字、颜色 */
  npc: { name: string; avatar: string; color?: string; typing?: string };
  me: { name: string; avatar: string; color?: string };
  /** 开场就在线程里的几条 */
  opening?: DialogMsg[];
  /** 按模拟时间 t 进来的消息（弹幕 / 后台告警） */
  feed?: (DialogMsg & { t: number })[];
  /** 一句话怎么算「发出去了」：trigger.control 记一笔 > 0 的事件；trigger.line 控件的值认出是哪一句 */
  trigger: { control: string; line: string };
  mode: 'composer' | 'instant';
  lines: DialogLine[];
  composer?: {
    /** 发送时依次拨（say = 1） */
    send: { control: string; value?: number | string }[];
    /** 发完拨回（kind = 0） */
    after?: { control: string; value?: number | string }[];
    placeholder: string; emptyText?: string; button?: string;
  };
  /** instant：两次递话术至少隔几模拟秒（防连点） */
  cooldown?: number;
  /** 对方打字多久回（模拟秒，演示时立刻回） */
  typingDelay?: number;
  /** 这一轮让对方等了几秒（离上一句的模拟秒数）写进 control；when 为假时不再计（谈妥了）；超过 nudge.after 对方催一句 */
  idle?: { control: string; when?: string; nudge?: { after: number; text: string } };
  /** 起伏量：本地量 name = amp × sin(t / period)（在线人数这种上下晃的数） */
  waves?: { name: string; amp: number; period: number }[];
  columns: DialogColumn[];
}

/** 文字模板：{{expr}} 四舍五入；{{expr:2}} 两位小数；{{expr|int}} 取整（向下）；{{expr|n}} 千分位；{{expr|clock}} m:ss */
export const DIALOG_TPL_RE = /\{\{(.+?)(?::(\d)|\|(int|n|clock))?\}\}/g;

/** 母版本地量（校验时按 0 代入） */
export const dialogLocals = (cfg: DialogConfig) => ['nth', 'auto', ...(cfg.waves || []).map(w => w.name)];

function dialogExprs(cfg: DialogConfig): string[] {
  const out: string[] = [];
  const e = (x?: string) => { if (x) out.push(x); };
  const tpl = (t?: string) => { for (const m of (t || '').matchAll(DIALOG_TPL_RE)) out.push(m[1]); };
  const whens = (l?: { when: string; text?: string }[]) => l?.forEach(x => { e(x.when); tpl(x.text); });
  const num = (v?: number | string) => { if (typeof v === 'string') out.push(v); };
  const action = (a?: MasterAction) => { a?.guards?.forEach(x => e(x.when)); a?.sayWhen?.forEach(x => { e(x.when); tpl(x.text); }); tpl(a?.say); a?.act?.forEach(x => num(x.value)); };
  tpl(cfg.subtitle); whens(cfg.subtitleWhen);
  cfg.badges?.forEach(b => { tpl(b.text); whens(b.textWhen); b.colorWhen?.forEach(x => e(x.when)); e(b.when); });
  e(cfg.idle?.when);
  cfg.composer?.send.forEach(x => num(x.value)); cfg.composer?.after?.forEach(x => num(x.value));
  cfg.lines.forEach(l => {
    tpl(l.text); whens(l.textWhen); e(l.ready); l.act?.forEach(x => num(x.value));
    l.effects?.forEach(b => { e(b.when); b.set.forEach(x => num(x.value)); });
    whens(l.replies); tpl(l.reply);
  });
  for (const col of cfg.columns) for (const b of col.blocks) {
    if ('when' in b) e(b.when);
    switch (b.kind) {
      case 'choices': e(b.disabledWhen); tpl(b.title); b.options.forEach(o => { tpl(o.sub); if (o.value) { tpl(o.value.text); o.value.colorWhen?.forEach(x => e(x.when)); } }); break;
      case 'buttons': b.buttons.forEach(x => { action(x.action); e(x.disabledWhen); e(x.when); whens(x.labelWhen); x.bgWhen?.forEach(y => e(y.when)); x.fgWhen?.forEach(y => e(y.when)); }); break;
      case 'stats': b.rows.forEach(r => tpl(r.text)); break;
      case 'ticket': tpl(b.title); break;
      case 'caption': tpl(b.text); whens(b.textWhen); break;
      case 'note': tpl(b.text); break;
    }
  }
  // 本地量按 0 代入，让存库校验能在 initBench 的环境里求值
  const locals = dialogLocals(cfg);
  return out.map(x => locals.reduce((s, n) => s.replace(new RegExp(`\\b${n}\\b`, 'g'), '0'), x));
}

function dialogControls(cfg: DialogConfig): string[] {
  const ids = new Set<string>([cfg.trigger.control, cfg.trigger.line]);
  cfg.composer?.send.forEach(x => ids.add(x.control)); cfg.composer?.after?.forEach(x => ids.add(x.control));
  cfg.lines.forEach(l => { l.act?.forEach(x => ids.add(x.control)); l.effects?.forEach(b => b.set.forEach(x => ids.add(x.control))); });
  if (cfg.idle) ids.add(cfg.idle.control);
  for (const col of cfg.columns) for (const b of col.blocks) {
    if (b.kind === 'choices' || b.kind === 'ticket') ids.add(b.control);
    if (b.kind === 'buttons') b.buttons.forEach(x => x.action.act?.forEach(y => ids.add(y.control)));
  }
  return [...ids];
}

export const DIALOG_DEF: MasterDef<DialogConfig> = {
  name: 'dialog', host: 'html',
  /** 配置里所有表达式（存库前逐个求值，求不了就拒收；本地量按 0 代入） */
  exprs: c => dialogExprs(c),
  /** 配置里会拨到的控件 id（都得在规格的 controls 里声明过） */
  controls: c => dialogControls(c),
};
