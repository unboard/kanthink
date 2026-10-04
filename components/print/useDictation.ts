'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal typings for the Web Speech API (not in lib.dom).
interface SRResult {
  0: { transcript: string }
  isFinal: boolean
}
interface SREvent {
  results: { length: number; [i: number]: SRResult }
}
interface SRInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SREvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: unknown) => void) | null
  start(): void
  stop(): void
}
type SRCtor = new () => SRInstance

function getCtor(): SRCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/**
 * Talk instead of type. While listening, `onText` receives everything heard so far in
 * this session (final and in-progress words), so a text box can show it live. Stops
 * on its own after a pause, or when `stop` is called.
 */
export function useDictation(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const rec = useRef<SRInstance | null>(null)
  const onTextRef = useRef(onText)
  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  useEffect(() => {
    // One-time capability check on mount, so SSR doesn't pin it false.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getCtor() != null)
    return () => rec.current?.stop()
  }, [])

  const stop = useCallback(() => {
    rec.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor || rec.current) return
    const r = new Ctor()
    r.continuous = false
    r.interimResults = true
    r.lang = 'en-US'
    r.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      onTextRef.current(text.trim())
    }
    r.onend = () => {
      rec.current = null
      setListening(false)
    }
    r.onerror = () => {
      rec.current = null
      setListening(false)
    }
    rec.current = r
    setListening(true)
    r.start()
  }, [])

  return { supported, listening, start, stop, toggle: listening ? stop : start }
}

/** Read a line aloud, for people who are still learning to read. */
export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.95
  u.pitch = 1.1
  window.speechSynthesis.speak(u)
}
