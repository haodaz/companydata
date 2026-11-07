/** 卡池（只在服务端用；前端只拿得到抽中的那一张） */
import { CARDS } from './cards';
import { randomName } from './engine';
import type { GameCard, PeerCard } from './types';

export const cardById = (id: string): GameCard | null => CARDS.find(c => c.id === id) || null;

/** 抽一张，外加同年入行的 3 个人（同一个职业的先挑，再随便补） */
export function draw(seed: number, exclude?: string): { card: GameCard; peers: PeerCard[] } {
  const pool = CARDS.filter(c => c.id !== exclude);
  const card = (pool.length ? pool : CARDS)[seed % (pool.length || CARDS.length)];
  const rest = CARDS.filter(c => c.id !== card.id).sort((a, b) => Number(b.occupation.key === card.occupation.key) - Number(a.occupation.key === card.occupation.key) || ((seed >> 3) % 7) - 3);
  const peers = rest.slice(0, 3).map((c, i) => ({ id: c.id, name: randomName(seed * 7 + i * 13 + 5), role: c.role, headline: c.headline, city: c.city, unit_type: c.unit_type, start: c.start, ladder: c.ladder, salary_factor: c.salary_factor, growth: c.growth, load: c.load, retire_age: c.retire_age }));
  return { card: strip(card), peers };
}
/** 生成信息不给前端 */
const strip = (c: GameCard): GameCard => { const { meta, ...rest } = c; void meta; return rest; };
export const publicCard = (id: string) => { const c = cardById(id); return c ? strip(c) : null; };
