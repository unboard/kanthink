'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronRight,
  CornerUpRight,
  ExternalLink,
  Loader2,
  Mail,
  MessageSquareText,
  Package,
  Phone,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';
import { formatAppPrice } from '@/lib/playground/appAccess';
import type { AppAudienceMember, AppOrderView, AppThreadMessage, ID, PlaygroundApp } from '@/lib/types';

interface Props {
  appId: ID;
  /** Told when the unread count changes, so the tab badge can follow. */
  onUnreadChange?: (unread: number) => void;
  /**
   * Handed the app row after something here changes it: adding a message to the
   * build brief rewrites the app's thread, and the drawer is holding a copy.
   */
  onAppUpdated?: (app: PlaygroundApp) => void;
  /** Jump the drawer to the Thread tab, so "view it" can actually show it. */
  onOpenThread?: () => void;
}

/** How often an open conversation checks for something new. */
const THREAD_POLL_MS = 10_000;
/** Messages this close together from the same person read as one run. */
const RUN_MS = 5 * 60_000;

/**
 * The people who use this app, and everything between you and each of them.
 *
 * Two levels, laid out the way a shop owner works. The list answers "who needs
 * me": anyone with an order to hand over, or a message you haven't read, is at the
 * top and says so. A person is the conversation with them, with their orders
 * pinned above it; tapping an order peeks its details in a sheet from the bottom,
 * and closing it drops you back where you were in the conversation.
 */
