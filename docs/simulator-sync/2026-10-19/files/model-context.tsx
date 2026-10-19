'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export { MODEL_OPTIONS } from '@/lib/model-options';
import { MODEL_OPTIONS } from '@/lib/model-options';
import { LLM_MODEL } from '@/lib/model-config';

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
  // 默认主力模型（model-config）；浏览器里存过的选择只认选单里有的
  const [currentModel, setCurrentModel] = useState<string>(LLM_MODEL);

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
