/**
 * 母版 A 桌面工作站（桌边 N 个程序）：顶栏 + 2–3 栏（panes）或图标坞 + 窗口 + 任务栏（dock）；
 * 块：表格（行可选）/ 卡片名单（随时间出现的实体）/ 选中实体的详情（scope）/ 便签 / 选项组 / 下拉 / 按钮 / 写作框（字数 → 控件）/ 键值格 / 自定义插件。
 * 搬过来的旧台面：审计 audit（lab-audit-desktop.ts）、分诊 triage（lab-triage-desktop.ts）。渲染：components/lab/masters/DesktopStage.tsx。
 *
 * 表达式：bench 表达式（evalExpr）+ 路径。路径在求值前换成数：
 *   row.name             当前行 / 卡片 / 详情的实体字段
 *   patients[pick].arrive 按 id 查数据集（data）里的一行
 *   ui.voucher  ui.asked[pick]   台面自己的小状态（不进评分，只管显示）
 *   ctl.lv[row.id]       带编号的控件（= lv1、lv2…）；ctl.pick 等于 pick
 *   ev.value  ev.t       watch 触发时那次控件变化
 * 文字模板：{{表达式或路径[:格式][ ?? 兜底文字]}}，格式紧贴冒号：:1 小数位、:, 千分位、:i 取整、:i2 取整补两位。
 * 控件名也能带模板（'lv{{pick}}'），要写 over: 数据集名，校验时按那个数据集的 id 展开。
 * 颜色也能带模板（'{{levels[ctl.lv[row.id]].color}}'）。
 * 由 lab-masters.ts 的注册表汇总；本文件只 `import type` 它，不在运行时引 bench（避免循环引用）。
 */
import type { MasterDef } from '@/lib/lab-masters';

/** 数据集的一行：约定有数字 id */
export type DRow = Record<string, string | number>;
type When<K extends string> = { when: string } & { [P in K]: string };

/** 点一下发生什么（全是数据）。执行顺序：when 不成立就跳过 → set → ui → first → all → say → after */
export interface DAction {
  when?: string;
  /** 拨控件：隐藏控件走 setHidden、其余走 act；value 是数或表达式（可带路径），不写给 1；control 可带模板，要配 over */
  set?: { control: string; value?: number | string; over?: string }[];
  /** 改台面小状态：at 给了就是 ui[name][at] = …（集合 / 映射）；value 表达式或 text 模板 */
  ui?: { name: string; at?: string; value?: number | string; text?: string }[];
  /** 分支：依次看 when，只执行第一个成立的（不写 when 的当兜底） */
  first?: DAction[];
  /** 依次全部执行（各自看 when） */
  all?: DAction[];
  /** 提示条（模板）；tone 默认用 cfg.sayTone */
  say?: string; tone?: DTone; ms?: number;
  /** 过 ms 毫秒（真实时间）再执行（量体征要等 4 秒） */
  after?: { ms: number; do: DAction };
}

export type DTone = 'pink' | 'violet' | 'alarm' | 'green' | 'gray';

