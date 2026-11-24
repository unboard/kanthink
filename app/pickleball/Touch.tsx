'use client';

// Touch controls for phones and tablets. One job per thumb:
//   left thumb  — move. A stick appears wherever it lands.
//   right thumb — the shot. Tap, or swipe the way you want the ball to go: up to spike
//                 or drive, a short flick to tip or dink, down to dive or lob, sideways
//                 to set or angle it. The game times the contact as the ball arrives,
//                 so your job is reading the ball and getting there.
// Pointer events with capture, so both thumbs work at once.

import { useRef, useState } from 'react';

export function TouchControls({ hint, onStick, onShot }: {
  hint: string;
  onStick: (x: number, y: number) => void;
  /** dx right, dy up, in pixels; returns the word for the shot */
  onShot: (dx: number, dy: number) => string;
}) {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);
  const swipe = useRef<{ id: number; x: number; y: number; lx: number; ly: number } | null>(null);
  const [trail, setTrail] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [flash, setFlash] = useState<{ word: string; x: number; y: number; k: number } | null>(null);
  const flashK = useRef(0);
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

  const release = (cx: number, cy: number, pad: DOMRect) => {
    const s = swipe.current;
    if (!s) return;
    swipe.current = null;
    const dx = cx - s.x;
    const dy = s.y - cy;
    const word = onShot(dx, dy);
    flashK.current += 1;
    setFlash({ word, x: s.x - pad.left, y: s.y - pad.top, k: flashK.current });
    const k = flashK.current;
    setTimeout(() => setFlash((f) => (f && f.k === k ? null : f)), 650);
    setTimeout(() => setTrail(null), 180);
  };

  return (
    <>
      <style>{`@keyframes pbShot { 0% { opacity: 0; transform: translate(-50%, -30%) scale(.8) } 25% { opacity: 1; transform: translate(-50%, -80%) scale(1.08) } 100% { opacity: 0; transform: translate(-50%, -140%) scale(1) } }`}</style>
      {/* left half: the stick */}
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

      {/* right half: the shot pad */}
      <div
        className="absolute bottom-0 right-0 top-[22%] w-1/2"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (swipe.current) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY };
          const r = e.currentTarget.getBoundingClientRect();
          setTrail({ x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top });
        }}
        onPointerMove={(e) => {
          const s = swipe.current;
          if (!s || s.id !== e.pointerId) return;
          s.lx = e.clientX;
          s.ly = e.clientY;
          const r = e.currentTarget.getBoundingClientRect();
          setTrail((t) => (t ? { ...t, x1: e.clientX - r.left, y1: e.clientY - r.top } : t));
          // a long, fast swipe doesn't wait for the finger to lift
          if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 190) release(e.clientX, e.clientY, r);
        }}
        onPointerUp={(e) => { if (swipe.current?.id === e.pointerId) release(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); }}
        onPointerCancel={(e) => { if (swipe.current?.id === e.pointerId) { swipe.current = null; setTrail(null); } }}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {trail && (
            <>
              <line x1={trail.x0} y1={trail.y0} x2={trail.x1} y2={trail.y1} stroke="#dcff3d" strokeWidth={10} strokeLinecap="round" opacity={0.75} />
              <circle cx={trail.x1} cy={trail.y1} r={14} fill="#dcff3d" opacity={0.9} />
            </>
          )}
        </svg>
        {flash && (
          <div key={flash.k} className="pointer-events-none absolute whitespace-nowrap rounded-full bg-[#dcff3d] px-3 py-1 text-[15px] font-black uppercase italic text-[#14200a] shadow-xl" style={{ left: flash.x, top: flash.y, animation: 'pbShot 650ms ease-out both' }}>
            {flash.word}
          </div>
        )}
        <div className="pointer-events-none absolute bottom-[max(22px,env(safe-area-inset-bottom))] right-[max(18px,env(safe-area-inset-right))] flex w-[min(230px,44vw)] flex-col items-center gap-1.5 rounded-3xl border-2 border-dashed border-white/25 bg-white/[0.05] px-3 py-3 text-center">
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#dcff3d]">Shot pad</div>
          <div className="text-[11px] leading-snug text-white/65">{hint}</div>
        </div>
      </div>
    </>
  );
}
