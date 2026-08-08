'use client';

import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/**
 * The screen behind /not-found and /error.
 *
 * Deliberately dependency-light: the icon is a pure SVG and the drift is CSS
 * keyframes in a plain <style> tag. A page that only renders when something is
 * broken must not import the machinery that might be what broke — which rules
 * out SporeBackground, since it pulls in the tsparticles engine.
 */

export interface DeadEndAction {
  label: string;
  href?: string;
  onClick?: () => void;
  /** The one action worth leading with. Everything else stays quiet. */
  primary?: boolean;
  /** Sits under the action, for the one that needs explaining. */
  note?: string;
}

interface DeadEndProps {
  /** Small mono line above the headline. Says what kind of nothing this is. */
  eyebrow: string;
  title: string;
  body: string;
  actions: DeadEndAction[];
}

// Spores drift up and fade. Positions and delays are hand-picked rather than
// random so the composition is the same every time — a page you land on twice
// should look like the same place.
const SPORES = [
  { left: '12%', size: 3, delay: '0s', duration: '19s', tint: '#c4b5fd' },
  { left: '26%', size: 2, delay: '4s', duration: '23s', tint: '#a5f3fc' },
  { left: '41%', size: 4, delay: '9s', duration: '17s', tint: '#c4b5fd' },
  { left: '58%', size: 2, delay: '2s', duration: '25s', tint: '#67e8f9' },
  { left: '71%', size: 3, delay: '12s', duration: '20s', tint: '#c4b5fd' },
  { left: '86%', size: 2, delay: '6s', duration: '22s', tint: '#a5f3fc' },
];

export function DeadEnd({ eyebrow, title, body, actions }: DeadEndProps) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#151515] px-6 py-16">
      <style>{`
        @keyframes kan-drift {
          0%   { transform: translateY(12vh) scale(0.9); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateY(-88vh) scale(1.1); opacity: 0; }
        }
        @keyframes kan-breathe {
          0%, 100% { opacity: 0.28; transform: scale(1); }
          50%      { opacity: 0.42; transform: scale(1.03); }
        }
        @media (prefers-reduced-motion: reduce) {
          .kan-spore { animation: none !important; opacity: 0.35 !important; }
          .kan-mark  { animation: none !important; }
        }
      `}</style>

      {/* Drift */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {SPORES.map((s, i) => (
          <span
            key={i}
            className="kan-spore absolute bottom-0 rounded-full"
            style={{
              left: s.left,
              width: s.size,
              height: s.size,
              background: s.tint,
              boxShadow: `0 0 8px ${s.tint}`,
              opacity: 0,
              animation: `kan-drift ${s.duration} linear ${s.delay} infinite`,
            }}
          />
        ))}
      </div>

      {/* A single pool of light, so the mark reads as standing in the dark
          rather than floating on a flat panel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-[60%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 65%)' }}
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        <div
          className="kan-mark mb-9 text-violet-400"
          style={{ animation: 'kan-breathe 5.5s ease-in-out infinite' }}
        >
          <KanthinkIcon size={72} />
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">
          {eyebrow}
        </p>

        <h1 className="mt-4 text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-neutral-100 sm:text-[2.125rem]">
          {title}
        </h1>

        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-neutral-400">{body}</p>

        <div className="mt-9 flex w-full flex-col items-center gap-3">
          {actions.map((action) => {
            const className = action.primary
              ? 'w-full rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400'
              : 'w-full rounded-lg border border-neutral-800 px-5 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400';

            return (
              <div key={action.label} className="w-full">
                {action.href ? (
                  <a href={action.href} className={`block text-center ${className}`}>
                    {action.label}
                  </a>
                ) : (
                  <button type="button" onClick={action.onClick} className={className}>
                    {action.label}
                  </button>
                )}
                {action.note && (
                  <p className="mt-2 text-xs leading-relaxed text-neutral-600">{action.note}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
