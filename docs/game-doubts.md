# 入一行，过一生 · 存疑清单

用户 11-07：拿不准的先跳过，能确认的先发布，存疑的记在这里最后统一处理。

## 职业库数据（库里的问题，卡上已绕开）
- [ ] **体育教练 sports_coach**：职业地图阶梯是康复师的数据。教练卡暂停（scripts/game-drafts/_hold/coach-county.json），等库里阶梯修好再做。
- [ ] **化工工程师 chemical_engineer**：AI 替代性串成了铸造叶片的任务。惠州炼化那张卡在草稿里用 ai_override 手写了炼化的活，库里没改。
- [ ] **备餐员 food_preparation_workers**：AI 替代性讲的是饭店传菜，和煎饼摊对不上。煎饼摊那张卡用了 ai_override；另外库里没有「街头小吃摊主」这个职业，借了这个 key，用 occ_name 改显示名。

## 卡的内容（已上线，可再看）
- [ ] **concrete_structural_engineer（隧道项目部 structural-cr）**：阶梯是设计院那套，卡上是施工单位，按「局里设计 / 技术线」写的。
- [ ] **agri-tech-gansu**：阶梯是企业基地的（场长、生产总监），卡上是县农技站，高几级落在县里写。
- [ ] **community-worker-sh**：最后一级写成进街道社区自治办。
- [ ] **护士 ICU（nurse-sh-icu）**：护士长那一级月薪在部分局里到五六万，偏高，可再调 salary_factor。

- [ ] **auditor-bj**：模拟里 33% 做到合伙人，对大所偏乐观，可调低 growth。
- [ ] **emergency_dispatchers（重庆 120 调度）**：库里 AI 替代性是防汛抢险的活，卡上 ai_override 手写了 120 调度；阶梯是应急指挥中心的通用职称。

## 新卡写作中跳过的
（第二、三波 agent 报回来的跳过项记在这里）
