'use client';

// Touch controls for phones and tablets, the same in every court game. Two circles, one
// per thumb, and neither has a spot you have to find:
//
//   left half  — the move stick. Wherever your thumb lands, a stick appears under it, and
//                it follows if your thumb wanders past its edge. Analog: a small push is
//                a small step.
//   right half — the action stick. Wherever your thumb lands, a matching circle appears.
//                Tap to make the everyday shot; drag to aim a different one, and the
//                circle names the shot while you drag. Let go (or flick far) to make it.
//
// At rest, each circle waits faintly in its bottom corner as a reminder of what lives on
// that side; the right one lights up when the ball is yours. There are no arrows, no
// labels to read and no zones to stay inside: the whole half is yours.
// Pointer events with capture, so both thumbs work at once and a thumb that slides out
// of its half keeps working until it lifts.

import { useEffect, useRef, useState } from 'react';

type Pad = { tap: string; up: string; flick: string; down: string; side: string; serve: string };

const LIME = '#dcff3d';
/** circle radius, in CSS pixels */
const R = 58;
/** a drag this far makes the shot without waiting for the lift: a flick */
const FLICK = 190;
/** after this many shots the "tap · drag" reminder goes */
const LEARNED = 30;
const TOP = 'top-[calc(max(8px,env(safe-area-inset-top))+56px)]';

