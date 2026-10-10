/**
 * 月嫂带教官（NOVA-47）第 1 章的抚触工位修正（用户 2026-10-11：给宝宝的操作台上没有宝宝，手里拿的还是拉花的奶缸）。
 *   原来：底图只有一张护理垫 + 仪表盘；工作面借用了拉花的 cup 层（画成咖啡杯）、轨迹没写 icon（默认画奶缸）。
 *   现在：底图换成仰躺的新生儿（肚脐上有脐带夹）；工作面换成 skin 层（抚触油光 + 肚脐禁区）；手里是 hand；轨迹沿宝宝肚子顺时针绕开肚脐。
 *   npx tsx scripts/lab-fix-yuesao-bench.mts <底图 png>
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { saveLabAsset, toJpeg } = await import('../src/lib/lab-art');
const { registerAsset } = await import('../src/lib/lab-cast-server');

const TASK = '19fd15d1-3787-4e65-a3a6-883a013ae59c', CHAPTER = 'a0b35fe3-9d4a-4bed-ab12-4e10d4c2c3b8';
const file = process.argv[2];
if (!file) { console.error('给我底图 png'); process.exit(1); }

const url = await saveLabAsset(await toJpeg(fs.readFileSync(file), 86), `19fd15d1-bench-baby-${Date.now().toString(36)}.jpg`);
const asset = await registerAsset({ kind: 'scene', url, title: '工位：新生儿抚触护理台', type_name: '新生儿抚触护理台', family: 'care', note: '俯视：新生儿仰躺在护理垫上，肚脐有脐带夹，旁边抚触油、毛巾', source_task_id: TASK, prompt: '扁平插画，正上方俯视近景，新生儿仰躺在白色护理垫上，肚脐有脐带残端和脐带夹，穿纸尿裤，抚触油、毛巾' });
console.log('素材', asset.code, url);

const { data: ch, error } = await db.from('lab_chapters').select('sim').eq('id', CHAPTER).single();
if (error) throw error;
const sim = ch.sim;
const step = sim.steps.find((s: any) => s.type === 'bench');
const scene = step.bench.scene;
scene.image = url;
// 宝宝肚子（百分比坐标，底图 16:9）：肚脐约在 (41.5, 82)，肚皮在 x 31–52、y 69–85 之间
const NAVEL = { x: 41.5, y: 82 };
scene.layers = scene.layers
  .filter((l: any) => l.id !== 'mat_glow')
  .map((l: any) => l.id === 'colon_trail' ? {
    ...l, icon: 'hand',
    // 从宝宝右下腹（画面左下）起，沿升结肠往上、横过上腹、沿降结肠下到左下腹（画面右下）：顺时针绕开肚脐
    points: [[33.5, 82.5], [33, 79], [34, 75.5], [36.5, 73], [39.5, 71.8], [43.5, 71.8], [46.5, 73], [49, 75.5], [50, 79], [49.8, 82.5]].map(([x, y]) => ({ x, y })),
  } : l);
scene.layers.unshift({
  id: 'belly', kind: 'skin', x: 31, y: 68, w: 21.5, h: 17, cold: false, points: [NAVEL], label: '脐带禁区 · 别碰',
  on: 'navel_danger > 0', level: 'clamp(pressure / 30, 0, 1) * (oil == 1 ? 1 : 0.4) * stroking',
});
if (sim.art?.scenes) sim.art.scenes.bench = url;
const { error: e2 } = await db.from('lab_chapters').update({ sim, updated_at: new Date().toISOString() }).eq('id', CHAPTER);
if (e2) throw e2;

// 老空间第 1 章在 skill_tasks.sim 上还有一份镜像：一起改
const { data: t } = await db.from('skill_tasks').select('sim').eq('id', TASK).single();
if (t?.sim?.steps?.some((s: any) => s.type === 'bench')) {
  const s2 = t.sim; const b2 = s2.steps.find((s: any) => s.type === 'bench');
  b2.bench.scene = scene; if (s2.art?.scenes) s2.art.scenes.bench = url;
  await db.from('skill_tasks').update({ sim: s2 }).eq('id', TASK);
}
// 角色表里的「工位」场景指到新素材
const { data: cast } = await db.from('lab_cast').select('id, name').eq('task_id', TASK).eq('kind', 'place').like('name', '工位：%');
for (const m of cast || []) await db.from('lab_cast').update({ asset_id: asset.id, name: '工位：新生儿抚触护理台' }).eq('id', m.id);
console.log('完成：底图、skin 层、手、轨迹已换；角色表工位', (cast || []).length, '条指到新素材');
