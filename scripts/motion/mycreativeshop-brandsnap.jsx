import { useEffect, useRef, useState } from 'react';

/*
 * MyCreativeShop — BrandSnap. A 39-second walkthrough of the newest design builder:
 * your website in, your brand on every design.
 *
 *   0–4.5     Your brand. On every design. In about a minute.
 *   4.5–9     Pick any template → Personalize
 *   9–14      Enter your website
 *   14–20.5   BrandSnap reads it: logo, colours, photos, words → brand kit
 *   20.5–25   A few ideas to start from
 *   25–31     The design assembles in your brand, then every format follows
 *   31–35     Skip the designer back-and-forth
 *   35–39     MyCreativeShop · BrandSnap
 *
 * The business is invented, on purpose: this is about the workflow, not a template.
 * One clock drives everything on a 1920×1080 stage, so it records frame for frame.
 */

const DURATION = 39;
const W = 1920;
const H = 1080;
const LOGO = 'https://res.cloudinary.com/mycreativeshop/image/upload/f_png/v1/public/mcs-logo-dark';

const C = {
  bg: '#F7F5FF',
  ink: '#15122B',
  muted: '#6B6785',
  line: '#E4E0F2',
  purple: '#5B2BC4',
  pink: '#D8338F',
  orange: '#FF6A2B',
  white: '#FFFFFF',
  // The example business's own brand.
  green: '#2F8F4E',
  navy: '#14324A',
  lime: '#B7E36B',
};
const GRADIENT = `linear-gradient(90deg, ${C.purple}, ${C.pink} 55%, ${C.orange})`;

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
const presence = (t, a, b, fade = 0.45) => Math.min(outCubic(seg(t, a, a + fade)), 1 - inOutCubic(seg(t, b - fade, b)));
const typed = (text, t, a, b) => text.slice(0, Math.round(seg(t, a, b) * text.length));

// ── clock and stage ─────────────────────────────────────────────────────────
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
    const tick = (now) => {
      setT((base.current.t + (now - base.current.at) / 1000) % DURATION);
      raf = requestAnimationFrame(tick);
    };
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
function Caption({ t, a, b, children, y = 90, size = 64 }) {
  const p = presence(t, a, b);
  if (p <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontSize: size, fontWeight: 800, letterSpacing: '-0.025em', color: C.ink, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
      {children}
    </div>
  );
}

function Sparkle({ size = 28, color = C.purple }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M10 2 L12 8.5 L18.5 10.5 L12 12.5 L10 19 L8 12.5 L1.5 10.5 L8 8.5 Z" fill={color} />
      <path d="M19 13 L20 16 L23 17 L20 18 L19 21 L18 18 L15 17 L18 16 Z" fill={color} opacity="0.8" />
    </svg>
  );
}

/** Bright Side Landscaping's mark: a leaf in a circle. */
function BizLogo({ size = 64, withName = true, dark = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.25 }}>
      <svg width={size} height={size} viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="19" fill={C.green} />
        <path d="M11 27 C 11 16, 19 10, 30 10 C 30 21, 24 29, 13 29 Z" fill={C.lime} />
        <path d="M12 28 L 24 16" stroke={C.green} strokeWidth="2" />
      </svg>
      {withName && (
        <div style={{ lineHeight: 1.05, color: dark ? C.white : C.navy }}>
          <div style={{ fontWeight: 900, fontSize: size * 0.36, letterSpacing: '-0.01em' }}>Bright Side</div>
          <div style={{ fontWeight: 700, fontSize: size * 0.22, color: dark ? C.lime : C.green, letterSpacing: '0.06em' }}>LANDSCAPING</div>
        </div>
      )}
    </div>
  );
}

