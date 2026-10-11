/**
 * 园艺师的交互故事（2026-10-11）：救一株生病的龟背竹——延迟反馈，决策要「等几天」才见结果。
 *   症状：下部叶片发黄、盆土一直湿、盆底没排水孔、放在空调出风口。真相是**烂根**（浇太多 + 不透气），不是缺肥。
 *   新手最常做的：看见黄叶就施肥、再浇水 —— 越救越死。对的路：先看（扒土看根、摸土、看盆）→ 停水 → 脱盆剪烂根 → 换透气土 + 有孔盆 → 挪到散射光 → 等（快进几天）→ 看新叶。
 * 台面组件：src/components/lab/surfaces/Garden.tsx。（教学化简化模型）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const GARDEN_ACTS = [
  { v: 1, label: '摸土 / 看盆底', icon: '🖐️', kind: 'look' }, { v: 2, label: '脱盆看根', icon: '🔍', kind: 'look' },
  { v: 3, label: '浇水', icon: '💧', kind: 'do' }, { v: 4, label: '施肥', icon: '🧪', kind: 'do' },
  { v: 5, label: '剪掉烂根 + 黄叶', icon: '✂️', kind: 'do' }, { v: 6, label: '换透气土 + 有孔盆', icon: '🪴', kind: 'do' },
  { v: 7, label: '挪到散射光处', icon: '☀️', kind: 'do' }, { v: 8, label: '喷杀菌剂', icon: '🫧', kind: 'do' },
];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  const act = (t: number, v: number) => { push(t, 'act', v); push(t + 0.5, 'act', 0); };
  act(2, 1); act(5, 2); act(9, 5); act(13, 6); act(16, 7); push(19, 'skip', 1); push(23, 'skip', 1); act(27, 1); push(30, 'skip', 1); act(34, 3); push(38, 'skip', 1); push(42, 'skip', 1); push(46, 'skip', 1);
  return a;
}

export function gardenSpec(image: string): BenchSpec {
  return {
    name: '花房 · 客户送来的龟背竹', surface: 'garden',
    brief: '客户抱来一盆龟背竹：下面几片叶子黄了、软了，说「我天天浇水、上周还施了肥，怎么越来越差」。你有一周时间。先看再动手：摸土、看盆、脱盆看根；决定做什么之后按「过一天」看变化——有些决定三天后才看得出对错。看见黄叶就施肥、再浇水，是最常见的把它浇死的办法。（教学化简化模型）',
    timeScale: 1, maxSeconds: 420,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      // act 是旋钮（会留着），只在它刚变成某个值的那一拍算一次动作
      { id: 'act_now', initial: 0, set: 'act != last_act ? act : 0' },
      { id: 'last_act', initial: 0, set: 'act' },
      { id: 'day', label: '第几天', initial: 0, set: 'day + skip' },
      { id: 'looked', initial: 0, set: 'max(looked, act_now == 1 ? 1 : 0)' }, { id: 'rooted', initial: 0, set: 'max(rooted, act_now == 2 ? 1 : 0)' },
      { id: 'cut', initial: 0, set: 'max(cut, act_now == 5 ? 1 : 0)' }, { id: 'repot', initial: 0, set: 'max(repot, act_now == 6 ? 1 : 0)' }, { id: 'moved', initial: 0, set: 'max(moved, act_now == 7 ? 1 : 0)' },
      { id: 'water_n', label: '浇水次数', initial: 0, set: 'water_n + (act_now == 3 ? 1 : 0)' }, { id: 'fert_n', label: '施肥次数', initial: 0, set: 'fert_n + (act_now == 4 ? 1 : 0)' },
      { id: 'blind_fert', label: '没看根就施肥', initial: 0, set: 'max(blind_fert, act_now == 4 && rooted == 0 ? 1 : 0)' },
      { id: 'blind_water', label: '土还湿就浇水', initial: 0, set: 'max(blind_water, act_now == 3 && wet > 50 ? 1 : 0)' },
      { id: 'early_water', label: '换盆后 3 天内就浇', initial: 0, set: 'max(early_water, act_now == 3 && repot == 1 && day_since_repot < 3 ? 1 : 0)' },
      { id: 'day_since_repot', initial: 0, set: 'repot == 1 ? day_since_repot + skip : 0' },
      // 土壤湿度：每过一天掉一点（透气土掉得快），浇一次 +45
      { id: 'wet', label: '土壤湿度', initial: 92, min: 0, max: 100, set: 'act_now == 6 ? 55 : clamp(wet - skip * (repot == 1 ? 18 : 6) + (act_now == 3 ? 45 : 0), 0, 100)' },
      // 根的健康：烂根不剪一直烂；剪了 + 换盆 + 不涝才慢慢长
      { id: 'root', label: '根系健康', initial: 30, min: 0, max: 100, set: 'clamp(root + skip * ((cut == 1 && repot == 1 && wet < 70) ? 9 : (wet > 75 ? -8 : -2)) - (act_now == 4 && root < 50 ? 12 : 0), 0, 100)' },
      // 叶子：跟着根走，有延迟；光对了才长新叶
      { id: 'leaf', label: '叶片状态', initial: 40, min: 0, max: 100, set: 'clamp(leaf + skip * ((root - leaf) * 0.35 + (moved == 1 ? 2 : -2)), 0, 100)' },
      { id: 'new_leaf', label: '新叶', initial: 0, set: 'max(new_leaf, root > 60 && moved == 1 && day_since_repot >= 4 ? 1 : 0)' },
      { id: 'quality', label: '救治质量', initial: 0, min: 0, max: 100, set: 'clamp(root * 0.5 + leaf * 0.3 + (new_leaf == 1 ? 20 : 0) - blind_fert * 15 - blind_water * 10 - early_water * 10 - max(0, fert_n - 0) * 5, 0, 100)' },
    ],
    controls: [
      { id: 'act', label: '做什么', kind: 'knob', min: 0, max: 8, step: 1, initial: 0, hint: '1 摸土看盆 · 2 脱盆看根 · 3 浇水 · 4 施肥 · 5 剪烂根 · 6 换土换盆 · 7 挪散射光 · 8 杀菌剂' },
      { id: 'skip', label: '过一天', kind: 'button' },
    ],
    gauges: [
      { id: 'g_day', label: '第几天', unit: '', expr: 'day', min: 0, max: 7 },
      { id: 'g_wet', label: '土壤湿度', unit: '%', expr: 'wet', min: 0, max: 100, warn: 'wet > 75' },
      { id: 'g_root', label: '根系', unit: '', expr: 'root', min: 0, max: 100, warn: 'root < 30' },
      { id: 'g_q', label: '救治质量', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'blind_fert', label: '没看根就施肥（烂根吸不了肥，肥烧根，越施越死）', when: 'blind_fert == 1', severity: 'violation', once: true },
      { id: 'blind_water', label: '土还湿着就浇水（它不是渴，是涝）', when: 'blind_water == 1', severity: 'violation', once: true },
      { id: 'early_water', label: '换盆剪根后三天内就浇水（伤口没收口，浇了又烂）', when: 'early_water == 1', severity: 'warning', once: true },
      { id: 'dying', label: '根系快没了（再不脱盆剪根就救不回来）', when: 'root < 12', severity: 'violation', once: true },
      { id: 'no_move', label: '一直放在空调出风口（冷风直吹，叶片脱水）', when: 'day >= 3 && moved == 0', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'look', label: '先看：摸土、看盆底（土一直湿、没排水孔）', when: 'looked == 1' },
      { id: 'root', label: '脱盆看根：烂了一半，这才是病因', when: 'rooted == 1', after: 'look' },
      { id: 'cut', label: '剪掉烂根和黄叶', when: 'cut == 1', after: 'root' },
      { id: 'repot', label: '换透气土 + 有排水孔的盆', when: 'repot == 1', after: 'cut' },
      { id: 'move', label: '挪到散射光、避开空调风', when: 'moved == 1', after: 'repot' },
      { id: 'wait', label: '换盆后至少等 3 天再浇第一次水', when: 'water_n >= 1 && early_water == 0 && day_since_repot >= 3', after: 'repot' },
      { id: 'newleaf', label: '长出新叶（根系 > 60）', when: 'new_leaf == 1', after: 'move' },
      { id: 'q', label: '救治质量 ≥ 70', when: 'quality >= 70 && day >= 5', after: 'newleaf' },
    ],
    expertScript: expertScript(),
  };
}
