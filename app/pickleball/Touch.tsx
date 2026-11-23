'use client';

// Touch controls for phones and tablets: a stick that appears wherever your left thumb
// lands, and one big button under your right thumb. Pointer events with capture, so two
// thumbs work at once and a thumb that slides off the stick still steers.

import { useRef, useState } from 'react';

export function TouchControls({ label, onStick, onPress }: {
  label: string;
  onStick: (x: number, y: number) => void;
  onPress: () => void;
}) {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [down, setDown] = useState(false);
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);
  const R = 56;

  const move = (cx: number, cy: number) => {
    const o = origin.current;
    if (!o) return;
    let dx = cx - o.x;
    let dy = cy - o.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ x: dx, y: dy });
    onStick(dx / R, -dy / R);
  };
  const end = () => {
    origin.current = null;
    setBase(null);
    setKnob({ x: 0, y: 0 });
    onStick(0, 0);
  };

  return (
    <>
      {/* the left half of the screen is the stick */}
      <div
        className="absolute bottom-0 left-0 top-[22%] w-1/2"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (origin.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          origin.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
          setBase({ x: e.clientX - r.left, y: e.clientY - r.top });
          setKnob({ x: 0, y: 0 });
        }}
        onPointerMove={(e) => { if (origin.current?.id === e.pointerId) move(e.clientX, e.clientY); }}
        onPointerUp={(e) => { if (origin.current?.id === e.pointerId) end(); }}
        onPointerCancel={(e) => { if (origin.current?.id === e.pointerId) end(); }}
      >
        {base ? (
          <div className="pointer-events-none absolute" style={{ left: base.x - R, top: base.y - R, width: R * 2, height: R * 2 }}>
            <div className="absolute inset-0 rounded-full border-2 border-white/35 bg-white/10 backdrop-blur-sm" />
            <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white/85 shadow-xl" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-[max(26px,env(safe-area-inset-bottom))] left-[max(26px,env(safe-area-inset-left))] flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-white/25 bg-white/[0.04] text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
            Move
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={label}
        className={`absolute bottom-[max(26px,env(safe-area-inset-bottom))] right-[max(22px,env(safe-area-inset-right))] flex h-[104px] w-[104px] items-center justify-center rounded-full border-4 border-[#14200a]/30 text-[15px] font-black uppercase tracking-wide text-[#14200a] shadow-[0_8px_0_#93b000,0_18px_40px_rgba(0,0,0,0.45)] transition-transform ${down ? 'translate-y-[5px] bg-[#f1ff9a] shadow-[0_3px_0_#93b000]' : 'bg-[#dcff3d]'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => { e.preventDefault(); setDown(true); onPress(); }}
        onPointerUp={() => setDown(false)}
        onPointerLeave={() => setDown(false)}
        onPointerCancel={() => setDown(false)}
      >
        {label}
      </button>
    </>
  );
}