export function AppAudiencePane({ appId, onUnreadChange, onAppUpdated, onOpenThread }: Props) {
  const [audience, setAudience] = useState<AppAudienceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMember, setOpenMember] = useState<AppAudienceMember | null>(null);
  const [totals, setTotals] = useState<{ revenue: number; currency: string; buyers: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/playground/apps/${appId}/audience`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Could not load people'); return; }
      const list: AppAudienceMember[] = data.audience || [];
      setAudience(list);
      setTotals({ revenue: data.revenue ?? 0, currency: data.currency ?? 'usd', buyers: data.buyers ?? 0 });
      onUnreadChange?.(list.reduce((sum, m) => sum + m.unreadForOwner, 0));
      setError(null);
    } catch {
      setError('Could not load people');
    } finally {
      setLoading(false);
    }
  }, [appId, onUnreadChange]);

  useEffect(() => { void load(); }, [load]);

  if (openMember) {
    return (
      <Person
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

  if (error) return <p className="px-4 py-6 text-sm text-red-500">{error}</p>;

  if (audience.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
          <Users className="w-5 h-5 text-neutral-400" />
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Nobody yet</p>
        <p className="mt-1 mx-auto max-w-xs text-xs text-neutral-400 dark:text-neutral-500 leading-relaxed">
          Publish the app and share its link. Anyone who orders, buys or sends a message shows up here.
        </p>
      </div>
    );
  }

  const revenue = totals?.revenue ?? 0;
  const waiting = audience.reduce((n, m) => n + (m.toFulfil ?? 0), 0);

  return (
    <div className="px-4 py-4">
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="People" value={String(audience.length)} />
        <Stat label={waiting ? 'To fulfil' : 'Buyers'} value={String(waiting || totals?.buyers || 0)} accent={waiting > 0} />
        <Stat label="Collected" value={revenue > 0 ? formatAppPrice(revenue, totals?.currency ?? 'usd', null) : '—'} />
      </div>

      <div className="space-y-1.5">
        {audience.map((member) => {
          const toFulfil = member.toFulfil ?? 0;
          const orders = member.orderCount ?? 0;
          return (
            <button
              key={member.id}
              onClick={() => setOpenMember(member)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/40 hover:border-violet-400/60 transition-colors text-left group"
            >
              <Initials name={member.name || member.email} strong={orders > 0 || member.status === 'paid'} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900 dark:text-white truncate group-hover:text-violet-600 dark:group-hover:text-violet-400">
                  {member.name || member.email}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{summary(member)}</p>
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                {toFulfil > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    <Package className="h-3 w-3" />
                    {toFulfil} to fulfil
                  </span>
                )}
                {member.unreadForOwner > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                    <MessageSquareText className="h-3 w-3" />
                    {member.unreadForOwner} new
                  </span>
                )}
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-neutral-300 dark:text-neutral-600" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One person: the conversation, with their orders pinned above it. */
function Person({
  appId, member, onBack, onAppUpdated, onOpenThread,
}: {
  appId: ID;
  member: AppAudienceMember;
  onBack: () => void;
  onAppUpdated?: (app: PlaygroundApp) => void;
  onOpenThread?: () => void;
}) {
  const [messages, setMessages] = useState<AppThreadMessage[]>([]);
  const [orders, setOrders] = useState<AppOrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [briefedId, setBriefedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peek, setPeek] = useState<AppOrderView | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const firstLoad = useRef(true);

  const refresh = useCallback(async (showSpinner: boolean) => {
    try {
      const res = await fetch(`/api/playground/apps/${appId}/audience?memberId=${member.id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { if (showSpinner) setError(data?.error || 'Could not load this conversation'); return; }
      setMessages(data.messages || []);
      setOrders(data.orders || []);
    } catch {
      if (showSpinner) setError('Could not load this conversation');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [appId, member.id]);

  useEffect(() => { void refresh(true); }, [refresh]);

  // They can write back while this is open; polling, at conversation pace.
  useEffect(() => {
    const tick = () => { if (!document.hidden) void refresh(false); };
    const timer = setInterval(tick, THREAD_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);

  useEffect(() => {
    if (loading) return;
    endRef.current?.scrollIntoView({ block: 'end', behavior: firstLoad.current ? 'auto' : 'smooth' });
    firstLoad.current = false;
  }, [messages.length, loading]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [reply]);

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
      if (data.app) onAppUpdated?.(data.app as PlaygroundApp);
      setBriefedId(messageId);
    } catch {
      setError('Could not add that to the brief');
    }
  };

  const setStatus = async (order: AppOrderView, status: 'fulfilled' | 'paid') => {
    const res = await fetch(`/api/playground/apps/${appId}/orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id, status }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.order) {
      const next = data.order as AppOrderView;
      setOrders((list) => list.map((o) => (o.id === next.id ? next : o)));
      setPeek(next);
    } else {
      setError(data?.error || 'Could not update the order');
    }
  };

  const phone = orders.find((o) => o.buyerPhone)?.buyerPhone ?? null;
  const name = member.name || member.email;
  const first = member.name?.split(/\s+/)[0] || 'them';
  const shown = orders.filter((o) => o.status !== 'canceled');
  const open = shown.filter((o) => o.status === 'paid').length;

  return (
    <div className="flex min-h-full flex-col">
      {/* Who */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white/95 px-3 py-2.5 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
        <button onClick={onBack} aria-label="Back to everyone" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Initials name={name} strong={shown.length > 0} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{name}</p>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{member.email}</p>
        </div>
        {phone && (
          <a href={`tel:${phone}`} aria-label={`Call ${name}`} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-violet-600 dark:hover:bg-neutral-800">
            <Phone className="h-4 w-4" />
          </a>
        )}
        <a href={`mailto:${member.email}`} aria-label={`Email ${name}`} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-violet-600 dark:hover:bg-neutral-800">
          <Mail className="h-4 w-4" />
        </a>
      </div>

      {/* Their orders, as context for the conversation */}
      {shown.length > 0 && (
        <div className="border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
          <p className="mb-1.5 px-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            {shown.length} order{shown.length === 1 ? '' : 's'}{open ? ` · ${open} to fulfil` : ''}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {shown.map((o) => (
              <button
                key={o.id}
                onClick={() => setPeek(o)}
                className="flex min-w-[200px] max-w-[260px] flex-shrink-0 items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left transition-colors hover:border-violet-400/60 dark:border-neutral-700 dark:bg-neutral-800/60"
              >
                <StatusDot status={o.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-neutral-900 dark:text-white">{o.quantity > 1 ? `${o.quantity} × ` : ''}{o.item}</span>
                  <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                    #{o.number} · {formatAppPrice(o.amount, o.currency, null)} · {STATUS_LABEL[o.status]}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The conversation */}
      <div className="flex-1 px-3 py-3">
        {loading ? (
          <div className="flex justify-center py-10 text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-xs text-neutral-400">No messages yet. Write first: they see it in the app&apos;s Chat.</p>
        ) : (
          <Thread
            messages={messages}
            theirName={member.name?.split(/\s+/)[0] || 'Them'}
            briefedId={briefedId}
            onBrief={toBrief}
            onOpenThread={onOpenThread}
          />
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 border-t border-neutral-200 bg-white px-3 pb-3 pt-2.5 dark:border-neutral-800 dark:bg-neutral-900">
        {error && <p className="mb-1.5 px-1 text-xs text-red-500">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              const touch = window.matchMedia?.('(pointer: coarse)').matches;
              if (e.key === 'Enter' && !e.shiftKey && !touch) { e.preventDefault(); void send(); }
            }}
            rows={1}
            placeholder={`Message ${first}`}
            className="max-h-[140px] min-h-[40px] flex-1 resize-none rounded-[20px] border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[15px] leading-5 text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-violet-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
          <button
            onClick={() => void send()}
            disabled={sending || !reply.trim()}
            aria-label="Send"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-violet-600 text-white transition-opacity hover:bg-violet-500 disabled:opacity-35"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10.5px] text-neutral-400">They see it in the app&apos;s Chat right away, and get an email copy.</p>
      </div>

      {peek && (
        <OrderSheet
          order={peek}
          onClose={() => setPeek(null)}
          onStatus={(s) => void setStatus(peek, s)}
          onMessage={() => {
            const about = `About order #${peek.number} (${peek.item}): `;
            setPeek(null);
            setReply((r) => r || about);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
        />
      )}
    </div>
  );
}