/** A photo stand-in: sky, sun, rolling lawn. */
function Photo({ w, h, radius = 10 }) {
  return (
    <div style={{ position: 'relative', width: w, height: h, borderRadius: radius, overflow: 'hidden', background: 'linear-gradient(180deg, #9ED8FF, #D9F2FF)' }}>
      <div style={{ position: 'absolute', width: w * 0.16, height: w * 0.16, borderRadius: '50%', background: '#FFD66B', right: '14%', top: '12%' }} />
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

/**
 * A postcard at any stage of personalisation: `brand` 0 is the bare template
 * (grey blocks), 1 is fully in the business's brand.
 */
function Postcard({ w = 760, h = 500, brand = 1, headline = 'Your Best Lawn Starts Now.', parts = {} }) {
  const p = { wash: brand, photo: brand, logo: brand, words: brand, cta: brand, ...parts };
  const grey = '#D9D6E6';
  const mix = (a, b, q) => (q >= 1 ? b : q <= 0 ? a : b);
  return (
    <div style={{ position: 'relative', width: w, height: h, borderRadius: 16, overflow: 'hidden', background: C.white, boxShadow: '0 30px 80px rgba(40,20,90,.18)' }}>
      {/* Colour wash sweeping in from the left */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '52%', background: grey }} />
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${52 * clamp(p.wash)}%`, background: C.navy }} />
      {/* Photo */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: '48%', height: '100%', background: grey }}>
        <div style={{ opacity: clamp(p.photo), transform: `scale(${lerp(1.15, 1, outCubic(clamp(p.photo)))})`, width: '100%', height: '100%' }}>
          <Photo w={w * 0.48} h={h} radius={0} />
        </div>
      </div>
      {/* Logo */}
      <div style={{ position: 'absolute', left: '6%', top: '8%' }}>
        {p.logo > 0.02
          ? <div style={{ opacity: clamp(p.logo), transform: `scale(${outBack(clamp(p.logo))})`, transformOrigin: 'left center' }}><BizLogo size={w * 0.07} dark /></div>
          : <div style={{ width: w * 0.2, height: w * 0.05, borderRadius: 6, background: '#C9C5DA' }} />}
      </div>
      {/* Words */}
      <div style={{ position: 'absolute', left: '6%', top: '30%', width: '42%' }}>
        {p.words > 0.02 ? (
          <>
            <div style={{ color: C.white, fontWeight: 900, fontSize: w * 0.058, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
              {typed(headline, clamp(p.words), 0, 1)}
            </div>
            <div style={{ marginTop: w * 0.018, color: C.lime, fontWeight: 700, fontSize: w * 0.022, opacity: seg(p.words, 0.7, 1) }}>
              Spring cleanups · Mowing · Planting
            </div>
          </>
        ) : (
          <>
            <div style={{ width: '90%', height: w * 0.04, borderRadius: 6, background: '#C9C5DA' }} />
            <div style={{ width: '70%', height: w * 0.04, borderRadius: 6, background: '#C9C5DA', marginTop: 10 }} />
            <div style={{ width: '55%', height: w * 0.018, borderRadius: 4, background: '#C9C5DA', marginTop: 16 }} />
          </>
        )}
      </div>
      {/* Call to action */}
      <div style={{ position: 'absolute', left: '6%', bottom: '9%', padding: `${w * 0.012}px ${w * 0.022}px`, borderRadius: 999, background: p.cta > 0.02 ? C.lime : '#C9C5DA', color: C.navy, fontWeight: 900, fontSize: w * 0.022, opacity: 0.5 + 0.5 * clamp(p.cta), minWidth: w * 0.2, minHeight: w * 0.02 }}>
        {p.cta > 0.02 ? 'Free estimate · 555-0142' : ''}
      </div>
    </div>
  );
}

// ── scenes ──────────────────────────────────────────────────────────────────
function SceneHook({ t }) {
  if (t > 4.8) return null;
  const out = inOutCubic(seg(t, 3.9, 4.7));
  const lines = ['Your brand.', 'On every design.', 'In about a minute.'];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: 1 - out, transform: `translateY(${-out * 40}px)` }}>
      <div style={{ textAlign: 'center' }}>
        {lines.map((l, i) => {
          const q = outBack(seg(t, 0.2 + i * 0.55, 0.8 + i * 0.55));
          const last = i === lines.length - 1;
          return (
            <div key={l} style={{
              fontSize: 128, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1,
              opacity: clamp(q * 1.4), transform: `translateY(${(1 - q) * 70}px)`,
              ...(last ? { background: GRADIENT, WebkitBackgroundClip: 'text', color: 'transparent' } : { color: C.ink }),
            }}>{l}</div>
          );
        })}
      </div>
    </div>
  );
}

function SceneTemplates({ t }) {
  const p = presence(t, 4.4, 9.2);
  if (p <= 0) return null;
  const pick = inOutCubic(seg(t, 6.6, 7.4));
  const tap = t > 7.9 && t < 8.15;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <Caption t={t} a={4.5} b={9.2}>Pick any template.</Caption>
      <div style={{ position: 'absolute', left: 300, top: 240, display: 'grid', gridTemplateColumns: 'repeat(4, 300px)', gap: 40 }}>
        {Array.from({ length: 8 }, (_, i) => {
          const q = outCubic(seg(t, 4.6 + i * 0.1, 5.2 + i * 0.1));
          const chosen = i === 5;
          return (
            <div key={i} style={{
              width: 300, height: 200, borderRadius: 14, background: C.white, boxShadow: '0 10px 30px rgba(40,20,90,.08)',
              opacity: q * (chosen ? 1 : 1 - pick * 0.75), transform: `translateY(${(1 - q) * 40}px) scale(${chosen ? 1 + pick * 0.12 : 1})`,
              outline: chosen && pick > 0.5 ? `4px solid ${C.purple}` : 'none', padding: 20, boxSizing: 'border-box', display: 'flex', gap: 14,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ height: 14, width: '60%', borderRadius: 4, background: '#D9D6E6' }} />
                <div style={{ height: 26, width: '90%', borderRadius: 5, background: '#C9C5DA', marginTop: 18 }} />
                <div style={{ height: 26, width: '70%', borderRadius: 5, background: '#C9C5DA', marginTop: 8 }} />
                <div style={{ height: 22, width: '55%', borderRadius: 11, background: '#E4E0F2', marginTop: 26 }} />
              </div>
              <div style={{ width: '42%', borderRadius: 8, background: ['#E9E4FA', '#FDE7DC', '#E2F3E8', '#E3EEF9'][i % 4] }} />
            </div>
          );
        })}
      </div>
      {/* Personalize button */}
      <div style={{
        position: 'absolute', left: 760, top: 830, width: 400, padding: '22px 0', borderRadius: 18, textAlign: 'center',
        background: GRADIENT, color: C.white, fontSize: 38, fontWeight: 800,
        opacity: outCubic(seg(t, 7.2, 7.6)), transform: `scale(${tap ? 0.96 : outBack(seg(t, 7.2, 7.7))})`,
        boxShadow: `0 20px 50px ${C.purple}55`,
      }}>
        <Sparkle size={34} color={C.white} /> Personalize
      </div>
      <Cursor x={lerp(1250, 960, inOutCubic(seg(t, 7.3, 7.9)))} y={lerp(700, 860, inOutCubic(seg(t, 7.3, 7.9)))} opacity={seg(t, 7.2, 7.4)} pressed={tap} />
    </div>
  );
}

function SceneWebsite({ t }) {
  const p = presence(t, 8.9, 14.2);
  if (p <= 0) return null;
  const url = typed('brightsidelandscaping.com', t, 10.2, 11.9);
  const ready = t > 12.0;
  const press = t > 12.9 && t < 13.15;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <div style={{ position: 'absolute', left: 460, top: 170, width: 1000, padding: 60, borderRadius: 32, background: C.white, boxShadow: '0 40px 100px rgba(40,20,90,.14)', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 30, fontWeight: 800, background: GRADIENT, WebkitBackgroundClip: 'text', color: 'transparent' }}>
          <Sparkle size={30} /> Personalize
        </div>
        <div style={{ marginTop: 26, fontSize: 62, fontWeight: 900, letterSpacing: '-0.03em', color: C.ink, lineHeight: 1.05 }}>Let&rsquo;s make your postcard together.</div>
        <div style={{ marginTop: 20, fontSize: 30, color: C.muted, lineHeight: 1.4 }}>Give us your website and we&rsquo;ll do the first draft — your logo, your colors, your words.</div>
        <div style={{ marginTop: 44, fontSize: 28, fontWeight: 800, color: C.ink }}>Enter your website to continue</div>
        <div style={{ marginTop: 14, height: 88, borderRadius: 18, border: `4px solid ${C.purple}`, display: 'flex', alignItems: 'center', padding: '0 28px', fontSize: 38, color: url ? C.ink : '#A7A3BD' }}>
          {url || 'www.yourwebsite.com'}
          {!ready && Math.floor(t * 3) % 2 === 0 && <span style={{ width: 3, height: 44, background: C.ink, marginLeft: 4 }} />}
        </div>
        <div style={{
          marginTop: 34, height: 92, borderRadius: 20, display: 'grid', placeItems: 'center', fontSize: 38, fontWeight: 800, color: C.white,
          background: ready ? GRADIENT : '#B9A6EA', transform: `scale(${press ? 0.97 : 1})`, transition: 'background .3s',
        }}>
          Let&rsquo;s go →
        </div>
      </div>
      <Cursor x={lerp(1300, 980, inOutCubic(seg(t, 12.2, 12.9)))} y={lerp(560, 880, inOutCubic(seg(t, 12.2, 12.9)))} opacity={seg(t, 12.1, 12.3)} pressed={press} />
    </div>
  );
}

const KIT = [
  { label: 'Logo', at: 15.4 },
  { label: 'Brand colors', at: 16.4 },
  { label: 'Photos', at: 17.4 },
  { label: 'What you do', at: 18.4 },
];

function SceneReading({ t }) {
  const p = presence(t, 13.9, 20.8);
  if (p <= 0) return null;
  // A flying piece: from a spot on the website to its row in the kit.
  const fly = (at, from, to) => {
    const q = inOutCubic(seg(t, at - 0.6, at));
    return { left: lerp(from[0], to[0], q), top: lerp(from[1], to[1], q) - Math.sin(q * Math.PI) * 80, opacity: seg(t, at - 0.7, at - 0.5) };
  };
  const scan = (t * 0.6) % 1;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <Caption t={t} a={14.0} b={20.8} y={70}>
        <span style={{ background: GRADIENT, WebkitBackgroundClip: 'text', color: 'transparent' }}>BrandSnap</span> reads your site.
      </Caption>

      {/* The website */}
      <div style={{ position: 'absolute', left: 150, top: 220, width: 820, height: 660, borderRadius: 22, background: C.white, boxShadow: '0 30px 80px rgba(40,20,90,.14)', overflow: 'hidden' }}>
        <div style={{ height: 52, background: '#EEEAF8', display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px' }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 14, height: 14, borderRadius: 7, background: '#D3CDE8' }} />)}
          <div style={{ marginLeft: 18, flex: 1, height: 30, borderRadius: 15, background: C.white, fontSize: 18, color: C.muted, display: 'flex', alignItems: 'center', padding: '0 16px' }}>brightsidelandscaping.com</div>
        </div>
        <div style={{ padding: '26px 34px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.white }}>
          <BizLogo size={58} />
          <div style={{ display: 'flex', gap: 22 }}>{['Services', 'Gallery', 'Contact'].map((m) => <div key={m} style={{ fontSize: 20, fontWeight: 700, color: C.navy }}>{m}</div>)}</div>
        </div>
        <div style={{ position: 'relative', height: 300 }}>
          <Photo w={820} h={300} radius={0} />
          <div style={{ position: 'absolute', left: 34, top: 60, color: C.white, fontSize: 46, fontWeight: 900, textShadow: '0 4px 20px rgba(0,0,0,.25)', letterSpacing: '-0.02em' }}>Lawns worth<br />coming home to.</div>
        </div>
        <div style={{ display: 'flex', gap: 20, padding: 30 }}>
          {[C.navy, C.green, C.lime].map((c) => <div key={c} style={{ flex: 1, height: 70, borderRadius: 12, background: c }} />)}
        </div>
        {/* The scan line */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 52 + scan * 608, height: 4, background: GRADIENT, opacity: 0.8 * (1 - seg(t, 19.0, 19.4)), boxShadow: `0 0 30px ${C.pink}` }} />
      </div>

      {/* The brand kit */}
      <div style={{ position: 'absolute', left: 1090, top: 220, width: 680, borderRadius: 22, background: C.white, boxShadow: '0 30px 80px rgba(40,20,90,.14)', padding: 36, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 30, fontWeight: 900, color: C.ink }}>Your brand kit</div>
        {KIT.map((k, i) => {
          const done = t > k.at;
          return (
            <div key={k.label} style={{ display: 'flex', alignItems: 'center', gap: 20, height: 118, borderTop: i ? `2px solid ${C.line}` : 'none', marginTop: i ? 0 : 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, display: 'grid', placeItems: 'center', background: done ? '#22A65A' : C.line, color: C.white, fontSize: 26, fontWeight: 900, transform: `scale(${done ? outBack(seg(t, k.at, k.at + 0.35)) : 1})` }}>{done ? '✓' : ''}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: C.ink, width: 210 }}>{k.label}</div>
              <div style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'center', opacity: done ? 1 : 0 }}>
                {i === 0 && <BizLogo size={54} />}
                {i === 1 && [C.navy, C.green, C.lime].map((c) => <div key={c} style={{ width: 54, height: 54, borderRadius: 27, background: c }} />)}
                {i === 2 && [0, 1].map((n) => <Photo key={n} w={110} h={72} />)}
                {i === 3 && <div style={{ fontSize: 22, color: C.muted, lineHeight: 1.3 }}>Lawn care · Planting<br />Spring cleanups</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pieces in flight, from the website to the kit */}
      {t < 18.5 && (
        <>
          <div style={{ position: 'absolute', ...fly(15.4, [184, 300], [1370, 330]) }}><BizLogo size={54} /></div>
          {[C.navy, C.green, C.lime].map((c, i) => (
            <div key={c} style={{ position: 'absolute', width: 54, height: 54, borderRadius: 27, background: c, ...fly(16.4, [260 + i * 270, 820], [1370 + i * 66, 450]) }} />
          ))}
          <div style={{ position: 'absolute', ...fly(17.4, [400, 500], [1370, 570]) }}><Photo w={110} h={72} /></div>
        </>
      )}

      <div style={{ position: 'absolute', left: 1090, top: 830, width: 680, textAlign: 'center', fontSize: 30, fontWeight: 800, color: '#22A65A', opacity: seg(t, 18.8, 19.2) }}>
        ✓ Logo and colors ready
      </div>
    </div>
  );
}

const IDEAS = [
  { title: 'Spring Cleanup Special', line: '“Your Best Lawn Starts Now.”', sub: 'Book before May 1 and save 15%.' },
  { title: 'Trusted Local Pros', line: '“Rooted in Riverside Since 2009.”', sub: 'The neighbors’ choice for curb appeal.' },
  { title: 'Free Estimate', line: '“Curb Appeal, Handled.”', sub: 'Tell us your yard. We’ll price it free.' },
];

function SceneIdeas({ t }) {
  const p = presence(t, 20.5, 25.3);
  if (p <= 0) return null;
  const chosen = inOutCubic(seg(t, 23.3, 23.9));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <Caption t={t} a={20.6} b={25.3}>A few ideas, in your voice.</Caption>
      <div style={{ position: 'absolute', left: 170, top: 290, display: 'flex', gap: 50 }}>
        {IDEAS.map((idea, i) => {
          const q = outBack(seg(t, 21.0 + i * 0.35, 21.7 + i * 0.35));
          const pick = i === 0;
          return (
            <div key={idea.title} style={{
              width: 500, padding: 40, borderRadius: 26, background: C.white, boxSizing: 'border-box',
              boxShadow: pick && chosen > 0.3 ? `0 30px 80px ${C.purple}40` : '0 20px 50px rgba(40,20,90,.10)',
              outline: pick && chosen > 0.3 ? `4px solid ${C.purple}` : `2px solid ${C.line}`,
              opacity: clamp(q * 1.4) * (pick ? 1 : 1 - chosen * 0.6), transform: `translateY(${(1 - q) * 60}px) scale(${pick ? 1 + chosen * 0.05 : 1})`,
            }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: C.ink }}>{idea.title}</div>
              <div style={{ marginTop: 22, padding: '20px 22px', borderRadius: 14, background: '#F2F0F8', fontSize: 30, fontWeight: 800, color: C.ink }}>{idea.line}</div>
              <div style={{ marginTop: 20, fontSize: 24, color: C.muted, lineHeight: 1.4 }}>{idea.sub}</div>
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: `2px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', fontSize: 26, fontWeight: 800, color: pick && chosen > 0.3 ? C.purple : C.ink }}>
                Start with this <span>→</span>
              </div>
            </div>
          );
        })}
      </div>
      <Cursor x={lerp(1000, 520, inOutCubic(seg(t, 22.6, 23.3)))} y={lerp(900, 700, inOutCubic(seg(t, 22.6, 23.3)))} opacity={seg(t, 22.5, 22.7)} pressed={t > 23.3 && t < 23.5} />
    </div>
  );
}

