/** 卡池（scripts/game-cards.mts 生成，别手改；只在服务端 import） */
import c0 from './dev-cd-outsource.json';
import c1 from './dev-hz-bigco.json';
import c2 from './lawyer-bj-firm.json';
import c3 from './nurse-sh-icu.json';
import c4 from './nurse-town.json';
import c5 from './preschool-county.json';
import c6 from './surgeon-bj-neuro.json';
import c7 from './surgeon-county-gs.json';
import type { GameCard } from '../types';
export const CARDS = [c0, c1, c2, c3, c4, c5, c6, c7] as unknown as GameCard[];