const STATUS_LABEL: Record<AppOrderView['status'], string> = {
  pending: 'Checking out',
  paid: 'To fulfil',
  fulfilled: 'Fulfilled',
  canceled: 'Canceled',
  refunded: 'Refunded',
};

function StatusDot({ status }: { status: AppOrderView['status'] }) {
  const cls = status === 'paid' ? 'bg-amber-400' : status === 'fulfilled' ? 'bg-emerald-500' : 'bg-neutral-400';
  return <span className={`h-2 w-2 flex-shrink-0 rounded-full ${cls}`} />;
}

/** "rockId" → "Rock id". */
function humanKey(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;

/** A peek at one order, from the bottom. Close it and you're back in the conversation. */
function OrderSheet({ order, onClose, onStatus, onMessage }: {
  order: AppOrderView;
  onClose: () => void;
  onStatus: (s: 'fulfilled' | 'paid') => void;
  onMessage: () => void;
}) {
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const busy = busyFor === order.status;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const details = Object.entries(order.details ?? {});
  const ship = order.shipping
    ? [order.shipping.name, order.shipping.line1, order.shipping.line2, [order.shipping.city, order.shipping.state, order.shipping.postal_code].filter(Boolean).join(' '), order.shipping.country].filter(Boolean)
    : [];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div role="dialog" aria-label={`Order #${order.number}`} className="relative max-h-[80dvh] w-full max-w-[560px] overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" aria-hidden />
        <div className="flex items-start gap-3 px-5 pb-3 pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Order #{order.number}</p>
            <p className="mt-0.5 text-lg font-semibold leading-snug text-neutral-900 dark:text-white">{order.quantity > 1 ? `${order.quantity} × ` : ''}{order.item}</p>
            <p className="mt-0.5 text-sm tabular-nums text-neutral-700 dark:text-neutral-300">{formatAppPrice(order.amount, order.currency, null)}</p>
          </div>
          <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${order.status === 'paid' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : order.status === 'fulfilled' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-neutral-500/15 text-neutral-500'}`}>
            <StatusDot status={order.status} /> {STATUS_LABEL[order.status]}
          </span>
          <button onClick={onClose} aria-label="Close" className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mx-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
          <Row label="Buyer" value={order.buyerName || order.buyerEmail || '—'} />
          {order.buyerEmail && <Row label="Email" value={<a href={`mailto:${order.buyerEmail}`} className="text-violet-600 hover:underline dark:text-violet-400">{order.buyerEmail}</a>} />}
          {order.buyerPhone && <Row label="Phone" value={<a href={`tel:${order.buyerPhone}`} className="text-violet-600 hover:underline dark:text-violet-400">{order.buyerPhone}</a>} />}
          {order.buyerNote && <Row label="Their note" value={`“${order.buyerNote}”`} />}
          {ship.length > 0 && <Row label="Ship to" value={<span className="whitespace-pre-line">{ship.join('\n')}</span>} />}
          {details.map(([k, v]) => <Row key={k} label={humanKey(k)} value={v} muted />)}
          <Row label="Paid" value={when(order.paidAt) || '—'} />
          {order.fulfilledAt && <Row label="Fulfilled" value={when(order.fulfilledAt)!} />}
        </dl>

        <div className="space-y-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {order.status === 'paid' && (
            <button
              onClick={() => { setBusyFor(order.status); onStatus('fulfilled'); }}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mark fulfilled
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={onMessage} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800">
              <MessageSquareText className="h-4 w-4" /> Message about it
            </button>
            {order.status === 'fulfilled' && (
              <button onClick={() => { setBusyFor(order.status); onStatus('paid'); }} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
                <RotateCcw className="h-4 w-4" /> Not yet
              </button>
            )}
            {order.stripePaymentIntentId && (
              <a
                href={`https://dashboard.stripe.com/payments/${order.stripePaymentIntentId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Stripe <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <dt className="w-24 flex-shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className={`min-w-0 flex-1 break-words ${muted ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-neutral-100'}`}>{value}</dd>
    </div>
  );
}

function dayLabel(d: Date): string {
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** The conversation as a text thread: your messages right, theirs left, in runs. */
function Thread({ messages, theirName, briefedId, onBrief, onOpenThread }: {
  messages: AppThreadMessage[];
  theirName: string;
  briefedId: string | null;
  onBrief: (id: string) => void;
  onOpenThread?: () => void;
}) {
  return (
    <div className="flex flex-col">
      {messages.map((m, i) => {
        const at = new Date(m.createdAt);
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const newDay = !prev || new Date(prev.createdAt).toDateString() !== at.toDateString();
        const startsRun = newDay || prev.sender !== m.sender || at.getTime() - new Date(prev.createdAt).getTime() > RUN_MS;
        const endsRun = !next || next.sender !== m.sender || new Date(next.createdAt).getTime() - at.getTime() > RUN_MS
          || new Date(next.createdAt).toDateString() !== at.toDateString();
        const mine = m.sender === 'publisher';
        return (
          <div key={m.id}>
            {newDay && <p className="my-3 text-center text-[11px] font-medium text-neutral-400">{dayLabel(at)}</p>}
            <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${startsRun ? 'mt-2' : 'mt-0.5'}`}>
              <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-[15px] leading-snug ${
                mine
                  ? `bg-violet-600 text-white ${endsRun ? 'rounded-br-[6px]' : ''}`
                  : `bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 ${endsRun ? 'rounded-bl-[6px]' : ''}`
              }`}>
                {m.body}
              </div>
            </div>
            {endsRun && (
              <div className={`mt-1 flex flex-wrap items-center gap-2 px-1 text-[11px] text-neutral-400 ${mine ? 'justify-end' : ''}`}>
                <span>{mine ? 'You' : theirName} · {at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                {!mine && (briefedId === m.id ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" /> In the build brief
                    {onOpenThread && <button onClick={onOpenThread} className="inline-flex items-center gap-0.5 underline">View <ArrowRight className="h-3 w-3" /></button>}
                  </span>
                ) : (
                  <button onClick={() => onBrief(m.id)} className="inline-flex items-center gap-1 hover:text-violet-500">
                    <CornerUpRight className="h-3 w-3" /> Add to build brief
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`px-3 py-2.5 rounded-xl border text-center ${accent ? 'border-amber-500/40 bg-amber-500/5' : 'border-neutral-200 dark:border-neutral-800'}`}>
      <p className={`text-base font-semibold ${accent ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-900 dark:text-white'}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</p>
    </div>
  );
}

function Initials({ name, strong }: { name: string; strong?: boolean }) {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length === 0 ? '?' : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
  return (
    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${strong ? 'bg-violet-600 text-white' : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200'}`}>
      {letters}
    </div>
  );
}

/** One line under their name: what they've bought and when you last saw them. */
function summary(member: AppAudienceMember): string {
  const bits: string[] = [];
  const orders = member.orderCount ?? 0;
  if (orders > 0) bits.push(`${orders} order${orders === 1 ? '' : 's'} · ${formatAppPrice(member.orderTotal ?? 0, member.currency ?? 'usd', null)}`);
  if (member.status === 'paid') bits.push(member.amountPaid ? `Paid ${formatAppPrice(member.amountPaid, member.currency, null)}` : 'Paid');
  else if (member.status === 'refunded') bits.push('Refunded');
  else if (member.status === 'canceled') bits.push('Access ended');
  if (member.messageCount > 0) bits.push(`${member.messageCount} message${member.messageCount === 1 ? '' : 's'}`);
  if (member.lastSeenAt) bits.push(`seen ${new Date(member.lastSeenAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
  return bits.join(' · ') || member.email;
}
