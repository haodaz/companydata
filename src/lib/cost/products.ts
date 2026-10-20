/**
 * 两个产品的记账口径（2026-10-12，用户：「得拆开，咱们最后大概率也会拆开代码」）：
 *   百业（AI 百业，将来随 /lab 一起拆走）和数据工厂（挖公司数据）各有各的后台、各看各的钱。
 * 底层的记账表 token_usage_logs、价目表 model_pricing、token-logger 两边共用；按 tool_name 分产品。
 * 新加一种记账（tool_name）就在这里归到一边。
 */
export const COST_PRODUCTS = {
  lab: { label: 'AI 百业', tools: ['skill-lab', 'lab-art', 'lab-3d'] },
  factory: { label: '智能企业数据工厂', tools: ['finder', 'fetcher', 'structurer-job', 'company-profile', 'company-pipeline', 'company-deep-research', 'competition-radar', 'standard-radar', 'occupation', 'office-chief', 'office-chat', 'flywheel', 'job-tagging', 'work', 'workspace', 'unattributed', 'external'] },   // unattributed = llm-client 兜底记的；external = 系统外花费补记（Nebius 等）
} as const;
export type CostProduct = keyof typeof COST_PRODUCTS;
export const toolsOf = (p: CostProduct): string[] => [...COST_PRODUCTS[p].tools];
