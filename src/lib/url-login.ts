/**
 * 把「需登录」写回信息源库（同一网址在几家企业下各有一条的，一起标）。仅服务端。
 * 迁移 013 还没跑时列不存在，写失败静默跳过——标记是旁路，不能让抓取失败。
 */
import { supabaseAdmin } from '@/lib/supabase';
import type { LoginVerdict } from '@/lib/agents/login-wall';

export async function markLogin(url: string, v: LoginVerdict) {
  try {
    await supabaseAdmin.from('url_sources')
      .update({ requires_login: v.login, login_reason: v.reason || null, login_checked_at: new Date().toISOString() })
      .eq('url', url);
  } catch { /* 旁路 */ }
}
