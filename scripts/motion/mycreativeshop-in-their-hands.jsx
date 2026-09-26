import { useEffect, useRef, useState } from 'react';

/*
 * MyCreativeShop — "In their hands." 31 seconds, 16:9.
 *
 * Upbeat and fast: a design personalized to your brand in moments, printed, mailed,
 * and in people's hands. No pain points, no invented product name — the feature is
 * MyCreativeShop's own "Personalize".
 *
 *   0–3.6     Your design. Your brand. In their hands.
 *   3.6–9     Personalize: website in, logo and colors snap on
 *   9–13.2    A few ideas, ready to go — pick one
 *   13.2–18.6 Print it: quantity, finish, order — prints stack up
 *   18.6–24   Mail it: a route lights up the neighborhood
 *   24–27.6   In their hands: the postcard at the door
 *   27.6–31   MyCreativeShop — Personalize. Print. Mail.
 *
 * Invented business (Bright Side Landscaping), real MCS logo, never says AI.
 * One clock on a 1920×1080 stage, so it records frame for frame.
 */

const DURATION = 31;
const W = 1920;
const H = 1080;
const LOGO = 'https://res.cloudinary.com/mycreativeshop/image/upload/f_png/v1/public/mcs-logo-dark';

const C = {
  bg: '#F7F5FF', ink: '#15122B', muted: '#6B6785', line: '#E4E0F2',
  purple: '#5B2BC4', pink: '#D8338F', orange: '#FF6A2B', white: '#FFFFFF',
  green: '#2F8F4E', navy: '#14324A', lime: '#B7E36B', sun: '#FFD66B',
};
const GRADIENT = `linear-gradient(90deg, ${C.purple}, ${C.pink} 55%, ${C.orange})`;
const gradText = { background: GRADIENT, WebkitBackgroundClip: 'text', color: 'transparent' };

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const outCubic = (p) => 1 - Math.pow(1 - p, 3);
const inOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const outBack = (p) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const presence = (t, a, b, fade = 0.35) => Math.min(outCubic(seg(t, a, a + fade)), 1 - inOutCubic(seg(t, b - fade, b)));
const typed = (text, t, a, b) => text.slice(0, Math.round(seg(t, a, b) * text.length));

