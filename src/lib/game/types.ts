/**
 * 「入一行，过一生」（/game，2026-11-07）：抽一张入职登记卡，从这一天起把一段职业生涯过到退休。
 * 卡少而精、卡池不公开（抽到哪张是黑盒）；每张卡事先用 AI 造好（这个身份的一天、专属事件、重大抉择），人可以校正。
 * 玩的时候不调 AI：晋升阶梯、年限薪资、AI 替代性都来自职业库，事件和抉择按规则 + 随机推进，所以同一张卡每局都不一样。
 */
export type Stat = 'skill' | 'rep' | 'health' | 'joy';
export const STATS: { k: Stat; label: string; hint: string }[] = [
  { k: 'skill', label: '手艺', hint: '这一行的本事，晋升主要看它' },
  { k: 'rep', label: '口碑', hint: '同行、领导、客户 / 病人怎么看你' },
  { k: 'health', label: '身心', hint: '太低会被迫离开一线' },
  { k: 'joy', label: '热爱', hint: '还喜不喜欢这一行' },
];

/** 一次变化：四项状态加减（-30–30），savings 一次性进出的钱（万元） */
export type Effect = Partial<Record<Stat, number>> & { savings?: number };

/** 晋升阶梯的一级（来自职业库 career_map.ladder；薪资是全国口径，玩的时候乘卡上的 salary_factor） */
export interface LadderStep { title: string; stage: string; years: string; min: number; salary: [number, number]; focus: string }

export interface GameEvent {
  id: string;
  /** 入行后第几年到第几年之间可能发生（从开局算，0 = 第一年） */
  from: number; to: number;
  /** 这一年发生的概率 0–1 */
  chance: number;
  text: string;
  effect: Effect;
  /** 依据：职业地图 / 年限薪资 / AI 替代性 / 岗位库 / 行业常见 */
  source: string;
  mood: 'good' | 'bad' | 'plain';
  /** 至少到第几级才会发生（阶梯下标） */
  minStage?: number;
}

export interface GameOption {
  label: string;
  /** 选了之后发生了什么（一句话） */
  result: string;
  effect: Effect;
  /** 晋升机会加成（0–1，下一次晋升判定时加上） */
  promote?: number;
  /** 薪资系数（乘到之后的月薪上，如跳槽 1.3） */
  salary?: number;
  /** 成长速度系数（乘到之后每年手艺的增长上） */
  growth?: number;
  /** 选了就结束这段职业生涯（转行、出国……）：结局的一句话 */
  end?: string;
}

export interface GameChoice {
  id: string;
  from: number; to: number;
  title: string;
  /** 处境：两三句，讲清楚为什么现在要选 */
  situation: string;
  source: string;
  options: GameOption[];
  minStage?: number;
}

export interface GameCard {
  id: string;
  occupation: { key: string; name: string };
  /** 具体身份，如「神经外科副主任医师」 */
  role: string;
  /** 一句话的身份，如「北京一家三甲医院神经外科的副主任医师」 */
  headline: string;
  unit: string; unit_type: string;
  city: string; city_tier: string;
  education: string;
  start: { age: number; years_in_field: number; stage: number; level: string };
  /** 登记卡下面的开场：两三句，第二人称 */
  intro: string;
  /** 登记卡上的数据，每条带出处（只用职业库 / 岗位库给的数） */
  facts: { label: string; value: string; source: string }[];
  /** 这个身份的一天（6–8 格） */
  day: { time: string; text: string }[];
  ladder: LadderStep[];
  /** 本卡相对全国口径的薪资系数（城市 × 单位），和一句说明 */
  salary_factor: number; salary_note: string;
  /** 成长快慢（0.5–1.5）、每年身心消耗（0–1） */
  growth: number; load: number;
  retire_age: number;
  ai: { from_year: number; tasks: { name: string; kind: string; how: string }[]; new_tasks: { name: string; why: string }[] };
  events: GameEvent[];
  choices: GameChoice[];
  endings: { retire: string; burnout: string };
  /** 生成信息（不给玩家看） */
  meta?: { model: string; at: string; brief: string };
}

/** 抽卡接口给的同年入行的人：只给推演要的数据，不给整张卡 */
export type PeerCard = Pick<GameCard, 'id' | 'role' | 'headline' | 'city' | 'unit_type' | 'start' | 'ladder' | 'salary_factor' | 'growth' | 'load' | 'retire_age'> & { name: string };
