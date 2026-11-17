'use client';

/**
 * AI 工作台的沙盒：Python 跑在候选人浏览器的 Web Worker 里（Pyodide，pandas / numpy / matplotlib），不占服务器、不联网。
 * 每次跑：把整个工作区写进 /work → 在 /work 下执行 → 把新增 / 改动 / 删掉的文件交回来。超时就把 Worker 整个换掉。
 */
import type { WsFile } from '@/lib/work/agent-bench';

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const BIN = /\.(png|jpe?g|gif|webp|xlsx|xls|pdf|zip|parquet|pkl)$/i;
const WORKER = `
importScripts('${PYODIDE}pyodide.js');
let py = null, ready = null;
const boot = () => ready || (ready = (async () => { py = await loadPyodide({ indexURL: '${PYODIDE}' }); await py.loadPackage(['numpy', 'pandas', 'matplotlib']); py.runPython("import os; os.environ['MPLBACKEND']='Agg'"); })());
const BIN = ${BIN.toString()};
const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromDataUrl = u => { const b = atob(String(u).split(',')[1] || ''); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
const mime = p => /\\.png$/i.test(p) ? 'image/png' : /\\.jpe?g$/i.test(p) ? 'image/jpeg' : /\\.gif$/i.test(p) ? 'image/gif' : /\\.webp$/i.test(p) ? 'image/webp' : /\\.pdf$/i.test(p) ? 'application/pdf' : 'application/octet-stream';
function walk(dir, out) { for (const n of py.FS.readdir(dir)) { if (n === '.' || n === '..' || n === '__pycache__') continue; const p = dir + '/' + n; const st = py.FS.stat(p); if (py.FS.isDir(st.mode)) walk(p, out); else out.push(p); } return out; }
onmessage = async e => {
  const { id, files, code, path, warm } = e.data;
  try {
    await boot();
    if (warm) { postMessage({ id, ok: true, warm: true }); return; }
    py.runPython("import shutil, os\\nshutil.rmtree('/work', ignore_errors=True)\\nos.makedirs('/work', exist_ok=True)\\nos.chdir('/work')");
    for (const f of files) { const p = '/work/' + f.path; py.FS.mkdirTree(p.slice(0, p.lastIndexOf('/'))); py.FS.writeFile(p, f.bin ? fromDataUrl(f.content) : f.content); }
    const before = new Map(files.map(f => [f.path, f.content]));
    const src = path ? new TextDecoder().decode(py.FS.readFile('/work/' + path)) : String(code || '');
    let out = '', err = '';
    py.setStdout({ batched: s => { if (out.length < 40000) out += s + '\\n'; } });
    py.setStderr({ batched: s => { if (err.length < 20000) err += s + '\\n'; } });
    let ok = true;
    try { await py.loadPackagesFromImports(src); await py.runPythonAsync(src, { globals: py.toPy({ __name__: '__main__', __file__: path ? '/work/' + path : '<code>' }), filename: path || '<code>' }); }
    catch (x) { ok = false; err += String(x && x.message || x); }
    try { py.runPython("import matplotlib.pyplot as _p; _p.close('all')"); } catch (_) {}
    const now = walk('/work', []).map(p => p.slice(6));
    const changed = [];
    for (const p of now) {
      const bin = BIN.test(p); const raw = py.FS.readFile('/work/' + p);
      const content = bin ? 'data:' + mime(p) + ';base64,' + toB64(raw) : new TextDecoder().decode(raw);
      if (before.get(p) !== content) changed.push({ path: p, content, bin });
    }
    const deleted = files.map(f => f.path).filter(p => !now.includes(p));
    postMessage({ id, ok, stdout: out, stderr: err, changed, deleted });
  } catch (x) { postMessage({ id, ok: false, stdout: '', stderr: 'Python 环境出错：' + String(x && x.message || x), changed: [], deleted: [] }); }
};`;

export type RunResult = { ok: boolean; stdout: string; stderr: string; changed: WsFile[]; deleted: string[]; ms: number; timeout?: boolean };

let worker: Worker | null = null, seq = 0;
const pending = new Map<number, (r: any) => void>();
function spawn() {
  const url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }));
  worker = new Worker(url);
  worker.onmessage = e => { const f = pending.get(e.data.id); if (f) { pending.delete(e.data.id); f(e.data); } };
  return worker;
}
const call = (msg: any, ms: number) => new Promise<any>(res => {
  const w = worker || spawn(); const id = ++seq;
  const timer = setTimeout(() => { pending.delete(id); w.terminate(); worker = null; res({ ok: false, timeout: true, stdout: '', stderr: `超过 ${Math.round(ms / 1000)} 秒没跑完，已经中止（死循环或数据太大？）`, changed: [], deleted: [] }); }, ms);
  pending.set(id, r => { clearTimeout(timer); res(r); });
  w.postMessage({ id, ...msg });
});

/** 进考试台就先把 Python 环境装好（第一次要下载十来 MB，约 10–30 秒） */
export const warmSandbox = () => call({ warm: true }, 180_000);

export async function runPython(files: WsFile[], opts: { path?: string; code?: string }): Promise<RunResult> {
  const t0 = Date.now();
  const r = await call({ files: files.map(f => ({ path: f.path, content: f.content, bin: !!f.bin })), path: opts.path, code: opts.code }, 90_000 + (worker ? 0 : 60_000));
  return { ok: !!r.ok, stdout: r.stdout || '', stderr: r.stderr || '', changed: (r.changed || []).map((f: any) => ({ path: f.path, content: f.content, ...(f.bin ? { bin: true } : {}) })), deleted: r.deleted || [], ms: Date.now() - t0, ...(r.timeout ? { timeout: true } : {}) };
}
