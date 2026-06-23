import { useEffect, useRef, useState } from 'react';

// Minimal typings for the Web Speech API (not in lib.dom).
interface SRAlternative { transcript: string }
interface SRResult { 0: SRAlternative; isFinal: boolean }
interface SREvent { results: { length: number;[i: number]: SRResult }; resultIndex: number }
interface SRInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start(): void;
  stop(): void;
}
type SRCtor = new () => SRInstance;

function getCtor(): SRCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Live speech-to-text captions from the default microphone (Chrome/Edge).
 * While `enabled`, calls `onCaption` with a rolling window of the most recent
 * words; clears it on stop. Auto-restarts since the recognizer ends on silence.
 */
export function useSpeechCaptions(enabled: boolean, onCaption: (text: string) => void) {
  // Detected on mount (not in a useState initializer) so SSR doesn't pin it false.
  const [supported, setSupported] = useState(false);
  const activeRef = useRef(false);
  const onCaptionRef = useRef(onCaption);
  useEffect(() => { onCaptionRef.current = onCaption; }, [onCaption]);

  useEffect(() => {
    // One-time browser capability check on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getCtor() != null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const Ctor = getCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      let text = '';
      const from = Math.max(0, e.results.length - 4);
      for (let i = from; i < e.results.length; i++) text += `${e.results[i][0].transcript} `;
      const words = text.trim().split(/\s+/).filter(Boolean);
      onCaptionRef.current(words.slice(-14).join(' '));
    };
    rec.onend = () => {
      if (activeRef.current) { try { rec.start(); } catch { /* already started */ } }
    };
    rec.onerror = () => { /* transient; onend will restart */ };

    activeRef.current = true;
    try { rec.start(); } catch { /* noop */ }

    return () => {
      activeRef.current = false;
      try { rec.stop(); } catch { /* noop */ }
      onCaptionRef.current('');
    };
  }, [enabled]);

  return { supported };
}
