import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type LLMProvider = 'openai' | 'google';
export type Theme = 'spores'; // Only spores theme for now - others will be added back later
export type QuestionFrequency = 'off' | 'light' | 'moderate';

export interface AISettings {
  provider: LLMProvider;
  model: string;
  systemInstructions: string;
  // Note: apiKey is no longer stored client-side for security
  // BYOK keys are encrypted and stored server-side only
}

interface SettingsState {
  ai: AISettings;
  theme: Theme;
  questionFrequency: QuestionFrequency;
  shroomsExplainerDismissed: boolean;
  shroomsButtonHighlighted: boolean;
  _hasHydrated: boolean;
  _serverHasOwnerKey: boolean;
  _isSignedIn: boolean;
  _hasByokConfigured: boolean;
  _showSignUpOverlay: boolean;

  updateAISettings: (updates: Partial<AISettings>) => void;
  setTheme: (theme: Theme) => void;
  setQuestionFrequency: (frequency: QuestionFrequency) => void;
  setShroomsExplainerDismissed: (dismissed: boolean) => void;
  setShroomsButtonHighlighted: (highlighted: boolean) => void;
  setHasHydrated: (state: boolean) => void;
  setServerHasOwnerKey: (has: boolean) => void;
  setIsSignedIn: (signedIn: boolean) => void;
  setHasByokConfigured: (configured: boolean) => void;
  setShowSignUpOverlay: (show: boolean) => void;
}

const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'openai',
  model: '',
  systemInstructions: '',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ai: DEFAULT_AI_SETTINGS,
      theme: 'spores',
      questionFrequency: 'light',
      shroomsExplainerDismissed: false,
      shroomsButtonHighlighted: false,
      _hasHydrated: false,
      _serverHasOwnerKey: false,
      _isSignedIn: false,
      _hasByokConfigured: false,
      _showSignUpOverlay: false,

      updateAISettings: (updates) => {
        set((state) => ({
          ai: { ...state.ai, ...updates },
        }));
      },

      setTheme: (theme) => set({ theme }),

      setQuestionFrequency: (frequency) => set({ questionFrequency: frequency }),

      setShroomsExplainerDismissed: (dismissed) => set({ shroomsExplainerDismissed: dismissed }),

      setShroomsButtonHighlighted: (highlighted) => set({ shroomsButtonHighlighted: highlighted }),

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      setServerHasOwnerKey: (has) => set({ _serverHasOwnerKey: has }),

      setIsSignedIn: (signedIn) => set({ _isSignedIn: signedIn }),

      setHasByokConfigured: (configured) => set({ _hasByokConfigured: configured }),

      setShowSignUpOverlay: (show) => set({ _showSignUpOverlay: show }),
    }),
    {
      name: 'kanthink-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist UI preferences, not API keys
        ai: {
          provider: state.ai.provider,
          model: state.ai.model,
          systemInstructions: state.ai.systemInstructions,
        },
        theme: state.theme,
        questionFrequency: state.questionFrequency,
        shroomsExplainerDismissed: state.shroomsExplainerDismissed,
        shroomsButtonHighlighted: state.shroomsButtonHighlighted,
      }),
      onRehydrateStorage: () => (state) => {
        // Migrate invalid theme values to 'spores' (the only valid theme now)
        if (state && state.theme !== 'spores') {
          state.setTheme('spores');
        }
        state?.setHasHydrated(true);
      },
    }
  )
);

// Helper to check if AI is configured (user BYOK, server owner key, or signed-in user with server-side access)
export function isAIConfigured(): boolean {
  const { _serverHasOwnerKey, _isSignedIn, _hasByokConfigured } = useSettingsStore.getState();
  return _hasByokConfigured || _serverHasOwnerKey || _isSignedIn;
}

// Helper to require sign-in for AI features
// Returns true if user is signed in, otherwise shows sign-up overlay and returns false
export function requireSignInForAI(): boolean {
  const { _isSignedIn, setShowSignUpOverlay } = useSettingsStore.getState();
  if (_isSignedIn) {
    return true;
  }
  setShowSignUpOverlay(true);
  return false;
}

// Fetch server AI status on app load
export async function fetchAIStatus() {
  try {
    const [aiStatusRes, byokStatusRes] = await Promise.all([
      fetch('/api/ai-status'),
      fetch('/api/byok/status'),
    ]);

    if (aiStatusRes.ok) {
      const data = await aiStatusRes.json();
      useSettingsStore.getState().setServerHasOwnerKey(data.hasOwnerKey);
    }

    if (byokStatusRes.ok) {
      const data = await byokStatusRes.json();
      useSettingsStore.getState().setHasByokConfigured(data.configured);
      // Sync provider and model from server if configured
      if (data.configured && data.provider) {
        useSettingsStore.getState().updateAISettings({
          provider: data.provider,
          model: data.model || '',
        });
      }
    }
  } catch {
    // Silently fail - server status unavailable
  }
}

// Helper to get current AI config for LLM client
// Note: apiKey is no longer available client-side, all AI calls go through server
export function getAIConfig() {
  const { ai } = useSettingsStore.getState();
  return {
    provider: ai.provider,
    model: ai.model || undefined,
    systemInstructions: ai.systemInstructions,
  };
}

