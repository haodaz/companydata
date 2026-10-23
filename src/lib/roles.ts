/**
 * 账号层级（2026-10-23）：
 *   admin       管理员：全部
 *   user        普通用户（数据 / 产品同事）：数据工厂 + 百业，百业和真活里只管自己的
 *   baiye_user  百业用户（对外开的账号）：只能用百业的模拟、真活、企业 / 科研 workspace，
 *               绝对碰不到、看不到数据资产（企业库、岗位库、采集工具、虚拟工厂、数据外采篮……）
 *
 * baiye_user 用白名单：只放下面列出的页面和接口，其余一律拒绝——以后数据那边新加页面 / 接口，默认也不对他们开放。
 * 闸口在 src/proxy.ts，角色每次按 system_users 实时判断（不信登录凭证里写的角色，降级立刻生效）。
 */
export const ROLES = ['admin', 'user', 'baiye_user'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { admin: '管理员', user: '普通用户（数据 / 产品）', baiye_user: '百业用户（只用百业）' };
/** 自助注册和管理员新加账号的默认角色：只开百业，数据资产要管理员手动升级 */
export const DEFAULT_ROLE: Role = 'baiye_user';

export const isRole = (r: unknown): r is Role => typeof r === 'string' && (ROLES as readonly string[]).includes(r);
export const isBaiyeOnly = (role?: string | null) => role === 'baiye_user';

/** baiye_user 能进的页面：百业（模拟）、真活、企业版 / 科研版 workspace、百业学院 */
export function baiyePageAllowed(pathname: string) {
  if (/^\/lab\/admin(\/|$)/.test(pathname)) return false;   // 百业后台（成本、交接包）只给内部
  return /^\/(lab|work|workspace|research|college)(\/|$)/.test(pathname)
    || ['/login', '/register'].includes(pathname);
}

/** baiye_user 能调的接口。注意 /api/lab/admin（百业后台：成本、交接包）不给 */
export function baiyeApiAllowed(pathname: string) {
  if (/^\/api\/lab\/admin(\/|$)/.test(pathname)) return false;
  return /^\/api\/(auth|lab|work|ws|college)(\/|$)/.test(pathname)
    || /^\/api\/admin\/work(\/|$)/.test(pathname)   // 真活出题 / 管自己的题（路由里再按归属检查）
    || pathname === '/api/kg/chat';                  // 「和我聊」数字职人对话
}
