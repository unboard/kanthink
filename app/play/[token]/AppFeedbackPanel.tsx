'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, Loader2, MessageCircle } from 'lucide-react';
import type { AppThreadMessage } from '@/lib/types';

interface Props {
  token: string;
  appTitle: string;
  /** Who made the app: the face on the other side of the conversation. */
  maker?: { name: string | null; image: string | null };
  /** Open on load: someone followed the link in a reply email. */
  initiallyOpen?: boolean;
  /** Ask the page to open sign-in, so someone can read the replies here. */
  onRequestSignIn?: () => void;
}

/** While the conversation is open, a reply should just turn up. */
const OPEN_POLL_MS = 6_000;
/** While it is shut, this only feeds the unread badge. */
const IDLE_POLL_MS = 60_000;
/** Messages this close together from the same person read as one run. */
const RUN_MS = 5 * 60_000;

/**
 * The conversation between someone using an app and the person who made it.
 *
 * The one place they talk: the app's maker answers from Kanthink, and anyone using
 * the app answers here. Emails only carry a copy and a link back. So it looks and
 * behaves like a text thread: bubbles, runs, day breaks, a composer that grows, and
 * Enter to send.
 *
 * Every colour is a --kp-* variable set by the page from the app's own style
 * (lib/playground/hostChrome), so it belongs to whichever app it opens over.
 */
