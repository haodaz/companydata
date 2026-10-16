/**
 * 模型选单：页面上所有模型下拉、命令行脚本的 --model 都从这里取，改模型只改这里。
 * badge：模型切换处显示的提醒标记（所有模型下拉共用，加新入口时不会漏）。
 */
export const MODEL_OPTIONS: { id: string; label: string; provider: string; modelName: string; badge?: string }[] = [
  // Google Gemini
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', provider: 'Google', modelName: 'gemini-3.8-flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', provider: 'Google', modelName: 'gemini-3.6-flash' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', provider: 'Google', modelName: 'gemini-3.1-pro-preview' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', provider: 'Google', modelName: 'gemini-3.5-flash' },
  // 阿里云通义千问（联网检索走阿里云搜索，国内企业首选）
  { id: 'qwen-plus', label: '通义千问 Plus（阿里云搜索）', provider: 'Aliyun', modelName: 'qwen-plus', badge: '国内' },
  { id: 'qwen-max', label: '通义千问 Max（阿里云搜索）', provider: 'Aliyun', modelName: 'qwen-max' },
  { id: 'qwen-flash', label: '通义千问 Flash（阿里云搜索）', provider: 'Aliyun', modelName: 'qwen-flash', badge: '便宜' },
  { id: 'qwen3.7-plus', label: '通义千问 3.7 Plus（阿里云搜索）', provider: 'Aliyun', modelName: 'qwen3.7-plus' },
  { id: 'qwen3.6-plus', label: '通义千问 3.6 Plus（阿里云搜索）', provider: 'Aliyun', modelName: 'qwen3.6-plus' },
  { id: 'qwen3.7-max', label: '通义千问 3.7 Max（阿里云搜索）', provider: 'Aliyun', modelName: 'qwen3.7-max' },
  // OpenAI GPT
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', provider: 'OpenAI', modelName: 'gpt-6-astra', badge: '很贵🥹🥹' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', provider: 'OpenAI', modelName: 'gpt-5.6-terra' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', provider: 'OpenAI', modelName: 'gpt-5.6-luna' },
];

export const isKnownModel = (id: string) => MODEL_OPTIONS.some(m => m.id === id);