function SceneAssemble({ t }) {
  const p = presence(t, 25.0, 31.3);
  if (p <= 0) return null;
  const parts = {
    wash: inOutCubic(seg(t, 25.6, 26.3)),
    photo: seg(t, 26.2, 26.8),
    logo: seg(t, 26.8, 27.3),
    words: seg(t, 27.2, 28.4),
    cta: seg(t, 28.3, 28.6),
  };
  const spread = inOutCubic(seg(t, 28.9, 29.8));
  const writing = t > 25.4 && t < 28.6;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <Caption t={t} a={29.0} b={31.3} y={80}>Your logo. Your colors. Your words.</Caption>
      {/* Flyer and door hanger arrive in the same brand */}
      {[{ x: -1, w: 320, h: 430, label: 'Flyer' }, { x: 1, w: 190, h: 460, label: 'Door hanger' }].map((f) => (
        <div key={f.label} style={{
          position: 'absolute', left: 960 + f.x * lerp(0, 700, spread) - f.w / 2, top: 560 - f.h / 2 + 30,
          width: f.w, height: f.h, borderRadius: 14, overflow: 'hidden', background: C.navy, opacity: spread, boxShadow: '0 30px 80px rgba(40,20,90,.18)',
        }}>
          <div style={{ height: '48%' }}><Photo w={f.w} h={f.h * 0.48} radius={0} /></div>
          <div style={{ padding: 18 }}>
            <BizLogo size={f.w * 0.16} dark />
            <div style={{ marginTop: 16, color: C.white, fontWeight: 900, fontSize: f.w * 0.1, lineHeight: 1.05 }}>Your Best Lawn Starts Now.</div>
            <div style={{ marginTop: 14, display: 'inline-block', padding: '6px 14px', borderRadius: 999, background: C.lime, color: C.navy, fontWeight: 900, fontSize: f.w * 0.055 }}>Free estimate</div>
          </div>
        </div>
      ))}
      <div style={{ position: 'absolute', left: 960 - 380, top: 560 - 250 + 30, transform: `scale(${lerp(1, 0.86, spread)})` }}>
        <Postcard brand={0} parts={parts} />
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 930, textAlign: 'center', fontSize: 34, fontWeight: 800, color: C.muted,
        opacity: writing ? outCubic(seg(t, 25.4, 25.8)) : 1 - seg(t, 28.6, 29.0),
      }}>
        <Sparkle size={30} color={C.pink} /> We&rsquo;re writing your words…
      </div>
    </div>
  );
}

