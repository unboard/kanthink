'use client';

/**
 * Kan's "working" indicators.
 *
 * Threads branch outward to nodes and retract, so the mark reads as actively
 * searching rather than idling — replaces the three bouncing dots that could
 * have belonged to any chat app.
 */

const THREADS = ['M16 16 L6 8', 'M16 16 L27 10', 'M16 16 L8 26', 'M16 16 L26 25', 'M16 16 L16 4', 'M16 16 L3 17'];
const NODES: [number, number][] = [[6, 8], [27, 10], [8, 26], [26, 25], [16, 4], [3, 17]];

/** Keyframes are injected once per mount point; scoped by the kan- prefix. */
function ThinkingStyles() {
  return (
    <style>{`
      @keyframes kan-thread { 0% { stroke-dasharray: 0 20; opacity: 0 } 25% { opacity: 1 } 60% { stroke-dasharray: 20 20; opacity: 1 } 100% { stroke-dasharray: 20 20; opacity: 0 } }
      .kan-thread { stroke-dasharray: 0 20; animation: kan-thread 2.4s ease-in-out infinite; }
      @keyframes kan-node { 0%,20% { transform: scale(0); opacity: 0 } 45% { transform: scale(1); opacity: 1 } 100% { transform: scale(.4); opacity: 0 } }
      .kan-node { transform-origin: center; transform-box: fill-box; animation: kan-node 2.4s ease-in-out infinite; }
      @keyframes kan-crawl { 0% { transform: translateX(-100%) } 100% { transform: translateX(300%) } }
      .kan-crawl { animation: kan-crawl 1.8s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .kan-thread, .kan-node, .kan-crawl { animation: none; }
        .kan-thread { stroke-dasharray: 20 20; opacity: .7; }
        .kan-node { opacity: .7; }
      }
    `}</style>
  );
}

/** The mycelium web mark on its own. */
export function MyceliumWeb({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <>
      <ThinkingStyles />
      <svg viewBox="0 0 32 32" width={size} height={size} className={`overflow-visible ${className}`} aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none">
          {THREADS.map((d, i) => (
            <path key={d} d={d} className="kan-thread" style={{ animationDelay: `${i * 220}ms` }} />
          ))}
        </g>
        {NODES.map(([cx, cy], i) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx} cy={cy} r="1.6"
            fill="currentColor"
            className="kan-node"
            style={{ animationDelay: `${i * 220 + 400}ms` }}
          />
        ))}
        <circle cx="16" cy="16" r="2.6" fill="currentColor" />
      </svg>
    </>
  );
}

/** Drop-in row for "Kan is thinking" in a chat thread. */
export function KanThinking({ label = 'Kan is thinking', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`} role="status" aria-live="polite">
      <MyceliumWeb size={22} className="text-violet-400" />
      <span className="text-xs text-neutral-400">{label}</span>
    </div>
  );
}

/**
 * Progress for work of unknown length. A Mixpanel export reports no real
 * progress, so this names the stage and shows elapsed time rather than
 * inventing a percentage — elapsed time is what makes a slow call visibly slow.
 */
export function KanWorkingBar({
  stage,
  step,
  totalSteps,
  elapsedMs,
  className = '',
}: {
  stage: string;
  step?: number;
  totalSteps?: number;
  elapsedMs?: number;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 ${className}`}>
      <ThinkingStyles />
      <div className="mb-2 flex items-center gap-2">
        <MyceliumWeb size={16} className="text-violet-400" />
        <span className="text-xs text-neutral-300">{stage}</span>
        {typeof elapsedMs === 'number' && (
          <span className="ml-auto tabular-nums text-[11px] text-neutral-500">{(elapsedMs / 1000).toFixed(1)}s</span>
        )}
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800">
        <div className="kan-crawl h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-violet-400 to-transparent" />
      </div>
      {typeof step === 'number' && typeof totalSteps === 'number' && (
        <p className="mt-2 text-[11px] text-neutral-600">Step {step} of {totalSteps}</p>
      )}
    </div>
  );
}
