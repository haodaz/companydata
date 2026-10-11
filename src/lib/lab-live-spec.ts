/**
 * 直播运营的交互故事（2026-10-11）：一场带货中控——信息流不停，要边看边做。
 *   弹幕在滚：有人问尺码、有人问价、有人喊假货；后台在报：爆款库存只剩 3 件；主播嘴快说了「全网最低」。
 *   中控要做的：切讲解品、递话术、上下链接、处理库存预警、回应质疑（不是一刀切拉黑）、拦下违规词。
 * 台面组件：src/components/lab/surfaces/Live.tsx（HTML，浅色整屏，像直播中控台）。
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const PRODUCTS = [
  { v: 1, name: '云感针织开衫', price: 139, stock: 3, hot: true }, { v: 2, name: '高腰直筒牛仔裤', price: 169, stock: 48, hot: false }, { v: 3, name: '羊绒混纺围巾', price: 99, stock: 120, hot: false },
];
export const SAYS = [
  { v: 1, label: '讲卖点', text: '这件开衫是 30% 羊毛的，上身不扎，机洗不变形——姐妹们看一下这个垂感。' },
  { v: 2, label: '答尺码', text: '尺码问题统一回：160 以内穿 M，165–172 穿 L，胖一点选大一码，弹性很大。' },
  { v: 3, label: '答价格', text: '价格就是页面上的 139，没有套路，领了券再下单。' },
  { v: 4, label: '回应质疑', text: '有姐妹问是不是正品——我们是品牌授权店，授权书我现在举给大家看，支持任何平台验货，假一赔十。' },
  { v: 5, label: '催单', text: '开衫还剩最后几件，想要的现在拍，拍完这一波就没有了。' },
  { v: 6, label: '「全网最低」', text: '我们这个价格全网最低、史上最低，别的地方买不到！' },
];
/** 时间轴上的事（模拟秒） */
export const EVENTS = [
  { t: 0, kind: 'danmu', who: '小鱼儿', text: '开衫 160 穿什么码？' }, { t: 12, kind: 'danmu', who: '阿杰', text: '多少钱啊' }, { t: 20, kind: 'danmu', who: '栗子', text: '155 偏胖穿 M 还是 L' },
  { t: 40, kind: 'alert', who: '后台', text: '⚠ 云感针织开衫 库存剩 3 件' }, { t: 48, kind: 'danmu', who: '路人甲', text: '这不是假货吧，我在别处看见 59 的' }, { t: 56, kind: 'danmu', who: 'Lydia', text: '假货！！！别买' },
  { t: 75, kind: 'danmu', who: 'momo', text: '牛仔裤有 XL 吗' }, { t: 90, kind: 'alert', who: '后台', text: '⚠ 开衫 库存 0，链接仍在售' }, { t: 110, kind: 'danmu', who: '橙子', text: '围巾什么颜色' },
];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(2, 'card', 1); push(3, 'link', 1); push(5, 'say', 1); push(5.5, 'say', 0); push(14, 'say', 2); push(14.5, 'say', 0); push(22, 'say', 3); push(22.5, 'say', 0);
  push(44, 'stock', 1); push(46, 'card', 2); push(47, 'link', 1); push(50, 'say', 1); push(50.5, 'say', 0); push(58, 'say', 4); push(58.5, 'say', 0);
  push(80, 'say', 2); push(80.5, 'say', 0); push(100, 'card', 3); push(101, 'link', 1); push(112, 'say', 1); push(112.5, 'say', 0);
  return a;
}

