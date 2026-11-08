# 只把验收过的卡写进卡池索引（后台还有 agent 在加卡，工作区的 index.ts 会带上没写完的）
# 用法：python3 .tmp-test/game-release-index.py <out_dir> <id> ...  → 在 out_dir 写 index.ts 和 en/index.ts
import sys, os
out, ids = sys.argv[1], sorted(set(sys.argv[2:]))
os.makedirs(out + '/en', exist_ok=True)
zh = ['/** 卡池（scripts/game-card-build.mts / game-cards.mts 生成，别手改；只在服务端 import） */']
zh += [f"import c{i} from './{x}.json';" for i, x in enumerate(ids)]
zh += ["import type { GameCard } from '../types';", 'export const CARDS = [' + ', '.join(f'c{i}' for i in range(len(ids))) + '] as unknown as GameCard[];']
open(out + '/index.ts', 'w', encoding='utf-8').write('\n'.join(zh) + '\n')
en = ['/** 英文覆盖层索引（scripts/game-card-en-check.mts 生成：只收校验全过的；别手改） */']
en += [f"import e{i} from './{x}.json';" for i, x in enumerate(ids)]
en += ["import type { CardEn } from '../../i18n';", 'export const EN: Record<string, CardEn> = { ' + ', '.join(f"'{x}': e{i} as unknown as CardEn" for i, x in enumerate(ids)) + ' };']
open(out + '/en/index.ts', 'w', encoding='utf-8').write('\n'.join(en) + '\n')
print(len(ids), 'cards')
