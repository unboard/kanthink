'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Package, RotateCcw } from 'lucide-react';
import { formatAppPrice } from '@/lib/playground/appAccess';

type Order = {
  id: string;
  number: number;
  item: string;
  quantity: number;
  details: Record<string, string> | null;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'fulfilled' | 'canceled' | 'refunded';
  buyerEmail: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  buyerNote: string | null;
  shipping: Record<string, string> | null;
  createdAt: string;
  paidAt: string | null;
  appUserId?: string | null;
};

const STATUS: Record<Order['status'], { label: string; cls: string }> = {
  pending: { label: 'Checking out', cls: 'text-neutral-400' },
  paid: { label: 'To fulfil', cls: 'text-amber-600 dark:text-amber-400' },
  fulfilled: { label: 'Done', cls: 'text-emerald-600 dark:text-emerald-400' },
  canceled: { label: 'Canceled', cls: 'text-neutral-400' },
  refunded: { label: 'Refunded', cls: 'text-neutral-400' },
};

/**
 * A shop's orders: who bought what, how to reach them, and a tick when it's handed
 * over. Paid orders waiting on you come first.
 */
export function AppOrdersSection({ appId, appUserId, hideWhenEmpty, title = 'Orders' }: {
  appId: string;
  /** Only this person's orders. */
  appUserId?: string;
  /** Render nothing until there is an order to show. */
  hideWhenEmpty?: boolean;
  title?: string;
}) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/playground/apps/${appId}/orders`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Could not load orders'); return; }
      const all = data.orders as Order[];
      setOrders(appUserId ? all.filter((o) => o.appUserId === appUserId) : all);
    } catch {
      setError('Could not load orders');
    }
  }, [appId, appUserId]);

  useEffect(() => { void load(); }, [load]);

  const mark = async (order: Order, status: 'fulfilled' | 'paid') => {
    setUpdating(order.id);
    try {
      const res = await fetch(`/api/playground/apps/${appId}/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, status }),
      });
      const data = await res.json();
      if (res.ok && data?.order) setOrders((list) => (list ?? []).map((o) => (o.id === order.id ? (data.order as Order) : o)));
      else setError(data?.error || 'Could not update the order');
    } finally {
      setUpdating(null);
    }
  };

  const rank = (o: Order) => (o.status === 'paid' ? 0 : o.status === 'pending' ? 1 : 2);
  const sorted = [...(orders ?? [])].sort((a, b) => rank(a) - rank(b));
  const waiting = sorted.filter((o) => o.status === 'paid').length;

  if (hideWhenEmpty && (orders === null || orders.length === 0) && !error) return null;

  return (
    <section>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
        {title}{waiting ? ` · ${waiting} to fulfil` : ''}
      </h3>
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800">
        {orders === null && !error && (
          <p className="flex items-center gap-2 px-3 py-3 text-xs text-neutral-400"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>
        )}
        {error && <p className="px-3 py-3 text-xs text-red-500">{error}</p>}
        {orders && orders.length === 0 && (
          <p className="flex items-center gap-2 px-3 py-3 text-xs text-neutral-500"><Package className="h-3.5 w-3.5" /> No orders yet. They appear here, and you get a notification, the moment someone pays.</p>
        )}
        {sorted.length > 0 && (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {sorted.map((o) => (
              <li key={o.id} className="px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-neutral-900 dark:text-white">
                      <span className="tabular-nums text-neutral-400">#{o.number}</span>{' '}
                      {o.quantity > 1 ? `${o.quantity} × ` : ''}{o.item}
                      <span className="ml-1.5 tabular-nums text-neutral-500">{formatAppPrice(o.amount, o.currency, null)}</span>
                    </p>
                    {(o.buyerName || o.buyerEmail) && (
                      <p className="mt-0.5 text-[11px] text-neutral-600 dark:text-neutral-300">
                        {o.buyerName}{o.buyerName && o.buyerEmail ? ' · ' : ''}
                        {o.buyerEmail && <a href={`mailto:${o.buyerEmail}`} className="hover:underline">{o.buyerEmail}</a>}
                        {o.buyerPhone && <> · <a href={`tel:${o.buyerPhone}`} className="hover:underline">{o.buyerPhone}</a></>}
                      </p>
                    )}
                    {o.buyerNote && <p className="mt-0.5 text-[11px] text-neutral-500">“{o.buyerNote}”</p>}
                    {o.details && <p className="mt-0.5 text-[10.5px] text-neutral-400">{Object.entries(o.details).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
                    {o.shipping && <p className="mt-0.5 text-[10.5px] text-neutral-500">{[o.shipping.name, o.shipping.line1, o.shipping.line2, o.shipping.city, o.shipping.state, o.shipping.postal_code].filter(Boolean).join(', ')}</p>}
                    <p className={`mt-0.5 text-[10.5px] font-medium ${STATUS[o.status].cls}`}>
                      {STATUS[o.status].label}
                      <span className="font-normal text-neutral-400"> · {new Date(o.paidAt || o.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </p>
                  </div>
                  {o.status === 'paid' && (
                    <button
                      onClick={() => void mark(o, 'fulfilled')}
                      disabled={updating === o.id}
                      className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-[11px] text-neutral-700 hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
                    >
                      {updating === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Fulfilled
                    </button>
                  )}
                  {o.status === 'fulfilled' && (
                    <button onClick={() => void mark(o, 'paid')} disabled={updating === o.id} aria-label="Mark not fulfilled" title="Mark not fulfilled" className="flex-shrink-0 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800">
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