export function liveSpec(image: string): BenchSpec {
  return {
    name: '直播中控台 · 晚八点场', surface: 'live',
    brief: '晚八点的女装专场，你是中控：主播在前面讲，你盯着弹幕和后台。有人问尺码要在 20 秒内递话术；爆款只剩 3 件要先下链接再切下一款（不然超卖）；有人喊假货要递「回应质疑」的话术，不是拉黑了事；主播要说「全网最低」你得拦住。信息不停，错过就是损失。',
    timeScale: 1, maxSeconds: 300,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'say_now', initial: 0, set: 'say != last_say ? say : 0' }, { id: 'last_say', initial: 0, set: 'say' },
      { id: 'ans_size', label: '答了尺码', initial: 0, set: 'max(ans_size, say_now == 2 && t >= 0 ? 1 : 0)' },
      { id: 'ans_size_t', initial: 0, set: 'ans_size == 1 && ans_size_t == 0 ? t : ans_size_t' },
      { id: 'ans_doubt', label: '回应了质疑', initial: 0, set: 'max(ans_doubt, say_now == 4 && t >= 48 ? 1 : 0)' },
      { id: 'ans_doubt_t', initial: 0, set: 'ans_doubt == 1 && ans_doubt_t == 0 ? t : ans_doubt_t' },
      { id: 'stock_handled', label: '库存预警处理了', initial: 0, set: 'max(stock_handled, stock == 1 && t >= 40 ? 1 : 0)' },
      { id: 'stock_t', initial: 0, set: 'stock_handled == 1 && stock_t == 0 ? t : stock_t' },
      { id: 'oversell', label: '超卖', initial: 0, set: 'max(oversell, t >= 90 && stock_handled == 0 ? 1 : 0)' },
      { id: 'banned', label: '违规词', initial: 0, set: 'banned + (say_now == 6 ? 1 : 0)' },
      { id: 'muted', label: '拉黑了提问的人', initial: 0, set: 'muted + mute' },
      { id: 'cards', label: '讲了几款', initial: 0, set: 'max(cards, card)' },
      { id: 'sold', label: '成交单数', initial: 0, min: 0, max: 999, rate: 'link == 1 ? (0.4 + (ans_size == 1 ? 0.3 : 0) + (ans_doubt == 1 && t > 56 ? 0.3 : 0) + (say_now == 5 ? 2 : 0)) * (banned > 0 ? 0.5 : 1) : 0' },
      { id: 'mood', label: '直播间气氛', initial: 60, min: 0, max: 100, rate: '(t > 20 && ans_size == 0 ? -1.5 : 0) + (t > 56 && ans_doubt == 0 ? -2 : 0) + (ans_doubt == 1 && t - ans_doubt_t < 10 ? 2 : 0) + (muted > 0 ? -0.5 : 0) + 0.3' },
      { id: 'quality', label: '场控质量', initial: 0, min: 0, max: 100, set: 'clamp((ans_size == 1 && ans_size_t <= 25 ? 20 : ans_size == 1 ? 10 : 0) + (stock_handled == 1 && stock_t <= 60 ? 25 : stock_handled == 1 ? 10 : 0) + (ans_doubt == 1 && ans_doubt_t <= 76 ? 25 : ans_doubt == 1 ? 10 : 0) + (cards >= 3 ? 10 : 0) + min(20, sold * 0.4) - banned * 20 - oversell * 25 - muted * 10, 0, 100)' },
    ],
    controls: [
      { id: 'card', label: '讲解中的商品', kind: 'knob', min: 0, max: 3, step: 1, initial: 0 },
      { id: 'link', label: '链接在售', kind: 'switch' },
      { id: 'say', label: '递话术', kind: 'knob', min: 0, max: 6, step: 1, initial: 0, hint: '1 卖点 · 2 尺码 · 3 价格 · 4 回应质疑 · 5 催单 · 6 违规词' },
      { id: 'stock', label: '处理库存预警（下链接）', kind: 'switch' },
      { id: 'mute', label: '拉黑', kind: 'button' },
    ],
    gauges: [
      { id: 'g_sold', label: '成交', unit: '单', expr: 'sold', min: 0, max: 120 },
      { id: 'g_mood', label: '气氛', unit: '', expr: 'mood', min: 0, max: 100, warn: 'mood < 40' },
      { id: 'g_ban', label: '违规', unit: '次', expr: 'banned', min: 0, max: 5, warn: 'banned > 0' },
      { id: 'g_q', label: '场控质量', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'size_late', label: '尺码问题 25 秒没人回（问的人已经走了）', when: 't > 25 && ans_size == 0', severity: 'warning', once: true },
      { id: 'oversell', label: '库存 0 链接还在售：超卖，要赔付', when: 'oversell == 1', severity: 'violation', once: true },
      { id: 'banned', label: '说了「全网最低 / 史上最低」（广告法绝对化用语，平台会掐）', when: 'banned > 0', severity: 'violation', once: true },
      { id: 'mute', label: '把提问的人拉黑了（质疑要回应，不是删掉）', when: 'muted > 0', severity: 'warning', once: true },
      { id: 'doubt_late', label: '有人喊假货 20 秒没回应（弹幕开始跟风）', when: 't > 76 && ans_doubt == 0', severity: 'violation', once: true },
    ],
    goals: [
      { id: 'open', label: '上链接、递第一条卖点话术', when: 'link == 1 && cards >= 1' },
      { id: 'size', label: '尺码问题 25 秒内递话术', when: 'ans_size == 1 && ans_size_t <= 25' },
      { id: 'stock', label: '库存预警 20 秒内下链接、切下一款', when: 'stock_handled == 1 && stock_t <= 60 && cards >= 2' },
      { id: 'doubt', label: '「假货」弹幕 20 秒内递回应话术', when: 'ans_doubt == 1 && ans_doubt_t <= 76' },
      { id: 'clean', label: '全场没说违规词、没超卖', when: 't >= 120 && banned == 0 && oversell == 0' },
      { id: 'q', label: '场控质量 ≥ 70', when: 't >= 120 && quality >= 70', after: 'clean' },
    ],
    expertScript: expertScript(),
  };
}
