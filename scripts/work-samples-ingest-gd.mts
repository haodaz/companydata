/**
 * 职业技能等级认定实操考核 → 深度样本（2026-10-24）：广东人社「样题和技能操作考核准备通知单」的 zip 包。
 * 每个等级（三级 / 四级 / 五级）合成一份样本：技能考核试卷 / 样题 + 评分记录表 + 考场考生准备通知单（.doc 用 macOS textutil 抽字；图纸 PDF 只抽文字）。理论考核不要。
 *   npx tsx scripts/work-samples-ingest-gd.mts <zip...> [--dry] [--model claude-sonnet-5-5]
 */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execFileSync } from 'node:child_process';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const argv = process.argv.slice(2); const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ZIPS = argv.filter(a => !a.startsWith('--') && a.endsWith('.zip')), DRY = argv.includes('--dry'), MODEL = opt('model', 'claude-sonnet-5-5');
const { parseSample, saveSample, listSamples } = await import('../src/lib/work/samples');

function unzip(zip: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-')); 
  execFileSync('python3', ['-c', `
import zipfile,os,sys
with zipfile.ZipFile(sys.argv[1]) as f:
    for i in f.infolist():
        try: n = i.filename.encode('cp437').decode('gbk')
        except Exception: n = i.filename
        if i.filename.endswith('/'): continue
        out = os.path.join(sys.argv[2], n); os.makedirs(os.path.dirname(out), exist_ok=True); open(out,'wb').write(f.read(i))
`, zip, dir]);
  return dir;
}
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
async function textOf(f: string): Promise<string> {
  const ext = path.extname(f).toLowerCase();
  if (ext === '.doc' || ext === '.docx') { try { return execFileSync('textutil', ['-convert', 'txt', '-stdout', f], { maxBuffer: 50e6 }).toString('utf8'); } catch { return ''; } }
  if (ext === '.pdf') { try { const { extractText, getDocumentProxy } = await import('unpdf'); const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(f))); const { text } = await extractText(pdf, { mergePages: true }); return String(text || ''); } catch { return ''; } }
  return '';
}
const clean = (t: string) => t.replace(/EMBED Equation\.\w+/g, '').replace(/\u0007/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

const have = new Set((await listSamples({ sharedOnly: true })).map(x => x.title));
for (const zip of ZIPS) {
  let dir: string; try { dir = unzip(zip); } catch (e: any) { console.log(`== ${zip}：解不开（${String(e.message).slice(0, 60)}），跳过`); continue; }
  const files = walk(dir);
  const trade = path.basename(zip).replace(/^\d+/, '').replace(/\.zip$/, '');
  // 按等级分组：路径里带「三级 / 四级 / 五级」；排除理论
  const levels = new Map<string, string[]>();
  for (const f of files) { const rel = path.relative(dir, f); if (/理论/.test(rel)) continue; const lv = (rel.match(/[三四五二一]级/) || ['通用'])[0]; (levels.get(lv) || levels.set(lv, []).get(lv)!).push(f); }
  for (const [lv, fl] of levels) {
    const title = `${trade} · ${lv}技能考核样题（广东人社）`;
    const parts: string[] = [];
    for (const f of fl) { const rel = path.relative(dir, f); const t = clean(await textOf(f)); if (t.length > 80) parts.push(`### 文件：${rel.split('/').pop()}\n${t.slice(0, 12000)}`); }
    const raw = parts.join('\n\n');
    console.log(`== ${title}：${fl.length} 个文件，取字 ${raw.length}`);
    if (DRY || raw.length < 400 || have.has(title)) { if (have.has(title)) console.log('  已有，跳过'); continue; }
    try {
      const k = await parseSample(raw, { title, model: MODEL, actor: 'ingest', kind: 'practical' });
      if (!k.stages.length) { console.log('  ✗ 没解析出考核项目'); continue; }
      k.title = title; k.format = 'practical'; k.problem_type = k.problem_type || '实操考核';
      await saveSample(k, raw, { source_name: `广东人社 技能等级认定 · ${trade}`, created_by: 'ingest@pingfang', shared: true });
      console.log(`  ✓ ${k.stages.length} 个考核项目 · ${k.industry} · ${k.difficulty} · 手法 ${k.style_notes.length} 条`);
    } catch (e: any) { console.log('  ✗', String(e.message).slice(0, 120)); }
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exit(0);
