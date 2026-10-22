/**
 * 真活插件（2026-10-22）：第四种作答方式——候选人用自己的工具（网页版文档 / 设计 / 各家 AI）做，浏览器插件只在答题期间记：
 * 打开 / 切换了哪些网页、页面上显示的文字（AI 网站上的对话照样读下来）、打字和粘贴的量。和「数据外采篮」完全是两个东西。
 * 一次作答 = 一个真活码；插件凭真活码把记到的东西挂到这次作答上。介绍 / 下载 / 启动页：/work/plugin。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { randomInt } from 'node:crypto';

/** 认得出来的 AI 网站：在这些网站上读到的页面文字记成「和 AI 的对话」 */
export const AI_HOSTS = ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com', 'kimi.moonshot.cn', 'kimi.com', 'doubao.com', 'tongyi.aliyun.com', 'qianwen.aliyun.com', 'chat.qwen.ai', 'chat.deepseek.com', 'yiyan.baidu.com', 'chatglm.cn', 'yuanbao.tencent.com', 'metaso.cn', 'poe.com', 'perplexity.ai', 'copilot.microsoft.com', 'tiangong.cn', 'xinghuo.xfyun.cn', 'hailuoai.com', 'chat.mistral.ai', 'grok.com'];
export const isAiHost = (host: string) => AI_HOSTS.some(h => host === h || host.endsWith('.' + h));

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 去掉 0 O 1 I L，口头念、手抄都不会错
export const newCode = () => Array.from({ length: 6 }, () => ALPHA[randomInt(ALPHA.length)]).join('');
export const normCode = (c: string) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

/** 真活码 → 这次作答 + 题（只取插件要用的字段） */
export async function sessionByCode(code: string) {
  const c = normCode(code);
  if (c.length !== 6) return null;
  const { data: s } = await db.from('work_sessions').select('id, task_id, participant, started_at, submitted_at, deliverable, events, ai_chat, report').eq('participant->>code', c).maybeSingle();
  if (!s) return null;
  const { data: t } = await db.from('work_tasks').select('id, share_token, status, company_name, role, task, materials').eq('id', s.task_id).maybeSingle();
  if (!t) return null;
  return { s, t };
}

/** 插件传上来的事件只收这些类型，字段截短（页面文字单独限长） */
const TYPES = new Set(['plugin_start', 'plugin_stop', 'visit', 'page', 'edit', 'paste', 'copy', 'idle', 'warn']);
export function cleanEvents(raw: any[]): any[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 300).filter(e => TYPES.has(String(e?.type))).map(e => ({
    t: Math.max(0, Math.round(Number(e.t) || 0)), type: String(e.type),
    ...(e.host ? { host: String(e.host).slice(0, 80) } : {}),
    ...(e.note ? { note: String(e.note).slice(0, 160) } : {}),
    ...(e.chars != null ? { chars: Math.max(0, Number(e.chars) || 0) } : {}),
    ...(e.delta != null ? { delta: Number(e.delta) || 0 } : {}),
    ...(e.text ? { text: String(e.text).slice(0, 2000) } : {}),
    src: 'plugin',
  }));
}
