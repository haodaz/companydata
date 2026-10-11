#!/bin/bash
# 依次建空间（职业探索），每个建完把 id 记到 scratchpad/created-spaces.txt
cd /Users/aisandbox/Documents/companydata
OUT=/private/tmp/claude-502/-Users-aisandbox-Documents-companydata/363d4d33-d9c2-4a73-a22a-67799d1e992d/scratchpad/created-spaces.txt
for p in "急诊护士" "电气设备维修工" "客服主管" "中餐厨师" "审计师" "幼儿园老师" "直播运营" "园艺师"; do
  id=$(npx tsx scripts/lab-create-space.mts "$p" 2>&1 | tail -1)
  echo "$p $id" >> "$OUT"
done
