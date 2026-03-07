/**
 * Lightweight shared voice state — tracks whether the last user input was via voice
 * so chat surfaces can auto-play AI responses via TTS.
 */
export const voiceState = {
  lastInputWasVoice: false,
};

/**
 * Call after receiving an AI response. If the last input was voice,
 * auto-plays the response via TTS and resets the flag.
 */
export async function speakIfVoiceInput(text: string): Promise<void> {
  if (!voiceState.lastInputWasVoice || !text.trim()) return;
  voiceState.lastInputWasVoice = false;

  try {
    const res = await fetch('/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) return;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.onerror = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch {
    // Silent failure — TTS is best-effort
  }
}
