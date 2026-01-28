'use client';

import { useState, useEffect, useCallback } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

const messages = [
  {
    text: "Hey! I'm Kan.",
    weight: 'bold' as const,
  },
  {
    text: 'I live in a kanban board. Each channel you create is a new space for me to explore\u2014columns are the rooms, cards are the furniture.',
    weight: 'normal' as const,
  },
  {
    text: 'Chat with me, give me tasks, point me at something interesting. I\u2019ll research, organize, and rearrange the place.',
    weight: 'normal' as const,
  },
  {
    text: 'The more we work together, the more I learn what belongs where.',
    weight: 'normal' as const,
  },
  {
    text: 'Ready to build your first channel?',
    weight: 'accent' as const,
  },
];

const MESSAGE_INTERVAL = 900;

interface KanWelcomeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: () => void;
}

export function KanWelcomeOverlay({
  isOpen,
  onClose,
  onCreate,
}: KanWelcomeOverlayProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [iconReady, setIconReady] = useState(false);

  const allVisible = visibleCount >= messages.length;

  // Reset state when overlay opens
  useEffect(() => {
    if (isOpen) {
      setVisibleCount(0);
      setSkipped(false);
      setIconReady(false);

      // Small delay before showing the icon (entrance beat)
      const iconTimer = setTimeout(() => setIconReady(true), 200);
      return () => clearTimeout(iconTimer);
    }
  }, [isOpen]);

  // Timed message reveal
  useEffect(() => {
    if (!isOpen || skipped || !iconReady) return;
    if (visibleCount >= messages.length) return;

    const delay = visibleCount === 0 ? 600 : MESSAGE_INTERVAL;
    const timer = setTimeout(() => {
      setVisibleCount((c) => c + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [isOpen, iconReady, visibleCount, skipped]);

  const skipToEnd = useCallback(() => {
    setSkipped(true);
    setVisibleCount(messages.length);
  }, []);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (allVisible) {
          onCreate();
        } else {
          skipToEnd();
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, allVisible, onClose, onCreate, skipToEnd]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-500"
        onClick={onClose}
        style={{ opacity: isOpen ? 1 : 0 }}
      />

      {/* Card */}
      <div
        className="
          relative z-10 w-full max-w-md
          bg-neutral-950/95 rounded-3xl
          border border-neutral-800/60
          shadow-[0_0_80px_-20px_rgba(139,92,246,0.15)]
          overflow-hidden
        "
      >
        {/* Messages area */}
        <div className="px-5 pt-6 pb-5 space-y-2.5 min-h-[220px]">
          {messages.map((msg, i) => {
            const isVisible = i < visibleCount;
            const wasSkipped = skipped && i >= visibleCount - messages.length;
            const isFirst = i === 0;

            return (
              <div
                key={i}
                className="transition-all ease-out"
                style={{
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.97)',
                  transitionDuration: wasSkipped ? '150ms' : '400ms',
                  transitionDelay: wasSkipped ? `${i * 30}ms` : '0ms',
                }}
              >
                <div className={`flex items-start gap-2.5 ${isFirst ? '' : 'pl-11'}`}>
                  {/* Avatar on first message only */}
                  {isFirst && (
                    <div
                      className="relative shrink-0 mt-0.5"
                      style={{
                        animation: iconReady
                          ? 'kan-float 3.5s ease-in-out 0.8s infinite'
                          : 'none',
                      }}
                    >
                      <div className="absolute -inset-1.5 rounded-full bg-violet-500/10 blur-md" />
                      <div className="relative w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700/50 flex items-center justify-center">
                        <KanthinkIcon size={18} className="text-violet-400" />
                      </div>
                    </div>
                  )}

                  <div>
                    {/* Name label on first message */}
                    {isFirst && (
                      <p className="text-xs font-medium text-neutral-400 mb-1">Kan</p>
                    )}
                    <div
                      className={`
                        inline-block max-w-[90%] px-4 py-2.5 rounded-2xl rounded-tl-md
                        text-sm leading-relaxed
                        ${
                          msg.weight === 'bold'
                            ? 'bg-neutral-800/80 text-neutral-100 font-medium'
                            : msg.weight === 'accent'
                              ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
                              : 'bg-neutral-800/50 text-neutral-300'
                        }
                      `}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing indicator — three dots pulsing */}
          {!allVisible && iconReady && (
            <div className="flex items-center gap-1 pl-12 pt-1 h-6">
              <span
                className="w-1.5 h-1.5 rounded-full bg-neutral-500"
                style={{ animation: 'kan-dot 1.2s ease-in-out infinite' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-neutral-500"
                style={{ animation: 'kan-dot 1.2s ease-in-out 0.2s infinite' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-neutral-500"
                style={{ animation: 'kan-dot 1.2s ease-in-out 0.4s infinite' }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="
              text-xs text-neutral-500 hover:text-neutral-300
              transition-colors py-2 px-1
            "
          >
            skip
          </button>

          <button
            onClick={allVisible ? onCreate : skipToEnd}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
              transition-all duration-300 ease-out
              ${
                allVisible
                  ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20 hover:shadow-violet-500/30 scale-100'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 scale-95 opacity-70'
              }
            `}
          >
            {allVisible ? (
              <>
                Let&apos;s go
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </>
            ) : (
              'skip intro'
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
