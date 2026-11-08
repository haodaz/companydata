# 「入一行，过一生」英文覆盖层翻译说明（One Job, One Life）

英文版给海外玩家「体验一位中国从业者的一生」：抽一张某个具体中国从业者的登记卡（城市、单位、资历），一年一年过完职业生涯，开局前有一段「来路」，离开这一行后有几幕「后来」。**全部自己写，不调用任何大模型 API。** 不 git 提交，不改别的文件。

工作目录：/Users/aisandbox/Documents/companydata

## 每张卡
1. 读中文卡 `src/lib/game/cards/<id>.json`（类型见 `src/lib/game/types.ts`，覆盖层格式 `CardEn` 见 `src/lib/game/i18n.ts`）。
2. 写英文覆盖层 `src/lib/game/cards/en/<id>.json`：
```json
{
  "id": "<id>",
  "occupation": "<occupation.name 的英文，如 Surgeon>",
  "role": "", "headline": "", "unit": "", "unit_type": "", "city": "", "city_tier": "", "education": "",
  "level": "<start.level>", "intro": "", "salary_note": "",
  "facts": [ { "label": "", "value": "", "source": "" } ],
  "day": [ "<day[0].text>" ],
  "ladder": [ { "title": "", "stage": "", "focus": "" } ],
  "ai_tasks": [ { "name": "", "how": "" } ],
  "events": { "<事件 id>": "<text>" },
  "choices": { "<抉择 id>": { "title": "", "situation": "", "options": [ { "label": "", "result": "", "end": "<中文选项有 end 才写>" } ] } },
  "endings": { "retire": "", "burnout": "" },
  "past": [ "<past[0].text>" ],
  "late": { "pension_note": "", "scenes": [ "<late.scenes[0].text>" ], "closing": { "retire": "", "burnout": "", "end": "" } }
}
```
数组和中文卡**同序同数**（facts、day、ladder、ai_tasks、past、late.scenes），事件和抉择按 id 全覆盖。
3. 校验：`npx tsx scripts/game-card-en-check.mts <id> …`，全部 ✓（数量对、id 不缺、没有任何中文字符，包括「」，。这类标点）。
4. 回报：完成的 id，各挑一两句你满意的译句。

## 怎么译
- 自然、克制、有文学感的英文，第二人称 you，语气安静具体，不煽情不说教；面向 X 上的海外读者，要读起来像好的英文散文，不像翻译。
- 中国特色保留并顺手解释，不加脚注：三甲医院 → "a top-tier (Grade 3A) hospital"；县 → county；镇卫生院 → township clinic；编制 → "a permanent state post"；规培 → residency training；高考第一次出现写 "the gaokao (college entrance exam)"；双十一 → Singles' Day；赶场 → market day；职称按真实英文头衔。人名用拼音。食物、地方、物件写具体。
- 钱：¥ 加千分位，如 "¥5,000–10,000 a month (national average)"；万要换算（12 万 → ¥120,000）。
- 出处与登记卡标签：职业地图 → Career map；年限薪资 → Pay by experience；AI 替代性 → AI exposure；岗位库 → Job listings。「XX这一级」→ "<Title> (current level)"；「往上一级」→ "Next level up"；「AI 拿不走的」→ "What AI can't take"；「AI 开始插手的」→ "Where AI is moving in"；「在招岗位」→ "Open positions"；「入行10 年以上月薪」→ "Pay after 10+ years"。
- ladder 用真实英文职称（Resident Physician → Attending Physician → Associate Chief Physician → Chief Physician → Department Head），stage 写短标签。
- 不增不减信息，数字照抄。
