import type { Metadata } from 'next';

// 真活是独立品牌：标签页标题 / 分享卡片不能顶着根布局的「智能企业数据工厂」
const TITLE = '百业AI｜真活 · 寻找真人才，看他干真活';
const DESC = 'True work, true talent. 给一家企业、一个岗位，生成此刻真实的业务题；候选人在操作台上做或用自己的软件做并录屏，AI 记录过程、逐条评价、和基线对照。';
export const metadata: Metadata = {
  title: { default: TITLE, template: '%s · 百业AI｜真活' },
  description: DESC,
  applicationName: '百业AI｜真活',
  openGraph: { title: TITLE, description: DESC, siteName: '百业AI｜真活', type: 'website', locale: 'zh_CN' },
};

export default function WorkLayout({ children }: { children: React.ReactNode }) { return children; }
