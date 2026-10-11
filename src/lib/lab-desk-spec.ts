/**
 * 数据分析师的交互故事（2026-10-11）：办公桌——不是选择题，是真的打开一张表、切几张图、把结论写进一份有结构的报告。
 *   数据集是生成的，里面埋了答案：上周六大盘 GMV 掉了 18%，真凶是 Android 7.2.1 版本的支付接口超时（支付成功率 97% → 38%）；
 *   「直播渠道」是烟雾弹（反而涨了一点）。看对了图（支付成功率 → 按客户端拆 → Android 按版本拆）→ 调错误日志 → 报告引用对的数字。
 * 考的是过程：事件流里记着你先看了哪张图、有没有在地区 / 支付方式里乱翻、有没有没拿证据就下结论。
 * 台面组件：src/components/lab/surfaces/Desk.tsx。
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export interface DeskRow { day: string; dow: string; client: string; version: string; region: string; channel: string; orders: number; paid: number; gmv: number }

export const DESK_METRICS = ['GMV（万元）', '订单数', '转化率 CVR', '支付成功率'];
export const DESK_DIMS = ['不拆分', '渠道', '客户端', 'App 版本', '地区', '支付方式'];
export const DESK_VIEWS = ['数据表', '折线（按天）', '柱状（周六对比上周六）'];
export const DESK_CLIENTS = ['全部', 'iOS', 'Android', 'Web'];

/** 确定性伪随机：同一个空间每次打开数据一样 */
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function deskDataset(seed = 42): DeskRow[] {
  const r = rng(seed);
  const days = Array.from({ length: 14 }, (_, i) => i);   // 0 = 两周前周日 … 13 = 上周六（异动日）
  const DOW = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const clients: [string, string[], number][] = [['iOS', ['12.4.0'], 0.38], ['Android', ['7.1.0', '7.2.0', '7.2.1'], 0.47], ['Web', ['-'], 0.15]];
  const regions = ['华东', '华北', '华南', '西南'], regionW = [0.4, 0.25, 0.22, 0.13];
  const channels = ['搜索', '推荐', '直播'], channelW = [0.45, 0.38, 0.17];
  const rows: DeskRow[] = [];
  for (const d of days) {
    const weekend = d % 7 === 0 || d % 7 === 6;
    const base = 52000 * (weekend ? 1.35 : 1) * (0.94 + r() * 0.12);   // 日订单数
    for (const [client, versions, cw] of clients) {
      const vw = versions.length === 3 ? [0.22, 0.3, 0.48] : [1];
      versions.forEach((version, vi) => {
        regions.forEach((region, ri) => {
          channels.forEach((channel, ci) => {
            const orders = Math.round(base * cw * vw[vi] * regionW[ri] * channelW[ci] * (0.9 + r() * 0.2));
            let payRate = 0.965 + r() * 0.02;
            // 埋的答案：上周六 Android 7.2.1 支付接口超时
            if (d === 13 && client === 'Android' && version === '7.2.1') payRate = 0.36 + r() * 0.05;
            // 烟雾弹：直播周六略涨
            const live = d === 13 && channel === '直播' ? 1.08 : 1;
            const paid = Math.round(orders * payRate * live);
            const aov = (client === 'Web' ? 168 : 142) * (0.95 + r() * 0.1);
            rows.push({ day: `${d < 7 ? '前周' : '上周'}${DOW[d % 7]}`, dow: DOW[d % 7], client, version, region, channel, orders, paid, gmv: Math.round(paid * aov) });   // 元
          });
        });
      });
    }
  }
  return rows;
}

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(1, 'app', 3); push(4, 'app', 5); push(7, 'app', 1); push(8, 'view', 1); push(11, 'metric', 3); push(15, 'dim', 2); push(20, 'client', 2); push(24, 'dim', 3); push(28, 'view', 2);
  push(32, 'app', 2); push(34, 'log', 1); push(38, 'app', 4); push(44, 'cite', 4); push(44, 'words', 140); push(48, 'app', 3); push(50, 'send', 1);
  return a;
}

