'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  PRODUCT_UPDATES,
  PRODUCT_UPDATE_KIND_LABELS,
  type ProductUpdateKind,
} from '@/lib/productUpdates';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

const KIND_STYLES: Record<ProductUpdateKind, string> = {
  capability: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  workflow: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  automation: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  fix: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

const KINDS: ProductUpdateKind[] = ['capability', 'workflow', 'automation', 'fix'];

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function SystemLogPage() {
  const [active, setActive] = useState<ProductUpdateKind | 'all'>('all');

  const grouped = useMemo(() => {
    const visible = active === 'all'
      ? PRODUCT_UPDATES
      : PRODUCT_UPDATES.filter((u) => u.kind === active);

    const byDate = new Map<string, typeof PRODUCT_UPDATES>();
    for (const update of visible) {
      const list = byDate.get(update.date) ?? [];
      list.push(update);
      byDate.set(update.date, list);
    }
    return Array.from(byDate.entries());
  }, [active]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: PRODUCT_UPDATES.length };
    for (const k of KINDS) c[k] = PRODUCT_UPDATES.filter((u) => u.kind === k).length;
    return c;
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <header className="mb-8">
          <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
            ← Back
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <KanthinkIcon size={28} className="text-violet-400" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">System log</h1>
              <p className="text-sm text-neutral-400">
                Meaningful changes to Kanthink. Kan knows the recent ones — ask it &ldquo;what&rsquo;s new?&rdquo; in chat or voice.
              </p>
            </div>
          </div>
        </header>

        <div className="mb-6 flex flex-wrap gap-2">
          {(['all', ...KINDS] as const).map((kind) => {
            const isActive = active === kind;
            const label = kind === 'all' ? 'All' : PRODUCT_UPDATE_KIND_LABELS[kind];
            return (
              <button
                key={kind}
                onClick={() => setActive(kind)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  isActive
                    ? 'border-neutral-500 bg-neutral-800 text-neutral-100'
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                {label}
                <span className="ml-1.5 text-neutral-500">{counts[kind] ?? 0}</span>
              </button>
            );
          })}
        </div>

        {grouped.length === 0 ? (
          <p className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-8 text-center text-sm text-neutral-500">
            Nothing logged under that filter yet.
          </p>
        ) : (
          <ol className="relative space-y-8 border-l border-neutral-800 pl-6">
            {grouped.map(([date, updates]) => (
              <li key={date} className="relative">
                <span className="absolute -left-[1.6875rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-neutral-950 bg-violet-500" />
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {formatDate(date)}
                </p>
                <div className="space-y-3">
                  {updates.map((u) => (
                    <article
                      key={u.id}
                      className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${KIND_STYLES[u.kind]}`}>
                          {PRODUCT_UPDATE_KIND_LABELS[u.kind]}
                        </span>
                        <h2 className="text-sm font-medium text-neutral-100">{u.title}</h2>
                      </div>
                      <p className="text-sm leading-relaxed text-neutral-400">{u.body}</p>
                    </article>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-10 text-xs text-neutral-600">
          Entries earn a place here only if they change how someone works. Polish, refactors and
          internal fixes are deliberately left out.
        </p>
      </div>
    </div>
  );
}
