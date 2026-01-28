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
  _serverHasOwnerKey: boolean;

  updateAISettings: (updates: Partial<AISettings>) => void;
  setTheme: (theme: Theme) => void;
  setQuestionFrequency: (frequency: QuestionFrequency) => void;
  setHasHydrated: (state: boolean) => void;
  setServerHasOwnerKey: (has: boolean) => void;
}

const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'openai',
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
      _serverHasOwnerKey: false,

      updateAISettings: (updates) => {
        set((state) => ({
          ai: { ...state.ai, ...updates },
        }));
      },

      setTheme: (theme) => set({ theme }),

      setQuestionFrequency: (frequency) => set({ questionFrequency: frequency }),

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      setServerHasOwnerKey: (has) => set({ _serverHasOwnerKey: has }),
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

// Helper to check if AI is configured (user BYOK or server owner key)
export function isAIConfigured(): boolean {
  const { ai, _serverHasOwnerKey } = useSettingsStore.getState();
  return !!ai.apiKey || _serverHasOwnerKey;
}

// Fetch server AI status on app load
export async function fetchAIStatus() {
  try {
    const res = await fetch('/api/ai-status');
    if (res.ok) {
      const data = await res.json();
      useSettingsStore.getState().setServerHasOwnerKey(data.hasOwnerKey);
    }
  } catch {
    // Silently fail - client key check still works
  }
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

