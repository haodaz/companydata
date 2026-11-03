/**
 * 从一个实验方法落到百业（2026-11-02）：方法库（058）里的操作指南 + 科研产品库里挂在这个方法上的真实型号 →
 *   --space   一个研究岗空间（研一进组第一周，章节贴着这份指南的步骤和常见坑、用库里真实的仪器）
 *   --work    一道科研真活（设备选型论证：材料是库里真实型号的参数，原题直发，不碰企业库）
 *   npx tsx scripts/research-method-showcase.mts <方法 key> --space|--work [--model claude-opus-5-5]
 * 建完空间要扩成完整一天：npx tsx scripts/lab-build-full-day.mts <空间 id> --model claude-opus-5-5
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');

const argv = process.argv.slice(2);
const mi = argv.indexOf('--model'); const model = mi >= 0 ? argv[mi + 1] : 'claude-opus-5-5';
const key = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--model');
if (!key) { console.error('用法见文件头'); process.exit(1); }
const { data: m } = await db.from('research_methods').select('*').eq('key', key).single();
if (!m) throw new Error(`方法库里没有 ${key}`);
const LAB = '演示·肿瘤细胞生物学课题组';
const strip = (s: any) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// 挂在这个方法上的仪器：有品牌 / 型号 / 描述的优先，每种通用仪器最多 4 个型号
const { data: prods } = await db.from('research_products').select('id, name, brand, model_no, labels, description, type, specs, supplier:companies(name)')
  .not('if_delete', 'is', true).eq('type', 'instruments_and_equipment').or(`methods.eq.${key},methods.like."${key},%",methods.like."%,${key}",methods.like."%,${key},%"`).limit(400);
const pick: any[] = [];
for (const g of m.generic_instruments || []) {
  const core = g.replace(/[（(].*$/, '').replace(/\s/g, '');
  const hit = (prods || []).filter(p => p.name.replace(/\s/g, '').includes(core.slice(0, 4))).sort((a, b) => strip(b.description).length - strip(a.description).length).slice(0, 4);
  pick.push(...hit.filter(h => !pick.some(x => x.id === h.id)));
}
const line = (p: any) => `${p.name}${p.brand ? `（${p.brand}${p.model_no ? ' ' + p.model_no : ''}）` : ''} · ${p.supplier?.name || '厂商未知'}${p.labels ? ` · ${p.labels}` : ''}`;
console.log(`方法：${m.name}；挂上的仪器 ${prods?.length || 0} 条，选出 ${pick.length} 个型号：\n  ${pick.map(line).join('\n  ')}`);

if (argv.includes('--space')) {
  const { assignNova } = await import('../src/lib/lab-nova');
  const { buildSpaceFromJd } = await import('../src/lib/agents/skill-lab-build');
  const { reconcileCast } = await import('../src/lib/lab-cast-server');
  const title = `研一新生 · ${m.name}（进组第一周）`;
  const responsibilities = [
    `进组第一周要学会「${m.name}」：${m.summary || ''}`,
    `标准流程：${(m.steps || []).map((s: any, i: number) => `${i + 1}. ${s.title}：${s.detail}`).join(' ')}`,
    `新手最常踩的坑（现象 → 原因 → 怎么判断）：${(m.pitfalls || []).map((x: any) => `${x.symptom} → ${x.cause} → ${x.check}`).join('；')}`,
    `安全：${m.safety || ''}`,
    `细胞房里的设备（科研产品库里的真实型号）：${pick.map(line).join('；')}`,
  ].join('\n');
  const qualifications = `要练的本事：${(m.skills || []).map((s: any) => `${s.name}（${s.why}）`).join('；')}`;
  const jd = { company: LAB, title, responsibilities, qualifications };
  const HINT = `这是课题组研一新生进组第一周的带教空间：跟着带教师姐学「${m.name}」，章节按真实的一周推进（安全培训与熟悉细胞房、复苏传代、出现异常、组会汇报），把上面「新手最常踩的坑」做成章节里的真实事件，让新人自己发现和判断；提到设备时用上面给的真实品牌型号，不编参数；评分重无菌意识、判断数据可不可信和安全规范。`;
  const log = (phase: string, detail?: string) => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${phase}${detail ? `：${detail}` : ''}`);
  const built = await buildSpaceFromJd(jd, model, log, { hint: HINT });
  const { data: skill, error: skErr } = await db.from('skills').insert({
    slug: `research-method-${key}-${Date.now().toString(36)}`, ...built.skill, interview: [],
    expert_name: '岗位 AI 自学草案', expert_title: `从实验方法库「${m.name}」和科研产品库推断 · 等待导师校正`, expert_location: '云端', expert_note: '尚未有真人专家', tz_offset: 0,
    source: 'jd-draft', assigned_agent: 'qa', distilled_at: new Date().toISOString(), created_by: 'cli',
  }).select('id').single();
  if (skErr) throw skErr;
  const { data: created, error: insErr } = await db.from('skill_tasks').insert({
    job_id: null, skill_id: skill.id,
    jd_snapshot: { ...jd, kind: 'research_post', method_key: key, product_ids: pick.map(p => p.id), fetched_at: new Date().toISOString().slice(0, 10) },
    ...built.task, created_by: 'cli',
  }).select('id').single();
  if (insErr) throw insErr;
  await assignNova(created.id).catch(e => console.warn('分编号失败', e?.message));
  await reconcileCast(created.id);
  log('完成', created.id);
  console.log(`SPACE ${created.id}`);
}

if (argv.includes('--work')) {
  const { createWorkTask } = await import('../src/lib/work/chat-agent');
  const { data: admin } = await db.from('system_users').select('email').eq('role', 'admin').limit(1).single();
  // 材料：题目要配的三类设备，按名字到科研产品库里各取介绍最全的 4 款（原文抽取，标来源）
  const cand: any[] = [];
  for (const pats of [['CO2培养箱', 'CO₂培养箱', '二氧化碳培养箱'], ['生物安全柜'], ['倒置显微镜', '倒置荧光显微镜']]) {
    const { data } = await db.from('research_products').select('id, name, brand, model_no, labels, description, specs, supplier:companies(name)').not('if_delete', 'is', true).or(pats.map(x => `name.ilike.%${x}%`).join(',')).limit(60);
    cand.push(...(data || []).sort((a, b) => strip(b.description).length - strip(a.description).length).slice(0, 4));
  }
  const sheet = `# 候选设备参数（来自科研产品库，原文取自厂商 / 展会会刊）\n\n${cand.map((p, i) => `## ${i + 1}. ${p.name}\n- 品牌 / 型号：${[p.brand, p.model_no].filter(Boolean).join(' ') || '会刊未写'}\n- 厂商：${p.supplier?.name || '—'}\n- 卖点标签：${p.labels || '—'}\n${Object.keys(p.specs || {}).length ? `- 参数：${Object.entries(p.specs).map(([k, v]) => `${k} ${v}`).join('；')}\n` : ''}- 介绍：${strip(p.description).slice(0, 400) || '—'}`).join('\n\n')}`;
  const text = `${LAB}要新建一间细胞房，主要做肿瘤细胞系和原代细胞的培养、传代和药物处理，同时有 3 名研一新生要在这里学「${m.name}」。设备预算 60 万元（含安装培训），需要配齐：CO₂ 培养箱、生物安全柜、倒置显微镜，其余小设备另有经费。
附件是从科研产品库里调出的候选设备（厂商 / 会刊原文），参数不全的地方需要你注明怎么去核实。
请交一份《细胞房设备选型论证》，给课题组长和学院设备处看：
1. 每类设备选哪一款（可以说明为什么不选其他的），关键指标怎么比、哪些指标对我们的实验真正要紧；
2. 预算怎么分配，超了或有余量怎么处理；
3. 新手多、做原代细胞，最怕污染：设备配置和摆放上怎么降低污染风险，日常维护和验证（如培养箱 CO₂ 浓度、安全柜风速）怎么安排；
4. 还缺哪些信息需要向厂商询问（列成问题清单）。
要求：结论先行；所有参数注明出处，会刊没写的不要编，写「待厂商确认」；可以用 AI 帮忙整理，但选型判断要你自己负责。建议用时 60 分钟。`;
  const r = await createWorkTask({ email: admin?.email || 'cli', role: 'admin' }, { company: LAB, role: `实验室主管 / 博士后（${m.name}平台）`, verbatim: text, attachments: [{ url: 'local://research-products', name: '候选设备参数（科研产品库）.md', mime: 'text/markdown', text: sheet }] as any });
  // 参数表不是上传的文件：改成库里来的文档材料（不出「下载附件」的空链接）
  const { data: row } = await db.from('work_tasks').select('id, materials').eq('share_token', r.share_token).single();
  await db.from('work_tasks').update({ materials: (row!.materials || []).map((x: any) => String(x.url || '').startsWith('local://') ? { ...x, kind: 'doc', url: undefined, mime: undefined, name: undefined, source: 'library', basis: '科研产品库（厂商 / 展会会刊原文）' } : x) }).eq('id', row!.id);
  console.log(`WORK ${r.share_token} owner_key=${r.owner_key} ${r.title}`);
}