export function TouchControls({ pad, sportId, ready, serving, preview, onStick, onShot }: {
  pad: Pad;
  sportId: string;
  /** the ball is yours to play now */
  ready: boolean;
  serving: boolean;
  /** the word a drag would make, without making it */
  preview: (dx: number, dy: number) => string;
  onStick: (x: number, y: number) => void;
  /** dx right, dy up, in pixels; returns the word for the shot */
  onShot: (dx: number, dy: number) => string;
}) {
  // move stick: its center (in client pixels) and the knob, relative to it
  const move = useRef<{ id: number; x: number; y: number } | null>(null);
  const [moveAt, setMoveAt] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  // action stick
  const act = useRef<{ id: number; x: number; y: number } | null>(null);
  const [actAt, setActAt] = useState<{ x: number; y: number } | null>(null);
  const [aim, setAim] = useState({ x: 0, y: 0, word: '' });
  const [flash, setFlash] = useState<{ word: string; x: number; y: number; k: number } | null>(null);
  const flashK = useRef(0);
  const [uses, setUses] = useState(0);
  const storeKey = `court-pad-uses-${sportId}`;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a saved count once
    try { setUses(Number(localStorage.getItem(storeKey)) || 0); } catch { /* private mode */ }
  }, [storeKey]);

  const learned = uses >= LEARNED;
  const everyday = serving ? pad.serve : pad.tap;

  // ——— the move stick ———
  const moveTo = (cx: number, cy: number, box: DOMRect) => {
    const o = move.current;
    if (!o) return;
    let dx = cx - o.x;
    let dy = cy - o.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      // the stick follows a thumb that runs past its edge, so you never run out of room
      o.x += (dx / d) * (d - R);
      o.y += (dy / d) * (d - R);
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setMoveAt({ x: o.x - box.left, y: o.y - box.top });
    setKnob({ x: dx, y: dy });
    onStick(dx / R, -dy / R);
  };
  const moveEnd = () => {
    move.current = null;
    setMoveAt(null);
    setKnob({ x: 0, y: 0 });
    onStick(0, 0);
  };

  // ——— the action stick ———
  const release = (cx: number, cy: number, box: DOMRect) => {
    const s = act.current;
    if (!s) return;
    act.current = null;
    const dx = cx - s.x;
    const dy = s.y - cy;
    const word = onShot(dx, dy);
    flashK.current += 1;
    const k = flashK.current;
    // the word shows just above where the circle was, not under the thumb
    setFlash({ word, x: s.x - box.left, y: s.y - box.top - R - 10, k });
    setActAt(null);
    setAim({ x: 0, y: 0, word: '' });
    setTimeout(() => setFlash((f) => (f && f.k === k ? null : f)), 900);
    setUses((u) => {
      const n = u + 1;
      try { if (n <= LEARNED + 1) localStorage.setItem(storeKey, String(n)); } catch { /* private mode */ }
      return n;
    });
  };

  const ring = (on: boolean, glow: boolean): React.CSSProperties => ({
    borderColor: on ? LIME : glow ? 'rgba(220,255,61,0.75)' : 'rgba(255,255,255,0.28)',
    background: glow ? 'rgba(220,255,61,0.12)' : 'rgba(255,255,255,0.06)',
  });

  return (
    <>
      <style>{`
        @keyframes pbShot { 0% { opacity: 0; transform: translate(-50%, -20%) scale(.8) } 18% { opacity: 1; transform: translate(-50%, -70%) scale(1.08) } 100% { opacity: 0; transform: translate(-50%, -150%) scale(1) } }
        @keyframes pbReady { 0% { transform: scale(1); opacity: .8 } 100% { transform: scale(1.45); opacity: 0 } }
      `}</style>

      {/* left half: move */}
      <div
        className={`absolute bottom-0 left-0 ${TOP} w-1/2`}
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (move.current) return;
          capture(e.currentTarget, e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          move.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          setMoveAt({ x: e.clientX - r.left, y: e.clientY - r.top });
          setKnob({ x: 0, y: 0 });
        }}
        onPointerMove={(e) => { if (move.current?.id === e.pointerId) moveTo(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); }}
        onPointerUp={(e) => { if (move.current?.id === e.pointerId) moveEnd(); }}
        onPointerCancel={(e) => { if (move.current?.id === e.pointerId) moveEnd(); }}
      >
        {moveAt ? (
          <Circle x={moveAt.x} y={moveAt.y} style={ring(true, false)}>
            <div className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/80 shadow-xl" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
          </Circle>
        ) : (
          <Resting side="left" style={ring(false, false)}>
            <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25" />
            {!learned && <Hint>move</Hint>}
          </Resting>
        )}
      </div>

      {/* right half: the shot */}
      <div
        className={`absolute bottom-0 right-0 ${TOP} w-1/2`}
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (act.current) return;
          e.preventDefault();
          capture(e.currentTarget, e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          act.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          setActAt({ x: e.clientX - r.left, y: e.clientY - r.top });
          setAim({ x: 0, y: 0, word: preview(0, 0) });
        }}
        onPointerMove={(e) => {
          const s = act.current;
          if (!s || s.id !== e.pointerId) return;
          const dx = e.clientX - s.x;
          const dy = s.y - e.clientY;
          const d = Math.hypot(dx, dy);
          if (d > FLICK) { release(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); return; }
          const k = d > R ? R / d : 1;
          setAim({ x: dx * k, y: -dy * k, word: preview(dx, dy) });
        }}
        onPointerUp={(e) => { if (act.current?.id === e.pointerId) release(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); }}
        onPointerCancel={(e) => { if (act.current?.id === e.pointerId) { act.current = null; setActAt(null); } }}
      >
        {actAt ? (
          <Circle x={actAt.x} y={actAt.y} style={ring(true, ready)}>
            {/* the aim: a line from the middle to the thumb, and the shot it makes */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <line x1={R} y1={R} x2={R + aim.x} y2={R + aim.y} stroke={LIME} strokeWidth={6} strokeLinecap="round" opacity={0.8} />
            </svg>
            <div className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full shadow-xl" style={{ background: LIME, transform: `translate(calc(-50% + ${aim.x}px), calc(-50% + ${aim.y}px))` }} />
            <div className="absolute left-1/2 whitespace-nowrap rounded-full bg-black/70 px-2.5 py-0.5 text-[13px] font-black uppercase italic text-white shadow-lg" style={{ top: -30, transform: 'translateX(-50%)' }}>
              {aim.word}
            </div>
          </Circle>
        ) : (
          <Resting side="right" style={ring(false, ready)}>
            {ready && <div className="absolute -inset-[2px] rounded-full border-[3px]" style={{ borderColor: LIME, animation: 'pbReady 1s ease-out infinite' }} />}
            <div className="absolute inset-0 flex items-center justify-center text-[13px] font-black uppercase italic" style={{ color: ready ? LIME : 'rgba(255,255,255,0.75)' }}>
              {everyday}
            </div>
            {!learned && <Hint>tap · or drag to aim</Hint>}
          </Resting>
        )}
        {flash && (
          <div key={flash.k} className="pointer-events-none absolute whitespace-nowrap rounded-full bg-black/60 px-2.5 py-0.5 text-[13px] font-black uppercase italic shadow-lg" style={{ left: flash.x, top: flash.y, color: LIME, animation: 'pbShot 900ms ease-out both' }}>
            {flash.word}
          </div>
        )}
      </div>
    </>
  );
}

/** keep a thumb's moves coming here even if it slides off; never let a refusal break the touch */
function capture(el: Element, id: number) {
  try { el.setPointerCapture(id); } catch { /* not a live pointer */ }
}

/** a circle centered on (x, y) inside its half */
function Circle({ x, y, style, children }: { x: number; y: number; style: React.CSSProperties; children?: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute rounded-full border-2" style={{ left: x - R, top: y - R, width: R * 2, height: R * 2, ...style }}>
      {children}
    </div>
  );
}

/** the circle waiting in its corner */
function Resting({ side, style, children }: { side: 'left' | 'right'; style: React.CSSProperties; children?: React.ReactNode }) {
  const at = side === 'left'
    ? { left: 'max(36px, env(safe-area-inset-left))' }
    : { right: 'max(36px, env(safe-area-inset-right))' };
  return (
    <div className="pointer-events-none absolute rounded-full border-2 transition-colors duration-150" style={{ ...at, bottom: 'max(36px, env(safe-area-inset-bottom))', width: R * 2, height: R * 2, ...style }}>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-white/55">{children}</div>;
}