export function deskSpec(image: string): BenchSpec {
  return {
    name: '数据破案台 · 周六 GMV 异动 18%', surface: 'desk',
    brief: '周一早上，大盘看板显示上周六 GMV 比上上周六掉了 18%，运营群里已经在传「是直播出了问题」。桌上是最近两周的明细表：先决定看哪个指标、按什么拆、要不要筛到某一端，再调接口日志拿证据，最后把结论写进报告。乱翻地区 / 支付方式、没拿证据就下结论，都会被记下来。',
    timeScale: 1, maxSeconds: 600,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'seen_rate', label: '看过转化 / 支付成功率', initial: 0, set: 'max(seen_rate, metric >= 2 ? 1 : 0)' },
      { id: 'seen_client', label: '按客户端拆过', initial: 0, set: 'max(seen_client, dim == 2 && metric >= 2 ? 1 : 0)' },
      { id: 'seen_version', label: '下钻到 Android 版本', initial: 0, set: 'max(seen_version, client == 2 && dim == 3 && metric >= 2 ? 1 : 0)' },
      { id: 'log_seen', label: '调过错误日志', initial: 0, set: 'max(log_seen, log)' },
      { id: 'aimless', label: '无序翻看次数', initial: 0, set: 'aimless + (dimchg == 1 && (dim == 4 || dim == 5) && seen_client == 0 ? 1 : 0)' },
      { id: 'early', label: '没证据就写结论', initial: 0, set: 'max(early, words > 60 && log_seen == 0 ? 1 : 0)' },
      { id: 'read_chat', label: '看过群', initial: 0, set: 'max(read_chat, app == 3 ? 1 : 0)' },
      { id: 'confidence', label: '归因置信度', initial: 0, min: 0, max: 100, set: 'clamp(seen_rate * 20 + seen_client * 20 + seen_version * 25 + log_seen * 25 + min(cite, 4) * 2.5 - aimless * 6 - early * 15, 0, 100)' },
    ],
    controls: [
      { id: 'view', label: '视图', kind: 'knob', min: 0, max: 2, step: 1, initial: 0, hint: '0 表 · 1 折线 · 2 柱状' },
      { id: 'metric', label: '指标', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hint: '0 GMV · 1 订单 · 2 CVR · 3 支付成功率' },
      { id: 'dim', label: '拆分维度', kind: 'knob', min: 0, max: 5, step: 1, initial: 0, hint: '0 不拆 · 1 渠道 · 2 客户端 · 3 版本 · 4 地区 · 5 支付方式' },
      { id: 'client', label: '筛选客户端', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hint: '0 全部 · 1 iOS · 2 Android · 3 Web' },
      { id: 'log', label: '调取支付接口错误日志', kind: 'button' },
      { id: 'app', label: '打开的工具', kind: 'knob', min: 0, max: 5, step: 1, initial: 0, hint: '1 大盘明细 · 2 接口日志 · 3 运营群 · 4 排查简报 · 5 便签' },
      { id: 'send', label: '简报发到群里', kind: 'switch' },
      { id: 'cite', label: '报告引用的关键数字', kind: 'knob', min: 0, max: 8, hidden: true, initial: 0 },
      { id: 'words', label: '报告字数', kind: 'knob', min: 0, max: 2000, hidden: true, initial: 0 },
      { id: 'dimchg', label: '刚换了维度', kind: 'switch', hidden: true },
    ],
    gauges: [
      { id: 'g_conf', label: '归因置信度', unit: '', expr: 'confidence', min: 0, max: 100 },
      { id: 'g_aim', label: '无序翻看', unit: '次', expr: 'aimless', min: 0, max: 10, warn: 'aimless > 2' },
      { id: 'g_cite', label: '引用数字', unit: '个', expr: 'cite', min: 0, max: 6 },
      { id: 'g_words', label: '报告字数', unit: '', expr: 'words', min: 0, max: 400 },
    ],
    rules: [
      { id: 'aimless', label: '还没按客户端拆就去翻地区 / 支付方式（无序遍历，先拆大的）', when: 'dimchg == 1 && (dim == 4 || dim == 5) && seen_client == 0', severity: 'warning' },
      { id: 'early', label: '没调日志就开始写结论（证据链不闭合）', when: 'words > 60 && log_seen == 0', severity: 'warning', once: true },
      { id: 'live_bias', label: '只盯着「直播」渠道（那是烟雾弹：它周六反而涨了）', when: 'dim == 1 && t > 90 && seen_client == 0', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'rate', label: '看指标：从 GMV 换到转化率 / 支付成功率', when: 'seen_rate == 1' },
      { id: 'client', label: '按客户端拆，看出 Android 掉得最狠', when: 'seen_client == 1', after: 'rate' },
      { id: 'version', label: '筛到 Android、按版本拆，锁定 7.2.1', when: 'seen_version == 1', after: 'client' },
      { id: 'log', label: '调取支付接口错误日志，拿到根因证据', when: 'log_seen == 1', after: 'version' },
      { id: 'report', label: '报告引用 ≥ 3 个关键数字、不少于 80 字', when: 'cite >= 3 && words >= 80', after: 'log' },
      { id: 'send', label: '简报发到运营群，纠正「直播出问题」的说法', when: 'send == 1', after: 'report' },
      { id: 'conf', label: '归因置信度 ≥ 80', when: 'confidence >= 80', after: 'report' },
    ],
    expertScript: expertScript(),
  };
}

/** 报告里该出现的关键数字 / 词（命中几个 = cite） */
export const DESK_KEYS = ['7.2.1', '38%', '支付成功率', 'Android', '18%', '超时', '直播'];
