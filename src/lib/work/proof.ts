/**
 * 作品核验（11-13 潜历 043：候选人想把做过的真活当求职的 proof of work，要能保存、最好改不了）。
 * PDF 谁都能改，所以不管文件，让它能被核对：作品存档上印核验码 + 二维码 + 交付原文的数字指纹（SHA-256），
 * 指向 /work/verify/<核验码> 只读页，页上是平台存的原件（候选人改不了）。原文改一个字，指纹就对不上。
 * 核验码 = 成绩单上一直印的那个验证码：ZH- + 作答编号去掉横线的前 10 位。
 */
import { createHash } from 'node:crypto';
import { supabaseAdmin as db } from '@/lib/supabase';

export const proofCode = (sid: string) => `ZH-${String(sid).replace(/-/g, '').slice(0, 10).toUpperCase()}`;
export const fingerprint = (text: string) => createHash('sha256').update(String(text || ''), 'utf8').digest('hex');

/** 核验码 → 作答（只认交了卷、出了报告、不是预览的） */
export async function sessionByCode(code: string) {
  const hex = String(code || '').trim().toUpperCase().replace(/^ZH-?/, '').toLowerCase();
  if (!/^[0-9a-f]{10}$/.test(hex)) return null;
  const head = `${hex.slice(0, 8)}-${hex.slice(8, 10)}`;
  const { data } = await db.from('work_sessions').select('id, task_id, participant, submitted_at, started_at, deliverable, events, report, score')
    .gte('id', `${head}00-0000-0000-000000000000`).lte('id', `${head}ff-ffff-ffff-ffffffffffff`).not('submitted_at', 'is', null).limit(2);
  const s = (data || []).find((x: any) => !x.participant?.preview && x.report);
  return s || null;
}

/** 交卷时还在的附件（删掉的不算） */
export function filesOf(events: any[]) {
  const removed = new Set((events || []).filter(e => e.type === 'file_remove').map(e => e.url));
  return (events || []).filter(e => e.type === 'file' && e.url && !removed.has(e.url)).map(e => ({ name: String(e.name || ''), url: String(e.url), size: Number(e.size) || 0 }));
}
