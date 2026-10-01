'use client';

/**
 * The studio's look: a cool morning page, ink-dark type set large, and one
 * colour — cobalt — that only ever means "your decision". Money is green and
 * nothing else is. Nothing on screen is smaller than 13px.
 */

export const THEME = {
  '--paper': '#F2F4F7',
  '--card': '#FFFFFF',
  '--ink': '#111A2E',
  '--soft': '#4A5468',
  '--faint': '#7C8597',
  '--line': '#DDE2EA',
  '--cobalt': '#2747E8',
  '--wash': '#E9EDFD',
  '--money': '#0E7A55',
  '--warn': '#A4501F',
} as React.CSSProperties;

export const money = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 10 || Number.isInteger(a) ? a.toFixed(0) : a.toFixed(2);
  return `${n < 0 ? '−' : ''}$${s}`;
};

export function duration(seconds: number) {
  if (seconds < 60) return `${seconds} seconds`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

export function Button({ children, onClick, kind = 'plain', disabled, wide }: {
  children: React.ReactNode; onClick?: () => void; kind?: 'decide' | 'plain' | 'quiet'; disabled?: boolean; wide?: boolean;
}) {
  const look = {
    decide: 'bg-(--cobalt) text-white hover:brightness-110',
    plain: 'bg-(--card) text-(--ink) ring-1 ring-(--line) hover:ring-(--faint)',
    quiet: 'text-(--soft) hover:text-(--ink) underline-offset-4 hover:underline',
  }[kind];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-5 py-3 text-[16px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cobalt) disabled:opacity-40 ${look} ${wide ? 'w-full' : ''}`}
    >
      {children}
    </button>
  );
}

/** One-tap reasons. Small on purpose: the decision already happened. */
export function Reasons({ prompt, options, onPick, onCancel }: { prompt: string; options: { id: string; label: string }[]; onPick: (id: string) => void; onCancel?: () => void }) {
  return (
    <div className="mt-5">
      <p className="text-[15px] text-(--soft)">{prompt}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick(o.id)}
            className="rounded-full bg-(--card) px-4 py-2 text-[15px] text-(--ink) ring-1 ring-(--line) transition hover:ring-(--cobalt) focus-visible:outline-2 focus-visible:outline-(--cobalt)"
          >
            {o.label}
          </button>
        ))}
        {onCancel && <button type="button" onClick={onCancel} className="px-2 text-[15px] text-(--faint) hover:text-(--ink)">Cancel</button>}
      </div>
    </div>
  );
}

/** A line that only rises or falls. No axes: the number next to it carries the value. */
export function Trend({ values, width = 96, height = 32, tone }: { values: number[]; width?: number; height?: number; tone?: 'money' | 'cobalt' }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const color = tone === 'cobalt' ? 'var(--cobalt)' : 'var(--money)';
  return (
    <svg width={width} height={height} className="flex-shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#111A2E]/30 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-[600px] overflow-y-auto rounded-t-[28px] bg-(--paper) px-6 pb-10 pt-6 sm:rounded-[28px]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.01em] text-(--ink)">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-[15px] text-(--soft) ring-1 ring-(--line) hover:text-(--ink)">Close</button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
