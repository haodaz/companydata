/**
 * 给已有的卡补「来路」（怎么一步步走到这个截面）和「晚年」（离开这一行之后）。用户 11-07：卡是一个截面，可以前推和后推。
 *   npx tsx --env-file=.env.local scripts/game-cards-extend.mts [卡 id …] [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateContent } from '../src/lib/llm-client';
import { parseJsonLoose } from '../src/lib/agents/search-llm';
import type { GameCard } from '../src/lib/game/types';

const MODEL = process.env.GAME_MODEL || 'claude-opus-5-5';
const DIR = path.join(import.meta.dirname, '../src/lib/game/cards');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function extend(file: string) {
  const card: GameCard = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { data: occ } = await db.from('occupations').select('career_map, relevant_certificates, position_requirement').eq('key', card.occupation.key).single();
  const cm: any = occ?.career_map || {};
  const prompt = `你在给职业生涯模拟游戏「入一行，过一生」的一张卡补两段：来路和晚年。玩家抽到这张卡时，看到的是这个人此刻的一个截面；来路讲他怎么一步步走到这里，晚年讲离开这一行之后。
【这张卡】${card.headline}；${card.unit}，${card.city}（${card.city_tier}）；${card.education}；开局 ${card.start.age} 岁，入行第 ${card.start.years_in_field} 年，${card.start.level}
开场：${card.intro}
晋升阶梯：${card.ladder.map(l => `${l.title}（${l.years}）`).join(' → ')}；退休年龄 ${card.retire_age}
【职业库 · 入行路径】${JSON.stringify(cm.entry_paths || []).slice(0, 2500)}
【职业库 · 证书和任职要求】${occ?.relevant_certificates || ''}；${occ?.position_requirement || ''}
【职业库 · AI 替代性】${card.ai.tasks.map(t => `${t.name}（${t.kind === 'human' ? 'AI 拿不走' : t.kind === 'hybrid' ? '人机一起' : 'AI 能接手'}）`).join('；')}
【这张卡结局的写法】退休：${card.endings.retire}

要求：全部中文、第二人称「你」，具体、有画面、克制，不煽情、不说教；不出现真实人名和真实单位名；死亡和病痛不写画面。
1. past：来路 6–8 步 { age, text }，从十五岁左右（中考、高考、选专业）一直到开局前一年，每步一两句，写清楚每个岔路口为什么走了这条路（家里的条件、分数、城市、一次偶然），要用上入行路径和证书。和这张卡的城市、单位、学历严丝合缝；如果开局已经工作多年（比如四十多岁的副主任医师），中间要交代这些年怎么过来的。最后一步落在开局前，接得上开场那句话。
2. late：晚年。
   - pension_ratio：退休后每月大概能拿到最后月薪的几成（0.3–0.8，体制内高、企业低），pension_note 一句话依据（写明是估算）。
   - scenes：10–14 幕 { after, when, text, mood }。after = 离开这一行后第几年（0–25）；when = retire（正常退休才会有）/ burnout（身心撑不住离开一线才会有）/ end（中途转行离开的才会有）/ any（都会有）；每种离开方式至少 3 幕，any 至少 3 幕。写退休金够不够、返聘或带徒弟、身体、家里（孩子、孙辈、老伴）、老同事、这一行后来怎么变了（AI 接手的那些活后来怎样、年轻人怎么干这行）、偶尔被人认出来。mood good / bad / plain。
   - closing：{ retire, burnout, end } 三段收尾，每段两三句，落在很多年后的一个安静画面，不写死亡。

只返回 JSON：{ "past": [], "late": { "pension_ratio": 0.5, "pension_note": "", "scenes": [], "closing": { "retire": "", "burnout": "", "end": "" } } }`;
  const r = await generateContent(prompt, MODEL, { jsonMode: true });
  const p: any = parseJsonLoose(r.text);
  if (!p?.past?.length || !p?.late?.scenes?.length) throw new Error(`没给全：${r.text.slice(0, 160)}`);
  card.past = p.past.map((x: any) => ({ age: +x.age || 0, text: String(x.text || '') })).filter((x: any) => x.text);
  card.late = { pension_ratio: Math.max(0.2, Math.min(0.9, +p.late.pension_ratio || 0.5)), pension_note: String(p.late.pension_note || ''), scenes: p.late.scenes.map((x: any) => ({ after: Math.max(0, +x.after || 0), when: ['retire', 'burnout', 'end', 'any'].includes(x.when) ? x.when : 'any', text: String(x.text || ''), mood: ['good', 'bad', 'plain'].includes(x.mood) ? x.mood : 'plain' })).filter((x: any) => x.text), closing: { retire: p.late.closing?.retire || '', burnout: p.late.closing?.burnout || '', end: p.late.closing?.end || '' } };
  fs.writeFileSync(file, JSON.stringify(card, null, 1));
  return card;
}

const want = process.argv.slice(2).filter(a => !a.startsWith('--')), force = process.argv.includes('--force');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && (!want.length || want.includes(f.replace(/\.json$/, '')))).map(f => path.join(DIR, f)).filter(f => force || !JSON.parse(fs.readFileSync(f, 'utf8')).past);
for (let i = 0; i < files.length; i += 2) await Promise.all(files.slice(i, i + 2).map(f => extend(f).then(c => console.log(`✓ ${c.id} · 来路 ${c.past!.length} · 晚年 ${c.late!.scenes.length}`), e => console.error(`✗ ${path.basename(f)}: ${e.message}`))));
