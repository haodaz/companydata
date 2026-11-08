# 「入一行，过一生」写新卡说明（中文卡 + 英文覆盖层，一次写完）

玩家抽到一张卡，就以这个具体身份从此刻开始，一年一年把职业生涯过到退休；开局前快速闪过「来路」（怎么走到这里的），离开这一行后有「晚年」几幕。英文版 One Job, One Life 给海外玩家「体验一位中国从业者的一生」。玩的时候不调 AI，全靠卡里写好的内容 + 规则推演。**全部内容自己写，不调用任何大模型 API。** 不改别的文件，不 git 提交。

工作目录：/Users/aisandbox/Documents/companydata

## 每张卡的步骤
1. 看库里的真实数据：`npx tsx --env-file=.env.local scripts/game-card-context.mts <occ> [cityCode]`（阶梯带 stage 下标、技能证书、去向、入行路径、年限薪资、AI 替代性、岗位库数）。阶梯明显不是这个职业的（比如体育教练的阶梯是康复师），停下来，回报里说明，不要写这张。
2. 读范例学结构和语气：`src/lib/game/cards/surgeon-county-gs.json`、`src/lib/game/cards/en/` 下任意一份（如果已有），以及 `src/lib/game/types.ts`、`src/lib/game/i18n.ts`。
3. 写中文草稿 `scripts/game-drafts/<id>.json`（格式见下），**数字（薪资、JD 数）不用写**，装卡脚本从库里搬。
4. 装卡并校验：`npx tsx --env-file=.env.local scripts/game-card-build.mts <id>`，直到没有「要改的」（别人的卡报的问题不用管）。
5. 模拟：`npx tsx .tmp-test/game-mc.mts 2>&1 | grep -A4 "<id>"`，各级比例不应 90% 以上到顶；转身 20–40%。离谱就调 growth / load / 抉择 promote 再装卡。
6. 写英文覆盖层 `src/lib/game/cards/en/<id>.json`：照 `scripts/game-en-brief.md` 的格式和译法（**装卡之后再写**，facts / ladder / ai_tasks 要对着装好的卡 `src/lib/game/cards/<id>.json` 翻）；校验 `npx tsx scripts/game-card-en-check.mts <id>` 必须 ✓。
7. 回报：每张卡 id、role、各段条数、模拟分布一行、你最满意的一两个细节。

## 中文草稿格式（scripts/game-drafts/<id>.json）
```json
{
  "id": "barista-sh", "occ": "baristas", "cityCode": "310000", "author": "claude-code", "brief": "<一句话身份设定>", "gender": "f | m（卡里写死了性别才填）",
  "role": "精品咖啡馆见习咖啡师", "headline": "<一句话身份，像『省城规培三年刚回县里……的县医院普外科住院医师』这样具体>",
  "unit": "上海一家精品咖啡馆", "unit_type": "精品咖啡馆", "city": "上海", "city_tier": "一线", "education": "大专（酒店管理）",
  "start": { "age": 22, "years_in_field": 0, "stage": 0, "level": "<一句话现在的水平>" },
  "salary_factor": 1.2, "salary_note": "估算：<城市 × 单位相对全国口径的依据>", "growth": 1.0, "load": 0.5, "retire_age": 60,
  "intro": "<登记卡下的开场两三句，第二人称，结尾落在『从今天起……』>",
  "day": [ { "time": "07:10", "text": "<一两句>" } ],
  "events": [ { "id": "e1", "from": 0, "to": 5, "chance": 0.3, "text": "<已经发生的事>", "effect": { "skill": 3, "health": -2 }, "source": "行业常见", "mood": "good", "minStage": 1 } ],
  "choices": [ { "id": "c1", "from": 1, "to": 4, "title": "<短标题>", "situation": "<两三句>", "source": "职业地图", "options": [ { "label": "<短>", "result": "<一两句>", "effect": { "joy": 4 }, "promote": 0.3, "salary": 1.2, "growth": 1.1, "end": "<离开这一行时才写：结局一句话>" } ] } ],
  "endings": { "retire": "<三四句，留白>", "burnout": "<三四句>" },
  "past": [ { "age": 15, "text": "<来路一步>" } ],
  "late": { "pension_ratio": 0.45, "pension_note": "估算：<依据>", "scenes": [ { "after": 0, "when": "retire", "text": "<一两句>", "mood": "plain" } ], "closing": { "retire": "", "burnout": "", "end": "" } }
}
```

## 写法要求
- 中文，第二人称「你」，像懂这一行的人在讲：具体、有画面、克制，不煽情不说教。**城市和单位要写实**，这张卡的价值就在差别里。不出现真实人名、单位名、奖项名。死亡、暴力、病痛不写画面。
- day 7–8 格；events 18–24 条（from/to 是开局后第几年，覆盖到退休；chance 0.05–0.5；effect 四项 skill/rep/health/joy 每项 −15 到 15，可加 savings 万元；source 只用 职业地图 / AI 替代性 / 岗位库 / 行业常见；mood good/bad/plain；好事坏事、这一行特有的、生活、AI 接手后的变化都要有；扣身心加起来别超过 −80）。
- choices 7–9 个，2–3 个选项，没有明显正确的；用上证书 / 晋升要求 / 去向（转行用 end，全卡 end 不超过 3 个）、城市和单位的抉择（salary 0.6–1.5）、AI 新活学不学（growth 0.8–1.3）；promote 是 0–0.5 的数字。晋升是规则自动发生的，抉择只加机会；关于「考 / 评 / 竞聘某一级」的题，标题或处境写出阶梯里那一级的原名。
- past 5–7 步（15 岁左右到开局前一年，岔路口为什么这么走，用上入行路径和证书；age 小于开局年龄）。late：pension_ratio 0.3–0.8，scenes 10–12 幕，when = retire / burnout / end / any 各至少 3 幕（any 至少 2），after 0–20；closing 三段，落在安静画面，不写死亡。
- start.stage 和身份一致；salary_factor 一线大单位 1.2–2、县城乡镇 0.4–0.7；growth 0.6–1.4；load 0.2–0.9；retire_age 按实际。
