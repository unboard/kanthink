'use client';

// Small shared pieces of the court games' interface.

import { useEffect, useRef } from 'react';
import { drawPortrait, type Character } from './characters';

export const panel = 'rounded-3xl border border-white/10 bg-[#0b1424]/85 text-[#f3efe4] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl';
export const btnPrimary =
  'rounded-2xl bg-[#dcff3d] px-5 py-3 text-[15px] font-bold text-[#14200a] shadow-[0_6px_0_#93b000] transition hover:bg-[#e8ff7a] active:translate-y-[3px] active:shadow-[0_3px_0_#93b000] disabled:opacity-40 disabled:shadow-none';
export const btnGhost =
  'rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-[15px] font-semibold text-[#f3efe4] transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-40';
export const chip = (on: boolean) =>
  `rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${on ? 'bg-[#dcff3d] text-[#14200a]' : 'bg-white/[0.07] text-white/80 hover:bg-white/15'}`;

export function Center({ children }: { children: React.ReactNode }) {
  // the inner box grows past the screen instead of being clipped at the top, so short
  // phone screens can scroll a tall panel from its beginning
  return (
    <div className="absolute inset-0 overflow-y-auto overscroll-contain">
      <div className="flex min-h-full items-center justify-center p-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] sm:p-4">{children}</div>
    </div>
  );
}

export function Spinner() {
  return <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-[#dcff3d] align-[-2px]" />;
}

export function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-white/20 bg-white/10 px-1.5 font-mono text-[11px] text-white/90">
      {children}
    </kbd>
  );
}

/** a character's face, drawn in code */
export function Portrait({ c, size = 56, ring, className = '' }: { c: Character | null | undefined; size?: number; ring?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = c ? JSON.stringify(c) : '';
  useEffect(() => {
    if (!ref.current || !c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ref.current.width = Math.round(size * dpr);
    ref.current.height = Math.round(size * dpr);
    drawPortrait(ref.current, c, { ring });
    // the key covers every field of c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size, ring]);
  if (!c) {
    return (
      <div className={`flex items-center justify-center rounded-full border-2 border-dashed border-white/20 text-white/30 ${className}`} style={{ width: size, height: size }}>
        ?
      </div>
    );
  }
  return <canvas ref={ref} className={`rounded-full ${className}`} style={{ width: size, height: size }} />;
}

export function Swatches({ colors, value, onChange, round = true }: { colors: string[]; value: string; onChange: (c: string) => void; round?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={`h-9 w-9 border-2 transition ${round ? 'rounded-full' : 'rounded-xl'} ${value.toLowerCase() === c.toLowerCase() ? 'scale-110 border-white shadow-[0_0_0_3px_rgba(220,255,61,0.6)]' : 'border-white/10 hover:scale-105'}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

export function Options<T extends string>({ value, options, onChange }: { value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(options) as T[]).map((k) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={chip(value === k)}>{options[k]}</button>
      ))}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45 first:mt-0">{children}</div>;
}
