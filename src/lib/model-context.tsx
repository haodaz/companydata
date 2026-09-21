'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export const MODEL_OPTIONS = [
  // Google Gemini
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', provider: 'Google', modelName: 'gemini-3.8-flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', provider: 'Google', modelName: 'gemini-3.6-flash' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', provider: 'Google', modelName: 'gemini-3.1-pro-preview' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', provider: 'Google', modelName: 'gemini-3.5-flash' },
  // OpenAI GPT
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', provider: 'OpenAI', modelName: 'gpt-6-astra' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', provider: 'OpenAI', modelName: 'gpt-5.6-terra' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', provider: 'OpenAI', modelName: 'gpt-5.6-luna' },
];

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
