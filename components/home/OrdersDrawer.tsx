'use client';

import Link from 'next/link';
import { Drawer } from '@/components/ui/Drawer';
import { formatAppPrice } from '@/lib/playground/appAccess';

export type OrderGroup = {
  app: { id: string; title: string; cardId: string; channelId: string; thumbnailUrl: string | null };
  toFulfil: number;
  orders: Array<{
    id: string;
    number: number;
    item: string;
    quantity: number;
    amount: number;
    currency: string;
    status: 'paid' | 'fulfilled' | 'pending' | 'canceled' | 'refunded';
    buyerName: string | null;
    buyerEmail: string | null;
    buyerPhone: string | null;
    buyerNote: string | null;
    paidAt: string | null;
  }>;
};

/** The app drawer's People tab, where each order is handled. */
export function peopleHref(app: OrderGroup['app']) {
  return `/channel/${app.channelId}/card/${app.cardId}?app=${app.id}&pane=people`;
}

/**
 * Orders across every app you sell from, broken out by app. Fulfilling happens on
 * each app's People tab, a click away, where the buyer's thread lives too.
 */
export function OrdersDrawer({ isOpen, onClose, groups }: { isOpen: boolean; onClose: () => void; groups: OrderGroup[] }) {
  const waiting = groups.reduce((n, g) => n + g.toFulfil, 0);
  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="md" floating hideCloseButton>
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-white">Orders</h2>
            <p className="text-xs text-neutral-500">{waiting ? `${waiting} to fulfill` : 'All fulfilled'} · across your apps</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200" aria-label="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {groups.length === 0 && <p className="py-12 text-center text-sm text-neutral-500">No orders yet. They appear here the moment someone pays.</p>}
          {groups.map((g) => {
            const total = g.orders.reduce((n, o) => n + o.amount, 0);
            return (
              <div key={g.app.id} className="mb-4">
                <div className="flex items-center gap-2 px-2 pb-1.5 pt-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{g.app.title}</span>
                  <span className="text-[11px] text-neutral-500">· {formatAppPrice(total, g.orders[0]?.currency ?? 'usd', null)}</span>
                  <Link href={peopleHref(g.app)} onClick={onClose} className="ml-auto text-[11px] font-medium text-violet-500 hover:underline">
                    Open People
                  </Link>
                </div>
                <div className="space-y-1">
                  {g.orders.slice(0, 12).map((o) => (
                    <Link
                      key={o.id}
                      href={peopleHref(g.app)}
                      onClick={onClose}
                      className="flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/70"
                    >
                      <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${o.status === 'paid' ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-neutral-900 dark:text-white">
                          <span className="tabular-nums text-neutral-400">#{o.number}</span> {o.quantity > 1 ? `${o.quantity} × ` : ''}{o.item}
                        </span>
                        <span className="block truncate text-[11px] text-neutral-500">
                          {o.buyerName || o.buyerEmail}{o.buyerPhone ? ` · ${o.buyerPhone}` : ''} · {formatAppPrice(o.amount, o.currency, null)}
                          {o.status === 'paid' ? ' · to fulfill' : ' · done'}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}
