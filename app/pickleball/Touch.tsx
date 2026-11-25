'use client';

// Touch controls for phones and tablets. One job per thumb:
//   left thumb  — move. A stick appears wherever it lands.
//   right thumb — the shot. Tap, or swipe the way you want the ball to go. The game times
//                 the contact as the ball arrives, so your job is reading it and getting there.
// No instructions to read: a small compass under the right thumb shows the four moves,
// lights up when the ball is yours to play, and shows the shot you're about to make while
// your thumb is still moving. Once you've played a while the words fade, leaving the arrows.
// Pointer events with capture, so both thumbs work at once.

import { useEffect, useRef, useState } from 'react';

type Pad = { tap: string; up: string; flick: string; down: string; side: string; serve: string };
type Arm = 'tap' | 'up' | 'down' | 'left' | 'right';

const LIME = '#dcff3d';
const LEARNED = 30;

function armOf(dx: number, dy: number): Arm {
  const len = Math.hypot(dx, dy);
  if (len < 16) return 'tap';
  if (dy > len * 0.55) return 'up';
  if (dy < -len * 0.55) return 'down';
  return dx > 0 ? 'right' : 'left';
}

export function TouchControls({ pad, sportId, ready, serving, preview, onStick, onShot }: {
  pad: Pad;
  sportId: string;
  /** the ball is yours to play now */
  ready: boolean;
  serving: boolean;
  /** the word a swipe would make, without making it */
  preview: (dx: number, dy: number) => string;
  onStick: (x: number, y: number) => void;
  /** dx right, dy up, in pixels; returns the word for the shot */
  onShot: (dx: number, dy: number) => string;
}) {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number; arm: Arm; word: string } | null>(null);
  const [flash, setFlash] = useState<{ word: string; x: number; y: number; k: number } | null>(null);
  const [fired, setFired] = useState<{ arm: Arm; k: number } | null>(null);
  const flashK = useRef(0);
  const [uses, setUses] = useState(0);
  const storeKey = `court-pad-uses-${sportId}`;
  const R = 56;

  useEffect(() => {
    try { setUses(Number(localStorage.getItem(storeKey)) || 0); } catch { /* private mode */ }
  }, [storeKey]);

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

  const release = (cx: number, cy: number, box: DOMRect) => {
    const s = swipe.current;
    if (!s) return;
    swipe.current = null;
    const dx = cx - s.x;
    const dy = s.y - cy;
    const word = onShot(dx, dy);
    flashK.current += 1;
    const k = flashK.current;
    setFlash({ word, x: cx - box.left, y: cy - box.top, k });
    setFired({ arm: armOf(dx, dy), k });
    setDrag(null);
    setTimeout(() => setFlash((f) => (f && f.k === k ? null : f)), 900);
    setTimeout(() => setFired((f) => (f && f.k === k ? null : f)), 420);
    setUses((u) => {
      const n = u + 1;
      try { if (n <= LEARNED + 1) localStorage.setItem(storeKey, String(n)); } catch { /* private mode */ }
      return n;
    });
  };

  const live = drag?.arm ?? fired?.arm ?? null;
  const learned = uses >= LEARNED;
  const showWords = !learned || !!drag;
  const center = serving ? pad.serve : pad.tap;

  const armStyle = (a: Arm) => {
    const on = live === a;
    return {
      color: on ? '#14200a' : 'rgba(255,255,255,0.92)',
      background: on ? LIME : 'rgba(10,14,20,0.42)',
      borderColor: on ? LIME : ready ? 'rgba(220,255,61,0.55)' : 'rgba(255,255,255,0.22)',
      transform: on ? 'scale(1.12)' : 'scale(1)',
    };
  };
  const Chevron = ({ rot }: { rot: number }) => (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: `rotate(${rot}deg)` }} aria-hidden>
      <path d="M2 8 L6 4 L10 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const ArmChip = ({ a, rot, label, sub }: { a: Arm; rot: number; label: string; sub?: string }) => (
    <div className="flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-black uppercase italic leading-none tracking-wide shadow-lg transition-all duration-100" style={armStyle(a)}>
      <Chevron rot={rot} />
      {showWords && <span>{label}</span>}
      {showWords && sub && <span className="font-bold normal-case not-italic opacity-60">{sub}</span>}
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes pbShot { 0% { opacity: 0; transform: translate(-50%, -60%) scale(.7) } 20% { opacity: 1; transform: translate(-50%, -120%) scale(1.12) } 100% { opacity: 0; transform: translate(-50%, -190%) scale(1) } }
        @keyframes pbReady { 0% { transform: translate(-50%, -50%) scale(.85); opacity: .9 } 100% { transform: translate(-50%, -50%) scale(1.9); opacity: 0 } }
      `}</style>

      {/* left half: the stick */}
      <div
        className="absolute bottom-0 left-0 top-[calc(max(8px,env(safe-area-inset-top))+56px)] w-1/2"
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
        {/* Nothing drawn until a thumb lands: the whole left half is the stick, so
            there's no ring to aim for and nothing to slide out of. */}
        {base && (
          <div className="pointer-events-none absolute" style={{ left: base.x - R, top: base.y - R, width: R * 2, height: R * 2 }}>
            <div className="absolute inset-0 rounded-full border-2 border-white/25 bg-white/[0.06]" />
            <div className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/70 shadow-xl" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
          </div>
        )}
      </div>

      {/* right half: the shot pad. Swipe anywhere here. */}
      <div
        className="absolute bottom-0 right-0 top-[calc(max(8px,env(safe-area-inset-top))+56px)] w-1/2"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (swipe.current) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          const r = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - r.left;
          const y = e.clientY - r.top;
          setDrag({ x0: x, y0: y, x1: x, y1: y, arm: 'tap', word: preview(0, 0) });
        }}
        onPointerMove={(e) => {
          const s = swipe.current;
          if (!s || s.id !== e.pointerId) return;
          const r = e.currentTarget.getBoundingClientRect();
          const dx = e.clientX - s.x;
          const dy = s.y - e.clientY;
          // a long swipe doesn't wait for the finger to lift
          if (Math.hypot(dx, dy) > 190) { release(e.clientX, e.clientY, r); return; }
          setDrag((d) => (d ? { ...d, x1: e.clientX - r.left, y1: e.clientY - r.top, arm: armOf(dx, dy), word: preview(dx, dy) } : d));
        }}
        onPointerUp={(e) => { if (swipe.current?.id === e.pointerId) release(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); }}
        onPointerCancel={(e) => { if (swipe.current?.id === e.pointerId) { swipe.current = null; setDrag(null); } }}
      >
        {/* the thumb's path, and the shot it's about to make */}
        {drag && (
          <>
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <line x1={drag.x0} y1={drag.y0} x2={drag.x1} y2={drag.y1} stroke={LIME} strokeWidth={9} strokeLinecap="round" opacity={0.7} />
              <circle cx={drag.x0} cy={drag.y0} r={7} fill="white" opacity={0.6} />
              <circle cx={drag.x1} cy={drag.y1} r={15} fill={LIME} opacity={0.9} />
            </svg>
            <div className="pointer-events-none absolute whitespace-nowrap rounded-full bg-black/70 px-3 py-1 text-[15px] font-black uppercase italic text-white shadow-xl" style={{ left: drag.x1, top: drag.y1 - 58, transform: 'translateX(-50%)' }}>
              {drag.word}
            </div>
          </>
        )}
        {flash && (
          // Where the thumb lifted, but above it so the thumb doesn't hide it: a small,
          // quiet word for the shot you just made ("Dive left", "Spike deep"), under
          // the game's own big calls rather than competing with them.
          <div key={flash.k} className="pointer-events-none absolute whitespace-nowrap rounded-full bg-black/60 px-2.5 py-0.5 text-[13px] font-black uppercase italic shadow-lg" style={{ left: flash.x, top: flash.y - 46, color: LIME, animation: 'pbShot 900ms ease-out both' }}>
            {flash.word}
          </div>
        )}

        {/* the compass: four moves around a tap, under the resting thumb */}
        <div
          className="pointer-events-none absolute"
          style={{ right: 'max(18px, env(safe-area-inset-right))', bottom: 'max(18px, env(safe-area-inset-bottom))', width: 214, height: 164, opacity: drag || ready ? 0.9 : learned ? 0.25 : 0.5, transform: 'scale(0.78)', transformOrigin: '100% 100%', transition: 'opacity 150ms' }}
        >
          <div className="absolute left-1/2 top-1/2" style={{ width: 64, height: 64 }}>
            {ready && <div className="absolute left-1/2 top-1/2 h-16 w-16 rounded-full border-[3px]" style={{ borderColor: LIME, animation: 'pbReady 1s ease-out infinite' }} />}
            <div
              className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[12px] font-black uppercase italic shadow-xl transition-all duration-100"
              style={{
                background: live === 'tap' ? LIME : ready ? 'rgba(220,255,61,0.22)' : 'rgba(10,14,20,0.42)',
                borderColor: ready || live === 'tap' ? LIME : 'rgba(255,255,255,0.25)',
                color: live === 'tap' ? '#14200a' : 'white',
              }}
            >
              {center}
            </div>
          </div>
          <div className="absolute left-1/2 top-0 -translate-x-1/2"><ArmChip a="up" rot={0} label={pad.up} sub={showWords ? `· flick ${pad.flick}` : undefined} /></div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2"><ArmChip a="down" rot={180} label={pad.down} /></div>
          <div className="absolute left-0 top-1/2 -translate-y-1/2"><ArmChip a="left" rot={-90} label={pad.side} /></div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2"><ArmChip a="right" rot={90} label={pad.side} /></div>
        </div>
      </div>
    </>
  );
}