interface Base { when?: string; mt?: number; /** 在竖排里占满剩余高度 */ grow?: boolean }
export interface DButton extends Base {
  kind: 'button'; label: string; labelWhen?: When<'text'>[];
  /** 能不能点（不成立时置灰 / 禁用）；doneWhen 成立时显示成「已完成」的浅绿样式且不能点 */
  enabled?: string; doneWhen?: string;
  tone?: 'primary' | 'ghost' | 'dark' | 'violet' | 'teal' | 'gradient';
  size?: 'sm' | 'md' | 'lg'; full?: boolean; /** 竖排里推到最底下 */ push?: boolean;
  action: DAction;
}
export type DBlock =
  /** 小标题（栏目名） */
  | (Base & { kind: 'label'; text: string; spaced?: boolean; mb?: number })
  /** 一段字 */
  | (Base & { kind: 'text'; text: string; textWhen?: When<'text'>[]; size?: number; color?: string; colorWhen?: When<'color'>[]; lh?: number })
  /** 一行「粗体标签 + 内容」 */
  | (Base & { kind: 'line'; label?: string; text: string; size?: number; color?: string })
  /** 实体抬头：大名字 + 灰字 + 右边小字 */
  | (Base & { kind: 'head'; title: string; sub?: string; right?: string })
  /** 便签（黄纸） */
  | (Base & { kind: 'note'; text: string; textWhen?: When<'text'>[] })
  /** 白卡片：可带标题行（标题 + 右侧按钮），里面再放块 */
  | (Base & { kind: 'card'; title?: string; buttons?: DButton[]; blocks: DBlock[]; pad?: number; radius?: number })
  /** 横排网格（'1fr 1fr'） */
  | (Base & { kind: 'grid'; cols: string; gap?: number; blocks: DBlock[] })
  /** 选中的那个实体：from 数据集里 id == at 的一行当 row；没有就显示 empty */
  | (Base & { kind: 'scope'; from: string; at: string; gap?: number; blocks: DBlock[]; empty?: DBlock[] })
  /** 表格：rows 来自数据集，点行执行 action；selWhen 选中底色、doneWhen 划掉 */
  | (Base & { kind: 'table'; title?: string; from: string; filter?: string; cols: DCol[]; selWhen?: string; doneWhen?: string; action?: DAction })
  /** 卡片名单（实体随时间出现）：appear 成立才出来；还有没出来的就显示 pending */
  | (Base & { kind: 'cards'; from: string; appear?: string; pending?: string; selWhen?: string; bg?: string; bgWhen?: When<'color'>[];
      dot?: string; title: string; sub?: string; right?: { text: string; textWhen?: When<'text'>[]; color?: string; colorWhen?: When<'color'>[]; boldWhen?: string };
      body?: string; alerts?: { when: string; text: string }[]; action?: DAction })
  /** 选项组：点哪个就把 control 拨到 v（或执行 action，ev.value = v） */
  | (Base & { kind: 'choices'; control: string; options: { v: number; label: string; sub?: string; color?: string }[]; dir?: 'col' | 'row'; look?: 'card' | 'pill'; enabled?: string; action?: DAction })
  /** 下拉 */
  | (Base & { kind: 'select'; control: string; options: { v: number; label: string }[]; enabled?: string })
  /** 键值格（体征这类），bad 成立的标红 */
  | (Base & { kind: 'kv'; cols?: number; mono?: boolean; items: { label: string; text: string; bad?: string }[] })
  /** 写作框：字数（count: nonspace 去掉空白）写进 control；文字存在 ui.text_<control> */
  | (Base & { kind: 'write'; control: string; label?: string; placeholder?: string; count?: 'nonspace' | 'all' })
  | DButton
  /** 插件位：真做不成通用的（波形、电路图……）在 DesktopStage 的 DESKTOP_PLUGINS 里按名字登记；exprs / controls 写清楚它用到的，校验才拦得住 */
  | (Base & { kind: 'custom'; plugin: string; props?: Record<string, unknown>; exprs?: string[]; controls?: string[] });

export interface DCol { text: string; textWhen?: When<'text'>[]; mono?: boolean; size?: number; align?: 'left' | 'right' | 'center'; weight?: number; color?: string; colorWhen?: When<'color'>[]; pad?: string; nowrap?: boolean; width?: number | string }

/** 一栏（panes 版面）或一个窗口（dock 版面） */
export interface DPane {
  id?: string; blocks: DBlock[];
  /** CSS padding；scroll 超出滚动；border 画哪边的分隔线；bg 底色；gap 竖排间距 */
  pad?: number | string; scroll?: boolean; border?: 'left' | 'right'; bg?: string; gap?: number;
  /** dock 版面：图标 + 标题 + 窗口位置（百分比）+ 开局开没开 */
  icon?: string; title?: string; win?: { x: number; y: number; w: number; h: number }; open?: boolean;
}

