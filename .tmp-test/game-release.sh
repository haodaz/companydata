#!/bin/zsh
# 发布一批验收过的卡：卡池索引 = 上一次已发布的卡 + 这一批；索引直接写进 git 暂存区（不碰工作区——后台 agent 装卡会随时重写工作区的 index.ts）
# 用法：zsh .tmp-test/game-release.sh "<提交说明>" id1 id2 ...
set -e
msg=$1; shift
T=$(mktemp -d)
base=$(git show HEAD:src/lib/game/cards/index.ts | grep -o "from './[^']*\.json'" | sed "s/from '.\///;s/\.json'//")
python3 .tmp-test/game-release-index.py $T ${=base} "$@"
for i in "$@"; do for f in src/lib/game/cards/$i.json src/lib/game/cards/en/$i.json; do [ -f $f ] || { echo "缺 $f"; exit 1; }; git add $f; done; [ -f scripts/game-drafts/$i.json ] && git add scripts/game-drafts/$i.json; done
git update-index --cacheinfo 100644,$(git hash-object -w $T/index.ts),src/lib/game/cards/index.ts
git update-index --cacheinfo 100644,$(git hash-object -w $T/en/index.ts),src/lib/game/cards/en/index.ts
# 暂存区里的索引引用的每张卡都要在暂存区里有中文和英文文件
for i in $(git show :src/lib/game/cards/index.ts | grep -o "from './[^']*\.json'" | sed "s/from '.\///;s/\.json'//"); do git cat-file -e :src/lib/game/cards/$i.json && git cat-file -e :src/lib/game/cards/en/$i.json || { echo "暂存区缺 $i"; exit 1; }; done
echo "发布 $(git show :src/lib/game/cards/index.ts | grep -c '^import c') 张"
git commit -q -m "$msg

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
