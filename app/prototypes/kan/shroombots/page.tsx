'use client';

import { ShroomBot } from '@/components/kan/city/ShroomBot';
import { botLook } from '@/components/kan/city/look';

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const STATUSES = ['idle', 'working', 'needs', 'paused', 'off'] as const;

/** Every bot look side by side, at the sizes the city uses them. */
export default function ShroomBotsPage() {
  return (
    <div className="min-h-screen overflow-auto bg-neutral-950 p-6 text-neutral-200">
      <h1 className="mb-1 text-lg font-semibold">Shroom bots</h1>
      <p className="mb-6 text-sm text-neutral-400">Seeds 0–23 at 24, 40 and 80px, then each status.</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
        {SEEDS.map((s) => (
          <div key={s} className="flex items-end gap-2 rounded-xl bg-neutral-900 p-3">
            <ShroomBot seed={s} size={24} />
            <ShroomBot seed={s} size={40} />
            <ShroomBot seed={s} size={80} />
            <span className="ml-auto text-[10px] text-neutral-500">{s}<br />{botLook(s).pattern}</span>
          </div>
        ))}
      </div>
      <h2 className="mb-3 mt-8 text-sm font-semibold">Statuses</h2>
      <div className="flex flex-wrap gap-6">
        {STATUSES.map((st) => (
          <div key={st} className="flex flex-col items-center gap-1">
            <ShroomBot seed={3} size={64} status={st} />
            <span className="text-xs text-neutral-400">{st}</span>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-6 rounded-xl bg-white p-4">
        {SEEDS.slice(0, 10).map((s) => <ShroomBot key={s} seed={s} size={40} />)}
      </div>
    </div>
  );
}
