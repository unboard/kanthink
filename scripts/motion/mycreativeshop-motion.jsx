import { useEffect, useRef, useState } from 'react';

/*
 * MyCreativeShop — a 32-second motion piece.
 *
 * Built in the "video diagram" style from the Kan Bookmarks references: one idea per
 * beat, pieces that assemble in front of you, labels that explain as they arrive.
 *
 *   0–4.5s    Your business deserves to be seen.
 *   4.5–11    A postcard, exploded into its layers and put back together
 *   11–16.5   Make it yours: headline types in, colours try themselves on
 *   16.5–22   Every format. One design.
 *   22–28     Printed. Mailed. Delivered — a route draws across a neighbourhood
 *   28–32     MyCreativeShop — Design it. Print it. Grow it.
 *
 * Everything is drawn from one clock on a 1920×1080 stage scaled to fit, so it plays
 * the same at any size and can be recorded frame for frame.
 */

const DURATION = 32;
const W = 1920;
const H = 1080;

const C = {
  ink: '#0B1B3F',
  night: '#081430',
  orange: '#FF6B35',
  cream: '#FFF6EC',
  teal: '#18B8A0',
  sky: '#7CC4FF',
  sun: '#FFC857',
  white: '#FFFFFF',
};

const PALETTES = [
  { bg: C.orange, fg: C.white, accent: C.ink },
  { bg: C.teal, fg: C.white, accent: C.sun },
  { bg: C.ink, fg: C.cream, accent: C.orange },
];

// ── time helpers ────────────────────────────────────────────────────────────
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const outCubic = (p) => 1 - Math.pow(1 - p, 3);
const inOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const outBack = (p) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};
/** 0 → 1 → 0 across a window, with eased edges: how visible a scene is. */
const presence = (t, a, b, fade = 0.45) => Math.min(outCubic(seg(t, a, a + fade)), 1 - inOutCubic(seg(t, b - fade, b)));

// ── the clock ───────────────────────────────────────────────────────────────
function useClock() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const base = useRef({ at: performance.now(), t: 0 });

  useEffect(() => {
    // A recorder can drive the clock directly: window.__setTime(seconds).
    window.__setTime = (s) => {
      setPlaying(false);
      base.current = { at: performance.now(), t: s };
      setT(s);
    };
    window.__play = () => {
      base.current = { at: performance.now(), t: 0 };
      setPlaying(true);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    base.current = { at: performance.now(), t };
    let raf;
    const tick = (now) => {
      setT((base.current.t + (now - base.current.at) / 1000) % DURATION);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const seek = (s) => {
    base.current = { at: performance.now(), t: s };
    setT(s);
  };
  return { t, playing, setPlaying, seek };
}

function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

// ── pieces ──────────────────────────────────────────────────────────────────
function Caption({ t, a, b, children, y = 870, size = 64 }) {
  const p = presence(t, a, b);
  if (p <= 0) return null;
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center',
      fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', color: C.cream,
      opacity: p, transform: `translateY(${(1 - p) * 30}px)`,
    }}>
      {children}
    </div>
  );
}

