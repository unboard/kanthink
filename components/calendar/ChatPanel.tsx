'use client';

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

const STARTERS = [
  'What should we focus on this week to drive revenue?',
  'Add a fall HVAC email campaign targeting heating tune-ups.',
  "What's light in Q4? Fill the gaps.",
  'Give Erica an automation idea for September.',
];

export function ChatPanel({
  messages,
  loading,
  input,
  onInput,
  onSend,
  onClose,
}: {
  messages: ChatMsg[];
  loading: boolean;
  input: string;
  onInput: (v: string) => void;
  onSend: (text: string) => void;
  onClose?: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend(input);
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-neutral-200 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-neutral-900">Ask Kan</div>
          <div className="text-[11px] text-neutral-500">Plans every idea on your calendar</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Close chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="pt-2">
            <p className="mb-3 text-sm text-neutral-600">
              Kan knows every idea on the calendar and MyCreativeShop&apos;s products. Ask it to plan, fill gaps, or add an idea — new ideas always come through here.
            </p>
            <div className="space-y-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  className="block w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-[13px] text-neutral-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'border border-neutral-200 bg-white text-neutral-800'
              }`}
            >
              {m.role === 'assistant' ? (
                <div className="cal-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
              <div className="flex gap-1.5">
                <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-300" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-300" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-300" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-neutral-200 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-neutral-300 bg-white px-2.5 py-1.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder="Ask Kan to plan or add an idea…"
            className="max-h-28 flex-1 resize-none bg-transparent py-1.5 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
          <button
            onClick={() => onSend(input)}
            disabled={!input.trim() || loading}
            className="mb-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
