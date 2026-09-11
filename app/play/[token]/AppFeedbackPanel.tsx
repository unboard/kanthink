'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquareText, Send, X } from 'lucide-react';
import type { AppThreadMessage } from '@/lib/types';

interface Props {
  token: string;
  appTitle: string;
}

/**
 * "Something is wrong with this" — from inside the app, to the person who made it.
 *
 * A published app is a page on the internet with no support address, and the usual
 * outcome is that the one person who noticed a bug simply closes the tab. This is a
 * button and a text box, and what it collects lands on the app's own thread, which
 * is where the next build reads its brief from.
 *
 * It opens as a real drawer rather than a corner popover. The first version was a
 * 320px box sitting on the app it was about, which is fine for "nice one" and
 * hopeless for the reports that are actually worth having — a paragraph, a repro, a
 * reply, and the conversation that follows. Full height on the right, a near-full
 * sheet on a phone, and the thread gets the room.
 */
export function AppFeedbackPanel({ token, appTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AppThreadMessage[]>([]);
  const [identified, setIdentified] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/play/${token}/feedback`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) return;
      setMessages(data.messages || []);
      setIdentified(!!data.identified);
      if (data.email) setEmail(data.email);
    } catch { /* the panel still works, it just starts empty */ }
    finally { setLoaded(true); }
  }, [token]);

  // Checked once on mount so an answer waiting since last time is visible without
  // opening anything. A reply nobody is told about is not a reply.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/play/${token}/feedback`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled || !res.ok || !data.identified) return;
        const list: AppThreadMessage[] = data.messages || [];
        setUnread(list.filter((m) => m.sender === 'publisher' && !m.isRead).length);
      } catch { /* no badge, no harm */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [open, messages.length]);

  // Escape closes it, like every other drawer on the web.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openPanel = () => {
    setOpen(true);
    setUnread(0);
    if (!loaded) void load();
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/play/${token}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, email: email.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.needsEmail) setNeedsEmail(true);
        setError(data?.error || 'Could not send that.');
        return;
      }
      setMessages((prev) => [...prev, data.message as AppThreadMessage]);
      setIdentified(true);
      setNeedsEmail(false);
      setText('');
    } catch {
      setError('Could not send that. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={openPanel}
        className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-neutral-600 hover:text-violet-600 hover:bg-violet-50 transition-colors"
      >
        <MessageSquareText className="w-3.5 h-3.5" />
        <span className="font-medium">Feedback</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* The app keeps running underneath; the scrim just says where focus is. */}
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            aria-hidden
          />

          <div
            role="dialog"
            aria-label={`Feedback on ${appTitle}`}
            className="fixed z-50 flex flex-col bg-white shadow-2xl
                       inset-x-0 bottom-0 h-[85dvh] rounded-t-2xl
                       sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:w-[420px] sm:rounded-none sm:border-l sm:border-neutral-200"
          >
            <div className="flex-shrink-0 flex items-start gap-3 px-4 py-3.5 border-b border-neutral-200">
              <MessageSquareText className="w-4 h-4 mt-0.5 text-violet-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-900 truncate">{appTitle}</p>
                <p className="text-xs text-neutral-500">
                  Talk to whoever made this. They can reply here.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="p-1 -mr-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-neutral-50">
              {!loaded ? (
                <div className="py-8 flex justify-center text-neutral-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="py-6">
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    Found a bug, or want something changed?
                  </p>
                  <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
                    Say what happened and what you expected. It goes straight to the person
                    who built this, and their answer comes back to this same panel.
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={m.sender === 'user' ? 'pl-8' : 'pr-8'}>
                    <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-violet-600 text-white rounded-br-sm'
                        : 'bg-white border border-neutral-200 text-neutral-800 rounded-bl-sm'
                    }`}>
                      {m.body}
                    </div>
                    <p className={`mt-1 text-[10px] text-neutral-400 ${m.sender === 'user' ? 'text-right' : ''}`}>
                      {m.sender === 'user' ? 'You' : 'Reply'} ·{' '}
                      {new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>

            <div className="flex-shrink-0 px-4 py-3 border-t border-neutral-200 space-y-2 bg-white">
              {(!identified || needsEmail) && (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email, so they can reply"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-900 outline-none focus:border-violet-400"
                />
              )}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // Enter is a newline here — these are paragraphs, not chat lines.
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
                }}
                rows={4}
                placeholder="What is wrong, or what would make it better?"
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-900 outline-none focus:border-violet-400 resize-none leading-relaxed"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={send}
                  disabled={sending || !text.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {sending ? 'Sending…' : 'Send'}
                </button>
                <span className="hidden sm:block text-[10px] text-neutral-400">⌘↵</span>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
