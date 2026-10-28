#!/bin/bash
# 把 main 上「数据工厂」那部分推到公司 GitLab（用户 10-28：百业 AI 模拟、真活、大学都不推）。
# 做法：从当前 HEAD 导出一份，按 exclude.txt 删掉不推的，打上 overlay/ 里的补丁（去掉对不推部分的引用），
# 在导出目录里跑一遍 tsc 确认能编译，再作为一个提交推到 GitLab 的 main。GitHub 照常 git push。
#   bash scripts/gitlab/push-datafactory.sh [--dry]
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
REMOTE=git@ma.applysquare.net:zhuangzhuang/company-data.git
MIRROR=${GITLAB_MIRROR:-$HOME/Documents/companydata-gitlab}
SHA=$(git rev-parse --short HEAD); SUBJ=$(git log -1 --format=%s)
# 镜像仓库：只放导出结果（git clone 这台 GitLab 偶尔卡住，用 init + 浅 fetch）
if [ ! -d "$MIRROR/.git" ]; then mkdir -p "$MIRROR"; git -C "$MIRROR" init -q -b main; git -C "$MIRROR" remote add origin "$REMOTE"; fi
GIT_SSH_COMMAND="ssh -o ConnectTimeout=15 -o ServerAliveInterval=10" git -C "$MIRROR" fetch -q --depth 1 origin main
git -C "$MIRROR" reset -q --hard origin/main
OUT=$(mktemp -d)
git archive HEAD | tar -x -C "$OUT"
# 删掉不推的
(cd "$OUT" && git -C "$ROOT" -c core.quotepath=false ls-files | python3 -c "
import re,sys,os
pats=[re.compile(l.strip()) for l in open('$ROOT/scripts/gitlab/exclude.txt',encoding='utf-8') if l.strip() and not l.startswith('#')]
for p in sys.stdin.read().splitlines():
    if any(x.search(p) for x in pats) and os.path.exists(p): os.remove(p)
")
find "$OUT" -type d -empty -delete
# 补丁：overlay 里的文件覆盖进去
cp -R "$ROOT/scripts/gitlab/overlay/." "$OUT/" 2>/dev/null || true
python3 "$ROOT/scripts/gitlab/patch.py" "$OUT"
# 能编译才推
ln -s "$ROOT/node_modules" "$OUT/node_modules"
(cd "$OUT" && npx tsc --noEmit) || { echo "✗ 导出的代码编译不过，没推。目录：$OUT"; exit 1; }
rm "$OUT/node_modules"
# 同步进镜像仓库
rsync -a --delete --exclude .git "$OUT/" "$MIRROR/"
cd "$MIRROR"; git add -A
if git diff --cached --quiet; then echo "GitLab 没有变化"; exit 0; fi
git commit -q -m "sync $SHA: $SUBJ"
if [ "${1:-}" = "--dry" ]; then echo "（dry）已在 $MIRROR 提交，没推"; git show --stat HEAD | tail -3; exit 0; fi
git push -q origin HEAD:main && echo "✓ 已推 GitLab：sync $SHA"
rm -rf "$OUT"