export function AppFeedbackPanel({ token, appTitle, maker, initiallyOpen, onRequestSignIn }: Props) {
  const [open, setOpen] = useState(!!initiallyOpen);
  const [messages, setMessages] = useState<AppThreadMessage[]>([]);
  const [identified, setIdentified] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  /** Wrote without a confirmed address: their own messages show, replies go by email. */
  const [unverified, setUnverified] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const makerName = maker?.name?.trim() || null;
  const makerFirst = makerName?.split(/\s+/)[0] || null;

  const load = useCallback(async (opts: { countUnread?: boolean } = {}) => {
    try {
      const res = await fetch(`/api/play/${token}/feedback`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) return;
      const list: AppThreadMessage[] = data.messages || [];
      // A visitor who hasn't confirmed their address can't read the thread back, so
      // the server sends nothing; keep what they sent this visit on screen.
      if (data.identified || list.length) setMessages(list);
      setIdentified(!!data.identified);
      if (data.email) setEmail(data.email);
      if (opts.countUnread) setUnread(list.filter((m) => m.sender === 'publisher' && !m.isRead).length);
    } catch { /* it still works, it just starts empty */ }
    finally { setLoaded(true); }
  }, [token]);

  // Fast while open, slow while shut (that only feeds the badge), paused while hidden.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled || document.hidden) return;
      void load({ countUnread: !open });
    };
    // The first load always runs: a tab opened from an email link can start out
    // hidden, and skipping it left the chat on a spinner. Only the repeats pause.
    void load({ countUnread: !open });
    const timer = setInterval(tick, open ? OPEN_POLL_MS : IDLE_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [open, load]);

  useLayoutEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [open, messages.length, loaded]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // The composer grows with what's typed, up to a few lines, like any messaging app.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text, open]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (!identified && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Add your email so they can reply.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/play/${token}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, email: email.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Could not send that.'); return; }
      setMessages((prev) => [...prev, data.message as AppThreadMessage]);
      setIdentified(!!data.identified);
      setUnverified(!!data.needsVerification);
      setText('');
      inputRef.current?.focus();
    } catch {
      setError('Could not send that. Check your connection.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setUnread(0); }}
        className="relative flex h-9 items-center gap-2 rounded-full bg-[rgb(var(--kp-primary))] pl-3 pr-4 text-[13px] font-medium text-[rgb(var(--kp-primary-fg))] shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--kp-primary)/0.4)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--kp-bar))]"
        aria-label={unread ? `Chat, ${unread} new` : 'Chat'}
      >
        <MessageCircle className="h-4 w-4" />
        Chat
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-[rgb(var(--kp-bar))]">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-40 hidden bg-black/40 sm:block" aria-hidden />
          <div
            role="dialog"
            aria-label={`Chat about ${appTitle}`}
            className="kp-chat fixed inset-0 z-50 flex flex-col bg-[rgb(var(--kp-bg))] text-[rgb(var(--kp-fg))]
                       sm:inset-auto sm:bottom-4 sm:right-4 sm:top-4 sm:w-[400px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-[rgb(var(--kp-border))] sm:shadow-2xl"
          >
            {/* Who you're talking to */}
            <header className="flex flex-shrink-0 items-center gap-3 border-b border-[rgb(var(--kp-border))] bg-[rgb(var(--kp-card))] px-3 py-2.5">
              <Avatar name={makerName || appTitle} image={maker?.image} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold leading-tight">{makerName || appTitle}</p>
                <p className="truncate text-xs text-[rgb(var(--kp-muted-fg))]">{makerName ? `Made ${appTitle}` : 'Talk to the maker'}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--kp-muted-fg))] transition-colors hover:bg-[rgb(var(--kp-muted))] hover:text-[rgb(var(--kp-fg))]"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </header>

            {/* The thread */}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              {!loaded ? (
                <div className="flex justify-center py-10 text-[rgb(var(--kp-muted-fg))]"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <Avatar name={makerName || appTitle} image={maker?.image} size={56} />
                  <p className="mt-3 text-[15px] font-semibold">Message {makerFirst || 'the maker'}</p>
                  <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-[rgb(var(--kp-muted-fg))]">
                    A question, an idea, or something that isn&apos;t working. Their reply comes back right here.
                  </p>
                </div>
              ) : (
                <Thread messages={messages} />
              )}
              {unverified && (
                <div className="mx-auto mt-4 max-w-[300px] rounded-xl bg-[rgb(var(--kp-muted))] px-3 py-2.5 text-center text-[12px] leading-relaxed text-[rgb(var(--kp-muted-fg))]">
                  Sent. We&apos;ll email <span className="font-medium text-[rgb(var(--kp-fg))]">{email}</span> when {makerFirst || 'they'} replies.
                  {onRequestSignIn && (
                    <> <button onClick={onRequestSignIn} className="font-medium text-[rgb(var(--kp-fg))] underline underline-offset-2">Sign in</button> to see replies here.</>
                  )}
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Composer */}
            <div className="flex-shrink-0 border-t border-[rgb(var(--kp-border))] bg-[rgb(var(--kp-card))] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
              {!identified && (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  autoComplete="email"
                  placeholder="Your email, for their reply"
                  className="mb-2 w-full rounded-full border border-[rgb(var(--kp-border))] bg-[rgb(var(--kp-bg))] px-4 py-2 text-[14px] text-[rgb(var(--kp-fg))] outline-none placeholder:text-[rgb(var(--kp-muted-fg))] focus:border-[rgb(var(--kp-primary))]"
                />
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => { setText(e.target.value); setError(null); }}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter is a new line. On a touch keyboard Enter stays a new line.
                    const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
                    if (e.key === 'Enter' && !e.shiftKey && !touch) { e.preventDefault(); void send(); }
                  }}
                  rows={1}
                  autoFocus={!initiallyOpen}
                  placeholder="Message"
                  className="max-h-[140px] min-h-[40px] flex-1 resize-none rounded-[20px] border border-[rgb(var(--kp-border))] bg-[rgb(var(--kp-bg))] px-4 py-2.5 text-[15px] leading-5 text-[rgb(var(--kp-fg))] outline-none placeholder:text-[rgb(var(--kp-muted-fg))] focus:border-[rgb(var(--kp-primary))]"
                />
                <button
                  onClick={() => void send()}
                  disabled={sending || !text.trim()}
                  aria-label="Send"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[rgb(var(--kp-primary))] text-[rgb(var(--kp-primary-fg))] transition-opacity disabled:opacity-35"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
                </button>
              </div>
              {error && <p role="alert" className="mt-1.5 px-1 text-[12px] text-red-500">{error}</p>}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Avatar({ name, image, size = 36 }: { name: string; image?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const letters = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  if (image && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" width={size} height={size} onError={() => setBroken(true)} className="flex-shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="flex flex-shrink-0 items-center justify-center rounded-full bg-[rgb(var(--kp-primary))] font-semibold text-[rgb(var(--kp-primary-fg))]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {letters}
    </span>
  );
}

function dayLabel(d: Date): string {
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

/** Bubbles in runs, with a day break whenever the date changes, like a text thread. */
function Thread({ messages }: { messages: AppThreadMessage[] }) {
  return (
    <div className="flex flex-col">
      {messages.map((m, i) => {
        const at = new Date(m.createdAt);
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const newDay = !prev || new Date(prev.createdAt).toDateString() !== at.toDateString();
        const startsRun = newDay || !prev || prev.sender !== m.sender || at.getTime() - new Date(prev.createdAt).getTime() > RUN_MS;
        const endsRun = !next || next.sender !== m.sender || new Date(next.createdAt).getTime() - at.getTime() > RUN_MS
          || new Date(next.createdAt).toDateString() !== at.toDateString();
        const mine = m.sender === 'user';
        return (
          <div key={m.id}>
            {newDay && (
              <p className="my-3 text-center text-[11px] font-medium text-[rgb(var(--kp-muted-fg))]">{dayLabel(at)}</p>
            )}
            <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${startsRun ? 'mt-2' : 'mt-0.5'}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug ${
                  mine
                    ? `bg-[rgb(var(--kp-primary))] text-[rgb(var(--kp-primary-fg))] rounded-[18px] ${endsRun ? 'rounded-br-[6px]' : ''}`
                    : `bg-[rgb(var(--kp-muted))] text-[rgb(var(--kp-fg))] rounded-[18px] ${endsRun ? 'rounded-bl-[6px]' : ''}`
                }`}
              >
                {m.body}
              </div>
            </div>
            {endsRun && (
              <p className={`mt-1 px-1 text-[11px] text-[rgb(var(--kp-muted-fg))] ${mine ? 'text-right' : ''}`}>
                {at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
