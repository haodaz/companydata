/**
 * 「和我聊」提问的话题归类（职业问答日志的热力分析 / 排产建议用）。关键词规则：不花钱、可复现；一个问题可以落多个话题。
 * fill：这个话题缺了该补职业的哪一块（对应 fillOccupationPart 的 part）；tool：补不了的去哪个采集工具。
 */
export interface QuestionTopic { key: string; label: string; kw: string[]; fill?: string; tool?: { label: string; path: string } }

export const QUESTION_TOPICS: QuestionTopic[] = [
  { key: 'salary', label: '薪资待遇', kw: ['薪', '工资', '钱', '收入', '待遇', '福利', '月薪', '年薪', '涨'], fill: 'regions' },
  { key: 'entry', label: '入行与要求', kw: ['入行', '门槛', '学历', '专业', '要求', '条件', '零基础', '没经验', '转行', '应届', '实习', '面试'], fill: 'profile' },
  { key: 'career', label: '发展晋升', kw: ['晋升', '升', '发展', '路径', '天花板', '管理', '几年', '资深', '主管', '经理', '总监'], fill: 'career' },
  { key: 'daily', label: '日常工作', kw: ['一天', '每天', '日常', '忙', '加班', '累', '班', '作息', '干什么', '做什么'], fill: 'tasks' },
  { key: 'jobs', label: '在招岗位', kw: ['在招', '招聘', '招人', '哪些公司', '哪家', '岗位', '投递', '校招', '机会'], tool: { label: '校招岗位提取', path: '/admin/tool-job' } },
  { key: 'standard', label: '操作规范与标准', kw: ['规范', '标准', '规程', '流程', '步骤', '注意', '安全', '出错', '失误', '检查'], fill: 'tasks', tool: { label: '行业标准获取', path: '/admin/tool-standard' } },
  { key: 'tools', label: '工具设备与场所', kw: ['工具', '设备', '机器', '仪器', '软件', '系统', '在哪', '环境', '场所', '车间'], fill: 'context' },
  { key: 'outlook', label: '行业前景', kw: ['前景', '趋势', '未来', '取代', '替代', '淘汰', '饱和', '政策', '行情', 'AI', '稳定'] },
  { key: 'learn', label: '证书与学习', kw: ['证书', '考证', '资格', '认证', '学', '课程', '培训', '书'], fill: 'profile' },
];
export const OTHER_TOPIC = { key: 'other', label: '其它' };

export function topicsOf(q: string): string[] {
  const t = QUESTION_TOPICS.filter(x => x.kw.some(k => q.includes(k))).map(x => x.key);
  return t.length ? t : ['other'];
}
export const topicLabel = (k: string) => QUESTION_TOPICS.find(t => t.key === k)?.label || OTHER_TOPIC.label;
