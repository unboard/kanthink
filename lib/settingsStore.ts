import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type LLMProvider = 'anthropic' | 'openai';
export type Theme = 'default' | 'terminal';
export type QuestionFrequency = 'off' | 'light' | 'moderate';

export interface AISettings {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  systemInstructions: string;
}

interface SettingsState {
  ai: AISettings;
  theme: Theme;
  questionFrequency: QuestionFrequency;
  _hasHydrated: boolean;

  updateAISettings: (updates: Partial<AISettings>) => void;
  setTheme: (theme: Theme) => void;
  setQuestionFrequency: (frequency: QuestionFrequency) => void;
  setHasHydrated: (state: boolean) => void;
}

const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'anthropic',
  apiKey: '',
  model: '',
  systemInstructions: '',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ai: DEFAULT_AI_SETTINGS,
      theme: 'default',
      questionFrequency: 'light',
      _hasHydrated: false,

      updateAISettings: (updates) => {
        set((state) => ({
          ai: { ...state.ai, ...updates },
        }));
      },

      setTheme: (theme) => set({ theme }),

      setQuestionFrequency: (frequency) => set({ questionFrequency: frequency }),

      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'kanthink-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        ai: state.ai,
        theme: state.theme,
        questionFrequency: state.questionFrequency,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// Helper to check if AI is configured
export function isAIConfigured(): boolean {
  const { ai } = useSettingsStore.getState();
  return !!ai.apiKey;
}

// Helper to get current AI config for LLM client
export function getAIConfig() {
  const { ai } = useSettingsStore.getState();
  return {
    provider: ai.provider,
    apiKey: ai.apiKey,
    model: ai.model || undefined,
    systemInstructions: ai.systemInstructions,
  };
}

