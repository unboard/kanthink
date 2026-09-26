import { useEffect, useRef, useState } from 'react';

/*
 * MyCreativeShop — BrandSnap, the vertical cut. 20 seconds, 9:16, for Reels,
 * TikTok and Shorts: the same story as the landscape video, told twice as fast.
 *
 *   0–2.8     Stop paying for every design. → Just add your website.
 *   2.8–6.2   Type the website, tap go
 *   6.2–10.2  BrandSnap pulls the logo, colors, photos
 *   10.2–14.6 The postcard builds itself in that brand
 *   14.6–17   Every format follows
 *   17–20     MyCreativeShop · BrandSnap
 *
 * Invented business (Bright Side Landscaping), never says AI, real MCS logo.
 * One clock on a 1080×1920 stage, so it records frame for frame.
 */

const DURATION = 20;
const W = 1080;
const H = 1920;
const LOGO = 'https://res.cloudinary.com/mycreativeshop/image/upload/f_png/v1/public/mcs-logo-dark';

const C = {
  bg: '#F7F5FF', ink: '#15122B', muted: '#6B6785', line: '#E4E0F2',
  purple: '#5B2BC4', pink: '#D8338F', orange: '#FF6A2B', white: '#FFFFFF',
  green: '#2F8F4E', navy: '#14324A', lime: '#B7E36B',
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
      <div style={{ position: 'absolute', width: w * 0.16, height: w * 0.16, borderRadius: '50%', background: '#FFD66B', right: '14%', top: '12%' }} />
      <div style={{ position: 'absolute', left: '-10%', right: '-10%', bottom: '-30%', height: '75%', borderRadius: '50%', background: C.green }} />
      <div style={{ position: 'absolute', left: '-20%', right: '30%', bottom: '-40%', height: '65%', borderRadius: '50%', background: '#3FAE62' }} />
    </div>
  );
}

function Cursor({ x, y, opacity = 1, pressed = false }) {
  return (
    <svg style={{ position: 'absolute', left: x, top: y, opacity, transform: `scale(${pressed ? 0.85 : 1})`, transformOrigin: 'top left' }} width="54" height="64" viewBox="0 0 20 24">
      <path d="M2 2 L2 19 L7 14 L10 22 L13 21 L10 13 L17 13 Z" fill={C.ink} stroke={C.white} strokeWidth="1.5" />
    </svg>
  );
}

// ── scenes ──────────────────────────────────────────────────────────────────
function SceneHook({ t }) {
  if (t > 3.0) return null;
  const second = outBack(seg(t, 1.4, 1.9));
  const out = inOutCubic(seg(t, 2.5, 2.95));
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: 1 - out }}>
      <div style={{ textAlign: 'center', padding: '0 70px' }}>
        <div style={{ fontSize: 104, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1, color: C.muted, opacity: outCubic(seg(t, 0.1, 0.5)) }}>
          {['Stop paying for', 'every design.'].map((line, i) => (
            // Each line struck through on its own, the second just after the first.
            <div key={line} style={{ position: 'relative', display: 'table', margin: '0 auto' }}>
              {line}
              <div style={{ position: 'absolute', left: -8, top: '54%', height: 12, borderRadius: 6, background: C.orange, width: `calc(${inOutCubic(seg(t, 0.9 + i * 0.2, 1.25 + i * 0.2)) * 100}% + 16px)`, transform: 'rotate(-2deg)' }} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 70, fontSize: 128, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1.02, opacity: clamp(second * 1.3), transform: `translateY(${(1 - second) * 80}px)`, ...gradText }}>
          Just add your website.
        </div>
      </div>
    </div>
  );
}

function SceneWebsite({ t }) {
  const p = presence(t, 2.7, 6.3);
  if (p <= 0) return null;
  const url = typed('brightsidelandscaping.com', t, 3.3, 4.7);
  const press = t > 5.35 && t < 5.6;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <div style={{ position: 'absolute', left: 60, top: 520, width: 960, padding: 56, borderRadius: 36, background: C.white, boxShadow: '0 40px 100px rgba(40,20,90,.16)', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 36, fontWeight: 800, ...gradText }}><Sparkle size={36} /> Personalize</div>
        <div style={{ marginTop: 24, fontSize: 64, fontWeight: 900, letterSpacing: '-0.03em', color: C.ink, lineHeight: 1.05 }}>Let&rsquo;s make your postcard together.</div>
        <div style={{ marginTop: 44, height: 110, borderRadius: 22, border: `5px solid ${C.purple}`, display: 'flex', alignItems: 'center', padding: '0 30px', fontSize: 44, color: url ? C.ink : '#A7A3BD' }}>
          {url || 'www.yourwebsite.com'}
        </div>
        <div style={{ marginTop: 34, height: 116, borderRadius: 24, display: 'grid', placeItems: 'center', fontSize: 46, fontWeight: 800, color: C.white, background: t > 4.8 ? GRADIENT : '#B9A6EA', transform: `scale(${press ? 0.97 : 1})` }}>
          Let&rsquo;s go →
        </div>
      </div>
      <Cursor x={lerp(900, 560, inOutCubic(seg(t, 4.8, 5.35)))} y={lerp(1500, 1010, inOutCubic(seg(t, 4.8, 5.35)))} opacity={seg(t, 4.7, 4.9)} pressed={press} />
    </div>
  );
}