/** 顶栏上的东西（从左到右） */
export type DTopItem =
  | { kind: 'title'; text: string } | { kind: 'sub'; text: string } | { kind: 'spacer' }
  /** 提示条出现的位置（say / 播报） */
  | { kind: 'toast' }
  /** 常驻徽标 / 报警：when 成立才显示 */
  | { kind: 'badge'; text: string; when?: string; tone?: DTone }
  | DButton;

export interface DesktopConfig {
  master: 'desktop';
  /** panes：顶栏 + 几栏；dock：顶栏 + 左侧图标坞 + 窗口 + 底部任务栏 */
  layout?: 'panes' | 'dock';
  /** 栏宽（CSS grid-template-columns），gap 栏间距（也是外边距） */
  columns?: string; gap?: number;
  topbar: DTopItem[];
  panes: DPane[];
  /** 任务栏右边的字（dock 版面，模板） */
  taskbar?: string;
  /** 数据集：表格行、病人、标记类型……每行有数字 id */
  data?: Record<string, DRow[]>;
  /** 台面小状态的初值 */
  ui?: Record<string, number | string | Record<string, number | string>>;
  /** 盯着控件：隐藏控件看值变了、其余看事件流里的新事件，执行 do（ev.value / ev.t）。演示回放时脚本直接拨控件，靠它把台面状态补上 */
  watch?: { control: string; do: DAction }[];
  /** 实体出现时播报（新病人到）：when 是行内表达式，出现的人数变多就播最后一个 */
  announce?: { from: string; when: string; say: string; tone?: DTone; ms?: number }[];
  sayTone?: DTone; sayMs?: number;
}

// ──── 路径 / 模板（纯字符串处理，渲染端和校验端共用） ────

export const DESK_ROOTS = ['row', 'ev', 'ui', 'ctl'];
const ID0 = /[A-Za-z_]/, IDC = /\w/;

/** 从 i 开始吃一条路径（head 后面跟 .x 或 [..]），返回结束位置；不是路径返回 -1 */
function pathEnd(s: string, i: number, roots: Set<string>): number {
  let j = i; while (j < s.length && IDC.test(s[j])) j++;
  if (!roots.has(s.slice(i, j)) || (s[j] !== '.' && s[j] !== '[')) return -1;
  for (;;) {
    if (s[j] === '.' && IDC.test(s[j + 1] || '')) { j++; while (j < s.length && IDC.test(s[j])) j++; }
    else if (s[j] === '[') { let d = 0; for (; j < s.length; j++) { if (s[j] === '[') d++; else if (s[j] === ']' && --d === 0) break; } j++; }
    else return j;
  }
}
/** 把表达式里每条路径换成 rep(路径) 的结果 */
export function subPaths(src: string, roots: Set<string>, rep: (path: string) => string): string {
  let out = '', i = 0;
  while (i < src.length) {
    if (ID0.test(src[i]) && (i === 0 || !/[\w.]/.test(src[i - 1]))) {
      const e = pathEnd(src, i, roots);
      if (e > 0) { out += rep(src.slice(i, e)); i = e; continue; }
      let j = i; while (j < src.length && IDC.test(src[j])) j++;
      out += src.slice(i, j); i = j; continue;
    }
    out += src[i++];
  }
  return out;
}
/** 整个字符串就是一条路径吗 */
export const isPath = (s: string, roots: Set<string>) => { const t = s.trim(); return ID0.test(t[0] || '') && pathEnd(t, 0, roots) === t.length; };
/** 拆路径：head + 段（.f 字段 / [i] 下标表达式） */
export function parsePath(p: string): { head: string; segs: ({ f: string } | { i: string })[] } {
  const t = p.trim(); let j = 0; while (j < t.length && IDC.test(t[j])) j++;
  const head = t.slice(0, j), segs: ({ f: string } | { i: string })[] = [];
  while (j < t.length) {
    if (t[j] === '.') { let k = j + 1; while (k < t.length && IDC.test(t[k])) k++; segs.push({ f: t.slice(j + 1, k) }); j = k; }
    else if (t[j] === '[') { let d = 0, k = j; for (; k < t.length; k++) { if (t[k] === '[') d++; else if (t[k] === ']' && --d === 0) break; } segs.push({ i: t.slice(j + 1, k) }); j = k + 1; }
    else break;
  }
  return { head, segs };
}
export const TPL_RE = /\{\{([\s\S]+?)\}\}/g;
/** 模板里的一格：表达式、格式、兜底文字 */
export function parseTpl(inner: string): { expr: string; fmt?: string; fb?: string } {
  const q = inner.indexOf('??');
  let left = q >= 0 ? inner.slice(0, q) : inner; const fb = q >= 0 ? inner.slice(q + 2).trim() : undefined;
  left = left.trim();
  const m = left.match(/:(\d|,|i2|i)$/);
  return m && !/\s/.test(left[left.length - m[0].length - 1] || ' ') ? { expr: left.slice(0, -m[0].length), fmt: m[1], fb } : { expr: left, fb };
}
export const rootsOf = (cfg: DesktopConfig) => new Set([...DESK_ROOTS, ...Object.keys(cfg.data || {})]);

