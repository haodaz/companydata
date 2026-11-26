/**
 * 交付文件 AI 读不读得了（11-26 潜历：传了 Keynote，上传时没任何提示，评估时读不了拿了低分；白板附件写着「PPT 都行」）。
 * 和评估时真正能读的保持一致（lib/work/recording.ts 的 readTextFiles）：文本、PDF、Word、Excel、PPT（.pptx）、图片、压缩包；
 * 音视频原样留给企业看、不参与评估；其余格式读不了——上传那一刻就提示怎么转。前后端都能用（纯函数）。
 */
const READABLE = /\.(txt|md|csv|json|tsv|pdf|docx|xlsx?|pptx|png|jpe?g|webp|gif|zip)$/i;
const MEDIA = /\.(mp4|mov|m4v|webm|avi|mkv|mp3|m4a|wav)$/i;

const HOWTO: [RegExp, string, string][] = [
  [/\.key$/i, 'Keynote 读不了：在 Keynote 里「文件 → 导出为 → PDF」再传', "Keynote files can't be read: export to PDF (File → Export To → PDF) and upload that"],
  [/\.pages$/i, 'Pages 读不了：导出成 PDF 或 Word 再传', "Pages files can't be read: export to PDF or Word and upload that"],
  [/\.numbers$/i, 'Numbers 读不了：导出成 Excel 或 CSV 再传', "Numbers files can't be read: export to Excel or CSV and upload that"],
  [/\.(ppt|pps|ppsx)$/i, '老版 PPT 读不了：另存为 .pptx 或 PDF 再传', "Old PowerPoint files can't be read: save as .pptx or PDF and upload that"],
  [/\.doc$/i, '老版 Word 读不了：另存为 .docx 或 PDF 再传', "Old Word files can't be read: save as .docx or PDF and upload that"],
  [/\.(heic|heif|bmp|tiff?|svg)$/i, '这种图片格式读不了：存成 PNG 或 JPG 再传', "This image format can't be read: save as PNG or JPG and upload that"],
  [/\.(psd|ai|sketch|fig|xd|cdr|dwg|dxf|skp)$/i, '设计 / 图纸源文件读不了：导出成 PNG 或 PDF 再传（源文件可以一起留着给企业看）', "Design source files can't be read: export to PNG or PDF and upload that too (the source file can stay for the company)"],
  [/\.(rar|7z|tar|gz)$/i, '只认 .zip 压缩包：重新压成 zip 再传', 'Only .zip archives can be read: re-zip and upload'],
];

/** 读得了 → null；读不了 / 不参与评估 → 一句提示（中英） */
export function fileWarn(name: string, lang?: string): string | null {
  const n = String(name || '');
  const en = lang === 'en';
  if (READABLE.test(n)) return null;
  if (MEDIA.test(n)) return en ? 'Audio / video is kept for the company to watch but is not evaluated' : '音视频会原样留给企业看，不参与评估';
  const hit = HOWTO.find(([re]) => re.test(n));
  if (hit) return en ? hit[2] : hit[1];
  return en ? "AI can't read this format: convert to PDF, image, Word, Excel or PowerPoint (.pptx) and upload that" : 'AI 读不了这种格式：转成 PDF、图片、Word、Excel 或 PPT（.pptx）再传';
}

/** 上传控件 accept 里提示的格式（不拦，只引导） */
export const READABLE_HINT_ZH = 'PDF、Word、Excel、PPT（.pptx）、图片、文本、zip 都读得了；Keynote / Pages / Numbers / 设计源文件请先导出 PDF 或图片';
export const READABLE_HINT_EN = 'PDF, Word, Excel, PowerPoint (.pptx), images, text and zip can be read; export Keynote / Pages / Numbers / design source files to PDF or images first';
