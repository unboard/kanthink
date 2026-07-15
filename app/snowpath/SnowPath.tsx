'use client';
// Snowpath — React shell: HUD, joystick, menus
import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game';
import { HudState } from './types';

const INITIAL_HUD: HudState = {
  screen: 'menu', day: 1, timeLeft: 300, overtime: false, score: 0, cheer: 50,
  snowfall: 0.3, mode: 'foot', actionLabel: null, requests: [], toast: null,
  frostAt: 0, summary: null, bestStars: 0, fightHits: 0,
};

const FONT = "'Baloo 2', 'Trebuchet MS', system-ui, sans-serif";

function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

export default function SnowPath() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const bigMapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [loading, setLoading] = useState(0);
  const [ready, setReady] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [frostFlash, setFrostFlash] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !minimapRef.current) return;
    const game = new Game(canvasRef.current, minimapRef.current, (h) => {
      setHud(h);
      setLoading(game.loadProgress);
      setReady(game.ready);
    });
    gameRef.current = game;
    const readyPoll = setInterval(() => {
      setLoading(game.loadProgress);
      if (game.ready) { setReady(true); clearInterval(readyPoll); }
    }, 200);
    return () => { clearInterval(readyPoll); game.dispose(); gameRef.current = null; };
  }, []);

  // toast lifecycle
  useEffect(() => {
    if (!hud.toast) return;
    setToastVisible(true);
    const t = setTimeout(() => setToastVisible(false), 3500);
    return () => clearTimeout(t);
  }, [hud.toast]);

  // frost flash on snowball hit
  useEffect(() => {
    if (!hud.frostAt) return;
    setFrostFlash(true);
    const t = setTimeout(() => setFrostFlash(false), 700);
    return () => clearTimeout(t);
  }, [hud.frostAt]);

  // big map canvas attach
  useEffect(() => {
    gameRef.current?.attachBigMap(mapOpen ? bigMapRef.current : null);
  }, [mapOpen]);

  // ---- joystick ----
  const joyRef = useRef<HTMLDivElement>(null);
  const nubRef = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);

  const joyMove = useCallback((clientX: number, clientY: number) => {
    const el = joyRef.current, nub = nubRef.current;
    if (!el || !nub) return;
    const r = el.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const max = r.width * 0.36;
    const m = Math.hypot(dx, dy);
    if (m > max) { dx = (dx / m) * max; dy = (dy / m) * max; }
    nub.style.transform = `translate(${dx}px, ${dy}px)`;
    gameRef.current?.setJoystick(dx / max, dy / max);
  }, []);

  const joyEnd = useCallback(() => {
    joyId.current = null;
    if (nubRef.current) nubRef.current.style.transform = 'translate(0px, 0px)';
    gameRef.current?.setJoystick(0, 0);
  }, []);

  const g = gameRef.current;
  const playing = hud.screen === 'playing';
  const stormPct = Math.round(hud.snowfall * 100);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, overflow: 'hidden', background: '#0d1522',
        fontFamily: FONT, userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />

      {/* frost flash */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, rgba(255,255,255,0) 40%, rgba(220,240,255,0.85) 100%)',
        opacity: frostFlash ? 1 : 0, transition: 'opacity 0.6s ease-out',
      }} />

      {/* ------- top bar ------- */}
      {playing && (
        <div style={{ position: 'absolute', top: 'max(10px, env(safe-area-inset-top))', left: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Chip>Day {hud.day}</Chip>
          <Chip strong color={hud.overtime ? '#ff6b6b' : undefined}>
            {hud.overtime ? 'OVERTIME' : fmtClock(hud.timeLeft)}
          </Chip>
          <Chip>❄ {stormPct}%</Chip>
          <Chip>⭐ {hud.score}</Chip>
          <Chip>😊 {hud.cheer}</Chip>
        </div>
      )}

      {/* toast */}
      {hud.toast && (
        <div style={{
          position: 'absolute', top: 'max(52px, calc(env(safe-area-inset-top) + 44px))', left: '50%',
          transform: `translateX(-50%) translateY(${toastVisible ? 0 : -12}px)`,
          background: 'rgba(14,24,40,0.88)', color: '#eaf2ff', padding: '10px 18px',
          borderRadius: 14, fontSize: 15, fontWeight: 600, maxWidth: '84vw', textAlign: 'center',
          opacity: toastVisible ? 1 : 0, transition: 'opacity 0.4s, transform 0.4s',
          pointerEvents: 'none', border: '1px solid rgba(140,180,240,0.25)',
        }}>
          {hud.toast.text}
        </div>
      )}

      {/* ------- minimap ------- */}
      <canvas
        ref={minimapRef}
        width={180} height={180}
        onClick={() => playing && setMapOpen(true)}
        style={{
          position: 'absolute', top: 'max(48px, calc(env(safe-area-inset-top) + 40px))', right: 12,
          width: 132, height: 132, borderRadius: 12, cursor: 'pointer',
          display: playing ? 'block' : 'none',
          border: '1px solid rgba(140,180,240,0.3)',
        }}
      />

      {/* ------- request cards ------- */}
      {playing && hud.requests.length > 0 && (
        <div style={{
          position: 'absolute', left: 12, top: 'max(56px, calc(env(safe-area-inset-top) + 48px))',
          display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 220,
        }}>
          {hud.requests.slice(0, 6).map((r) => (
            <div
              key={r.id}
              onClick={() => gameRef.current?.focusRequest(r.id)}
              style={{
                background: 'rgba(12,22,38,0.85)', borderRadius: 12, padding: '7px 10px',
                borderLeft: `4px solid ${r.color}`, color: '#e8f0fc', cursor: 'pointer',
                fontSize: 13, lineHeight: 1.25, border: '1px solid rgba(140,180,240,0.18)',
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {r.family} → {r.dest}
                {r.phase === 'stuck' && <span style={{ color: '#ff7b7b' }}> ✻ STUCK!</span>}
              </div>
              <div style={{ opacity: 0.85, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {r.phase === 'warming'
                    ? (r.warmup > 0 ? `leaves in ${Math.ceil(r.warmup)}s` : 'snowed in! 🧹')
                    : r.phase === 'stuck' ? 'dig them out!' : 'driving…'}
                </span>
                <span style={{ color: r.secondsLeft < 20 ? '#ff9b9b' : '#9fc3ef', fontWeight: 700 }}>
                  ⏱ {Math.ceil(r.secondsLeft)}s
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------- joystick ------- */}
      {playing && (
        <div
          ref={joyRef}
          onPointerDown={(e) => {
            joyId.current = e.pointerId;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            joyMove(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => { if (joyId.current === e.pointerId) joyMove(e.clientX, e.clientY); }}
          onPointerUp={joyEnd}
          onPointerCancel={joyEnd}
          style={{
            position: 'absolute', left: 18, bottom: 'max(18px, env(safe-area-inset-bottom))',
            width: 128, height: 128, borderRadius: '50%',
            background: 'rgba(160,195,240,0.14)', border: '2px solid rgba(170,205,250,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'none',
          }}
        >
          <div
            ref={nubRef}
            style={{
              width: 52, height: 52, borderRadius: '50%', pointerEvents: 'none',
              background: 'rgba(210,230,255,0.75)', boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
            }}
          />
        </div>
      )}

      {/* ------- action buttons ------- */}
      {playing && (
        <div style={{
          position: 'absolute', right: 16, bottom: 'max(18px, env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end',
        }}>
          {hud.mode === 'foot' && (
            <RoundButton label="⛄" sub="throw" onClick={() => gameRef.current?.throwSnowball()} />
          )}
          {hud.actionLabel && (
            <div
              onPointerDown={() => gameRef.current?.action(true)}
              onPointerUp={() => gameRef.current?.action(false)}
              onPointerLeave={() => gameRef.current?.action(false)}
              style={{
                minWidth: 96, padding: '14px 20px', borderRadius: 20, textAlign: 'center',
                background: 'linear-gradient(180deg, #ffb84d, #f08c1f)', color: '#3a2408',
                fontWeight: 800, fontSize: 17, boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                cursor: 'pointer', touchAction: 'none',
              }}
            >
              {hud.actionLabel}
            </div>
          )}
        </div>
      )}

      {/* ------- small controls ------- */}
      {playing && (
        <div style={{ position: 'absolute', top: 'max(10px, env(safe-area-inset-top))', right: 12, display: 'flex', gap: 6 }}>
          <MiniButton label={muted ? '🔇' : '🔊'} onClick={() => { const m = !muted; setMuted(m); g?.setMuted(m); }} />
          <MiniButton label={paused ? '▶️' : '⏸'} onClick={() => { const p = !paused; setPaused(p); g?.setPaused(p); }} />
        </div>
      )}

      {/* ------- big map ------- */}
      {mapOpen && (
        <div
          onClick={() => setMapOpen(false)}
          style={{
            position: 'absolute', inset: 0, background: 'rgba(5,10,20,0.7)', zIndex: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <canvas ref={bigMapRef} width={512} height={512} style={{ width: 'min(86vw, 70vh)', height: 'min(86vw, 70vh)', borderRadius: 16 }} />
            <div style={{ color: '#bcd3f2', marginTop: 10, fontSize: 14 }}>tap anywhere to close</div>
          </div>
        </div>
      )}

      {/* ------- menu ------- */}
      {hud.screen === 'menu' && (
        <div style={overlayStyle}>
          <div style={{ fontSize: 15, letterSpacing: 6, color: '#9fc3ef', fontWeight: 700 }}>❄ ❄ ❄</div>
          <h1 style={{
            fontSize: 'min(15vw, 84px)', margin: '6px 0 2px', color: '#f2f7ff', fontWeight: 800,
            textShadow: '0 4px 24px rgba(90,140,220,0.55)', letterSpacing: 2,
          }}>
            SNOWPATH
          </h1>
          <p style={{ color: '#b8cfee', fontSize: 17, margin: '0 0 18px', maxWidth: 440, textAlign: 'center', lineHeight: 1.45 }}>
            The storm is here and the whole town needs to get somewhere.
            Plow the roads, blow out the driveways, and get every family where
            they&apos;re going — on time.
          </p>
          <div style={{ color: '#8fb2dd', fontSize: 14, marginBottom: 22, display: 'flex', gap: 18 }}>
            <span>🚜 plow roads</span><span>💨 blow driveways</span><span>⛄ snowball the kids</span>
          </div>
          {ready ? (
            <button onClick={() => gameRef.current?.startDay()} style={bigButtonStyle}>
              Start Day {hud.day} {hud.bestStars > 0 ? `· best ${'★'.repeat(hud.bestStars)}` : ''}
            </button>
          ) : (
            <div style={{ color: '#cfe2fa', fontSize: 16 }}>
              Loading the town… {Math.round(loading * 100)}%
            </div>
          )}
        </div>
      )}

      {/* ------- summary ------- */}
      {hud.screen === 'summary' && hud.summary && (
        <div style={overlayStyle}>
          <h2 style={{ color: '#f2f7ff', fontSize: 34, margin: '0 0 4px', fontWeight: 800 }}>Day {hud.day} complete!</h2>
          <div style={{ fontSize: 46, margin: '4px 0 10px', letterSpacing: 6 }}>
            <span style={{ color: '#ffd257' }}>{'★'.repeat(hud.summary.stars)}</span>
            <span style={{ color: 'rgba(255,255,255,0.22)' }}>{'★'.repeat(3 - hud.summary.stars)}</span>
          </div>
          <div style={{ color: '#cfe0f7', fontSize: 17, lineHeight: 1.7, textAlign: 'center' }}>
            On-time trips: <b>{hud.summary.delivered} / {hud.summary.total}</b><br />
            Score: <b>{hud.summary.score}</b>
            {hud.fightHits > 0 && <><br />Snowball hits on the kids: <b>{hud.fightHits}</b> 😄</>}
          </div>
          <button onClick={() => gameRef.current?.nextDay()} style={{ ...bigButtonStyle, marginTop: 24 }}>
            Next storm → Day {hud.day + 1}
          </button>
        </div>
      )}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, zIndex: 10,
  background: 'linear-gradient(180deg, rgba(13,24,44,0.88), rgba(20,34,58,0.92))',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: 20,
};

const bigButtonStyle: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: 20, fontWeight: 800, color: '#26333f',
  background: 'linear-gradient(180deg, #eaf4ff, #b9d4f2)', border: 'none',
  padding: '16px 38px', borderRadius: 22, cursor: 'pointer',
  boxShadow: '0 6px 22px rgba(60,110,190,0.45)',
};

function Chip({ children, strong, color }: { children: React.ReactNode; strong?: boolean; color?: string }) {
  return (
    <div style={{
      background: 'rgba(12,22,38,0.82)', color: color ?? '#e8f0fc', borderRadius: 11,
      padding: strong ? '6px 12px' : '5px 10px', fontSize: strong ? 15 : 13, fontWeight: 700,
      border: '1px solid rgba(140,180,240,0.18)', whiteSpace: 'nowrap',
    }}>
      {children}
    </div>
  );
}

function RoundButton({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <div
      onPointerDown={onClick}
      style={{
        width: 66, height: 66, borderRadius: '50%', cursor: 'pointer', touchAction: 'none',
        background: 'rgba(200,225,255,0.22)', border: '2px solid rgba(200,228,255,0.45)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#eaf2ff', fontSize: 24, lineHeight: 1,
      }}
    >
      {label}
      <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.85, marginTop: 2 }}>{sub}</span>
    </div>
  );
}

function MiniButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
        background: 'rgba(12,22,38,0.82)', border: '1px solid rgba(140,180,240,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
      }}
    >
      {label}
    </div>
  );
}
