/** 卡池（只在服务端用；前端只拿得到抽中的那一张）。英文版只抽有英文覆盖层的卡，合并后给出去 */
import { CARDS } from './cards';
import { EN } from './cards/en';
import { randomName } from './engine';
import { mergeEn, type Lang } from './i18n';
import type { GameCard, PeerCard } from './types';

const localize = (c: GameCard, lang: Lang) => (lang === 'en' ? mergeEn(c, EN[c.id]) : c);
export const cardById = (id: string): GameCard | null => CARDS.find(c => c.id === id) || null;

/** 抽一张，外加同年入行的 3 个人（同一个职业的先挑，再随便补） */
export function draw(seed: number, exclude?: string, lang: Lang = 'zh'): { card: GameCard; peers: PeerCard[] } {
  const enCards = CARDS.filter(c => EN[c.id]);
  const all = lang === 'en' && enCards.length ? enCards : CARDS;   // 英文一张都还没有时退回中文卡，免得抽不到
  const pool = all.filter(c => c.id !== exclude);
  const card = (pool.length ? pool : all)[seed % (pool.length || all.length)];
  const rest = all.filter(c => c.id !== card.id).sort((a, b) => Number(b.occupation.key === card.occupation.key) - Number(a.occupation.key === card.occupation.key) || ((seed >> 3) % 7) - 3);
  const peers = rest.slice(0, 3).map(c0 => localize(c0, lang)).map((c, i) => ({ id: c.id, name: randomName(seed * 7 + i * 13 + 5, c.gender, lang), role: c.role, headline: c.headline, city: c.city, unit_type: c.unit_type, start: c.start, ladder: c.ladder, salary_factor: c.salary_factor, growth: c.growth, load: c.load, retire_age: c.retire_age }));
  return { card: strip(localize(card, lang)), peers };
}
/** 生成信息不给前端 */
const strip = (c: GameCard): GameCard => { const { meta, ...rest } = c; void meta; return rest; };
export const publicCard = (id: string, lang: Lang = 'zh') => { const c = cardById(id); return c && (lang === 'zh' || EN[c.id]) ? strip(localize(c, lang)) : null; };