// ──── 校验：表达式、控件 ────

const EXPR_KEYS = new Set(['when', 'enabled', 'doneWhen', 'selWhen', 'appear', 'at', 'filter', 'bad', 'boldWhen']);
function walk(o: any, fn: (k: string, v: any, parent: any) => void) {
  if (Array.isArray(o)) { o.forEach(x => walk(x, fn)); return; }
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (k === 'data' || k === 'props' || k === 'ui' && !Array.isArray(v)) continue;   // 数据集、插件参数、ui 初值不是表达式
    fn(k, v, o);
    walk(v, fn);
  }
}
function desktopExprs(cfg: DesktopConfig): string[] {
  const roots = rootsOf(cfg), out: string[] = [];
  /** 路径换成 0，下标里的表达式也收进来 */
  const norm = (e: string) => {
    out.push(subPaths(e, roots, p => { for (const s of parsePath(p).segs) if ('i' in s) norm(s.i); return '0'; }));
  };
  walk(cfg, (k, v) => {
    if (typeof v === 'string') {
      if (EXPR_KEYS.has(k) || k === 'value') norm(v);
      for (const m of v.matchAll(TPL_RE)) norm(parseTpl(m[1]).expr);
    }
    if (k === 'exprs' && Array.isArray(v)) v.forEach((e: any) => typeof e === 'string' && norm(e));
  });
  return out;
}
function desktopControls(cfg: DesktopConfig): string[] {
  const ids = new Set<string>();
  walk(cfg, (k, v, parent) => {
    if (k === 'control' && typeof v === 'string') {
      if (!v.includes('{{')) ids.add(v);
      else if (parent.over && cfg.data?.[parent.over]) cfg.data[parent.over].forEach(r => ids.add(v.replace(TPL_RE, String(r.id))));
      else ids.add(v);   // 带模板又没写 over：原样返回，校验会拦下
    }
    if (k === 'controls' && Array.isArray(v)) v.forEach((c: any) => typeof c === 'string' && ids.add(c));
  });
  return [...ids];
}

export const DESKTOP_DEF: MasterDef<DesktopConfig> = {
  name: 'desktop', host: 'html',
  /** 配置里所有表达式（存库前逐个求值，求不了就拒收）：路径换成 0 再交给 evalExpr，所以路径以外的名字都得是规格里的 */
  exprs: c => desktopExprs(c),
  /** 配置里会拨到的控件 id（都得在规格的 controls 里声明过；带模板的 id 按 over 数据集展开） */
  controls: c => desktopControls(c),
};
