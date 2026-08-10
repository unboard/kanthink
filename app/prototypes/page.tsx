import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/**
 * Index of the prototype area.
 *
 * These are explorations, not shipped surfaces — each one is reachable only by
 * URL, which meant the only way to find one was to already know it existed.
 */
const PROTOTYPES: { slug: string; name: string; blurb: string; status?: string }[] = [
  {
    slug: 'save-confirm',
    name: 'Share confirmation',
    blurb: 'The screen you land on after sharing something in. Five alternatives to the green tick, each trying to make the moment land without promising what Kan will do next.',
    status: 'newest',
  },
  {
    slug: 'voice-speaking',
    name: 'Voice mode — speaking effect',
    blurb: 'Voice mode on a phone, with five alternatives to the aurora gradient that plays while Kan talks. The spore field underneath is the real one.',
  },
  {
    slug: 'kan-presence',
    name: 'Kan presence',
    blurb: 'How Kan looks and sounds while working: progress states, thinking indicators built from the mushroom, and the voice loops you can play. Mycelium web and Surge shipped from here.',
  },
  {
    slug: 'shroom-cards',
    name: 'Shroom cards',
    blurb: 'Thirteen ways to present an automation on the board — specimen slabs, field notes, spore prints, gills.',
  },
  {
    slug: 'card-drawer-v3',
    name: 'Card drawer v3',
    blurb: 'Third pass at the card detail drawer.',
  },
  {
    slug: 'card-drawer-v2',
    name: 'Card drawer v2',
    blurb: 'Second pass at the card detail drawer.',
  },
  {
    slug: 'card-detail',
    name: 'Card detail',
    blurb: 'Full-page card view explorations.',
  },
  {
    slug: 'action-drawer',
    name: 'Action drawer',
    blurb: 'Layouts for proposing and confirming AI actions.',
  },
  {
    slug: 'overlays',
    name: 'Overlays',
    blurb: 'Modal, sheet and popover treatments.',
  },
  {
    slug: 'skeleton',
    name: 'Skeleton',
    blurb: 'Loading placeholder styles.',
  },
];

export default function PrototypesIndexPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <header className="mb-8">
          <Link href="/" className="text-xs text-neutral-500 transition-colors hover:text-neutral-300">
            ← Back
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <KanthinkIcon size={28} className="text-violet-400" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Prototypes</h1>
              <p className="text-sm text-neutral-400">
                Explorations to look at and choose from. Nothing here is wired into the app.
              </p>
            </div>
          </div>
        </header>

        <ul className="space-y-2">
          {PROTOTYPES.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/prototypes/${p.slug}`}
                className="block rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 transition-colors hover:border-neutral-600 hover:bg-neutral-900"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-100">{p.name}</span>
                  {p.status && (
                    <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-300">
                      {p.status}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-neutral-600">/{p.slug}</span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{p.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-xs text-neutral-600">
          Looking for shipped changes instead?{' '}
          <Link href="/system-log" className="text-violet-400 hover:underline">
            System log
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
