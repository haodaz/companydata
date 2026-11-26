import type { Metadata } from 'next';
import { supabaseAdmin as db } from '@/lib/supabase';

/**
 * 参与链接的分享卡片（11-26 潜历：「整场 180 分钟的限时是打开链接之后才知道的」）：
 * 链接发到微信 / 钉钉时，卡片上就写清任务名、企业、时长和要交几份。只读公开信息（已发布的任务）。
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  try {
    const { data: t } = await db.from('work_tasks').select('status, company_name, task').eq('share_token', token).maybeSingle();
    if (!t || !['published', 'ready'].includes(t.status) || !t.task?.title) return {};
    const en = t.task.lang === 'en';
    const n = Array.isArray(t.task.deliverables) ? t.task.deliverables.length : 0;
    const time = t.task.no_limit ? (en ? 'No time limit' : '不限时') : t.task.soft_limit ? (en ? `${t.task.time_minutes} min suggested` : `建议 ${t.task.time_minutes} 分钟`) : (en ? `${t.task.time_minutes}-minute limit` : `限时 ${t.task.time_minutes} 分钟，开始后不暂停`);
    const until = t.task.open_until ? new Date(t.task.open_until).toLocaleDateString(en ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric' }) : '';
    const desc = en
      ? `${t.company_name || ''} · ${time} · ${n} deliverable${n === 1 ? '' : 's'}${until ? ` · open until ${until}` : ''}`
      : `${t.company_name || ''} · ${time} · 交 ${n} 份${until ? ` · 开放到 ${until}` : ''}`;
    return { title: t.task.title, description: desc, openGraph: { title: t.task.title, description: desc } };
  } catch { return {}; }
}

export default function TaskLayout({ children }: { children: React.ReactNode }) { return children; }
