import { useSettingsStore } from '@/lib/settingsStore';

/**
 * Returns true when voice features are available:
 * - Provider is OpenAI (BYOK or owner key)
 * - User has AI access
 */
export function useVoiceAvailability(): boolean {
  const provider = useSettingsStore((s) => s.ai.provider);
  const hasByok = useSettingsStore((s) => s._hasByokConfigured);
  const hasOwnerKey = useSettingsStore((s) => s._serverHasOwnerKey);
  return (hasByok || hasOwnerKey) && provider === 'openai';
}
