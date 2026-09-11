'use client';

import { useCallback, useEffect, useState } from 'react';
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
 * button and a text box, and it puts what they say on the app's own thread, which is
 * where the next build reads its brief from.
 *
 * The reply comes back to the same panel, so it is a conversation rather than a
 * suggestion box.
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

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/play/${token}/feedback`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) return;
      const list: AppThreadMessage[] = data.messages || [];
      setMessages(list);
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

  if (!open) {
    return (
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
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-80 z-50 rounded-t-2xl sm:rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-neutral-200">
        <MessageSquareText className="w-4 h-4 text-violet-500" />
        <p className="flex-1 min-w-0 text-sm font-medium text-neutral-900 truncate">{appTitle}</p>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto px-3 py-3 space-y-2.5 bg-neutral-50">
        {!loaded ? (
          <div className="py-4 flex justify-center text-neutral-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-2 text-xs text-neutral-500 leading-relaxed">
            Found a bug, or want something changed? Tell the person who made this. They
            can reply here.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.sender === 'user' ? 'pl-6' : 'pr-6'}>
              <div className={`px-2.5 py-1.5 rounded-xl text-xs whitespace-pre-wrap break-words ${
                m.sender === 'user' ? 'bg-violet-600 text-white' : 'bg-white border border-neutral-200 text-neutral-800'
              }`}>
                {m.body}
              </div>
              <p className="mt-0.5 text-[10px] text-neutral-400">
                {m.sender === 'user' ? 'You' : 'Reply'} ·{' '}
                {new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="px-3 py-2.5 border-t border-neutral-200 space-y-2">
        {(!identified || needsEmail) && (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email, so they can reply"
            className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-900 outline-none focus:border-violet-400"
          />
        )}
        <div className="flex items-end gap-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            rows={2}
            placeholder="What is wrong, or what would make it better?"
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-900 outline-none focus:border-violet-400 resize-none"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            aria-label="Send"
            className="flex-shrink-0 p-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        {error && <p className="text-[11px] text-red-500">{error}</p>}
      </div>
    </div>
  );
}