function ScenePull({ t }) {
  const p = presence(t, 6.0, 10.4);
  if (p <= 0) return null;
  const rows = [
    { label: 'Logo', at: 7.0, body: <BizLogo size={78} /> },
    { label: 'Brand colors', at: 7.8, body: <div style={{ display: 'flex', gap: 18 }}>{[C.navy, C.green, C.lime].map((c) => <div key={c} style={{ width: 76, height: 76, borderRadius: 38, background: c }} />)}</div> },
    { label: 'Photos', at: 8.6, body: <div style={{ display: 'flex', gap: 16 }}>{[0, 1].map((n) => <Photo key={n} w={150} h={98} />)}</div> },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 260, textAlign: 'center', fontSize: 92, fontWeight: 900, letterSpacing: '-0.035em', color: C.ink, lineHeight: 1.05 }}>
        <span style={gradText}>BrandSnap</span><br />grabs your brand.
      </div>
      <div style={{ position: 'absolute', left: 90, top: 620, width: 900 }}>
        {rows.map((r, i) => {
          const q = outBack(seg(t, r.at - 0.35, r.at + 0.1));
          const done = t > r.at;
          return (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 30, padding: '40px 44px', marginBottom: 34, borderRadius: 30, background: C.white, boxShadow: '0 24px 60px rgba(40,20,90,.10)', opacity: clamp(q * 1.4), transform: `translateX(${(1 - q) * 120}px)` }}>
              <div style={{ width: 62, height: 62, borderRadius: 31, display: 'grid', placeItems: 'center', background: done ? '#22A65A' : C.line, color: C.white, fontSize: 36, fontWeight: 900 }}>{done ? '✓' : ''}</div>
              <div style={{ fontSize: 44, fontWeight: 800, color: C.ink, width: 300 }}>{r.label}</div>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', opacity: done ? 1 : 0 }}>{r.body}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1400, textAlign: 'center', fontSize: 50, fontWeight: 800, color: '#22A65A', opacity: seg(t, 9.0, 9.3) }}>✓ Ready in seconds</div>
    </div>
  );
}

function SceneBuild({ t }) {
  const p = presence(t, 10.0, 14.8);
  if (p <= 0) return null;
  const wash = inOutCubic(seg(t, 10.5, 11.1));
  const photo = seg(t, 11.0, 11.5);
  const logo = seg(t, 11.5, 11.9);
  const words = seg(t, 11.8, 12.9);
  const cta = seg(t, 12.8, 13.1);
  const headline = 'Your Best Lawn Starts Now.';
  const grey = '#D9D6E6';
  const w = 900;
  const h = 1180;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 180, textAlign: 'center', fontSize: 72, fontWeight: 900, letterSpacing: '-0.03em', color: C.ink, opacity: seg(t, 12.9, 13.3) }}>
        Your logo. Your colors.<br />Your words.
      </div>
      <div style={{ position: 'absolute', left: 90, top: 480, width: w, height: h, borderRadius: 28, overflow: 'hidden', background: grey, boxShadow: '0 40px 100px rgba(40,20,90,.20)' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '46%', background: grey }}>
          <div style={{ opacity: photo, transform: `scale(${lerp(1.15, 1, outCubic(photo))})`, width: '100%', height: '100%' }}><Photo w={w} h={h * 0.46} radius={0} /></div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '54%', background: grey }} />
        <div style={{ position: 'absolute', left: 0, bottom: 0, height: '54%', width: `${wash * 100}%`, background: C.navy }} />
        <div style={{ position: 'absolute', left: 60, top: '49%' }}>
          {logo > 0.02
            ? <div style={{ opacity: logo, transform: `scale(${outBack(logo)})`, transformOrigin: 'left center' }}><BizLogo size={96} dark /></div>
            : <div style={{ width: 300, height: 60, borderRadius: 10, background: '#C9C5DA' }} />}
          <div style={{ marginTop: 34, width: 780, color: C.white, fontWeight: 900, fontSize: 92, lineHeight: 1.0, letterSpacing: '-0.03em', minHeight: 184 }}>
            {words > 0.02 ? typed(headline, words, 0, 1) : <div style={{ width: 640, height: 90, borderRadius: 12, background: '#C9C5DA' }} />}
          </div>
          <div style={{ marginTop: 30, display: 'inline-block', padding: '16px 34px', borderRadius: 999, background: cta > 0.02 ? C.lime : '#C9C5DA', color: C.navy, fontWeight: 900, fontSize: 40, minWidth: 300, minHeight: 48 }}>
            {cta > 0.02 ? 'Free estimate · 555-0142' : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

function SceneFormats({ t }) {
  const p = presence(t, 14.5, 17.2);
  if (p <= 0) return null;
  const formats = [
    { name: 'Postcard', w: 560, h: 370 },
    { name: 'Flyer', w: 400, h: 520 },
    { name: 'Door hanger', w: 230, h: 560 },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 200, textAlign: 'center', fontSize: 88, fontWeight: 900, letterSpacing: '-0.035em', color: C.ink, lineHeight: 1.05 }}>
        Every design.<br /><span style={gradText}>On brand.</span>
      </div>
      {formats.map((f, i) => {
        const q = outBack(seg(t, 14.8 + i * 0.3, 15.4 + i * 0.3));
        const pos = [{ x: 260, y: 560 }, { x: 110, y: 1010 }, { x: 640, y: 980 }][i];
        return (
          <div key={f.name} style={{ position: 'absolute', left: pos.x, top: pos.y, opacity: clamp(q * 1.4), transform: `translateY(${(1 - q) * 120}px) rotate(${[-2, 3, -4][i]}deg)` }}>
            <div style={{ width: f.w, height: f.h, borderRadius: 18, overflow: 'hidden', background: C.navy, boxShadow: '0 30px 80px rgba(40,20,90,.22)' }}>
              <div style={{ height: '45%' }}><Photo w={f.w} h={f.h * 0.45} radius={0} /></div>
              <div style={{ padding: f.w * 0.07 }}>
                <BizLogo size={Math.min(f.w * 0.14, f.h * 0.12)} dark />
                <div style={{ marginTop: Math.min(f.w, f.h) * 0.04, color: C.white, fontWeight: 900, fontSize: Math.min(f.w * 0.085, f.h * 0.075), lineHeight: 1.05 }}>Your Best Lawn Starts Now.</div>
              </div>
            </div>
            <div style={{ marginTop: 16, textAlign: 'center', fontSize: 36, fontWeight: 800, color: C.ink }}>{f.name}</div>
          </div>
        );
      })}
    </div>
  );
}