function SceneSavings({ t }) {
  const p = presence(t, 31.0, 35.3);
  if (p <= 0) return null;
  const q1 = outBack(seg(t, 31.4, 32.0));
  const q2 = outBack(seg(t, 32.1, 32.7));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <Caption t={t} a={31.1} b={35.3} y={140} size={76}>Skip the designer back-and-forth.</Caption>
      <div style={{ position: 'absolute', left: 260, top: 380, display: 'flex', gap: 80 }}>
        <div style={{ width: 640, padding: 50, borderRadius: 30, background: C.white, boxSizing: 'border-box', opacity: clamp(q1 * 1.4), transform: `translateY(${(1 - q1) * 50}px)`, boxShadow: '0 20px 50px rgba(40,20,90,.08)' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.muted }}>Hiring a designer</div>
          <div style={{ marginTop: 26, fontSize: 30, color: C.muted, lineHeight: 1.7 }}>
            <div>Briefs and revisions</div>
            <div>Days of waiting</div>
            <div>A design fee for every piece</div>
          </div>
        </div>
        <div style={{ width: 640, padding: 50, borderRadius: 30, background: C.white, boxSizing: 'border-box', opacity: clamp(q2 * 1.4), transform: `translateY(${(1 - q2) * 50}px)`, outline: `4px solid ${C.purple}`, boxShadow: `0 30px 80px ${C.purple}33` }}>
          <div style={{ fontSize: 32, fontWeight: 900, background: GRADIENT, WebkitBackgroundClip: 'text', color: 'transparent' }}>BrandSnap</div>
          <div style={{ marginTop: 26, fontSize: 30, color: C.ink, lineHeight: 1.7, fontWeight: 700 }}>
            <div>Your website in</div>
            <div>A first draft in about a minute</div>
            <div>Change every word and picture</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SceneLockup({ t }) {
  const p = presence(t, 35.0, 39.4, 0.5);
  if (p <= 0) return null;
  const q = outBack(seg(t, 35.2, 35.9));
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: p }}>
      <div style={{ textAlign: 'center' }}>
        <img src={LOGO} alt="MyCreativeShop" style={{ display: 'block', margin: '0 auto', width: 720, opacity: clamp(q * 1.3), transform: `scale(${lerp(0.9, 1, q)})` }} />
        <div style={{ marginTop: 10, fontSize: 120, fontWeight: 900, letterSpacing: '-0.04em', opacity: seg(t, 35.9, 36.4), background: GRADIENT, WebkitBackgroundClip: 'text', color: 'transparent' }}>
          <Sparkle size={90} color={C.pink} /> BrandSnap
        </div>
        <div style={{ marginTop: 18, fontSize: 48, fontWeight: 800, color: C.ink, opacity: seg(t, 36.5, 37.0) }}>Your website in. Your brand on every design.</div>
        <div style={{ marginTop: 26, fontSize: 32, color: C.muted, opacity: seg(t, 37.1, 37.5) }}>Try it on any template · mycreativeshop.com</div>
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

  const glowX = 30 + Math.sin(t * 0.3) * 20;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#ECE8FA', overflow: 'hidden', fontFamily: 'Poppins, system-ui, sans-serif' }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2,
        transform: `scale(${scale})`, overflow: 'hidden',
        background: `radial-gradient(1100px 700px at ${glowX}% 0%, #FFFFFF 0%, ${C.bg} 55%, #EFEAFD 100%)`,
      }}>
        {/* Load the logo up front, so it is there the moment the closing frame needs it. */}
        <img src={LOGO} alt="" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
        {/* A soft gradient ribbon along the bottom, the brand's thread through every scene */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, background: GRADIENT }} />
        <SceneHook t={t} />
        <SceneTemplates t={t} />
        <SceneWebsite t={t} />
        <SceneReading t={t} />
        <SceneIdeas t={t} />
        <SceneAssemble t={t} />
        <SceneSavings t={t} />
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
