/**
 * 认人用的手机或邮箱（2026-11-09）：大家拿同一条链接，填了信息才变成个人的；同一道题同一个联系方式只对应一次作答。
 * 返回归一后的 key，格式不对返回空串。
 */
export function contactKey(v: unknown) {
  const x = String(v ?? '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) return x;
  const d = x.replace(/[\s()+-]/g, '').replace(/^(00)?86(?=1\d{10}$)/, '');
  return /^\d{7,15}$/.test(d) ? d : '';
}

/** 允许重做：拿掉这次作答的认人标记，同一个人再进来就是新的一次（旧的作答和报告留着） */
export function releaseContact(p: any) {
  const { contact_key: _k, ...rest } = p || {};
  return { ...rest, retake_allowed: true };
}
