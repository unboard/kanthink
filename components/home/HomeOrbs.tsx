'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useStudioInfo } from '@/lib/hooks/useStudioInfo';
import { ReviewDrawer, usePendingGroups, type ReviewScope } from './ReviewDrawer';
import { OrdersDrawer, type OrderGroup } from './OrdersDrawer';

/**
 * What's waiting on you, as orbs drifting above the spore field.
 *
 * Shroom cards awaiting a decision and the Studio's sparks used to sit on Home as
 * panels between the greeting and the composer. Now each is a small orb that floats
 * around the edges with a count on it. An orb glows softly when something has
 * arrived since you last opened it; opening it shows everything in a drawer, where
 * you approve or reject — one at a time or all at once.
 */

const SEEN_KEY = 'kanthink-orbs-seen';
const listeners = new Set<() => void>();
function readSeen(): string {
  try { return localStorage.getItem(SEEN_KEY) || '{}'; } catch { return '{}'; }
}
function markSeen(orb: string, ids: string[]) {
  try {
    const seen = JSON.parse(readSeen()) as Record<string, string[]>;
    seen[orb] = ids.slice(-500);
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch { /* no storage: the glow just stays until the cards are decided */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function Orb({ label, count, fresh, onClick, icon, className }: { label: string; count: number; fresh: boolean; onClick: () => void; icon: React.ReactNode; className: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${count} waiting${fresh ? ', something new' : ''}`}
      title={`${label} · ${count}`}
      className={`pointer-events-auto absolute flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-neutral-900/70 text-violet-200 shadow-lg shadow-black/40 backdrop-blur-md transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-violet-400 ${fresh ? 'kan-orb-fresh' : ''} ${className}`}
    >
      {icon}
      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold text-white">
        {count > 99 ? '99+' : count}
      </span>
    </button>
  );
}

const ORB_CSS = `
@keyframes kan-orb-drift-a { 0%,100% { transform: translate(0,0) } 25% { transform: translate(14px,-18px) } 50% { transform: translate(-8px,-30px) } 75% { transform: translate(-16px,-10px) } }
@keyframes kan-orb-drift-b { 0%,100% { transform: translate(0,0) } 30% { transform: translate(-18px,12px) } 60% { transform: translate(10px,24px) } 80% { transform: translate(16px,6px) } }
@keyframes kan-orb-drift-c { 0%,100% { transform: translate(0,0) } 35% { transform: translate(12px,16px) } 65% { transform: translate(-14px,8px) } }
@keyframes kan-orb-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(167,139,250,0.5) } 50% { box-shadow: 0 0 0 12px rgba(167,139,250,0) } }
.kan-orb-a { animation: kan-orb-drift-a 22s ease-in-out infinite }
.kan-orb-b { animation: kan-orb-drift-b 27s ease-in-out infinite }
.kan-orb-c { animation: kan-orb-drift-c 31s ease-in-out infinite }
.kan-orb-fresh::before { content: ''; position: absolute; inset: -1px; border-radius: 9999px; animation: kan-orb-glow 2.6s ease-in-out infinite; pointer-events: none }
@media (prefers-reduced-motion: reduce) { .kan-orb-a, .kan-orb-b, .kan-orb-c, .kan-orb-fresh::before { animation: none } }
`;

export function HomeOrbs({ onOpenCard }: { onOpenCard: (cardId: string) => void }) {
  const { data: session } = useSession();
  const studio = useStudioInfo();
  const [open, setOpen] = useState<'shrooms' | 'sparks' | 'orders' | null>(null);
  // Orders across your apps. Refreshed when an order notification arrives, so the
  // orb appears without a reload.
  const [orderGroups, setOrderGroups] = useState<OrderGroup[]>([]);
  const signedIn = !!session?.user?.id;
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    const load = () => fetch('/api/orders', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.groups) setOrderGroups(d.groups as OrderGroup[]); })
      .catch(() => {});
    void load();
    const timer = setInterval(load, 60_000);
    return () => { live = false; clearInterval(timer); };
  }, [signedIn]);
  const toFulfilIds = orderGroups.flatMap((g) => g.orders.filter((o) => o.status === 'paid').map((o) => o.id));
  const seenRaw = useSyncExternalStore(subscribe, readSeen, () => '{}');
  const seen = useMemo(() => {
    try { return JSON.parse(seenRaw) as Record<string, string[]>; } catch { return {} as Record<string, string[]>; }
  }, [seenRaw]);

  const sparksColumn = studio?.sparksColumnId;
  const shroomScope = useMemo<ReviewScope>(() => ({
    include: (_channel, col) => col !== sparksColumn,
    title: 'Waiting on you',
    subtitle: 'cards your shrooms made',
    approveLabel: 'Approve',
    empty: 'Nothing waiting. Your shrooms leave cards here when they need a decision.',
  }), [sparksColumn]);
  const sparkScope = useMemo<ReviewScope>(() => ({
    include: (_channel, col) => !!sparksColumn && col === sparksColumn,
    title: 'Spark ideas',
    subtitle: 'approving one puts up its test page',
    approveLabel: 'Approve, put up a test page',
    empty: 'No sparks waiting. The scout brings new ones each morning.',
  }), [sparksColumn]);

  const shroomGroups = usePendingGroups(shroomScope);
  const sparkGroups = usePendingGroups(sparkScope);
  const shroomIds = shroomGroups.flatMap((g) => g.items.map((i) => i.cardId));
  const sparkIds = sparkGroups.flatMap((g) => g.items.map((i) => i.cardId));
  const isFresh = (orb: string, ids: string[]) => ids.some((id) => !(seen[orb] ?? []).includes(id));

  // The Studio's other waiting work, for the bottom of the sparks drawer.
  const [studioWeek, setStudioWeek] = useState<{ draftsWaiting: number; readyForYou: number; channelId: string } | null>(null);
  const admin = !!session?.user?.isAdmin;
  useEffect(() => {
    if (!admin || open !== 'sparks') return;
    let live = true;
    fetch('/api/studio')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.studio) setStudioWeek({ ...d.studio.week, channelId: d.studio.channelId }); })
      .catch(() => {});
    return () => { live = false; };
  }, [admin, open]);

  const openOrb = useCallback((orb: 'shrooms' | 'sparks' | 'orders', ids: string[]) => {
    markSeen(orb, ids);
    setOpen(orb);
  }, []);

  return (
    <>
      <style>{ORB_CSS}</style>

      {/* Above the spores, around the edges of the conversation; never in its way. */}
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
        {shroomIds.length > 0 && (
          <Orb
            label="Waiting on you"
            count={shroomIds.length}
            fresh={isFresh('shrooms', shroomIds)}
            onClick={() => openOrb('shrooms', shroomIds)}
            className="kan-orb-a left-[5%] top-[24%] md:left-[12%]"
            icon={<span className="text-lg leading-none">🍄</span>}
          />
        )}
        {sparkIds.length > 0 && (
          <Orb
            label="Spark ideas"
            count={sparkIds.length}
            fresh={isFresh('sparks', sparkIds)}
            onClick={() => openOrb('sparks', sparkIds)}
            className="kan-orb-b right-[5%] top-[32%] md:right-[12%]"
            icon={
              <svg className="h-5 w-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
            }
          />
        )}
        {toFulfilIds.length > 0 && (
          <Orb
            label="Orders to fulfil"
            count={toFulfilIds.length}
            fresh={isFresh('orders', toFulfilIds)}
            onClick={() => openOrb('orders', toFulfilIds)}
            className="kan-orb-c left-[8%] top-[52%] md:left-[18%]"
            icon={
              <svg className="h-5 w-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
              </svg>
            }
          />
        )}
      </div>

      <OrdersDrawer isOpen={open === 'orders'} onClose={() => setOpen(null)} groups={orderGroups} />
      <ReviewDrawer isOpen={open === 'shrooms'} onClose={() => setOpen(null)} scope={shroomScope} onOpenCard={onOpenCard} />
      <ReviewDrawer
        isOpen={open === 'sparks'}
        onClose={() => setOpen(null)}
        scope={sparkScope}
        onOpenCard={onOpenCard}
        footer={studioWeek && (studioWeek.draftsWaiting > 0 || studioWeek.readyForYou > 0) ? (
          <p className="text-xs text-neutral-500">
            Also in your Studio:{' '}
            {studioWeek.draftsWaiting > 0 && (
              <Link href="/people" className="text-violet-400 hover:underline">
                {studioWeek.draftsWaiting} email {studioWeek.draftsWaiting === 1 ? 'draft' : 'drafts'} in People
              </Link>
            )}
            {studioWeek.draftsWaiting > 0 && studioWeek.readyForYou > 0 && ' · '}
            {studioWeek.readyForYou > 0 && (
              <Link href={`/channel/${studioWeek.channelId}`} className="text-violet-400 hover:underline">
                {studioWeek.readyForYou} {studioWeek.readyForYou === 1 ? 'app' : 'apps'} ready to ship
              </Link>
            )}
          </p>
        ) : undefined}
      />
    </>
  );
}
