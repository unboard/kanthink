'use client';

import { useEffect, useRef, useState } from 'react';

/** A thumb stick for driving and flying on a phone. Up is forward (or climb). */
export function Stick({ onMove, bottom, hint }: { onMove(x: number, y: number): void; bottom: number; hint: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const send = useRef(onMove);
  useEffect(() => { send.current = onMove; });
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const R = r.width / 2;
    let dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    setKnob({ x: dx, y: dy });
    send.current(Math.abs(dx) < 0.12 ? 0 : dx, Math.abs(dy) < 0.12 ? 0 : -dy);
  };
  const end = () => { active.current = null; setKnob({ x: 0, y: 0 }); send.current(0, 0); };
  // Let go of the stick when it goes away.
  useEffect(() => () => send.current(0, 0), []);
  return (
    <div className="absolute left-5 z-20 flex flex-col items-center gap-1" style={{ bottom }}>
      <div
        ref={ref}
        onPointerDown={(e) => { active.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={(e) => { if (active.current === e.pointerId) move(e); }}
        onPointerUp={end}
        onPointerCancel={end}
        className="relative h-32 w-32 touch-none select-none rounded-full border border-white/20 bg-neutral-950/40 shadow-2xl backdrop-blur"
      >
        <div
          className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-violet-500/90 shadow-lg ring-2 ring-white/40"
          style={{ transform: `translate(calc(-50% + ${knob.x * 40}px), calc(-50% + ${knob.y * 40}px))` }}
        />
      </div>
      <span className="text-[11px] font-medium text-white/80 drop-shadow">{hint}</span>
    </div>
  );
}
