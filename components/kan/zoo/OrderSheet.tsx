'use client';

import { useState } from 'react';
import { place } from '@/lib/kan/zoo/map';
import { MENUS, orderMath, type Order } from '@/lib/kan/zoo/meet';
import { money } from '@/lib/kan/zoo/sim';
import { Sheet } from './ZooSheets';

/**
 * Ordering lunch: tap what you want, see the sum build up line by line, and pay out
 * of the zoo's money (if there's enough).
 */
export function OrderSheet({ placeId, have, onClose, onPay }: { placeId: string; have: number; onClose: () => void; onPay: (order: Order) => void }) {
  const [order, setOrder] = useState<Order>({});
  const menu = MENUS[placeId] ?? [];
  const { lines, total } = orderMath(placeId, order);
  const add = (id: string, d: number) => setOrder((o) => ({ ...o, [id]: Math.max(0, Math.min(9, (o[id] ?? 0) + d)) }));
  const short = total > have;
  return (
    <Sheet title={place(placeId).name} emoji={place(placeId).emoji} onClose={onClose}>
      <div className="space-y-2">
        {menu.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-neutral-100 px-3 py-2">
            <span className="text-3xl">{m.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{m.name}</p>
              <p className="text-[13px] text-neutral-500">{money(m.price)}</p>
            </div>
            {(order[m.id] ?? 0) > 0 && <button onClick={() => add(m.id, -1)} aria-label={`One less ${m.name}`} className="h-9 w-9 rounded-full bg-white text-[18px] font-bold shadow active:scale-95">−</button>}
            {(order[m.id] ?? 0) > 0 && <span className="w-5 text-center text-[16px] font-bold tabular-nums">{order[m.id]}</span>}
            <button onClick={() => add(m.id, 1)} aria-label={`One more ${m.name}`} className="h-9 w-9 rounded-full bg-emerald-500 text-[18px] font-bold text-white shadow active:scale-95">+</button>
          </div>
        ))}
      </div>
      {/* Always there, so the menu doesn't jump when the first thing goes in. */}
      <div className="mt-3 min-h-[100px] rounded-2xl bg-amber-50 px-4 py-3 font-mono text-[14px] text-amber-900">
        {lines.length ? lines.map((l, i) => <p key={i} className={i === lines.length - 1 && lines.length > 1 ? 'mt-1 border-t border-amber-200 pt-1 font-bold' : ''}>{l}</p>)
          : <p className="font-sans text-amber-700">Tap + to add food. Your receipt shows up here.</p>}
      </div>
      <p className="mt-2 text-center text-[13px] text-neutral-500">The zoo has {money(have)}.{short ? ' That’s not enough for all of this!' : ''}</p>
      <button disabled={total === 0 || short} onClick={() => onPay(order)} className="mt-2 w-full rounded-full bg-emerald-500 py-3 text-[16px] font-bold text-white shadow-xl active:scale-95 disabled:opacity-40">
        {total ? `Pay ${money(total)}` : 'Pick something yummy'}
      </button>
    </Sheet>
  );
}