function SceneLockup({ t }) {
  const p = presence(t, 16.9, 20.4, 0.4);
  if (p <= 0) return null;
  const q = outBack(seg(t, 17.1, 17.7));
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: p }}>
      <div style={{ textAlign: 'center', padding: '0 60px' }}>
        <img src={LOGO} alt="MyCreativeShop" style={{ display: 'block', margin: '0 auto', width: 820, opacity: clamp(q * 1.3), transform: `scale(${lerp(0.9, 1, q)})` }} />
        <div style={{ marginTop: 20, fontSize: 132, fontWeight: 900, letterSpacing: '-0.045em', opacity: seg(t, 17.7, 18.1), ...gradText }}>
          <Sparkle size={110} color={C.pink} /> BrandSnap
        </div>
        <div style={{ marginTop: 26, fontSize: 60, fontWeight: 800, color: C.ink, lineHeight: 1.15, opacity: seg(t, 18.1, 18.5) }}>Your website in.<br />Your brand on every design.</div>
        <div style={{ marginTop: 40, fontSize: 42, color: C.muted, opacity: seg(t, 18.6, 19.0) }}>Try it on any template<br />mycreativeshop.com</div>
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
    <div style={{ position: 'fixed', inset: 0, background: '#1b1830', overflow: 'hidden', fontFamily: 'Poppins, system-ui, sans-serif' }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2,
        transform: `scale(${scale})`, overflow: 'hidden',
        background: `radial-gradient(900px 900px at ${50 + Math.sin(t * 0.4) * 25}% 0%, #FFFFFF 0%, ${C.bg} 55%, #EFEAFD 100%)`,
      }}>
        <img src={LOGO} alt="" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 12, background: GRADIENT }} />
        <SceneHook t={t} />
        <SceneWebsite t={t} />
        <ScenePull t={t} />
        <SceneBuild t={t} />
        <SceneFormats t={t} />
        <SceneLockup t={t} />
      </div>
      {!recording && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16, background: 'linear-gradient(transparent, rgba(21,18,43,.45))', opacity: idle && playing ? 0 : 1, transition: 'opacity .4s' }}>
          <button onClick={() => setPlaying(!playing)} style={{ width: 44, height: 44, borderRadius: 22, border: 0, background: C.purple, color: C.white, fontSize: 18, cursor: 'pointer' }} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
          <button onClick={() => seek(0)} style={{ width: 44, height: 44, borderRadius: 22, border: `1px solid ${C.white}88`, background: 'transparent', color: C.white, fontSize: 20, cursor: 'pointer' }} aria-label="Restart">↺</button>
          <input type="range" min={0} max={DURATION} step={0.01} value={t} onChange={(e) => seek(Number(e.target.value))} style={{ flex: 1, accentColor: C.purple }} aria-label="Position" />
          <div style={{ color: C.white, fontVariantNumeric: 'tabular-nums', fontSize: 14, width: 90, textAlign: 'right' }}>{t.toFixed(1)}s / {DURATION}s</div>
        </div>
      )}
    </div>
  );
}
