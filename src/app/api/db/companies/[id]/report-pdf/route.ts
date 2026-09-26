import { NextResponse } from 'next/server';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * 企业深度画像报告 → PDF / 整页截图：用本机 Chrome 打开报告页（带当前登录 cookie），按 A4 打印或整页截图。
 *   GET /api/db/companies/:id/report-pdf            → application/pdf
 *   GET /api/db/companies/:id/report-pdf?format=png → 整页 PNG（网页截图，1440 宽）
 * Chrome 路径可用 CHROME_PATH 覆盖；默认 macOS 的 Google Chrome。
 */
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get('format') === 'png' ? 'png' : 'pdf';
  const cookie = req.headers.get('cookie') || '';
  const token = /(?:^|;\s*)auth_token=([^;]+)/.exec(cookie)?.[1] || '';
  if (!token) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
  const origin = `${url.protocol}//${url.host}`;
  let browser: any = null;
  try {
    const puppeteer = (await import('puppeteer-core')).default;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--hide-scrollbars', '--window-size=1440,900'] });
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
    return NextResponse.json({ success: false, error: e?.message || String(e), hint: `需要本机安装 Chrome（${path.basename(CHROME)}）或设置 CHROME_PATH` }, { status: 500 });
  } finally {
    try { await browser?.close(); } catch { /* ignore */ }
  }
}
