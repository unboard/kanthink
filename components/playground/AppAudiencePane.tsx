'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CornerUpRight,
  Loader2,
  MessageSquareText,
  Send,
  Users,
} from 'lucide-react';
import { formatAppPrice } from '@/lib/playground/appAccess';
import type { AppAudienceMember, AppThreadMessage, ID, PlaygroundApp } from '@/lib/types';

interface Props {
  appId: ID;
  /** Told when the unread count changes, so the tab badge can follow. */
  onUnreadChange?: (unread: number) => void;
  /**
   * Handed the app row after something here changes it — adding a message to the
   * build brief rewrites the app's thread, and the drawer is holding a copy.
   */
  onAppUpdated?: (app: PlaygroundApp) => void;
  /** Jump the drawer to the Thread tab, so "view it" can actually show it. */
  onOpenThread?: () => void;
}

/** How often an open thread checks for something new. */
const THREAD_POLL_MS = 10_000;

/**
 * Who uses this app, and the conversation with each of them.
 *
 * A published app is the only part of Kanthink where strangers show up, so this is
 * the only view that has to answer "who are these people and what do they want".
 * Two levels: the list, and one person's thread. No triage, no inbox, no statuses —
 * an app with forty users does not need a helpdesk.
 */
export function AppAudiencePane({ appId, onUnreadChange, onAppUpdated, onOpenThread }: Props) {
  const [audience, setAudience] = useState<AppAudienceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMember, setOpenMember] = useState<AppAudienceMember | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/playground/apps/${appId}/audience`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Could not load the audience'); return; }
      const list: AppAudienceMember[] = data.audience || [];
      setAudience(list);
      onUnreadChange?.(list.reduce((sum, m) => sum + m.unreadForOwner, 0));
      setError(null);
    } catch {
      setError('Could not load the audience');
    } finally {
      setLoading(false);
    }
  }, [appId, onUnreadChange]);

  useEffect(() => { void load(); }, [load]);

  if (openMember) {
    return (
      <MemberThread
        appId={appId}
        member={openMember}
        onBack={() => { setOpenMember(null); void load(); }}
        onAppUpdated={onAppUpdated}
        onOpenThread={onOpenThread}
      />
    );
  }

  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center gap-2 text-sm text-neutral-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (error) {
    return <p className="px-4 py-6 text-sm text-red-500">{error}</p>;
  }

  if (audience.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
          <Users className="w-5 h-5 text-neutral-400" />
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Nobody yet</p>
        <p className="mt-1 mx-auto max-w-xs text-xs text-neutral-400 dark:text-neutral-500 leading-relaxed">
          Publish the app and share its link. Anyone who opens it and leaves feedback —
          or buys it — shows up here, with the thread you can answer them in.
        </p>
      </div>
    );
  }

  const paid = audience.filter((m) => m.status === 'paid');
  const revenue = paid.reduce((sum, m) => sum + (m.amountPaid || 0), 0);

  return (
    <div className="px-4 py-4">
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="People" value={String(audience.length)} />
        <Stat label="Paid" value={String(paid.length)} />
        <Stat
          label="Collected"
          value={revenue > 0 ? formatAppPrice(revenue, paid[0]?.currency ?? 'usd', null) : '—'}
        />
      </div>

      <div className="space-y-1.5">
        {audience.map((member) => (
          <button
            key={member.id}
            onClick={() => setOpenMember(member)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/40 hover:border-violet-400/60 transition-colors text-left group"
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-semibold ${
              member.status === 'paid'
                ? 'bg-emerald-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-300'
            }`}>
              {initials(member.name || member.email)}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-900 dark:text-white truncate group-hover:text-violet-600 dark:group-hover:text-violet-400">
                {member.name || member.email}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                {describe(member)}
              </p>
            </div>

            {member.unreadForOwner > 0 && (
              <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-semibold">
                <MessageSquareText className="w-2.5 h-2.5" />
                {member.unreadForOwner}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A single person's thread, and the two things you can do about it. */
function MemberThread({
  appId, member, onBack, onAppUpdated, onOpenThread,
}: {
  appId: ID;
  member: AppAudienceMember;
  onBack: () => void;
  onAppUpdated?: (app: PlaygroundApp) => void;
  onOpenThread?: () => void;
}) {
  const [messages, setMessages] = useState<AppThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  /** The id of the message most recently pushed onto the build brief. */
  const [briefedId, setBriefedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (showSpinner: boolean) => {
    try {
      const res = await fetch(`/api/playground/apps/${appId}/audience?memberId=${member.id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { if (showSpinner) setError(data?.error || 'Could not load this thread'); return; }
      setMessages(data.messages || []);
    } catch {
      if (showSpinner) setError('Could not load this thread');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [appId, member.id]);

  useEffect(() => { void refresh(true); }, [refresh]);

  // Someone using the app can write back while this is open. Polling rather than a
  // socket: a support thread moves at conversation pace, and a public Pusher
  // channel for an anonymous visitor is a surface this does not need.
  useEffect(() => {
    const tick = () => { if (!document.hidden) void refresh(false); };
    const timer = setInterval(tick, THREAD_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const send = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/playground/apps/${appId}/audience`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, action: 'reply', body: text }),
      });
      const data = await res.json();
      if (!res.ok || !data?.message) { setError(data?.error || 'Could not send'); return; }
      setMessages((prev) => [...prev, data.message as AppThreadMessage]);
      setReply('');
    } catch {
      setError('Could not send');
    } finally {
      setSending(false);
    }
  };

  const toBrief = async (messageId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/playground/apps/${appId}/audience`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, action: 'to_brief', messageId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Could not add that to the brief'); return; }
      // The drawer is holding this app's thread; hand it the new one so the Thread
      // tab is already correct by the time anyone looks at it.
      if (data.app) onAppUpdated?.(data.app as PlaygroundApp);
      setBriefedId(messageId);
    } catch {
      setError('Could not add that to the brief');
    }
  };

  return (
    <div className="px-4 py-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-3 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Everyone
      </button>

      <div className="mb-4 px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40">
        <p className="text-sm font-medium text-neutral-900 dark:text-white">
          {member.name || member.email}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{member.email}</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{describe(member)}</p>
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center gap-2 text-sm text-neutral-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-2.5">
          {messages.length === 0 && (
            <p className="py-6 text-center text-xs text-neutral-400">
              No messages yet. You can still write first.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={m.sender === 'publisher' ? 'pl-8' : 'pr-8'}>
              <div className={`px-3 py-2 rounded-xl text-sm whitespace-pre-wrap break-words ${
                m.sender === 'publisher'
                  ? 'bg-violet-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100'
              }`}>
                {m.body}
              </div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-neutral-400">
                  {m.sender === 'publisher' ? 'You' : member.name || 'Them'} ·{' '}
                  {new Date(m.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>

                {m.sender === 'user' && (
                  briefedId === m.id ? (
                    // Confirmation that names where it went, and offers to show you.
                    <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                      <Check className="w-2.5 h-2.5" />
                      Added to the build brief
                      {onOpenThread && (
                        <button
                          onClick={onOpenThread}
                          className="inline-flex items-center gap-0.5 underline hover:no-underline"
                        >
                          View it <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </span>
                  ) : (
                    // The whole point of the loop: a report becomes a line in the
                    // brief the next build reads, without anyone retyping it.
                    <button
                      onClick={() => toBrief(m.id)}
                      className="inline-flex items-center gap-1 text-[10px] text-neutral-400 hover:text-violet-600 dark:hover:text-violet-400"
                    >
                      <CornerUpRight className="w-2.5 h-2.5" />
                      Add to build brief
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

      <div className="mt-4 flex items-end gap-2">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
          }}
          rows={2}
          placeholder="Reply to them…"
          className="flex-1 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400 resize-none"
        />
        <button
          onClick={send}
          disabled={sending || !reply.trim()}
          className="flex-shrink-0 p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-neutral-400">
        They see this in the app&apos;s feedback panel within seconds, without reloading. If
        their email is a Kanthink account they get a notification too, and either way it
        reaches them by email.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-center">
      <p className="text-base font-semibold text-neutral-900 dark:text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</p>
    </div>
  );
}

/** One line that answers "who is this and do they pay me". */
function describe(member: AppAudienceMember): string {
  const bits: string[] = [];
  if (member.status === 'paid') {
    bits.push(member.amountPaid
      ? `Paid ${formatAppPrice(member.amountPaid, member.currency, null)}`
      : 'Paid');
  } else if (member.status === 'refunded') {
    bits.push('Refunded');
  } else if (member.status === 'canceled') {
    bits.push('Access ended');
  } else {
    bits.push('Free');
  }

  bits.push(`${member.sessionCount} open${member.sessionCount === 1 ? '' : 's'}`);
  if (member.lastSeenAt) {
    bits.push(`last ${new Date(member.lastSeenAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
  }
  if (member.messageCount > 0) {
    bits.push(`${member.messageCount} message${member.messageCount === 1 ? '' : 's'}`);
  }
  return bits.join(' · ');
}

function initials(source: string): string {
  const parts = source.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
