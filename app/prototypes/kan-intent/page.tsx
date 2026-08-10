'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AudioLines } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { APPROACHES, type IntentApproach, type IntentProps } from './Approaches';

/**
 * Does Kan reply to this message, or not?
 *
 * Five answers built from the question rather than from the control. Every
 * composer here is real — type in it, tab out of it, watch what each one does
 * when the cursor lands.
 */
export default function KanIntentPrototype() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Styles />

      <div className="mx-auto max-w-2xl px-5 py-10">
        <header className="mb-7">
          <Link href="/prototypes" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← Prototypes
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <KanthinkIcon size={28} className="text-violet-400" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Does Kan answer this?</h1>
              <p className="text-sm text-neutral-400">
                Five answers to the actual question, not five skins on a switch. Type in them — they
                are real fields, and most of them only show themselves once the cursor is in.
              </p>
            </div>
          </div>
        </header>

        <div className="mb-6 space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-xs leading-relaxed text-neutral-400">
          <p>
            <span className="font-medium text-neutral-200">Why the switch was the wrong shape.</span>{' '}
            The intent is already in the words. &ldquo;What should I do about pricing?&rdquo; is a
            question; &ldquo;£42, booked&rdquo; is a note. A mode asks you to state it a second time,
            before you have written it, in a corner your eyes never visit. That is why it gets
            missed — and personality does not fix a control that is in the wrong place in the wrong
            order.
          </p>
          <p>
            <span className="font-medium text-neutral-200">So all five follow the same rules.</span>{' '}
            The decision happens after the writing, where you actually know the answer. It lives near
            the text or the send button, because that is where your attention already is. And it
            appears when you engage rather than sitting there forever.
          </p>
          <p>
            <span className="font-medium text-neutral-200">The + menu.</span> Upload and whiteboard
            move into the plus, which is what clears the room for any of this. Open it in any mock
            below.
          </p>
        </div>

        <div className="space-y-5">
          {APPROACHES.map((approach) => (
            <Sample key={approach.id} approach={approach} />
          ))}
        </div>

        <p className="mt-8 text-xs text-neutral-600">
          Say which one and I&rsquo;ll wire it into <span className="font-mono">ChatInput</span> —
          the + menu comes with it either way.
        </p>
      </div>
    </div>
  );
}

function Sample({ approach }: { approach: IntentApproach }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState<{ asking: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const props: IntentProps = {
    focused,
    text,
    asking,
    setAsking,
    onSend: (wasAsking) => {
      if (!text.trim()) return;
      setSent({ asking: wasAsking });
      setText('');
      setAsking(false);
      window.setTimeout(() => setSent(null), 2600);
    },
  };

  const { Inline, Trailing, Footer } = approach;
  const footer = Footer ? Footer(props) : null;

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-sm font-medium text-neutral-100">{approach.name}</h2>
        <span className="text-[11px] text-violet-300/80">{approach.principle}</span>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-neutral-500">{approach.note}</p>

      <div
        className={`relative rounded-xl border bg-neutral-800 px-3 py-2.5 transition-colors ${
          focused ? 'border-neutral-500' : 'border-neutral-700'
        }`}
      >
        <div className="flex items-start gap-1">
          {/* The + menu: upload and whiteboard, out of the way. */}
          <div ref={menuRef} className="relative flex-shrink-0">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMenuOpen((v) => !v)}
              title="Add"
              className={`flex h-[26px] w-7 items-center justify-center rounded-md transition-all ${
                menuOpen ? 'rotate-45 bg-neutral-700 text-neutral-200' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {menuOpen && (
              <div className="kn-menu absolute bottom-full left-0 z-20 mb-1.5 w-44 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-xl">
                {[
                  {
                    label: 'Upload image',
                    sub: 'Photo or screenshot',
                    d: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
                  },
                  {
                    label: 'Whiteboard',
                    sub: 'Sketch it out',
                    d: 'M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42',
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-neutral-700/60"
                  >
                    <svg className="h-4 w-4 flex-shrink-0 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.d} />
                    </svg>
                    <span>
                      <span className="block text-[12px] text-neutral-100">{item.label}</span>
                      <span className="block text-[10px] text-neutral-500">{item.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 items-start px-1">
            {Inline ? Inline(props) : null}
            <textarea
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Add a note…"
              className="min-w-0 flex-1 resize-none bg-transparent text-sm leading-[26px] text-white placeholder-neutral-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            title="Live voice"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-neutral-500 hover:text-neutral-300"
          >
            <AudioLines className="h-4 w-4" />
          </button>

          {Trailing ? (
            Trailing(props)
          ) : (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => props.onSend(asking || false)}
              disabled={!text.trim()}
              className={`flex h-[26px] w-7 flex-shrink-0 items-center justify-center transition-colors ${
                !text.trim() ? 'text-neutral-700' : asking ? 'text-violet-400' : 'text-neutral-200'
              }`}
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          )}
        </div>

        {footer && <div className="ml-8 mt-1.5 flex items-center">{footer}</div>}
      </div>

      {/* What the thread would do with it. */}
      <p className="mt-2 h-4 text-[11px]">
        {sent ? (
          <span className={`kn-fade ${sent.asking ? 'text-violet-300' : 'text-neutral-500'}`}>
            {sent.asking ? '→ Posted, and Kan is replying below it' : '→ Posted to the thread. Nobody replies.'}
          </span>
        ) : (
          <span className="text-neutral-700">Type something and send it.</span>
        )}
      </p>
    </section>
  );
}

function Styles() {
  return (
    <style>{`
      @keyframes kn-fade {
        from { opacity: 0; transform: translateY(3px); }
        to   { opacity: 1; transform: none; }
      }
      @keyframes kn-grow {
        from { opacity: 0; max-height: 0; transform: translateY(-4px); }
        to   { opacity: 1; max-height: 60px; transform: none; }
      }
      @keyframes kn-menu {
        from { opacity: 0; transform: translateY(6px) scale(.96); }
        to   { opacity: 1; transform: none; }
      }
      .kn-fade { animation: kn-fade .22s ease-out both; }
      .kn-grow { animation: kn-grow .24s cubic-bezier(.2,.9,.3,1) both; }
      .kn-menu { animation: kn-menu .16s ease-out both; transform-origin: bottom left; }
      @media (prefers-reduced-motion: reduce) {
        .kn-fade, .kn-grow, .kn-menu { animation: none; }
      }
    `}</style>
  );
}