/** A postcard face: background, photo, headline, logo badge, call to action. */
function CardFace({ palette, headline = 'Grand Opening', sub = 'This Saturday · 20% off everything', w = 640, h = 420, only }) {
  // `only` shows a single layer — how the exploded diagram takes the card apart.
  const on = (n) => !only || only === n;
  return (
    <div style={{ position: 'relative', width: w, height: h, borderRadius: 18, overflow: 'hidden', background: on(1) ? palette.bg : 'transparent', boxShadow: on(1) ? '0 30px 80px rgba(0,0,0,.35)' : 'none' }}>
      {on(2) && (
        <div style={{ position: 'absolute', right: 0, top: 0, width: '46%', height: '100%', background: `linear-gradient(160deg, ${C.sky}, ${C.teal})` }}>
          <div style={{ position: 'absolute', width: w * 0.16, height: w * 0.16, borderRadius: '50%', background: C.sun, right: '22%', top: '18%' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%', background: C.ink, clipPath: 'polygon(0 60%, 25% 20%, 45% 55%, 70% 5%, 100% 50%, 100% 100%, 0 100%)', opacity: 0.85 }} />
        </div>
      )}
      {on(3) && (
        <div style={{ position: 'absolute', left: '7%', top: '16%', width: '48%', color: palette.fg }}>
          <div style={{ fontSize: w * 0.075, fontWeight: 900, lineHeight: 1.02, letterSpacing: '-0.02em' }}>{headline}</div>
          <div style={{ marginTop: w * 0.02, fontSize: w * 0.03, opacity: 0.9 }}>{sub}</div>
        </div>
      )}
      {on(4) && (
        <div style={{ position: 'absolute', left: '7%', bottom: '10%', display: 'flex', alignItems: 'center', gap: w * 0.015 }}>
          <div style={{ width: w * 0.07, height: w * 0.07, borderRadius: '50%', background: palette.accent, display: 'grid', placeItems: 'center', color: palette.bg, fontWeight: 900, fontSize: w * 0.03 }}>B</div>
          <div style={{ color: palette.fg, fontWeight: 700, fontSize: w * 0.028 }}>Bloom Bakery</div>
        </div>
      )}
      {on(5) && (
        <div style={{ position: 'absolute', right: '4%', bottom: '6%', background: C.white, borderRadius: 10, padding: w * 0.012, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, width: w * 0.11 }}>
          {Array.from({ length: 25 }, (_, i) => (
            <div key={i} style={{ aspectRatio: '1', background: [0, 1, 3, 4, 5, 9, 12, 15, 19, 20, 21, 23, 24, 7, 17].includes(i) ? C.ink : 'transparent' }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── scenes ──────────────────────────────────────────────────────────────────
function SceneOpen({ t }) {
  const lines = [['Your', 'business', 'deserves'], ['to', 'be', 'seen.']];
  const out = inOutCubic(seg(t, 3.8, 4.6));
  if (t > 4.7) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: 1 - out, filter: `blur(${out * 12}px)`, transform: `scale(${1 + out * 0.08})` }}>
      <div style={{ fontSize: 150, fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.08, color: C.cream, textAlign: 'center' }}>
        {lines.map((line, li) => (
          <div key={li} style={{ display: 'flex', justifyContent: 'center', gap: 38, whiteSpace: 'nowrap' }}>
            {line.map((w, wi) => {
              const i = li * 3 + wi;
              const p = outBack(seg(t, 0.25 + i * 0.28, 0.85 + i * 0.28));
              const last = w === 'seen.';
              return (
                <span key={w} style={{ display: 'inline-block', position: 'relative', opacity: clamp(p * 1.4), transform: `translateY(${(1 - p) * 90}px)`, color: last ? C.orange : C.cream }}>
                  {w}
                  {last && (
                    <span style={{ position: 'absolute', left: 0, bottom: 4, height: 14, borderRadius: 7, background: C.orange, width: `${outCubic(seg(t, 2.3, 3.1)) * 100}%` }} />
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const LAYERS = [
  { label: 'Pick a template', color: C.orange },
  { label: 'Add your photo', color: C.teal },
  { label: 'Say it your way', color: C.sun },
  { label: 'Put your brand on it', color: C.sky },
  { label: 'Tell them what to do', color: C.cream },
];

/** The BIG-style beat: a postcard, exploded into layers, assembled, flattened. */
function SceneLayers({ t }) {
  const p = presence(t, 4.5, 11.2, 0.5);
  if (p <= 0) return null;
  const collapse = inOutCubic(seg(t, 8.8, 9.9));
  const flatten = inOutCubic(seg(t, 9.6, 10.6));
  const tiltX = lerp(56, 0, flatten);
  const tiltZ = lerp(-38, 0, flatten);
  const left = lerp(300, 640, flatten);
  const top = lerp(300, 250, flatten);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <div style={{ position: 'absolute', left, top, width: 640, height: 420, perspective: 2400 }}>
        <div style={{ position: 'relative', width: 640, height: 420, transformStyle: 'preserve-3d', transform: `rotateX(${tiltX}deg) rotateZ(${tiltZ}deg)` }}>
          {LAYERS.map((l, i) => {
            const arrive = outCubic(seg(t, 5.0 + i * 0.6, 5.6 + i * 0.6));
            const spread = (i - 2) * 95 * (1 - collapse);
            return (
              <div key={l.label} style={{
                position: 'absolute', inset: 0, transformStyle: 'preserve-3d',
                transform: `translateZ(${spread + (1 - arrive) * 600}px)`, opacity: arrive,
              }}>
                {/* One element per layer; stacked, they are the card. */}
                <CardFace palette={PALETTES[0]} only={i + 1} />
                <div style={{ position: 'absolute', inset: -3, borderRadius: 20, border: `3px ${i === 0 ? 'solid' : 'dashed'} ${l.color}`, background: i === 0 ? 'transparent' : `${l.color}10`, opacity: (1 - collapse) * 0.95 }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Labels on the right, one per layer, like a diagram's key. */}
      <div style={{ position: 'absolute', left: 1120, top: 190 }}>
        {LAYERS.map((l, i) => {
          const q = outCubic(seg(t, 5.2 + i * 0.6, 5.8 + i * 0.6)) * (1 - inOutCubic(seg(t, 8.7, 9.3)));
          return (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 22, height: 86, opacity: q, transform: `translateX(${(1 - q) * 40}px)` }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: l.color, color: C.ink, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 26 }}>{`0${i + 1}`}</div>
              <div style={{ fontSize: 44, fontWeight: 700, color: C.cream, letterSpacing: '-0.01em' }}>{l.label}</div>
            </div>
          );
        })}
      </div>

      <Caption t={t} a={9.7} b={11.2}>One postcard. Five minutes.</Caption>
    </div>
  );
}

function SceneEditor({ t }) {
  const p = presence(t, 11.0, 16.8);
  if (p <= 0) return null;
  const text = 'Grand Opening';
  const typed = text.slice(0, Math.round(seg(t, 11.6, 12.9) * text.length));
  const palette = t < 13.9 ? PALETTES[0] : t < 14.9 ? PALETTES[1] : PALETTES[2];
  const swatchX = 760 + (t < 13.9 ? 0 : t < 14.9 ? 1 : 2) * 130;
  const cursor = { x: lerp(1030, swatchX + 30, inOutCubic(seg(t, 13.2, 13.8))), y: lerp(420, 930, inOutCubic(seg(t, 13.2, 13.8))) };
  const pop = (at) => 1 + 0.08 * Math.sin(clamp((t - at) / 0.3) * Math.PI);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <div style={{ position: 'absolute', left: 520, top: 215, width: 880, height: 580, transform: `scale(${pop(13.9) * pop(14.9)})` }}>
        <CardFace palette={palette} headline={`${typed}${seg(t, 11.6, 12.9) < 1 && Math.floor(t * 3) % 2 ? '|' : ''}`} w={880} h={580} />
      </div>
      {/* Swatches */}
      <div style={{ position: 'absolute', left: 760, top: 900, display: 'flex', gap: 30 }}>
        {PALETTES.map((pal, i) => (
          <div key={i} style={{ width: 100, height: 60, borderRadius: 14, background: pal.bg, border: `4px solid ${pal === palette ? C.cream : 'transparent'}`, boxShadow: '0 10px 30px rgba(0,0,0,.3)' }} />
        ))}
      </div>
      {/* Cursor */}
      <svg style={{ position: 'absolute', left: cursor.x, top: cursor.y, opacity: seg(t, 11.3, 11.6) }} width="40" height="48" viewBox="0 0 20 24">
        <path d="M2 2 L2 19 L7 14 L10 22 L13 21 L10 13 L17 13 Z" fill={C.white} stroke={C.ink} strokeWidth="1.5" />
      </svg>
      <Caption t={t} a={11.3} b={16.8} y={70}>Make it yours in minutes.</Caption>
    </div>
  );
}

const FORMATS = [
  { name: 'Flyer', w: 260, h: 340 },
  { name: 'Postcard', w: 330, h: 220 },
  { name: 'Business card', w: 230, h: 135 },
  { name: 'Door hanger', w: 150, h: 360, hole: true },
  { name: 'Yard sign', w: 320, h: 220, stake: true },
  { name: 'Social post', w: 240, h: 240 },
];

function SceneFormats({ t }) {
  const p = presence(t, 16.5, 22.3);
  if (p <= 0) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      {FORMATS.map((f, i) => {
        const q = outBack(seg(t, 16.8 + i * 0.28, 17.5 + i * 0.28));
        const GAP = 44;
        const total = FORMATS.reduce((n, g) => n + g.w, 0) + GAP * (FORMATS.length - 1);
        const x = (W - total) / 2 + FORMATS.slice(0, i).reduce((n, g) => n + g.w + GAP, 0);
        // Bottoms line up on one shelf; the yard sign's stake hangs below it.
        const y = 660 - f.h;
        const float = Math.sin(t * 1.6 + i) * 6;
        return (
          <div key={f.name} style={{ position: 'absolute', left: x, top: y + float + (1 - clamp(q)) * 120, width: f.w, opacity: clamp(q * 1.5), transform: `scale(${lerp(0.6, 1, clamp(q))})`, transformOrigin: 'bottom center' }}>
            <div style={{ position: 'relative', width: f.w, height: f.h, borderRadius: 12, overflow: 'hidden', background: PALETTES[i % 3].bg, boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}>
              <div style={{ position: 'absolute', right: 0, top: 0, width: '45%', height: '100%', background: `linear-gradient(160deg, ${C.sky}, ${C.teal})` }} />
              <div style={{ position: 'absolute', left: '9%', top: '14%', width: '45%', height: Math.max(10, f.h * 0.08), borderRadius: 4, background: PALETTES[i % 3].fg }} />
              <div style={{ position: 'absolute', left: '9%', top: '30%', width: '32%', height: Math.max(6, f.h * 0.04), borderRadius: 3, background: PALETTES[i % 3].fg, opacity: 0.7 }} />
              {f.hole && <div style={{ position: 'absolute', left: '50%', top: 18, width: 60, height: 60, marginLeft: -30, borderRadius: '50%', background: C.night }} />}
            </div>
            <div style={{ position: 'absolute', top: f.h + (f.stake ? 70 : 22), left: -40, right: -40, textAlign: 'center', color: C.cream, fontSize: 30, fontWeight: 700, whiteSpace: 'nowrap' }}>{f.name}</div>
            {f.stake && <div style={{ position: 'absolute', top: f.h, left: f.w / 2 - 5, width: 10, height: 60, background: C.cream, opacity: 0.8 }} />}
          </div>
        );
      })}
      <Caption t={t} a={17.6} b={22.3} y={880}>Every format. One design.</Caption>
    </div>
  );
}

/** Print, mail, deliver: a route drawn across a neighbourhood, homes lighting up. */
function SceneMail({ t }) {
  const p = presence(t, 22.0, 28.3);
  if (p <= 0) return null;
  const draw = inOutCubic(seg(t, 23.2, 26.4));
  const route = 'M 170 690 C 420 690, 430 470, 700 470 S 980 690, 1240 640 S 1560 360, 1760 420';
  const homes = [
    [300, 600], [420, 560], [560, 470], [690, 420], [820, 540], [960, 640],
    [1100, 660], [1250, 600], [1390, 500], [1520, 430], [1650, 390], [1760, 470],
  ];
  const reached = Math.round(outCubic(seg(t, 23.4, 27.2)) * 12480);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      {/* Street grid */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`v${i}`} x1={120 + i * 170} y1={250} x2={120 + i * 170} y2={860} stroke={C.cream} strokeOpacity="0.08" strokeWidth="18" />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <line key={`h${i}`} x1={100} y1={290 + i * 140} x2={1820} y2={290 + i * 140} stroke={C.cream} strokeOpacity="0.08" strokeWidth="18" />
        ))}
        <path d={route} fill="none" stroke={C.orange} strokeWidth="10" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - draw} />
        {homes.map(([x, y], i) => {
          const lit = draw > (i + 0.5) / homes.length;
          const q = lit ? outBack(clamp((draw - (i + 0.5) / homes.length) * 8)) : 0;
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              <rect x="-26" y="-18" width="52" height="40" rx="6" fill={lit ? C.sun : C.cream} fillOpacity={lit ? 1 : 0.18} />
              <path d="M -32 -16 L 0 -44 L 32 -16 Z" fill={lit ? C.orange : C.cream} fillOpacity={lit ? 1 : 0.18} />
              {lit && <circle cx="0" cy="-70" r={14 * q} fill={C.teal} />}
            </g>
          );
        })}
      </svg>
      {/* A card riding the route */}
      <div style={{ position: 'absolute', left: lerp(150, 1700, draw), top: 160 + Math.sin(draw * Math.PI * 3) * 30, opacity: seg(t, 22.8, 23.3) * (1 - seg(t, 26.4, 26.9)), transform: `rotate(${Math.sin(draw * 12) * 6}deg)` }}>
        <CardFace palette={PALETTES[2]} w={180} h={118} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 80, textAlign: 'center', color: C.cream }}>
        <div style={{ fontSize: 70, fontWeight: 900, letterSpacing: '-0.02em', opacity: seg(t, 22.4, 22.9) }}>
          Printed. <span style={{ opacity: seg(t, 23.0, 23.5) }}>Mailed.</span> <span style={{ color: C.orange, opacity: seg(t, 23.6, 24.1) }}>Delivered.</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 910, textAlign: 'center', color: C.cream, opacity: seg(t, 23.4, 23.9) }}>
        <span style={{ fontSize: 84, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: C.sun }}>{reached.toLocaleString()}</span>
        <span style={{ fontSize: 44, fontWeight: 700, marginLeft: 20 }}>homes reached</span>
      </div>
    </div>
  );
}

function SceneLockup({ t }) {
  const p = presence(t, 28.0, 32.4, 0.5);
  if (p <= 0) return null;
  const name = 'MyCreativeShop';
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: p }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 150, fontWeight: 900, letterSpacing: '-0.04em' }}>
          {name.split('').map((ch, i) => {
            const q = outBack(seg(t, 28.2 + i * 0.045, 28.8 + i * 0.045));
            return (
              <span key={i} style={{ display: 'inline-block', color: i < 2 ? C.orange : C.cream, opacity: clamp(q * 1.3), transform: `translateY(${(1 - q) * 70}px) rotate(${(1 - q) * -12}deg)` }}>{ch}</span>
            );
          })}
        </div>
        <div style={{ height: 12, width: `${outCubic(seg(t, 29.1, 29.8)) * 62}%`, margin: '18px auto 0', borderRadius: 6, background: C.orange }} />
        <div style={{ marginTop: 36, fontSize: 58, fontWeight: 700, color: C.cream, opacity: seg(t, 29.5, 30.1), letterSpacing: '-0.01em' }}>
          Design it. Print it. <span style={{ color: C.orange }}>Grow it.</span>
        </div>
        <div style={{ marginTop: 26, fontSize: 38, color: C.cream, opacity: seg(t, 30.1, 30.6) * 0.75 }}>mycreativeshop.com</div>
      </div>
    </div>
  );
}

// ── the stage ──────────────────────────────────────────────────────────────
export default function App() {
  const { t, playing, setPlaying, seek } = useClock();
  const scale = useStageScale();
  const [idle, setIdle] = useState(false);
  const recording = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('record');

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800;900&display=swap';
    document.head.appendChild(link);
    const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); setPlaying((v) => !v); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPlaying]);

  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), 2200);
    const wake = () => { setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), 2200); };
    window.addEventListener('mousemove', wake);
    window.addEventListener('touchstart', wake);
    return () => { clearTimeout(timer); window.removeEventListener('mousemove', wake); window.removeEventListener('touchstart', wake); };
  }, []);

  // A slow drift of the background glow, so still moments never feel frozen.
  const glowX = 50 + Math.sin(t * 0.35) * 20;
  const glowY = 40 + Math.cos(t * 0.27) * 15;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#040a18', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2,
        transform: `scale(${scale})`, overflow: 'hidden',
        background: `radial-gradient(1200px 800px at ${glowX}% ${glowY}%, #16306b 0%, ${C.night} 55%, #050d22 100%)`,
      }}>
        <SceneOpen t={t} />
        <SceneLayers t={t} />
        <SceneEditor t={t} />
        <SceneFormats t={t} />
        <SceneMail t={t} />
        <SceneLockup t={t} />
      </div>

      {!recording && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 24px',
          display: 'flex', alignItems: 'center', gap: 16,
          background: 'linear-gradient(transparent, rgba(0,0,0,.55))',
          opacity: idle && playing ? 0 : 1, transition: 'opacity .4s',
        }}>
          <button onClick={() => setPlaying(!playing)} style={{ width: 44, height: 44, borderRadius: 22, border: 0, background: C.orange, color: C.white, fontSize: 18, cursor: 'pointer' }} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button onClick={() => seek(0)} style={{ width: 44, height: 44, borderRadius: 22, border: `1px solid ${C.cream}55`, background: 'transparent', color: C.cream, fontSize: 20, cursor: 'pointer' }} aria-label="Restart">↺</button>
          <input
            type="range" min={0} max={DURATION} step={0.01} value={t}
            onChange={(e) => seek(Number(e.target.value))}
            style={{ flex: 1, accentColor: C.orange }}
            aria-label="Position"
          />
          <div style={{ color: C.cream, fontVariantNumeric: 'tabular-nums', fontSize: 14, width: 90, textAlign: 'right' }}>
            {t.toFixed(1)}s / {DURATION}s
          </div>
        </div>
      )}
    </div>
  );
}
