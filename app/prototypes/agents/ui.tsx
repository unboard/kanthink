'use client';

import { CALLS, crewById, stageOf, type Call, type Stage } from './data';

export const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n) >= 100 ? Math.abs(n).toFixed(0) : Math.abs(n).toFixed(Math.abs(n) % 1 ? 2 : 0)}`;
export const pct = (n: number, d = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(d)}%`;

export function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export const STAGE_META: Record<Stage, { label: string; cls: string }> = {
  asking: { label: 'Your call', cls: 'bg-violet-500/15 text-violet-200 ring-violet-500/30' },
  watch: { label: 'Watching', cls: 'bg-neutral-800 text-neutral-400 ring-neutral-700' },
  passed: { label: 'Passed', cls: 'bg-neutral-900 text-neutral-500 ring-neutral-800' },
  skipped: { label: 'Skipped by scouts', cls: 'bg-neutral-900 text-neutral-500 ring-neutral-800' },
  practice: { label: 'Practice', cls: 'bg-amber-500/10 text-amber-200 ring-amber-500/30' },
  building: { label: 'Building', cls: 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30' },
  checking: { label: 'Checking', cls: 'bg-cyan-500/10 text-cyan-200 ring-cyan-500/30' },
  live: { label: 'Live', cls: 'bg-fuchsia-500/10 text-fuchsia-200 ring-fuchsia-500/30' },
  killed: { label: 'Killed', cls: 'bg-neutral-900 text-neutral-500 ring-neutral-800' },
};

export function StagePill({ stage, waiting }: { stage: Stage; waiting?: boolean }) {
  const m = STAGE_META[stage];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] ring-1 ${m.cls}`}>
      {m.label}
      {waiting && <span className="h-1.5 w-1.5 rounded-full bg-violet-400" title="Waiting on you" />}
    </span>
  );
}

export function CallPill({ call, by }: { call?: Call; by?: 'you' | 'kan' }) {
  if (!call) return null;
  const label = CALLS.find((c) => c.id === call)!.short;
  const yes = call === 'leanYes' || call === 'strong';
  return (
    <span className={`whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] ${yes ? 'border-violet-500/40 text-violet-300' : 'border-neutral-700 text-neutral-500'}`}>
      {by === 'kan' ? 'Kan' : 'You'}: {label}
    </span>
  );
}

export function AgentTag({ id }: { id: string }) {
  const st = stageOf(id);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] ${st.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
      {crewById(id).name}
    </span>
  );
}

/** A tiny line. Draws a zero line when the series crosses it. */
export function Spark({ values, width = 84, height = 26, tone = 'auto', dashed }: { values: number[]; width?: number; height?: number; tone?: 'auto' | 'amber'; dashed?: boolean }) {
  if (values.length < 2) return <span className="inline-block text-[10px] text-neutral-600" style={{ width }}>—</span>;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  const stroke = tone === 'amber' ? '#fbbf24' : last >= 0 ? '#34d399' : '#f87171';
  return (
    <svg width={width} height={height} className="flex-shrink-0 overflow-visible" aria-hidden>
      {min < 0 && max > 0 && <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="#404040" strokeDasharray="2 3" />}
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeDasharray={dashed ? '3 2' : undefined} />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2} fill={stroke} />
    </svg>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-800/80 bg-neutral-900/40 px-3 py-2.5">
      <p className="truncate text-[11px] text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-[19px] font-semibold tabular-nums tracking-tight ${tone ?? 'text-neutral-100'}`}>{value}</p>
      {sub && <p className="truncate text-[10.5px] text-neutral-600">{sub}</p>}
    </div>
  );
}

export function Btn({ children, onClick, kind = 'ghost', disabled }: { children: React.ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'violet' | 'quiet'; disabled?: boolean }) {
  const cls = {
    primary: 'bg-neutral-100 text-neutral-900 hover:bg-white font-medium',
    violet: 'bg-violet-500 text-white hover:bg-violet-400 font-medium',
    ghost: 'border border-neutral-700 text-neutral-300 hover:border-neutral-500',
    quiet: 'text-neutral-500 hover:text-neutral-300',
  }[kind];
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}

export function Chips({ options, onPick, tone = 'amber' }: { options: { id: string; label: string }[]; onPick: (id: string) => void; tone?: 'amber' | 'violet' }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onPick(o.id)}
          className={`rounded-full border border-neutral-700 px-2.5 py-1 text-[12px] text-neutral-300 ${tone === 'amber' ? 'hover:border-amber-400 hover:text-amber-200' : 'hover:border-violet-400 hover:text-violet-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Why({ children }: { children: React.ReactNode }) {
  return (
    <details className="group mt-3 text-[11.5px]">
      <summary className="cursor-pointer list-none text-neutral-500 hover:text-neutral-300">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>Why am I being asked?
      </summary>
      <p className="mt-1.5 pl-3 leading-relaxed text-neutral-400">{children}</p>
    </details>
  );
}
