'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

/** badge：模型切换处显示的提醒标记（所有模型下拉共用，加新入口时不会漏） */
export const MODEL_OPTIONS: { id: string; label: string; provider: string; modelName: string; badge?: string }[] = [
  // Google Gemini
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', provider: 'Google', modelName: 'gemini-3.8-flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', provider: 'Google', modelName: 'gemini-3.6-flash' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', provider: 'Google', modelName: 'gemini-3.1-pro-preview' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', provider: 'Google', modelName: 'gemini-3.5-flash' },
  // OpenAI GPT
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', provider: 'OpenAI', modelName: 'gpt-6-astra', badge: '很贵🥹🥹' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', provider: 'OpenAI', modelName: 'gpt-5.6-terra' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', provider: 'OpenAI', modelName: 'gpt-5.6-luna' },
];

/** 「很贵」这类提醒标记的统一样式 */
export function ModelBadge({ text }: { text?: string }) {
  if (!text) return null;
  return <span style={{ fontSize: 10, color: '#e8590c', background: '#fff4e6', borderRadius: 6, padding: '1px 5px', marginLeft: 6, fontWeight: 500, lineHeight: '16px', whiteSpace: 'nowrap' }}>{text}</span>;
}

type ModelContextType = {
  currentModel: string;
  setCurrentModel: (id: string) => void;
  modelLabel: string;
};

const ModelContext = createContext<ModelContextType | undefined>(undefined);

export function ModelProvider({ children }: { children: React.ReactNode }) {
  const [currentModel, setCurrentModel] = useState<string>('gemini-3.8-flash');

  useEffect(() => {
    const saved = localStorage.getItem('cd_current_model');
    if (saved && MODEL_OPTIONS.find(m => m.id === saved)) {
      setCurrentModel(saved);
    }
  }, []);

  const handleSetModel = (id: string) => {
    setCurrentModel(id);
    localStorage.setItem('cd_current_model', id);
  };

  const modelLabel = MODEL_OPTIONS.find(m => m.id === currentModel)?.label || currentModel;

  return (
    <ModelContext.Provider value={{ currentModel, setCurrentModel: handleSetModel, modelLabel }}>
      {children}
    </ModelContext.Provider>
  );
}

export function useModel() {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error('useModel must be used within ModelProvider');
  return ctx;
}
