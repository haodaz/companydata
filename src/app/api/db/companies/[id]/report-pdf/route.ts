import { NextResponse } from 'next/server';
import path from 'node:path';
import { requireDownload } from '@/lib/download-permission';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * 企业深度画像报告 → PDF / 整页截图：用本机 Chrome 打开报告页（带当前登录 cookie），按 A4 打印或整页截图。
 *   GET /api/db/companies/:id/report-pdf            → application/pdf
 *   GET /api/db/companies/:id/report-pdf?format=png → 整页 PNG（网页截图，1440 宽）
 * Chrome 路径可用 CHROME_PATH 覆盖；默认 macOS 的 Google Chrome。
 */
import fs from 'node:fs';
import os from 'node:os';

/**
 * 找一个能用的 Chromium：CHROME_PATH → 本机常见浏览器 → puppeteer 自己下载的 Chrome for Testing / headless-shell（~/.cache/puppeteer）
 * → Vercel 等无浏览器环境上若装了 @sparticuz/chromium 就用它。都没有返回 null，接口会退回"浏览器打印存 PDF"。
 * 注意 /Applications/Google Chrome.app 可能只是个空壳（2026-09-28 用户机器上就是），所以每个候选都要 existsSync 二进制本身。
 */
async function resolveBrowser(): Promise<{ executablePath: string; args?: string[]; headless?: any } | null> {
  const env = process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return { executablePath: env };
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Arc.app/Contents/MacOS/Arc',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return { executablePath: c };
  // puppeteer 缓存：chrome/<platform-version>/chrome-*/…，取版本号最大的
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'puppeteer');
  const verNum = (v: string) => (v.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number).reduce((a, b) => a * 100000 + b, 0);
  for (const kind of ['chrome', 'chrome-headless-shell']) {
    const base = path.join(cacheDir, kind);
    if (!fs.existsSync(base)) continue;
    const versions = fs.readdirSync(base).sort((a, b) => verNum(b) - verNum(a));
    for (const v of versions) {
      const dir = path.join(base, v);
      const sub = fs.readdirSync(dir).find(d => d.startsWith(kind + '-'));
      if (!sub) continue;
      const bins = kind === 'chrome'
        ? [path.join(dir, sub, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'), path.join(dir, sub, 'chrome'), path.join(dir, sub, 'chrome.exe')]
        : [path.join(dir, sub, 'chrome-headless-shell'), path.join(dir, sub, 'chrome-headless-shell.exe')];
      for (const b of bins) if (fs.existsSync(b)) return { executablePath: b };
    }
  }
  // 无浏览器的 serverless（Vercel）：装了 @sparticuz/chromium 就用它（可选依赖，没装就跳过）
  try {
    const mod: any = await import(/* webpackIgnore: true */ '@sparticuz/chromium' as any);
    const chromium = mod.default || mod;
    const executablePath = await chromium.executablePath();
    if (executablePath) return { executablePath, args: chromium.args, headless: chromium.headless };
  } catch { /* 没装 */ }
  return null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // 下载门禁：admin 或已获批准的用户才放行，放行时记下载日志（报告页本身的渲染 ?print=1 不拦）
  const denied = await requireDownload(req); if (denied) return denied;
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get('format') === 'png' ? 'png' : 'pdf';
  const cookie = req.headers.get('cookie') || '';
  const token = /(?:^|;\s*)auth_token=([^;]+)/.exec(cookie)?.[1] || '';
  if (!token) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
  const origin = `${url.protocol}//${url.host}`;
  let browser: any = null;
  try {
    const found = await resolveBrowser();
    if (!found) {
      // 没有可用的 Chromium：退回报告页自动弹打印，用户在浏览器里"存为 PDF"（Vercel 上没装 @sparticuz/chromium 时就是这条路）
      return NextResponse.redirect(`${origin}/admin/db-company/${id}/report?print=1&auto=1&logged=1&format=${format}`, 302);
    }
    const puppeteer = (await import('puppeteer-core')).default;
    browser = await puppeteer.launch({ executablePath: found.executablePath, headless: found.headless ?? true, args: [...(found.args || []), '--no-sandbox', '--hide-scrollbars', '--window-size=1440,900'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: format === 'png' ? 2 : 1 });
    await browser.setCookie({ name: 'auth_token', value: token, domain: url.hostname, path: '/' });
    await page.goto(`${origin}/admin/db-company/${id}/report?print=1`, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForSelector('.dr-paper', { timeout: 60000 });
    await new Promise(r => setTimeout(r, 1200));
    const name = await page.$eval('.dr-cover h1', (el: any) => el.textContent || '').catch(() => `company-${id}`);
    const safe = String(name).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || `company-${id}`;
    if (format === 'png') {
      const buf = await page.screenshot({ fullPage: true, type: 'png' });
      return new NextResponse(Buffer.from(buf), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safe)}_report.png` } });
    }
    await page.emulateMediaType('print');
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' }, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: `<div style="width:100%;font-size:8px;color:#888;text-align:center;font-family:sans-serif">智能企业数据工厂 · 平方创想 VisionSquare · <span class="pageNumber"></span> / <span class="totalPages"></span></div>` });
    return new NextResponse(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safe)}_report.pdf` } });
  } catch (e: any) {
    console.error('[report-pdf]', e);
    return NextResponse.json({ success: false, error: e?.message || String(e), hint: '服务器上的 Chromium 启动失败；可设置 CHROME_PATH 指向可用的 Chrome / Edge，或直接打开报告页用浏览器"打印 → 存为 PDF"' }, { status: 500 });
  } finally {
    try { await browser?.close(); } catch { /* ignore */ }
  }
}