function useClock() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const base = useRef({ at: performance.now(), t: 0 });
  useEffect(() => {
    window.__setTime = (s) => { setPlaying(false); base.current = { at: performance.now(), t: s }; setT(s); };
    window.__play = () => { base.current = { at: performance.now(), t: 0 }; setPlaying(true); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    base.current = { at: performance.now(), t };
    let raf;
    const tick = (now) => { setT((base.current.t + (now - base.current.at) / 1000) % DURATION); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const seek = (s) => { base.current = { at: performance.now(), t: s }; setT(s); };
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
function Sparkle({ size = 28, color = C.purple }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M10 2 L12 8.5 L18.5 10.5 L12 12.5 L10 19 L8 12.5 L1.5 10.5 L8 8.5 Z" fill={color} />
      <path d="M19 13 L20 16 L23 17 L20 18 L19 21 L18 18 L15 17 L18 16 Z" fill={color} opacity="0.8" />
    </svg>
  );
}

function BizLogo({ size = 64, dark = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.25 }}>
      <svg width={size} height={size} viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="19" fill={C.green} />
        <path d="M11 27 C 11 16, 19 10, 30 10 C 30 21, 24 29, 13 29 Z" fill={C.lime} />
        <path d="M12 28 L 24 16" stroke={C.green} strokeWidth="2" />
      </svg>
      <div style={{ lineHeight: 1.05, color: dark ? C.white : C.navy }}>
        <div style={{ fontWeight: 900, fontSize: size * 0.36 }}>Bright Side</div>
        <div style={{ fontWeight: 700, fontSize: size * 0.22, color: dark ? C.lime : C.green, letterSpacing: '0.06em' }}>LANDSCAPING</div>
      </div>
    </div>
  );
}

function Photo({ w, h, radius = 10 }) {
  return (
    <div style={{ position: 'relative', width: w, height: h, borderRadius: radius, overflow: 'hidden', background: 'linear-gradient(180deg, #9ED8FF, #D9F2FF)' }}>
      <div style={{ position: 'absolute', width: w * 0.16, height: w * 0.16, borderRadius: '50%', background: C.sun, right: '14%', top: '12%' }} />
      <div style={{ position: 'absolute', left: '-10%', right: '-10%', bottom: '-30%', height: '75%', borderRadius: '50%', background: C.green }} />
      <div style={{ position: 'absolute', left: '-20%', right: '30%', bottom: '-40%', height: '65%', borderRadius: '50%', background: '#3FAE62' }} />
    </div>
  );
}

function Cursor({ x, y, opacity = 1, pressed = false }) {
  return (
    <svg style={{ position: 'absolute', left: x, top: y, opacity, transform: `scale(${pressed ? 0.85 : 1})`, transformOrigin: 'top left' }} width="44" height="52" viewBox="0 0 20 24">
      <path d="M2 2 L2 19 L7 14 L10 22 L13 21 L10 13 L17 13 Z" fill={C.ink} stroke={C.white} strokeWidth="1.5" />
    </svg>
  );
}

/** The postcard. `brand` 0 = the bare template, 1 = fully Bright Side. */
function Postcard({ w = 760, h = 500, brand = 1, headline = 'Your Best Lawn Starts Now.', shadow = true }) {
  const grey = '#D9D6E6';
  const on = brand > 0.02;
  return (
    <div style={{ position: 'relative', width: w, height: h, borderRadius: w * 0.022, overflow: 'hidden', background: grey, boxShadow: shadow ? '0 30px 80px rgba(40,20,90,.18)' : 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${52 * clamp(brand * 1.4)}%`, background: C.navy }} />
      <div style={{ position: 'absolute', right: 0, top: 0, width: '48%', height: '100%', opacity: clamp(brand * 1.6 - 0.3) }}>
        <Photo w={w * 0.48} h={h} radius={0} />
      </div>
      <div style={{ position: 'absolute', left: '6%', top: '8%' }}>
        {on ? <div style={{ opacity: clamp(brand * 2 - 0.6) }}><BizLogo size={w * 0.07} dark /></div>
          : <div style={{ width: w * 0.2, height: w * 0.05, borderRadius: 6, background: '#C9C5DA' }} />}
      </div>
      <div style={{ position: 'absolute', left: '6%', top: '30%', width: '42%', color: C.white, fontWeight: 900, fontSize: w * 0.058, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
        {on ? typed(headline, brand, 0.35, 1) : <><div style={{ width: '90%', height: w * 0.04, borderRadius: 6, background: '#C9C5DA' }} /><div style={{ width: '70%', height: w * 0.04, borderRadius: 6, background: '#C9C5DA', marginTop: 10 }} /></>}
      </div>
      <div style={{ position: 'absolute', left: '6%', bottom: '9%', padding: `${w * 0.012}px ${w * 0.022}px`, borderRadius: 999, background: brand >= 1 ? C.lime : '#C9C5DA', color: C.navy, fontWeight: 900, fontSize: w * 0.022, minWidth: w * 0.2, minHeight: w * 0.02 }}>
        {brand >= 1 ? 'Free estimate · 555-0142' : ''}
      </div>
    </div>
  );
}

function Title({ t, a, b, children, y = 80, size = 80 }) {
  const p = presence(t, a, b);
  if (p <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontSize: size, fontWeight: 900, letterSpacing: '-0.035em', color: C.ink, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
      {children}
    </div>
  );
}

// ── scenes ──────────────────────────────────────────────────────────────────
function SceneOpen({ t }) {
  if (t > 3.8) return null;
  const out = inOutCubic(seg(t, 3.1, 3.7));
  const words = [['Your design.', C.ink], ['Your brand.', C.ink], ['In their hands.', null]];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: 1 - out, transform: `scale(${1 + out * 0.06})` }}>
      <div style={{ textAlign: 'center' }}>
        {words.map(([w, color], i) => {
          const q = outBack(seg(t, 0.15 + i * 0.45, 0.7 + i * 0.45));
          return (
            <div key={w} style={{ fontSize: 140, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1.08, opacity: clamp(q * 1.4), transform: `translateY(${(1 - q) * 70}px)`, ...(color ? { color } : gradText) }}>{w}</div>
          );
        })}
      </div>
    </div>
  );
}

function ScenePersonalize({ t }) {
  const p = presence(t, 3.5, 9.2);
  if (p <= 0) return null;
  const url = typed('brightsidelandscaping.com', t, 4.6, 5.8);
  const brand = inOutCubic(seg(t, 6.3, 8.0));
  const press = t > 6.05 && t < 6.25;
  const panelOut = inOutCubic(seg(t, 6.2, 6.7));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <Title t={t} a={3.6} b={9.2}><span style={gradText}>Personalize</span> in moments.</Title>
      {/* The website box, which folds away as the brand lands */}
      <div style={{ position: 'absolute', left: 150, top: 330, width: 640, padding: 44, borderRadius: 28, background: C.white, boxSizing: 'border-box', boxShadow: '0 30px 80px rgba(40,20,90,.12)', opacity: 1 - panelOut * 0.55, transform: `scale(${1 - panelOut * 0.06})` }}>
        <div style={{ fontSize: 28, fontWeight: 800, ...gradText }}><Sparkle size={28} /> Personalize</div>
        <div style={{ marginTop: 16, fontSize: 40, fontWeight: 900, color: C.ink, letterSpacing: '-0.02em' }}>Your website</div>
        <div style={{ marginTop: 18, height: 80, borderRadius: 16, border: `4px solid ${C.purple}`, display: 'flex', alignItems: 'center', padding: '0 24px', fontSize: 32, color: url ? C.ink : '#A7A3BD' }}>{url || 'www.yourwebsite.com'}</div>
        <div style={{ marginTop: 22, height: 80, borderRadius: 18, display: 'grid', placeItems: 'center', fontSize: 34, fontWeight: 800, color: C.white, background: GRADIENT, transform: `scale(${press ? 0.97 : 1})` }}>Let&rsquo;s go →</div>
        {/* What came back */}
        <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 18, opacity: seg(t, 6.5, 6.9) }}>
          <BizLogo size={52} />
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>{[C.navy, C.green, C.lime].map((c) => <div key={c} style={{ width: 44, height: 44, borderRadius: 22, background: c }} />)}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 900, top: 330 }}>
        <Postcard brand={brand} w={820} h={540} />
      </div>
      <Cursor x={lerp(700, 470, inOutCubic(seg(t, 5.6, 6.05)))} y={lerp(900, 640, inOutCubic(seg(t, 5.6, 6.05)))} opacity={seg(t, 5.5, 5.7) * (1 - seg(t, 6.6, 6.9))} pressed={press} />
      <div style={{ position: 'absolute', left: 900, width: 820, top: 900, textAlign: 'center', fontSize: 34, fontWeight: 800, color: '#22A65A', opacity: seg(t, 8.0, 8.3) }}>✓ Your logo, colors and words — on brand</div>
    </div>
  );
}

const IDEAS = ['Your Best Lawn Starts Now.', 'Curb Appeal, Handled.', 'Rooted in Riverside.', 'Spring Is Here. So Are We.'];

function SceneIdeas({ t }) {
  const p = presence(t, 8.9, 13.4);
  if (p <= 0) return null;
  const pick = inOutCubic(seg(t, 11.9, 12.5));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <Title t={t} a={9.0} b={13.4}>A few ideas, ready to go.</Title>
      <div style={{ position: 'absolute', left: 150, top: 290, display: 'grid', gridTemplateColumns: 'repeat(2, 780px)', gap: 60 }}>
        {IDEAS.map((idea, i) => {
          const q = outBack(seg(t, 9.3 + i * 0.25, 9.9 + i * 0.25));
          const chosen = i === 0;
          return (
            <div key={idea} style={{ opacity: clamp(q * 1.4) * (chosen ? 1 : 1 - pick * 0.7), transform: `translateY(${(1 - q) * 60}px) scale(${chosen ? 1 + pick * 0.03 : 1 - pick * 0.03})`, borderRadius: 20, outline: chosen && pick > 0.3 ? `6px solid ${C.purple}` : 'none', outlineOffset: 4 }}>
              <Postcard w={780} h={330} headline={idea} brand={1} />
            </div>
          );
        })}
      </div>
      <Cursor x={lerp(1400, 720, inOutCubic(seg(t, 11.2, 11.9)))} y={lerp(900, 480, inOutCubic(seg(t, 11.2, 11.9)))} opacity={seg(t, 11.1, 11.3)} pressed={t > 11.9 && t < 12.1} />
    </div>
  );
}

function ScenePrint({ t }) {
  const p = presence(t, 13.1, 18.8);
  if (p <= 0) return null;
  const qty = [250, 500, 1000][t < 14.4 ? 0 : t < 14.9 ? 1 : 2];
  const press = t > 15.7 && t < 15.95;
  const printing = seg(t, 16.0, 18.2);
  const sheets = Math.floor(printing * 14);
  const printed = Math.round(outCubic(printing) * 1000);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <Title t={t} a={13.2} b={18.8}>Print it. <span style={gradText}>Easy.</span></Title>
      {/* Order panel */}
      <div style={{ position: 'absolute', left: 150, top: 280, width: 720, padding: 50, borderRadius: 30, background: C.white, boxSizing: 'border-box', boxShadow: '0 30px 80px rgba(40,20,90,.12)' }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <Postcard w={220} h={145} shadow={false} />
          <div>
            <div style={{ fontSize: 34, fontWeight: 900, color: C.ink }}>Postcard</div>
            <div style={{ fontSize: 24, color: C.muted, marginTop: 6 }}>6&Prime; × 9&Prime; · Full color, both sides</div>
          </div>
        </div>
        <div style={{ marginTop: 40, fontSize: 26, fontWeight: 800, color: C.ink }}>Quantity</div>
        <div style={{ marginTop: 14, display: 'flex', gap: 16 }}>
          {[250, 500, 1000].map((n) => (
            <div key={n} style={{ flex: 1, padding: '20px 0', textAlign: 'center', borderRadius: 16, fontSize: 32, fontWeight: 800, border: `4px solid ${n === qty ? C.purple : C.line}`, color: n === qty ? C.purple : C.muted, background: n === qty ? '#F2EDFF' : C.white }}>{n.toLocaleString()}</div>
          ))}
        </div>
        <div style={{ marginTop: 30, fontSize: 26, fontWeight: 800, color: C.ink }}>Finish</div>
        <div style={{ marginTop: 14, display: 'flex', gap: 16 }}>
          {['Gloss', 'Matte'].map((f, i) => (
            <div key={f} style={{ padding: '16px 34px', borderRadius: 999, fontSize: 28, fontWeight: 800, border: `4px solid ${i === 0 && t > 15.2 ? C.purple : C.line}`, color: i === 0 && t > 15.2 ? C.purple : C.muted }}>{f}</div>
          ))}
        </div>
        <div style={{ marginTop: 40, height: 96, borderRadius: 22, display: 'grid', placeItems: 'center', fontSize: 38, fontWeight: 800, color: C.white, background: GRADIENT, transform: `scale(${press ? 0.97 : 1})` }}>
          {t > 15.95 ? '✓ Order placed' : 'Order prints →'}
        </div>
      </div>
      <Cursor x={lerp(1300, 640, inOutCubic(seg(t, 13.8, 14.3)))} y={lerp(900, 555, inOutCubic(seg(t, 13.8, 14.3)))} opacity={seg(t, 13.7, 13.9) * (1 - seg(t, 14.9, 15.0))} pressed={(t > 14.3 && t < 14.45) || (t > 14.8 && t < 14.95)} />
      <Cursor x={lerp(640, 500, inOutCubic(seg(t, 15.0, 15.7)))} y={lerp(555, 960, inOutCubic(seg(t, 15.0, 15.7)))} opacity={seg(t, 15.0, 15.1) * (1 - seg(t, 16.3, 16.5))} pressed={press} />

      {/* The press: sheets stacking up */}
      <div style={{ position: 'absolute', left: 1060, top: 300, width: 700, height: 600 }}>
        <div style={{ position: 'absolute', left: 60, top: 0, width: 580, height: 150, borderRadius: 24, background: '#2A2640', boxShadow: '0 20px 50px rgba(0,0,0,.2)' }}>
          <div style={{ position: 'absolute', left: 40, right: 40, bottom: 26, height: 16, borderRadius: 8, background: '#15122B' }} />
          <div style={{ position: 'absolute', right: 40, top: 30, width: 18, height: 18, borderRadius: 9, background: printing > 0 && printing < 1 ? '#3DDC84' : '#555' }} />
          <div style={{ position: 'absolute', left: 40, top: 26, color: C.white, fontSize: 26, fontWeight: 800 }}>MyCreativeShop Print</div>
        </div>
        {Array.from({ length: 14 }, (_, i) => {
          if (i >= sheets) return null;
          const fresh = i === sheets - 1 ? outCubic(clamp(printing * 14 - i)) : 1;
          return (
            <div key={i} style={{ position: 'absolute', left: 120 + (i % 2) * 4, top: lerp(140, 300 - i * 9, fresh), transform: `rotate(${(i % 3 - 1) * 1.2}deg)` }}>
              <Postcard w={460} h={300} shadow={i === sheets - 1} />
            </div>
          );
        })}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 640, textAlign: 'center', opacity: seg(t, 16.1, 16.4) }}>
          <span style={{ fontSize: 60, fontWeight: 900, color: C.purple, fontVariantNumeric: 'tabular-nums' }}>{printed.toLocaleString()}</span>
          <span style={{ fontSize: 34, fontWeight: 800, color: C.ink, marginLeft: 14 }}>printed</span>
        </div>
      </div>
    </div>
  );
}

function SceneMail({ t }) {
  const p = presence(t, 18.5, 24.2);
  if (p <= 0) return null;
  const draw = inOutCubic(seg(t, 19.3, 22.8));
  const route = 'M 170 740 C 420 740, 430 520, 700 520 S 980 740, 1240 690 S 1560 410, 1760 470';
  const homes = [[300, 650], [420, 610], [560, 520], [690, 470], [820, 590], [960, 690], [1100, 710], [1250, 650], [1390, 550], [1520, 480], [1650, 440], [1760, 520]];
  const delivered = Math.round(outCubic(seg(t, 19.5, 23.2)) * 1000);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <Title t={t} a={18.6} b={24.2}>Mail it. <span style={gradText}>We deliver.</span></Title>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={120 + i * 170} y1={300} x2={120 + i * 170} y2={900} stroke={C.purple} strokeOpacity="0.07" strokeWidth="18" />)}
        {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} x1={100} y1={340 + i * 140} x2={1820} y2={340 + i * 140} stroke={C.purple} strokeOpacity="0.07" strokeWidth="18" />)}
        <path d={route} fill="none" stroke="url(#routeGrad)" strokeWidth="10" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - draw} />
        <defs>
          <linearGradient id="routeGrad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={C.purple} /><stop offset="0.55" stopColor={C.pink} /><stop offset="1" stopColor={C.orange} />
          </linearGradient>
        </defs>
        {homes.map(([x, y], i) => {
          const lit = draw > (i + 0.5) / homes.length;
          const q = lit ? outBack(clamp((draw - (i + 0.5) / homes.length) * 8)) : 0;
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              <rect x="-28" y="-18" width="56" height="42" rx="6" fill={lit ? C.white : '#E4E0F2'} stroke={lit ? C.purple : 'none'} strokeWidth="3" />
              <path d="M -34 -16 L 0 -46 L 34 -16 Z" fill={lit ? C.orange : '#D9D4EE'} />
              {lit && <rect x={-18 * q} y={-80 - 12 * q} width={36 * q} height={24 * q} rx="4" fill={C.navy} />}
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 930, textAlign: 'center', opacity: seg(t, 19.5, 19.9) }}>
        <span style={{ fontSize: 76, fontWeight: 900, fontVariantNumeric: 'tabular-nums', ...gradText }}>{delivered.toLocaleString()}</span>
        <span style={{ fontSize: 40, fontWeight: 800, color: C.ink, marginLeft: 18 }}>postcards on their way</span>
      </div>
    </div>
  );
}

/** The payoff: a hand holding the postcard at the front door. */
function SceneHands({ t }) {
  const p = presence(t, 23.9, 27.8);
  if (p <= 0) return null;
  const rise = outBack(seg(t, 24.2, 25.0));
  const tilt = Math.sin(t * 1.4) * 1.5;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <Title t={t} a={24.0} b={27.8} y={70} size={96}>In <span style={gradText}>their hands.</span></Title>
      {/* Door */}
      <div style={{ position: 'absolute', left: 1220, top: 260, width: 420, height: 780, borderRadius: '30px 30px 0 0', background: '#E9E3FB', border: `10px solid ${C.white}`, boxSizing: 'border-box', boxShadow: '0 30px 80px rgba(40,20,90,.10)' }}>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 60, height: 260, borderRadius: 16, background: '#DAD1F7' }} />
        <div style={{ position: 'absolute', left: 40, right: 40, top: 360, height: 300, borderRadius: 16, background: '#DAD1F7' }} />
        <div style={{ position: 'absolute', right: 40, top: 420, width: 30, height: 30, borderRadius: 15, background: C.orange }} />
      </div>
      {/* Hand and card */}
      <div style={{ position: 'absolute', left: 330, top: lerp(1100, 300, rise), transform: `rotate(${-6 + tilt}deg)`, transformOrigin: 'bottom center' }}>
        <Postcard w={800} h={526} />
        {/* Thumb and fingers holding the card's bottom edge */}
        <svg width="300" height="420" viewBox="0 0 300 420" style={{ position: 'absolute', left: 330, top: 430 }}>
          <path d="M60 40 C 60 10, 120 10, 120 40 L 120 120 L 180 120 C 240 120, 270 160, 270 220 L 270 420 L 50 420 L 50 180 C 50 150, 60 130, 60 110 Z" fill="#E9A884" />
          <path d="M60 40 C 60 10, 120 10, 120 40 L 120 110 L 60 110 Z" fill="#F2B994" />
          <path d="M170 120 L 230 120 C 250 120, 262 132, 262 150" stroke="#D18F6C" strokeWidth="6" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

function SceneLockup({ t }) {
  const p = presence(t, 27.5, 31.4, 0.4);
  if (p <= 0) return null;
  const q = outBack(seg(t, 27.7, 28.3));
  const beats = ['Personalize.', 'Print.', 'Mail.'];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: p }}>
      <div style={{ textAlign: 'center' }}>
        <img src={LOGO} alt="MyCreativeShop" style={{ display: 'block', margin: '0 auto', width: 760, opacity: clamp(q * 1.3), transform: `scale(${lerp(0.9, 1, q)})` }} />
        <div style={{ marginTop: 34, display: 'flex', justifyContent: 'center', gap: 36, fontSize: 96, fontWeight: 900, letterSpacing: '-0.04em' }}>
          {beats.map((b, i) => {
            const r = outBack(seg(t, 28.4 + i * 0.3, 28.9 + i * 0.3));
            return <span key={b} style={{ display: 'inline-block', opacity: clamp(r * 1.4), transform: `translateY(${(1 - r) * 50}px)`, ...(i === 2 ? gradText : { color: C.ink }) }}>{b}</span>;
          })}
        </div>
        <div style={{ marginTop: 26, fontSize: 40, fontWeight: 700, color: C.muted, opacity: seg(t, 29.6, 30.0) }}>Your brand, in their hands · mycreativeshop.com</div>
      </div>
    </div>
  );
}

export default function App() {
  const { t, playing, setPlaying, seek } = useClock();
  const scale = useStageScale();
  const [idle, setIdle] = useState(false);
  const recording = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('record');

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@500;700;800;900&display=swap';
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#ECE8FA', overflow: 'hidden', fontFamily: 'Poppins, system-ui, sans-serif' }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2,
        transform: `scale(${scale})`, overflow: 'hidden',
        background: `radial-gradient(1100px 700px at ${30 + Math.sin(t * 0.3) * 20}% 0%, #FFFFFF 0%, ${C.bg} 55%, #EFEAFD 100%)`,
      }}>
        <img src={LOGO} alt="" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, background: GRADIENT }} />
        <SceneOpen t={t} />
        <ScenePersonalize t={t} />
        <SceneIdeas t={t} />
        <ScenePrint t={t} />
        <SceneMail t={t} />
        <SceneHands t={t} />
        <SceneLockup t={t} />
      </div>
      {!recording && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16, background: 'linear-gradient(transparent, rgba(21,18,43,.35))', opacity: idle && playing ? 0 : 1, transition: 'opacity .4s' }}>
          <button onClick={() => setPlaying(!playing)} style={{ width: 44, height: 44, borderRadius: 22, border: 0, background: C.purple, color: C.white, fontSize: 18, cursor: 'pointer' }} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
          <button onClick={() => seek(0)} style={{ width: 44, height: 44, borderRadius: 22, border: `1px solid ${C.white}88`, background: 'transparent', color: C.white, fontSize: 20, cursor: 'pointer' }} aria-label="Restart">↺</button>
          <input type="range" min={0} max={DURATION} step={0.01} value={t} onChange={(e) => seek(Number(e.target.value))} style={{ flex: 1, accentColor: C.purple }} aria-label="Position" />
          <div style={{ color: C.white, fontVariantNumeric: 'tabular-nums', fontSize: 14, width: 90, textAlign: 'right' }}>{t.toFixed(1)}s / {DURATION}s</div>
        </div>
      )}
    </div>
  );
}
