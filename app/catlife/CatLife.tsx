'use client';

// Whisker Wilds — React shell: screens, HUD, touch controls, overlays.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Game } from './game';
import { makeRoomCode, normalizeRoomCode, type PlaydateMember } from './net';
import CatViewer from './CatViewer';
import StyleStudio from './StyleStudio';
import { loadSave, migrateSave, newSave, persistSave, clearSave } from './save';
import {
  getAccount, clearAccount, signup, login as cloudLogin, fetchCloudSave,
  flushCloudPush, getSyncState, onSyncState, uploadMeow, type SyncState,
} from './cloud';
import {
  generateCat, rankFor, rankProgress, xpForLevel, clanCapacity,
  BUILDABLES, RANKS, RIVAL_CLANS, PATTERN_LABELS, ACCESSORY_LABELS,
  FISH_SPECIES, RARITY_LABELS, TOYS,
} from './data';
import type {
  AccessoryId, CatSpec, ChallengeState, DuelState, HudState, PatternId, SaveData, ToastMsg,
} from './types';

// ————— palette —————
const PAPER = '#f6f1e3';
const INK = '#33301f';
const INK_SOFT = '#6b6450';
const CARD = '#fdfaf1';
const LINE = '#dcd3bb';
const GREEN = '#5c7a3f';
const GOLD = '#c9971d';
const ROSE = '#c05c7a';

const CLAN_NAME_IDEAS = ['Sunbeam Clan', 'Moss Paw Clan', 'Starwhisker Clan', 'Berry Bramble Clan', 'Thunder Purr Clan', 'Petal Clan'];

export default function CatLife() {
  const [screen, setScreen] = useState<'boot' | 'intro' | 'play'>('boot');
  const [save, setSave] = useState<SaveData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadSave();
      const acc = getAccount();
      if (acc) {
        // signed in: the newest save wins, wherever it lives
        const cloud = await fetchCloudSave();
        if (cancelled) return;
        const cloudSave = cloud?.save ? migrateSave(cloud.save) : null;
        let chosen = local;
        if (cloudSave && (!local || (cloudSave.savedAt ?? 0) > (local.savedAt ?? 0))) {
          chosen = cloudSave;
          persistSave(cloudSave); // mirror the cloud copy locally
        }
        if (chosen) {
          setSave(chosen);
          setScreen('play');
          return;
        }
      }
      if (local) {
        setSave(local);
        setScreen('play');
      } else {
        setScreen('intro');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (screen === 'boot') {
    return (
      <div className="fixed inset-0 grid place-items-center" style={{ background: PAPER }}>
        <div className="text-2xl" style={{ color: INK, fontFamily: 'var(--font-fraunces)' }}>🐾 …</div>
      </div>
    );
  }

  if (screen === 'intro' || !save) {
    return (
      <IntroScreen
        onStart={(s) => {
          persistSave(s);
          setSave(s);
          setScreen('play');
        }}
      />
    );
  }

  return <PlayScreen save={save} />;
}

// ————————————————— intro: pick a kitten, name the clan —————————————————

function IntroScreen({ onStart }: { onStart: (s: SaveData) => void }) {
  const [worldSeed] = useState(() => (Math.random() * 2 ** 31) | 0);
  const [kittenSeeds, setKittenSeeds] = useState<number[]>(() =>
    [0, 1, 2].map(() => (Math.random() * 2 ** 31) | 0)
  );
  const [idx, setIdx] = useState(0);
  const [clanName, setClanName] = useState('');
  const [signIn, setSignIn] = useState(false);
  const placeholder = useMemo(() => CLAN_NAME_IDEAS[(Math.random() * CLAN_NAME_IDEAS.length) | 0], []);

  // starter cats are girls — every kid's main cat can be a mama someday
  const kitten = useMemo(
    () => generateCat(kittenSeeds[idx], 'player', { minStat: 3, gender: 'girl' }),
    [kittenSeeds, idx]
  );

  if (signIn) {
    return (
      <SignInScreen
        onBack={() => setSignIn(false)}
        onSignedIn={(s) => {
          persistSave(s);
          onStart(s);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 overflow-auto" style={{ background: PAPER, color: INK }}>
      <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-4 px-6 py-8 text-center">
        <div style={{ fontFamily: 'var(--font-fraunces)' }}>
          <h1 className="text-4xl font-bold">Whisker Wilds</h1>
          <p className="mt-1 text-sm italic" style={{ color: INK_SOFT, fontFamily: 'var(--font-spectral)' }}>
            Explore. Collect yarn. Grow your cat clan.
          </p>
        </div>

        <div className="rounded-3xl border px-6 pb-5 pt-3" style={{ background: CARD, borderColor: LINE }}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: INK_SOFT }}>
            Choose your first cat
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIdx((idx + 2) % 3)}
              className="h-12 w-12 rounded-full border text-xl active:scale-95"
              style={{ borderColor: LINE, background: PAPER }}
              aria-label="Previous kitten"
            >
              ‹
            </button>
            <CatViewer spec={kitten} size={240} />
            <button
              onClick={() => setIdx((idx + 1) % 3)}
              className="h-12 w-12 rounded-full border text-xl active:scale-95"
              style={{ borderColor: LINE, background: PAPER }}
              aria-label="Next kitten"
            >
              ›
            </button>
          </div>
          <div style={{ fontFamily: 'var(--font-fraunces)' }} className="text-2xl font-semibold">
            {kitten.name}
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-1.5">
            <Chip text="Girl 🎀" tone="gold" />
            <Chip text="Swimmer 🌊" />
            <Chip text={kitten.traits.brave ? 'Brave 🦁' : 'Gentle 🌼'} />
            <Chip text={PATTERN_LABELS[kitten.coat.pattern]} />
          </div>
          <p className="mt-2 text-sm italic" style={{ color: INK_SOFT, fontFamily: 'var(--font-spectral)' }}>
            “{kitten.personality}”
          </p>
          <button
            onClick={() => setKittenSeeds([0, 1, 2].map(() => (Math.random() * 2 ** 31) | 0))}
            className="mt-2 text-xs underline"
            style={{ color: INK_SOFT }}
          >
            Show me different kittens
          </button>
        </div>

        <div className="w-full max-w-sm">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-widest" style={{ color: INK_SOFT }}>
            Name your clan
          </label>
          <input
            value={clanName}
            onChange={(e) => setClanName(e.target.value)}
            placeholder={placeholder}
            maxLength={24}
            className="w-full rounded-2xl border px-4 py-3 text-center text-lg outline-none"
            style={{ background: CARD, borderColor: LINE, fontFamily: 'var(--font-fraunces)' }}
          />
        </div>

        <button
          onClick={() => onStart(newSave(worldSeed, clanName.trim() || placeholder, kittenSeeds[idx]))}
          className="rounded-full px-10 py-4 text-lg font-bold text-white shadow-lg active:scale-95"
          style={{ background: GREEN, fontFamily: 'var(--font-fraunces)' }}
        >
          Begin the Adventure 🐾
        </button>
        <button className="text-sm font-semibold underline" style={{ color: INK_SOFT }} onClick={() => setSignIn(true)}>
          I already have a clan — sign me in! ☁️
        </button>
        <p className="text-[11px]" style={{ color: INK_SOFT }}>
          Best in landscape on a tablet. Sign in from ⚙️ Settings so your clan is saved online, forever.
        </p>
      </div>
    </div>
  );
}

// ————————————————— cloud sign-in (restore a clan on any tablet) —————————————————

function SignInScreen({ onBack, onSignedIn }: { onBack: () => void; onSignedIn: (s: SaveData) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await cloudLogin(username.trim().toLowerCase(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Something went wrong.');
      return;
    }
    const save = res.save ? migrateSave(res.save) : null;
    if (!save) {
      setError("You're signed in, but this account has no saved clan yet. Go back and start a new adventure — it will save to your account!");
      return;
    }
    onSignedIn(save);
  };

  return (
    <div className="fixed inset-0 overflow-auto" style={{ background: PAPER, color: INK }}>
      <div className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-3 px-6 py-8 text-center">
        <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>Welcome back! ☁️🐾</h1>
        <p className="text-sm" style={{ color: INK_SOFT, fontFamily: 'var(--font-spectral)' }}>
          Type your player name and secret word to bring your clan home.
        </p>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="player name"
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full rounded-2xl border px-4 py-3 text-center text-lg outline-none"
          style={{ background: CARD, borderColor: LINE, fontFamily: 'var(--font-fraunces)' }}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="secret word"
          type="password"
          className="w-full rounded-2xl border px-4 py-3 text-center text-lg outline-none"
          style={{ background: CARD, borderColor: LINE, fontFamily: 'var(--font-fraunces)' }}
        />
        {error && <p className="text-sm font-semibold" style={{ color: ROSE }}>{error}</p>}
        <button
          onClick={submit}
          disabled={busy || !username.trim() || !password}
          className="w-full rounded-full py-4 text-lg font-bold text-white shadow-lg active:scale-95 disabled:opacity-50"
          style={{ background: GREEN, fontFamily: 'var(--font-fraunces)' }}
        >
          {busy ? 'Finding your clan…' : 'Bring my clan back! 🐾'}
        </button>
        <button className="text-sm underline" style={{ color: INK_SOFT }} onClick={onBack}>
          ← back
        </button>
      </div>
    </div>
  );
}

// ————————————————— play screen —————————————————

function PlayScreen({ save }: { save: SaveData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<null | 'guide' | 'build' | 'clan' | 'settings' | 'playdate' | 'map'>(null);
  const [, setSaveTick] = useState(0); // bump to re-read save in overlays
  const [playdateCode, setPlaydateCode] = useState<string | null>(null);
  const [playdateMembers, setPlaydateMembers] = useState<PlaydateMember[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, save, {
      onHud: setHud,
      onToast: (t) =>
        setToasts((prev) => {
          const next = [...prev, t].slice(-3);
          setTimeout(() => setToasts((p) => p.filter((x) => x.id !== t.id)), t.ms ?? 4200);
          return next;
        }),
      onDuel: setDuel,
      onChallenge: setChallenge,
      onSaveChanged: () => setSaveTick((v) => v + 1),
      onCelebrate: (kind, text) => {
        setCelebrate(text);
        confetti({ particleCount: kind === 'recruit' || kind === 'rankup' ? 160 : 80, spread: 75, origin: { y: 0.35 } });
        setTimeout(() => setCelebrate(null), 4200);
      },
      onPlaydateMembers: setPlaydateMembers,
    }, playdateCode ? { code: playdateCode } : null);
    gameRef.current = game;
    game.start();
    return () => {
      game.dispose();
      gameRef.current = null;
      setPlaydateMembers([]);
    };
    // rebuilding the whole game world is exactly what entering/leaving a playdate means
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playdateCode]);

  const game = gameRef.current;

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden"
      style={{ background: '#0a0f18', touchAction: 'none' }}
      onPointerDown={() => gameRef.current?.unlockAudio()}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* camera drag layer (under UI, over canvas) */}
      <CameraDragLayer gameRef={gameRef} />

      {/* HUD */}
      {hud && <TopHud hud={hud} onOpen={setOverlay} gameRef={gameRef} playdateCount={playdateCode ? playdateMembers.length : -1} />}
      {hud?.agility && <AgilityHud a={hud.agility} onCancel={() => gameRef.current?.cancelAgility()} />}

      {/* controls */}
      <Joystick onMove={(x, y) => gameRef.current?.setJoystick(x, y)} />
      {hud && !duel && <ActionCluster hud={hud} gameRef={gameRef} />}

      {/* build mode sheet */}
      {overlay === 'build' && game && (
        <BuildSheet
          game={game}
          onClose={() => {
            game.exitBuildMode();
            setOverlay(null);
          }}
        />
      )}

      {/* overlays */}
      {overlay === 'guide' && game && <GuideOverlay game={game} onClose={() => setOverlay(null)} />}
      {overlay === 'clan' && game && <ClanOverlay game={game} onClose={() => setOverlay(null)} />}
      {overlay === 'settings' && game && <SettingsOverlay game={game} onClose={() => setOverlay(null)} />}
      {overlay === 'map' && game && <MapOverlay game={game} onClose={() => setOverlay(null)} />}
      {overlay === 'playdate' && (
        <PlaydateOverlay
          code={playdateCode}
          members={playdateMembers}
          onStart={(code) => { setPlaydateCode(code); setOverlay(null); }}
          onLeave={() => { setPlaydateCode(null); setOverlay(null); }}
          onClose={() => setOverlay(null)}
        />
      )}

      {/* duel + challenge */}
      {duel && game && <DuelOverlay duel={duel} game={game} />}
      {challenge && game && <ChallengeOverlay c={challenge} game={game} />}

      {/* FISH ON! */}
      {hud?.fishing === 'bite' && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-2xl px-6 py-2.5 text-xl font-bold text-white shadow-xl"
          style={{ background: ROSE, fontFamily: 'var(--font-fraunces)', animation: 'ww-pulse 0.5s infinite' }}>
          🎣 FISH ON! Tap REEL IN!
        </div>
      )}

      {/* celebration banner */}
      {celebrate && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-2xl px-6 py-3 text-center text-lg font-bold text-white shadow-xl"
          style={{ background: GOLD, fontFamily: 'var(--font-fraunces)', animation: 'ww-pop 0.4s ease' }}>
          {celebrate}
        </div>
      )}

      {/* toasts */}
      <div className="pointer-events-none absolute bottom-36 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-1.5 px-4">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-xl px-4 py-2 text-center text-sm text-white shadow-lg"
            style={{ background: 'rgba(30,28,20,0.85)', animation: 'ww-rise 0.3s ease' }}>
            {t.text}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes ww-pop { from { transform: translateX(-50%) scale(0.6); opacity: 0 } to { transform: translateX(-50%) scale(1); opacity: 1 } }
        @keyframes ww-rise { from { transform: translateY(10px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes ww-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.06) } }
      `}</style>
    </div>
  );
}

// ————————————————— camera drag + pinch —————————————————

function CameraDragLayer({ gameRef }: { gameRef: React.RefObject<Game | null> }) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinch = useRef(0);

  return (
    <div
      className="absolute inset-0"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          lastPinch.current = Math.hypot(a.x - b.x, a.y - b.y);
        }
      }}
      onPointerMove={(e) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        const cur = { x: e.clientX, y: e.clientY };
        if (pointers.current.size === 1) {
          gameRef.current?.camDrag(cur.x - prev.x, cur.y - prev.y);
        }
        pointers.current.set(e.pointerId, cur);
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (lastPinch.current > 0) gameRef.current?.pinchZoom(d / lastPinch.current);
          lastPinch.current = d;
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        lastPinch.current = 0;
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        lastPinch.current = 0;
      }}
    />
  );
}

// ————————————————— joystick —————————————————

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const pid = useRef<number | null>(null);
  const R = 52;

  const handle = useCallback(
    (clientX: number, clientY: number) => {
      const el = baseRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      setKnob({ x: dx, y: dy, active: true });
      onMove(dx / R, dy / R);
    },
    [onMove]
  );

  return (
    <div
      ref={baseRef}
      className="absolute bottom-7 left-7 z-20 grid h-36 w-36 place-items-center rounded-full"
      style={{ background: 'rgba(255,255,255,0.14)', border: '2px solid rgba(255,255,255,0.25)', touchAction: 'none', backdropFilter: 'blur(2px)' }}
      onPointerDown={(e) => {
        pid.current = e.pointerId;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        handle(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pid.current === e.pointerId) handle(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (pid.current === e.pointerId) {
          pid.current = null;
          setKnob({ x: 0, y: 0, active: false });
          onMove(0, 0);
        }
      }}
      onPointerCancel={() => {
        pid.current = null;
        setKnob({ x: 0, y: 0, active: false });
        onMove(0, 0);
      }}
    >
      <div
        className="h-16 w-16 rounded-full shadow-lg transition-transform"
        style={{
          background: knob.active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)',
          transform: `translate(${knob.x}px, ${knob.y}px)`,
          transitionDuration: knob.active ? '0ms' : '150ms',
        }}
      />
    </div>
  );
}

// ————————————————— action buttons —————————————————

function RoundBtn({
  label, sub, onPress, size = 64, active = false, pulse = false,
}: {
  label: string; sub?: string; onPress: () => void; size?: number; active?: boolean; pulse?: boolean;
}) {
  return (
    <button
      className="grid place-items-center rounded-full font-bold shadow-lg active:scale-90"
      style={{
        width: size, height: size,
        background: active ? 'rgba(255,214,90,0.92)' : 'rgba(255,255,255,0.85)',
        color: INK,
        border: '2px solid rgba(0,0,0,0.08)',
        animation: pulse ? 'ww-pulse 1s infinite' : undefined,
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPress();
      }}
    >
      <span style={{ fontSize: size * 0.34, lineHeight: 1 }}>{label}</span>
      {sub && <span className="px-1 text-center" style={{ fontSize: 10, lineHeight: 1.1 }}>{sub}</span>}
    </button>
  );
}

function ActionCluster({ hud, gameRef }: { hud: HudState; gameRef: React.RefObject<Game | null> }) {
  const ctx = hud.context;
  return (
    <div className="absolute bottom-6 right-6 z-20 flex items-end gap-3">
      <div className="flex flex-col items-center gap-3">
        <RoundBtn label="⚡" sub={hud.zoom.active ? 'ZOOM!' : hud.zoom.ready ? 'zoom' : 'recharging'}
          active={hud.zoom.active} size={56}
          onPress={() => gameRef.current?.startZoom()} />
        <RoundBtn label="🤫" sub={hud.sneaking ? 'sneaking' : 'sneak'} active={hud.sneaking} size={56}
          onPress={() => gameRef.current?.toggleSneak()} />
        <RoundBtn label="🐱" sub="meow" size={56} onPress={() => gameRef.current?.pressMeow()} />
      </div>
      <div className="flex flex-col items-center gap-3">
        {ctx && (
          <RoundBtn label={ctxIcon(ctx.kind)} sub={ctx.label} size={72} pulse
            onPress={() => gameRef.current?.pressAction()} />
        )}
        {!ctx && hud.sneaking && (
          <RoundBtn label="🐾" sub="pounce" size={72} onPress={() => gameRef.current?.pressAction()} />
        )}
        <RoundBtn label="⬆️" sub={hud.climbing ? 'leap off' : 'jump'} size={72}
          onPress={() => gameRef.current?.pressJump()} />
      </div>
    </div>
  );
}

function ctxIcon(kind: string): string {
  switch (kind) {
    case 'dig': return '⛏️';
    case 'climb': return '🌲';
    case 'scratch': return '🪵';
    case 'duel': return '⚔️';
    case 'prey': return '🐾';
    case 'agility': return '🚩';
    case 'washart': return '💦';
    case 'bath': return '🛁';
    case 'fish': return '🎣';
    case 'reel': return '🎣';
    default: return '✨';
  }
}

// ————————————————— top HUD —————————————————

function TopHud({
  hud, onOpen, gameRef, playdateCount,
}: {
  hud: HudState;
  onOpen: (o: 'guide' | 'build' | 'clan' | 'settings' | 'playdate' | 'map') => void;
  gameRef: React.RefObject<Game | null>;
  playdateCount: number; // -1 = not in a playdate
}) {
  const t = hud.timeOfDay;
  const isDay = t > 0.25 && t < 0.75;
  return (
    <div className="absolute left-0 right-0 top-0 z-20 flex items-start justify-between p-3">
      <div className="flex items-center gap-2">
        {/* active cat chip → guide */}
        <button
          className="flex items-center gap-2 rounded-full py-1.5 pl-3 pr-4 shadow-lg active:scale-95"
          style={{ background: 'rgba(253,250,241,0.94)', border: `1.5px solid ${LINE}` }}
          onPointerDown={(e) => { e.stopPropagation(); onOpen('guide'); }}
        >
          <span className="text-xl">🐱</span>
          <span className="text-left leading-tight">
            <span className="block text-sm font-bold" style={{ color: INK, fontFamily: 'var(--font-fraunces)' }}>
              {hud.activeCat?.name}
            </span>
            <span className="block text-[10px] uppercase tracking-wide" style={{ color: INK_SOFT }}>
              Lv {hud.activeCat?.level} · {hud.activeCat?.rank}
            </span>
          </span>
        </button>
        <Pill text={`🧶 ${hud.yarn}`} />
        <Pill text={`🍪 ${hud.treats}`} />
        {hud.kittens > 0 && <Pill text={`🐱 ${hud.kittens}`} />}
        {hud.territory && <Pill text={hud.territory} />}
        {hud.paint && (
          <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold shadow-lg"
            style={{ background: 'rgba(253,250,241,0.94)', color: INK, border: `1.5px solid ${hud.paint}` }}>
            🎨 <span className="inline-block h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: hud.paint }} />
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* status chips */}
        {hud.swimming && <Pill text="🌊 swimming" />}
        {hud.climbing && <Pill text="🌲 climbing" />}
        {/* map waypoint */}
        {hud.waypoint && (
          <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold shadow-lg"
            style={{ background: '#faf0d3', color: INK, border: `1.5px solid ${GOLD}` }}>
            ⭐
            <span style={{ display: 'inline-block', transform: `rotate(${hud.waypoint.angle}rad)` }}>⬆️</span>
            <span className="text-[10px] tabular-nums">{Math.round(hud.waypoint.dist)}m</span>
          </span>
        )}
        {/* friend compass — find your sister's cat! */}
        {hud.friend && hud.friend.dist > 12 && (
          <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold shadow-lg"
            style={{ background: '#dcebfb', color: INK, border: '1.5px solid #9ec3e8' }}>
            👯
            <span style={{ display: 'inline-block', transform: `rotate(${hud.friend.angle}rad)` }}>⬆️</span>
            <span className="text-[10px]">{hud.friend.name} · {Math.round(hud.friend.dist)}m</span>
          </span>
        )}
        {/* kitten rescue compass — someone is stuck in a tree or out on the water! */}
        {hud.rescue && (
          <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold shadow-lg"
            style={{ background: '#fbe3ec', color: INK, border: '1.5px solid #e8a9c0', animation: 'ww-pulse 1.2s infinite' }}>
            {hud.rescue.kind === 'water' ? '🌊🐱' : '🐱'}
            <span style={{ display: 'inline-block', transform: `rotate(${hud.rescue.angle}rad)` }}>⬆️</span>
            <span className="text-[10px] tabular-nums">{Math.round(hud.rescue.dist)}m</span>
          </span>
        )}
        {/* pregnancy countdown — and the mad dash home when the kittens come! */}
        {hud.pregnancy && (
          hud.pregnancy.inLabor ? (
            <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold shadow-lg"
              style={{ background: '#fcd9e6', color: INK, border: '2px solid #e0507a', animation: 'ww-pulse 0.7s infinite' }}>
              🍼 Kittens coming — get home!
              <span style={{ display: 'inline-block', transform: `rotate(${hud.camp.angle}rad)` }}>⬆️</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold shadow-lg"
              style={{
                background: '#fbe3ec', color: INK, border: '1.5px solid #e8a9c0',
                animation: hud.pregnancy.secondsLeft <= 30 ? 'ww-pulse 1.2s infinite' : undefined,
              }}>
              🤰 {hud.pregnancy.momIsActive ? 'Kittens due' : hud.pregnancy.mom}
              <span className="text-[11px] tabular-nums">
                {Math.floor(hud.pregnancy.secondsLeft / 60)}:{String(hud.pregnancy.secondsLeft % 60).padStart(2, '0')}
              </span>
            </span>
          )
        )}
        {/* camp compass — appears when away from home, with distance */}
        {hud.camp.dist > 25 && !hud.waypoint && (
          <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold shadow-lg"
            style={{ background: 'rgba(253,250,241,0.94)', color: INK, border: `1.5px solid ${LINE}` }}>
            🏕
            <span style={{ display: 'inline-block', transform: `rotate(${hud.camp.angle}rad)` }}>⬆️</span>
            <span className="text-[10px] tabular-nums">{Math.round(hud.camp.dist)}m</span>
          </span>
        )}
        {/* day/night dial */}
        <div className="grid h-11 w-11 place-items-center rounded-full text-lg shadow-lg"
          style={{ background: isDay ? '#cfe6f7' : '#1c2340', border: `1.5px solid ${LINE}` }}>
          {isDay ? '☀️' : '🌙'}
        </div>
        <button
          className="flex h-11 items-center gap-1 rounded-full px-3 text-lg shadow-lg active:scale-90"
          style={{
            background: playdateCount >= 0 ? '#dcebfb' : 'rgba(253,250,241,0.94)',
            border: `1.5px solid ${playdateCount >= 0 ? '#9ec3e8' : LINE}`,
          }}
          aria-label="Playdate"
          onPointerDown={(e) => { e.stopPropagation(); onOpen('playdate'); }}
        >
          👯{playdateCount >= 0 && <span className="text-xs font-bold" style={{ color: INK }}>{playdateCount + 1}</span>}
        </button>
        <IconBtn icon="🗺" label="Map" onPress={() => onOpen('map')} />
        <IconBtn icon="🔨" label="Build" onPress={() => {
          if (gameRef.current?.enterBuildMode()) onOpen('build');
        }} />
        <IconBtn icon="🏆" label="Clans" onPress={() => onOpen('clan')} />
        <IconBtn icon="⚙️" label="Settings" onPress={() => onOpen('settings')} />
      </div>
    </div>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <span className="rounded-full px-3 py-1.5 text-sm font-bold shadow-lg"
      style={{ background: 'rgba(253,250,241,0.94)', color: INK, border: `1.5px solid ${LINE}` }}>
      {text}
    </span>
  );
}

function IconBtn({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <button
      className="grid h-11 w-11 place-items-center rounded-full text-lg shadow-lg active:scale-90"
      style={{ background: 'rgba(253,250,241,0.94)', border: `1.5px solid ${LINE}` }}
      aria-label={label}
      onPointerDown={(e) => { e.stopPropagation(); onPress(); }}
    >
      {icon}
    </button>
  );
}

function AgilityHud({ a, onCancel }: { a: NonNullable<HudState['agility']>; onCancel: () => void }) {
  return (
    <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-2xl px-5 py-2 text-center shadow-xl"
      style={{ background: 'rgba(253,250,241,0.95)', border: `1.5px solid ${LINE}` }}>
      <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: INK_SOFT }}>{a.name}</div>
      <div className="text-2xl font-bold tabular-nums" style={{ color: a.t > a.par ? ROSE : GREEN, fontFamily: 'var(--font-fraunces)' }}>
        {a.t.toFixed(1)}s
      </div>
      <div className="text-[11px]" style={{ color: INK_SOFT }}>
        gate {Math.min(a.nextGate, a.total - 1)}/{a.total - 1} · beat {a.par.toFixed(0)}s to level up
      </div>
      <button className="mt-0.5 text-[11px] underline" style={{ color: INK_SOFT }} onPointerDown={onCancel}>
        give up
      </button>
    </div>
  );
}

// ————————————————— duel overlay —————————————————

function DuelOverlay({ duel, game }: { duel: DuelState; game: Game }) {
  const [marker, setMarker] = useState(0);
  const zone = duel.zoneSize;

  useEffect(() => {
    if (duel.phase !== 'aim') return;
    let raf = 0;
    const loop = () => {
      setMarker(game.getDuelMarker());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [duel.phase, game]);

  const last = duel.results[duel.results.length - 1];

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex justify-center pb-6">
      <div className="w-full max-w-md rounded-3xl border p-4 text-center shadow-2xl"
        style={{ background: 'rgba(253,250,241,0.97)', borderColor: LINE, color: INK }}>
        <div className="text-lg font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>
          {duel.kind === 'hopscotch' ? '🟨 Hopscotch Race' : '⚔️ Pounce Duel'} vs {duel.rivalCat.name}
        </div>
        <div className="text-[11px] uppercase tracking-widest" style={{ color: INK_SOFT }}>
          {duel.rivalClanName} · {duel.stake ? '1 yarn at stake' : 'friendly (no stakes)'}
        </div>

        {/* score line (pounce) or race progress (hopscotch) */}
        {duel.kind === 'pounce' ? (
          <div className="my-2 flex justify-center gap-2 text-sm font-bold">
            <span style={{ color: GREEN }}>You {duel.playerScore}</span>
            <span style={{ color: INK_SOFT }}>·</span>
            <span style={{ color: ROSE }}>{duel.rivalScore} Them</span>
          </div>
        ) : duel.hs ? (
          <div className="my-2 flex flex-col gap-1">
            <RaceBar label="You" value={duel.hs.playerRow} max={duel.hs.rows.length} color={GREEN} />
            <RaceBar label={duel.rivalCat.name} value={duel.hs.rivalRow} max={duel.hs.rows.length} color={ROSE} />
          </div>
        ) : null}

        {duel.phase === 'choose' && (
          <div className="py-2">
            <p className="mb-2 text-sm" style={{ color: INK_SOFT }}>Pick your game!</p>
            <div className="flex justify-center gap-3">
              <button className="rounded-2xl px-5 py-4 font-bold text-white shadow active:scale-95" style={{ background: GREEN }}
                onPointerDown={() => game.chooseDuelKind('pounce')}>
                🐾 Pounce<br /><span className="text-xs font-normal">timing duel</span>
              </button>
              <button className="rounded-2xl px-5 py-4 font-bold text-white shadow active:scale-95" style={{ background: '#c98a2c' }}
                onPointerDown={() => game.chooseDuelKind('hopscotch')}>
                🟨 Hopscotch<br /><span className="text-xs font-normal">counting race</span>
              </button>
            </div>
          </div>
        )}

        {duel.phase === 'intro' && (
          <div className="py-3 text-sm">
            {duel.kind === 'hopscotch' ? 'On your marks… count the squares in the next row!' : 'The cats circle each other…'}
          </div>
        )}

        {duel.kind === 'hopscotch' && duel.phase === 'aim' && duel.hs && (
          <>
            <p className="text-sm font-semibold" style={{ color: duel.hs.locked ? ROSE : INK_SOFT }}>
              {duel.hs.locked ? 'Oops — wrong number! Look again…' : 'How many squares in the next row?'}
            </p>
            <div className="mt-2 flex justify-center gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button key={n}
                  className="h-16 w-16 rounded-2xl text-2xl font-bold shadow-lg active:scale-90 disabled:opacity-40"
                  disabled={duel.hs!.locked}
                  style={{ background: duel.hs!.locked ? '#e5dcc4' : CARD, border: `2.5px solid ${GREEN}`, color: INK }}
                  onPointerDown={() => game.hopscotchTap(n)}>
                  {n}
                </button>
              ))}
            </div>
          </>
        )}

        {duel.kind === 'pounce' && duel.phase === 'aim' && (
          <>
            <div className="relative mx-auto h-8 w-full overflow-hidden rounded-full" style={{ background: '#e5dcc4' }}>
              <div className="absolute top-0 h-full rounded-full"
                style={{ left: `${(0.5 - zone / 2) * 100}%`, width: `${zone * 100}%`, background: '#9ec97f' }} />
              <div className="absolute top-0 h-full w-2 rounded-full" style={{ left: `calc(${marker * 100}% - 4px)`, background: INK }} />
            </div>
            <button
              className="mt-3 w-full rounded-2xl py-4 text-xl font-bold text-white shadow-lg active:scale-95"
              style={{ background: GREEN, fontFamily: 'var(--font-fraunces)' }}
              onPointerDown={() => game.duelTap()}
            >
              POUNCE! 🐾
            </button>
            <p className="mt-1 text-[11px]" style={{ color: INK_SOFT }}>Tap when the marker is in the green!</p>
          </>
        )}

        {duel.phase === 'reveal' && last && (
          <div className="py-2 text-sm">
            <div>You: <b style={{ color: GREEN }}>{Math.round(last.player * 100)}%</b> · {duel.rivalCat.name}: <b style={{ color: ROSE }}>{Math.round(last.rival * 100)}%</b></div>
            <div className="mt-1 text-lg font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>
              {last.player > last.rival ? 'Perfect pounce! 🎯' : last.player === last.rival ? 'Even match!' : 'They got the jump on you!'}
            </div>
          </div>
        )}

        {duel.phase === 'done' && (
          <div className="py-2">
            <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-fraunces)', color: duel.won ? GREEN : ROSE }}>
              {duel.won ? 'Victory! 🏅' : 'Good try!'}
            </div>
            <p className="text-sm" style={{ color: INK_SOFT }}>
              {duel.recruited
                ? `${duel.rivalCat.name} is joining your clan! 🤝`
                : duel.won
                  ? duel.stake ? 'You won a yarn ball — it goes on your record!' : 'A win for the record book!'
                  : duel.stake ? 'They took a yarn ball. Win it back anytime!' : 'No yarn lost — just pride.'}
            </p>
            <button
              className="mt-2 rounded-full px-8 py-3 font-bold text-white active:scale-95"
              style={{ background: INK }}
              onPointerDown={() => game.endDuel()}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RaceBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 truncate text-right text-[11px] font-bold" style={{ color: INK_SOFT }}>{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: '#e8dfc8' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
      <span className="text-lg">🐾</span>
    </div>
  );
}

// ————————————————— challenge overlay —————————————————

function ChallengeOverlay({ c, game }: { c: ChallengeState; game: Game }) {
  if (c.phase === 'running') {
    const left = Math.max(0, c.timeLimit - c.t);
    return (
      <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-2xl px-5 py-2 text-center shadow-xl"
        style={{ background: 'rgba(253,250,241,0.95)', border: `1.5px solid ${GOLD}` }}>
        <div className="text-sm font-bold" style={{ color: INK, fontFamily: 'var(--font-fraunces)' }}>{c.title}</div>
        <div className="text-lg font-bold tabular-nums" style={{ color: left < 15 ? ROSE : GOLD }}>
          {Math.ceil(left)}s {c.goal > 1 ? `· ${c.progress}/${c.goal} 🧶` : ''}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-40 grid place-items-center p-4" style={{ background: 'rgba(20,18,10,0.45)' }}>
      <div className="w-full max-w-md rounded-3xl border p-6 text-center shadow-2xl"
        style={{ background: CARD, borderColor: GOLD, color: INK }}>
        {c.phase === 'offer' && (
          <>
            <div className="text-3xl">✨🧶✨</div>
            <h2 className="mt-1 text-2xl font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>{c.title}</h2>
            <p className="mt-2 text-sm" style={{ color: INK_SOFT, fontFamily: 'var(--font-spectral)' }}>{c.desc}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-widest" style={{ color: GOLD }}>
              Win → a new cat joins your clan!
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <button className="rounded-full px-7 py-3 font-bold text-white shadow active:scale-95" style={{ background: GREEN }}
                onPointerDown={() => game.acceptChallenge()}>
                Accept! 🐾
              </button>
              <button className="rounded-full border px-6 py-3 font-bold active:scale-95" style={{ borderColor: LINE, color: INK_SOFT }}
                onPointerDown={() => game.declineChallenge()}>
                Not now
              </button>
            </div>
          </>
        )}
        {c.phase === 'won' && (
          <>
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-fraunces)', color: GREEN }}>
              Challenge complete! 🎉
            </h2>
            {c.rewardCat ? (
              <>
                <div className="mx-auto my-1 grid place-items-center">
                  <CatViewer spec={c.rewardCat} size={200} />
                </div>
                <div className="text-xl font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>{c.rewardCat.name}</div>
                <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                  <Chip text="Swimmer 🌊" />
                  <Chip text={PATTERN_LABELS[c.rewardCat.coat.pattern]} />
                </div>
                <p className="mt-1 text-sm italic" style={{ color: INK_SOFT }}>“{c.rewardCat.personality}”</p>
                <p className="mt-1 text-sm font-semibold">joins your clan!</p>
              </>
            ) : (
              <p className="mt-2 text-sm">+8 yarn! (Build a den for more clan room.)</p>
            )}
            <button className="mt-3 rounded-full px-8 py-3 font-bold text-white active:scale-95" style={{ background: INK }}
              onPointerDown={() => game.dismissChallenge()}>
              Wonderful!
            </button>
          </>
        )}
        {c.phase === 'lost' && (
          <>
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-fraunces)', color: ROSE }}>So close!</h2>
            <p className="mt-2 text-sm" style={{ color: INK_SOFT }}>
              Golden yarn appears all over the island — find another and try again!
            </p>
            <button className="mt-3 rounded-full px-8 py-3 font-bold text-white active:scale-95" style={{ background: INK }}
              onPointerDown={() => game.dismissChallenge()}>
              Okay!
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ————————————————— build sheet —————————————————

function BuildSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const save = game.save;
  const activeRankIdx = RANKS.indexOf(rankFor(save.cats.find((c) => c.id === save.activeCatId)!));

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 pb-2">
      <div className="mx-auto max-w-3xl rounded-t-3xl border p-3 shadow-2xl"
        style={{ background: 'rgba(253,250,241,0.97)', borderColor: LINE }}>
        <div className="mb-1 flex items-center justify-between px-1">
          <div className="font-bold" style={{ color: INK, fontFamily: 'var(--font-fraunces)' }}>
            🔨 Build your camp <span className="ml-2 text-sm font-normal" style={{ color: INK_SOFT }}>🧶 {save.yarn}</span>
          </div>
          <button className="rounded-full px-4 py-1.5 text-sm font-bold" style={{ background: '#eee5cf', color: INK }} onPointerDown={onClose}>
            ✕ Done
          </button>
        </div>

        {!sel ? (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain' }}>
            {BUILDABLES.map((b) => {
              const locked = (b.minRankIdx ?? 0) > activeRankIdx;
              const afford = save.yarn >= b.cost;
              return (
                <button
                  key={b.id}
                  disabled={locked || !afford}
                  className="min-w-32 shrink-0 rounded-2xl border p-2 text-center disabled:opacity-45"
                  style={{ background: CARD, borderColor: LINE, color: INK }}
                  // click, not pointerdown: a swipe that starts on a card must scroll
                  // the row, not instantly select the card out from under the finger
                  onClick={() => {
                    if (locked || !afford) return;
                    setSel(b.id);
                    game.selectBuildable(b.id);
                  }}
                >
                  <div className="text-2xl">{b.icon}</div>
                  <div className="text-xs font-bold">{b.name}</div>
                  <div className="text-[11px]" style={{ color: afford ? GOLD : ROSE }}>🧶 {b.cost}</div>
                  {locked && <div className="text-[10px]" style={{ color: INK_SOFT }}>🔒 {RANKS[b.minRankIdx!].name}</div>}
                  {b.capacity ? <div className="text-[10px]" style={{ color: GREEN }}>+{b.capacity} cats</div> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-1 py-2">
            <p className="text-sm" style={{ color: INK_SOFT }}>
              Walk to position the green ghost, then place it!
            </p>
            <div className="flex gap-2">
              <button className="rounded-full px-6 py-3 font-bold text-white active:scale-95" style={{ background: GREEN }}
                onPointerDown={() => {
                  if (game.placeBuilding()) {
                    setSel(null);
                    game.selectBuildable(null);
                  }
                }}>
                ✓ Place
              </button>
              <button className="rounded-full border px-5 py-3 font-bold active:scale-95" style={{ borderColor: LINE, color: INK_SOFT }}
                onPointerDown={() => {
                  setSel(null);
                  game.selectBuildable(null);
                }}>
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ————————————————— field guide (Pollinator Lab style) —————————————————

function Chip({ text, tone = 'default' }: { text: string; tone?: 'default' | 'gold' | 'green' }) {
  const bg = tone === 'gold' ? '#f3e3b3' : tone === 'green' ? '#dbe7c9' : '#ece4cf';
  return (
    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: bg, color: INK }}>
      {text}
    </span>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[11px] font-semibold uppercase tracking-wide" style={{ color: INK_SOFT }}>{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: '#e8dfc8' }}>
        <div className="h-full rounded-full" style={{ width: `${value * 10}%`, background: GREEN }} />
      </div>
      <span className="w-5 text-right text-xs font-bold" style={{ color: INK }}>{value}</span>
    </div>
  );
}

function GuideOverlay({ game, onClose }: { game: Game; onClose: () => void }) {
  const save = game.save;
  const [selId, setSelId] = useState(save.activeCatId);
  const [rot, setRot] = useState<number | null>(null);
  const [studio, setStudio] = useState(false);
  const cat = save.cats.find((c) => c.id === selId) ?? save.cats[0];
  const { rank, next, frac } = rankProgress(cat);
  const cap = clanCapacity(save.buildings);
  const [, force] = useState(0);

  if (studio) {
    return <StyleStudio game={game} catId={cat.id} onClose={() => { setStudio(false); force((v) => v + 1); }} />;
  }

  return (
    <div className="absolute inset-0 z-40 overflow-auto" style={{ background: PAPER, color: INK }}>
      {/* header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-2.5"
        style={{ background: PAPER, borderColor: LINE }}>
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>
            🐾 {save.clanName}
          </h1>
          <span className="text-xs italic" style={{ color: INK_SOFT, fontFamily: 'var(--font-spectral)' }}>
            Clan Field Guide · {save.cats.length}/{cap} cats
          </span>
        </div>
        <button className="rounded-full px-5 py-2 text-sm font-bold text-white active:scale-95" style={{ background: INK }}
          onPointerDown={onClose}>
          ← Back to the Wilds
        </button>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:flex-row">
        {/* cat list */}
        <div className="flex shrink-0 gap-2 overflow-x-auto md:w-52 md:flex-col md:overflow-visible">
          {save.cats.map((c) => {
            const r = rankFor(c);
            const isActive = c.id === save.activeCatId;
            return (
              <button
                key={c.id}
                className="flex min-w-40 items-center gap-2 rounded-2xl border p-2 text-left"
                style={{
                  background: c.id === selId ? '#eef3e2' : CARD,
                  borderColor: c.id === selId ? GREEN : LINE,
                }}
                onPointerDown={() => setSelId(c.id)}
              >
                <span className="grid h-9 w-9 place-items-center rounded-full text-lg" style={{ background: c.coat.base }}>
                  🐱
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>
                    {c.name} {isActive && '⭐'}
                  </span>
                  <span className="block text-[10px] uppercase tracking-wide" style={{ color: INK_SOFT }}>
                    Lv {c.level} · {r.name}
                  </span>
                </span>
              </button>
            );
          })}
          <p className="hidden text-[11px] md:block" style={{ color: INK_SOFT }}>
            Win golden-yarn challenges to recruit more cats. Build dens for more room!
          </p>

          {/* newborn nursery */}
          {save.nursery.length > 0 && (
            <div className="min-w-40 rounded-2xl border p-2.5" style={{ background: '#fdf0f5', borderColor: '#e8a9c0' }}>
              <div className="mb-1 text-xs font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>
                🍼 Nursery ({save.nursery.length})
              </div>
              {save.nursery.map((n) => (
                <div key={n.spec.id} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: n.spec.coat.base }} />
                    {n.spec.name}
                  </span>
                  <span>{'💗'.repeat(Math.min(3, n.growth))}{'🤍'.repeat(Math.max(0, 3 - n.growth))}</span>
                </div>
              ))}
              <p className="mt-1 text-[10px]" style={{ color: INK_SOFT }}>
                Nurse them at camp — three feeds and they grow into kittens!
              </p>
            </div>
          )}

          {/* kittens */}
          {save.kittens.length > 0 && (
            <div className="min-w-40 rounded-2xl border p-2.5" style={{ background: CARD, borderColor: LINE }}>
              <div className="mb-1 text-xs font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>
                🐱 Kittens ({save.kittens.length})
              </div>
              <div className="flex flex-col gap-1">
                {save.kittens.map((k, i) => (
                  <div key={k.id} className="flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: i < 5 ? '#fbe3ec' : '#ece4cf', color: INK }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: k.coat.base }} />
                      {k.name}
                    </span>
                    <button
                      className="rounded-full border px-2 py-0.5 text-[9px] font-bold disabled:opacity-40"
                      style={{ borderColor: GOLD, color: GOLD }}
                      disabled={save.treats < 2}
                      onPointerDown={() => { game.growKitten(k.id); force((v) => v + 1); }}>
                      Grow up 🍪2
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px]" style={{ color: INK_SOFT }}>
                The first 5 follow you and copy everything you do. Feed treats to raise them into clan cats!
              </p>
            </div>
          )}
        </div>

        {/* 3D viewer */}
        <div className="flex flex-col items-center rounded-3xl border p-3" style={{ background: CARD, borderColor: LINE }}>
          <CatViewer spec={cat} size={300} rotation={rot} />
          <div className="flex w-full items-center gap-2 px-2">
            <button className="rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: LINE }}
              onPointerDown={() => setRot(null)}>
              ↺ {rot === null ? 'spinning' : 'spin'}
            </button>
            <input
              type="range" min={0} max={628} value={rot === null ? 0 : Math.round(rot * 100)}
              onChange={(e) => setRot(Number(e.target.value) / 100)}
              className="flex-1"
            />
            <span className="text-xs tabular-nums" style={{ color: INK_SOFT }}>360°</span>
          </div>
          {cat.id !== save.activeCatId && (
            <button
              className="mt-2 w-full rounded-full py-3 font-bold text-white active:scale-95"
              style={{ background: GREEN, fontFamily: 'var(--font-fraunces)' }}
              onPointerDown={() => { game.switchCat(cat.id); force((v) => v + 1); }}
            >
              Play as {cat.name} 🐾
            </button>
          )}
          <button
            className="mt-2 w-full rounded-full border py-2 text-sm font-bold active:scale-95 disabled:opacity-40"
            style={{ borderColor: GOLD, color: GOLD }}
            disabled={save.treats <= 0}
            onPointerDown={() => { game.feedTreat(cat.id); force((v) => v + 1); }}
          >
            🍪 Feed a treat (+5 xp) · {save.treats} left
          </button>
          <button
            className="mt-2 w-full rounded-full border-2 py-2.5 text-sm font-bold active:scale-95"
            style={{ borderColor: ROSE, color: ROSE }}
            onPointerDown={() => setStudio(true)}
          >
            🎨 Style Studio — design {cat.name}!
          </button>
        </div>

        {/* details */}
        <div className="flex-1 rounded-3xl border p-4" style={{ background: CARD, borderColor: LINE }}>
          <div className="flex items-center gap-2">
            <Chip text={rank.name} tone="gold" />
            {next && (
              <div className="flex flex-1 items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: '#e8dfc8' }}>
                  <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: GOLD }} />
                </div>
                <span className="text-[10px] uppercase" style={{ color: INK_SOFT }}>next: {next.name}</span>
              </div>
            )}
          </div>
          <h2 className="mt-1 text-3xl font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>{cat.name}</h2>
          <p className="text-sm italic" style={{ color: INK_SOFT, fontFamily: 'var(--font-spectral)' }}>
            “{cat.personality}”
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip text={(cat.gender ?? 'girl') === 'girl' ? 'Girl 🎀' : 'Boy 🧢'} />
            {cat.isMate && <Chip text="In love 💕" tone="gold" />}
            <Chip text="Swimmer 🌊" tone="green" />
            <Chip text={cat.traits.brave ? 'Brave 🦁' : 'Gentle 🌼'} />
            <Chip text={cat.traits.sneaky ? 'Sneaky 🐾' : 'Chatty 📣'} />
            <Chip text={PATTERN_LABELS[cat.coat.pattern]} />
            {cat.parents && <Chip text={`Kitten of ${cat.parents[0]} & ${cat.parents[1]}`} />}
          </div>

          <Section title="Stats" icon="📊">
            <div className="flex flex-col gap-1.5">
              <StatBar label="Speed" value={cat.traits.speed} />
              <StatBar label="Strength" value={cat.traits.strength} />
              <StatBar label="Agility" value={cat.traits.agility} />
              <div className="mt-1 text-[11px]" style={{ color: INK_SOFT }}>
                Level {cat.level} · {cat.xp}/{xpForLevel(cat.level)} xp
              </div>
            </div>
          </Section>

          <Section title="Record" icon="🏅">
            <div className="flex gap-4 text-sm">
              <span><b style={{ color: GREEN }}>{cat.wins}</b> duel wins</span>
              <span><b style={{ color: ROSE }}>{cat.losses}</b> losses</span>
              <span>⚡ best course: <b>{cat.bestAgility ? `${cat.bestAgility}s` : '—'}</b></span>
            </div>
          </Section>

          <Section title="Favorite pastime" icon="💛">
            <p className="text-sm" style={{ fontFamily: 'var(--font-spectral)' }}>{cat.favorite}</p>
          </Section>

          <Section title="Fur pattern" icon="🎨">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PATTERN_LABELS) as PatternId[]).map((p) => {
                const unlocked = save.unlockedPatterns.includes(p);
                return (
                  <button key={p} disabled={!unlocked}
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                    style={{
                      borderColor: cat.coat.pattern === p ? GREEN : LINE,
                      background: cat.coat.pattern === p ? '#dbe7c9' : PAPER,
                      color: INK,
                    }}
                    onPointerDown={() => { if (unlocked) { game.setPattern(cat.id, p); force((v) => v + 1); } }}>
                    {unlocked ? PATTERN_LABELS[p] : `🔒 ${PATTERN_LABELS[p]}`}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px]" style={{ color: INK_SOFT }}>Rank up to unlock special furs!</p>
          </Section>

          <Section title="Accessory" icon="🎀">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(ACCESSORY_LABELS) as AccessoryId[]).map((a) => {
                const unlocked = a === 'none' || save.unlockedAccessories.includes(a);
                return (
                  <button key={a} disabled={!unlocked}
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                    style={{
                      borderColor: cat.accessory === a ? GREEN : LINE,
                      background: cat.accessory === a ? '#dbe7c9' : PAPER,
                      color: INK,
                    }}
                    onPointerDown={() => { if (unlocked) { game.setAccessory(cat.id, a); force((v) => v + 1); } }}>
                    {unlocked ? ACCESSORY_LABELS[a] : `🔒 ${ACCESSORY_LABELS[a]}`}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title={`${cat.name}'s meow`} icon="🎤">
            <MeowRecorder game={game} cat={cat} onChanged={() => force((v) => v + 1)} />
          </Section>

          <Section title="Fish collection" icon="🎣">
            <div className="flex flex-wrap gap-1.5">
              {FISH_SPECIES.map((f) => {
                const rec = save.fish?.[f.id];
                return rec ? (
                  <Chip key={f.id} text={`${f.icon} ${f.name} · best ${rec.best}cm ×${rec.count}`}
                    tone={f.rarity === 'common' ? 'default' : 'gold'} />
                ) : (
                  <Chip key={f.id} text={`❔ ${RARITY_LABELS[f.rarity]}`} />
                );
              })}
            </div>
            <p className="mt-1 text-[10px]" style={{ color: INK_SOFT }}>
              Sit at the water&apos;s edge and press 🎣 — when the bobber tugs, reel in fast!
            </p>
          </Section>

          <Section title={`Toybox (${(save.toybox ?? []).length}/${TOYS.length})`} icon="🧸">
            <div className="flex flex-wrap gap-1.5">
              {TOYS.map((t) =>
                save.toybox?.includes(t.id) ? (
                  <Chip key={t.id} text={`${t.icon} ${t.name}`} tone="green" />
                ) : (
                  <Chip key={t.id} text={`❔ ${t.hint}`} />
                )
              )}
            </div>
            <p className="mt-1 text-[10px]" style={{ color: INK_SOFT }}>
              Toys and stuffies are hidden all over the island — the hints tell you where to sniff around!
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ————————————————— meow recorder: your real voice becomes the cat's meow —————————————————

function MeowRecorder({ game, cat, onChanged }: { game: Game; cat: CatSpec; onChanged: () => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'preview' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const signedIn = !!getAccount();

  useEffect(() => () => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
    game.setRecordingMute(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setError(null);
    try {
      // clean voice capture: cancel any speaker bleed and room hiss, keep it mono
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      const rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 128000,
      });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        game.setRecordingMute(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        blobRef.current = blob;
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
        setState('preview');
      };
      game.setRecordingMute(true); // the game goes quiet so the mic only hears the meow
      rec.start();
      recRef.current = rec;
      setState('recording');
      setTimeout(() => {
        if (recRef.current === rec && rec.state === 'recording') rec.stop();
      }, 4000);
    } catch {
      game.setRecordingMute(false);
      setError('Could not use the microphone — ask a grown-up to allow it!');
    }
  };

  const saveIt = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setState('uploading');
    setError(null);
    try {
      const url = await uploadMeow(blob);
      game.setMeowUrl(cat.id, url);
      blobRef.current = null;
      setState('idle');
      onChanged();
    } catch {
      setError('Could not save the meow — check the internet and try again!');
      setState('preview');
    }
  };

  const btn = 'rounded-full px-4 py-2 text-xs font-bold active:scale-95';

  return (
    <div>
      <p className="text-[11px]" style={{ color: INK_SOFT }}>
        Record your own meow (up to 4 seconds) — {cat.name} will use YOUR voice on the meow button!
      </p>
      {cat.meowUrl && state === 'idle' && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Chip text="🎤 Custom meow saved!" tone="green" />
          <button className={btn} style={{ background: '#dbe7c9', color: INK }}
            onPointerDown={() => { new Audio(cat.meowUrl!).play().catch(() => {}); }}>
            ▶ Play it
          </button>
          <button className={btn} style={{ background: '#f3dede', color: ROSE }}
            onPointerDown={() => { game.setMeowUrl(cat.id, null); onChanged(); }}>
            ✕ Remove
          </button>
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {state === 'idle' && (
          signedIn ? (
            <button className={btn} style={{ background: ROSE, color: '#fff' }} onPointerDown={start}>
              ● Record {cat.meowUrl ? 'a new meow' : 'a meow'}
            </button>
          ) : (
            <p className="text-[11px] font-semibold" style={{ color: INK_SOFT }}>
              ☁️ Sign in (in Settings) to record meows — they save online with your clan!
            </p>
          )
        )}
        {state === 'recording' && (
          <button className={btn} style={{ background: ROSE, color: '#fff', animation: 'ww-pulse 0.6s infinite' }}
            onPointerDown={() => recRef.current?.state === 'recording' && recRef.current.stop()}>
            ⏺ MEOW NOW! (tap to stop)
          </button>
        )}
        {state === 'preview' && (
          <>
            <button className={btn} style={{ background: '#dbe7c9', color: INK }}
              onPointerDown={() => { if (previewUrl) new Audio(previewUrl).play().catch(() => {}); }}>
              ▶ Listen
            </button>
            <button className={btn} style={{ background: GREEN, color: '#fff' }} onPointerDown={saveIt}>
              ✓ Save this meow!
            </button>
            <button className={btn} style={{ background: PAPER, color: INK_SOFT, border: `1px solid ${LINE}` }} onPointerDown={start}>
              ↺ Try again
            </button>
          </>
        )}
        {state === 'uploading' && <Chip text="☁️ Saving your meow…" tone="gold" />}
      </div>
      {error && <p className="mt-1 text-[11px] font-semibold" style={{ color: ROSE }}>{error}</p>}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t pt-2.5" style={{ borderColor: '#e9e1cb', borderTopStyle: 'dashed' }}>
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>
        <span>{icon}</span> {title}
      </div>
      {children}
    </div>
  );
}

// ————————————————— clan standings —————————————————

function ClanOverlay({ game, onClose }: { game: Game; onClose: () => void }) {
  const rows = game.clanYarnStandings();
  const [name, setName] = useState(game.save.clanName);
  return (
    <div className="absolute inset-0 z-40 grid place-items-center p-4" style={{ background: 'rgba(20,18,10,0.45)' }}>
      <div className="w-full max-w-md rounded-3xl border p-5 shadow-2xl" style={{ background: CARD, borderColor: LINE, color: INK }}>
        <h2 className="text-center text-2xl font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>🏆 Clan Standings</h2>
        <p className="mb-3 text-center text-xs" style={{ color: INK_SOFT }}>Lifetime yarn gathered by each clan</p>
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl border px-3 py-2"
              style={{ borderColor: r.isPlayer ? GOLD : LINE, background: r.isPlayer ? '#faf3dd' : PAPER }}>
              <span className="w-6 text-center text-lg font-bold" style={{ color: INK_SOFT }}>{i + 1}</span>
              <span className="h-4 w-4 rounded-full" style={{ background: r.color }} />
              <span className="flex-1 font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>
                {r.name} {r.isPlayer && '(you)'}
              </span>
              <span className="font-bold tabular-nums">🧶 {r.yarn}</span>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: INK_SOFT }}>Rename your clan</label>
          <div className="mt-1 flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24}
              className="flex-1 rounded-xl border px-3 py-2 outline-none" style={{ borderColor: LINE, background: PAPER }} />
            <button className="rounded-xl px-4 font-bold text-white active:scale-95" style={{ background: GREEN }}
              onPointerDown={() => game.renameClan(name)}>
              Save
            </button>
          </div>
        </div>
        <button className="mt-4 w-full rounded-full py-3 font-bold text-white active:scale-95" style={{ background: INK }}
          onPointerDown={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

// ————————————————— island map —————————————————

function MapOverlay({ game, onClose }: { game: Game; onClose: () => void }) {
  const [mapUrl] = useState(() => game.getMinimap());
  const [data, setData] = useState(() => game.getMapData());
  const [pending, setPending] = useState<{ x: number; z: number } | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setData(game.getMapData()), 400);
    return () => clearInterval(iv);
  }, [game]);

  const pct = (x: number, z: number) => ({
    left: `${((x / data.range) * 0.5 + 0.5) * 100}%`,
    top: `${((z / data.range) * 0.5 + 0.5) * 100}%`,
  });

  const Marker = ({ x, z, children, label }: { x: number; z: number; children: React.ReactNode; label?: string }) => (
    <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-center" style={pct(x, z)}>
      <div className="text-xl leading-none drop-shadow">{children}</div>
      {label && <div className="mt-0.5 rounded bg-black/60 px-1 text-[9px] font-bold text-white">{label}</div>}
    </div>
  );

  return (
    <div className="absolute inset-0 z-40 grid place-items-center p-3" style={{ background: 'rgba(20,18,10,0.55)' }}>
      <div className="w-full max-w-lg rounded-3xl border p-4 shadow-2xl" style={{ background: CARD, borderColor: LINE, color: INK }}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>🗺 Island Map</h2>
          <span className="text-[11px]" style={{ color: INK_SOFT }}>tap the map, then zoom or walk there</span>
        </div>

        <div
          className="relative w-full cursor-crosshair overflow-hidden rounded-2xl border-2"
          style={{ borderColor: '#b8a888', aspectRatio: '1' }}
          onPointerDown={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const wx = ((e.clientX - rect.left) / rect.width - 0.5) * 2 * data.range;
            const wz = ((e.clientY - rect.top) / rect.height - 0.5) * 2 * data.range;
            setPending({ x: wx, z: wz });
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mapUrl} alt="Island map" className="absolute inset-0 h-full w-full" style={{ imageRendering: 'auto' }} />
          {data.rivalCamps.map((c, i) => (
            <Marker key={i} x={c.x} z={c.z}>
              <span className="inline-block h-3 w-3 rounded-full border border-white" style={{ background: c.color }} />
            </Marker>
          ))}
          <Marker x={data.camp.x} z={data.camp.z} label="home">🏕</Marker>
          {data.courses.map((cs) => (
            <Marker key={cs.name} x={cs.x} z={cs.z} label={cs.name}>{cs.icon}</Marker>
          ))}
          <Marker x={data.art.x} z={data.art.z} label="art meadow">🎨</Marker>
          {data.spirits.map((s) => (
            <Marker key={s.name} x={s.x} z={s.z} label={s.name}>{s.icon}</Marker>
          ))}
          {data.tower && <Marker x={data.tower.x} z={data.tower.z} label="tower">🗼</Marker>}
          {data.rescue && <Marker x={data.rescue.x} z={data.rescue.z} label="kitten!">🐱</Marker>}
          {data.friends.map((f) => (
            <Marker key={f.name + f.x} x={f.x} z={f.z} label={f.name}>
              <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white" style={{ background: f.color }} />
            </Marker>
          ))}
          {data.waypoint && <Marker x={data.waypoint.x} z={data.waypoint.z}>⭐</Marker>}
          {pending && <Marker x={pending.x} z={pending.z}>📍</Marker>}
          {/* you: arrow showing where you're facing */}
          <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={pct(data.you.x, data.you.z)}>
            <div className="text-2xl leading-none drop-shadow-lg"
              style={{ transform: `rotate(${Math.PI - data.you.heading}rad)` }}>
              🔺
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {pending ? (
            <>
              <button className="rounded-full px-6 py-3 font-bold text-white active:scale-95" style={{ background: '#8e5cc0' }}
                onPointerDown={() => { if (game.travelTo(pending.x, pending.z)) onClose(); else setPending(null); }}>
                🪄 Zoom there!
              </button>
              <button className="rounded-full border-2 px-5 py-3 font-bold active:scale-95" style={{ borderColor: GOLD, color: INK }}
                onPointerDown={() => { game.setWaypoint(pending.x, pending.z); onClose(); }}>
                ⭐ Walk there
              </button>
            </>
          ) : (
            <button className="rounded-full px-6 py-3 font-bold text-white active:scale-95" style={{ background: GREEN }}
              onPointerDown={() => { if (game.travelTo(data.camp.x, data.camp.z)) onClose(); }}>
              🏕 Zoom home
            </button>
          )}
          {data.waypoint && !pending && (
            <button className="rounded-full border px-5 py-3 font-bold active:scale-95" style={{ borderColor: LINE, color: INK_SOFT }}
              onPointerDown={() => game.clearWaypoint()}>
              Clear ⭐
            </button>
          )}
          <button className="rounded-full px-6 py-3 font-bold text-white active:scale-95" style={{ background: INK }}
            onPointerDown={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ————————————————— playdate —————————————————

function PlaydateOverlay({
  code, members, onStart, onLeave, onClose,
}: {
  code: string | null;
  members: PlaydateMember[];
  onStart: (code: string) => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  const [joinInput, setJoinInput] = useState('');
  const [mode, setMode] = useState<'menu' | 'join'>('menu');

  return (
    <div className="absolute inset-0 z-40 grid place-items-center p-4" style={{ background: 'rgba(20,18,10,0.45)' }}>
      <div className="w-full max-w-md rounded-3xl border p-6 text-center shadow-2xl" style={{ background: CARD, borderColor: '#9ec3e8', color: INK }}>
        <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>👯 Playdate</h2>

        {code ? (
          <>
            <p className="mt-1 text-sm" style={{ color: INK_SOFT }}>Tell your sister the secret code:</p>
            <div className="mx-auto mt-2 w-fit rounded-2xl border-2 border-dashed px-8 py-3 text-4xl font-bold tracking-[0.3em]"
              style={{ borderColor: '#9ec3e8', fontFamily: 'var(--font-fraunces)', background: '#eef5fc' }}>
              {code}
            </div>
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: INK_SOFT }}>
                On this island ({members.length + 1})
              </p>
              <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                <Chip text="You 🐱" tone="gold" />
                {members.map((m) => (
                  <span key={m.id} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ background: '#dcebfb', color: INK }}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                    {m.name}
                  </span>
                ))}
                {members.length === 0 && (
                  <span className="text-xs italic" style={{ color: INK_SOFT }}>waiting for family to join…</span>
                )}
              </div>
            </div>
            <p className="mt-3 text-[11px]" style={{ color: INK_SOFT }}>
              Follow the 👯 arrow to find each other! Yarn you collect here goes home with you.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <button className="rounded-full px-6 py-3 font-bold text-white active:scale-95" style={{ background: INK }} onPointerDown={onClose}>
                Back to playing
              </button>
              <button className="rounded-full border px-5 py-3 font-bold active:scale-95" style={{ borderColor: '#e0b4b4', color: ROSE }} onPointerDown={onLeave}>
                Leave playdate
              </button>
            </div>
          </>
        ) : mode === 'menu' ? (
          <>
            <p className="mt-1 text-sm" style={{ color: INK_SOFT, fontFamily: 'var(--font-spectral)' }}>
              Play on the same island as your family — each on your own tablet!
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button className="rounded-2xl py-4 text-lg font-bold text-white shadow active:scale-95"
                style={{ background: GREEN, fontFamily: 'var(--font-fraunces)' }}
                onPointerDown={() => onStart(makeRoomCode())}>
                Start a playdate 🏝
              </button>
              <button className="rounded-2xl border-2 py-4 text-lg font-bold shadow active:scale-95"
                style={{ borderColor: '#9ec3e8', color: INK, fontFamily: 'var(--font-fraunces)' }}
                onPointerDown={() => setMode('join')}>
                I have a code!
              </button>
            </div>
            <button className="mt-3 text-sm underline" style={{ color: INK_SOFT }} onPointerDown={onClose}>
              maybe later
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm" style={{ color: INK_SOFT }}>Type the secret code:</p>
            <input
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
              placeholder="PURR42"
              maxLength={8}
              autoFocus
              className="mt-2 w-full rounded-2xl border-2 px-4 py-3 text-center text-3xl font-bold tracking-[0.25em] outline-none"
              style={{ borderColor: '#9ec3e8', fontFamily: 'var(--font-fraunces)', background: '#eef5fc' }}
            />
            <div className="mt-3 flex justify-center gap-2">
              <button
                className="rounded-full px-8 py-3 font-bold text-white active:scale-95 disabled:opacity-40"
                style={{ background: GREEN }}
                disabled={!normalizeRoomCode(joinInput)}
                onPointerDown={() => {
                  const norm = normalizeRoomCode(joinInput);
                  if (norm) onStart(norm);
                }}>
                Join! 🐾
              </button>
              <button className="rounded-full border px-5 py-3 font-bold active:scale-95" style={{ borderColor: LINE, color: INK_SOFT }}
                onPointerDown={() => setMode('menu')}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ————————————————— settings —————————————————

function SettingsOverlay({ game, onClose }: { game: Game; onClose: () => void }) {
  const [sound, setSound] = useState(game.save.soundOn);
  const [music, setMusic] = useState(game.save.musicOn);
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="absolute inset-0 z-40 grid place-items-center p-4" style={{ background: 'rgba(20,18,10,0.45)' }}>
      <div className="w-full max-w-sm rounded-3xl border p-5 shadow-2xl" style={{ background: CARD, borderColor: LINE, color: INK }}>
        <h2 className="text-center text-2xl font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>⚙️ Settings</h2>
        <div className="mt-3 flex flex-col gap-2">
          <Toggle label="Sound effects" value={sound} onChange={(v) => { setSound(v); game.setSound(v); }} />
          <Toggle label="Music" value={music} onChange={(v) => { setMusic(v); game.setMusic(v); }} />
        </div>
        <AccountSection game={game} />
        <div className="mt-4 border-t pt-3" style={{ borderColor: LINE }}>
          {!confirmReset ? (
            <button className="w-full rounded-full border py-2 text-sm font-bold" style={{ borderColor: '#e0b4b4', color: ROSE }}
              onPointerDown={() => setConfirmReset(true)}>
              Start a brand-new adventure…
            </button>
          ) : (
            <div className="text-center">
              <p className="text-sm font-bold" style={{ color: ROSE }}>This erases your whole clan forever! Are you sure?</p>
              <div className="mt-2 flex justify-center gap-2">
                <button className="rounded-full px-5 py-2 text-sm font-bold text-white" style={{ background: ROSE }}
                  onPointerDown={() => { clearSave(); location.reload(); }}>
                  Yes, start over
                </button>
                <button className="rounded-full border px-5 py-2 text-sm font-bold" style={{ borderColor: LINE }}
                  onPointerDown={() => setConfirmReset(false)}>
                  Keep my clan!
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="mt-3 text-center text-[10px]" style={{ color: INK_SOFT }}>
          Tips: 🤫 sneak up on mice & butterflies · 🌲 climb trees for hidden yarn · 🌊 every cat can swim to the far islets · ⚡ zoom + double-tap jump for super moves
        </p>
        <button className="mt-3 w-full rounded-full py-3 font-bold text-white active:scale-95" style={{ background: INK }}
          onPointerDown={onClose}>
          Back to the Wilds
        </button>
      </div>
    </div>
  );
}

// ————————————————— account: keep progress safe in the cloud —————————————————

function AccountSection({ game }: { game: Game }) {
  const [account, setAccountState] = useState(getAccount());
  const [sync, setSync] = useState<SyncState>(getSyncState());
  const [mode, setMode] = useState<'idle' | 'create' | 'signin'>('idle');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => onSyncState(setSync), []);

  const doCreate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await signup(username.trim().toLowerCase(), password, parentEmail.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Something went wrong.');
      return;
    }
    // push the clan they're playing right now, straight away
    persistSave(game.save);
    void flushCloudPush();
    setAccountState(getAccount());
    setMode('idle');
  };

  const doSignIn = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await cloudLogin(username.trim().toLowerCase(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Something went wrong.');
      return;
    }
    const cloudSave = res.save ? migrateSave(res.save) : null;
    const localAt = game.save.savedAt ?? 0;
    if (cloudSave && (cloudSave.savedAt ?? 0) > localAt) {
      // the online clan is newer — load it (full reload keeps things simple + safe)
      persistSave(cloudSave);
      location.reload();
      return;
    }
    // this tablet's clan is the newest — it becomes the online copy
    persistSave(game.save);
    void flushCloudPush();
    setAccountState(getAccount());
    setMode('idle');
  };

  const inputCls = 'w-full rounded-xl border px-3 py-2.5 text-center outline-none';
  const inputStyle = { background: PAPER, borderColor: LINE } as const;

  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: LINE }}>
      {account ? (
        <div className="rounded-2xl border px-4 py-3 text-center" style={{ borderColor: '#bcd4a6', background: '#f0f5e6' }}>
          <div className="text-sm font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>
            ☁️ {account.username}
          </div>
          <div className="text-[11px]" style={{ color: sync === 'error' ? ROSE : INK_SOFT }}>
            {sync === 'error'
              ? 'Trouble reaching the cloud — progress is safe on this tablet and will sync when internet is back.'
              : sync === 'syncing'
                ? 'Saving to the cloud…'
                : 'Progress saves online automatically — safe forever!'}
          </div>
          <button className="mt-1.5 text-[11px] underline" style={{ color: INK_SOFT }}
            onPointerDown={() => { clearAccount(); setAccountState(null); }}>
            sign out on this tablet
          </button>
        </div>
      ) : mode === 'idle' ? (
        <div className="text-center">
          <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>☁️ Keep your clan safe forever</p>
          <p className="text-[11px]" style={{ color: INK_SOFT }}>
            Make a player account so your cats are saved online — even if this tablet loses them.
          </p>
          <div className="mt-2 flex justify-center gap-2">
            <button className="rounded-full px-5 py-2.5 text-sm font-bold text-white active:scale-95" style={{ background: GREEN }}
              onPointerDown={() => { setMode('create'); setError(null); }}>
              Create account
            </button>
            <button className="rounded-full border px-5 py-2.5 text-sm font-bold active:scale-95" style={{ borderColor: LINE, color: INK }}
              onPointerDown={() => { setMode('signin'); setError(null); }}>
              Sign in
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>
            {mode === 'create' ? '☁️ Create your player account' : '☁️ Sign in'}
          </p>
          <input className={inputCls} style={inputStyle} value={username} placeholder="player name (like scarlett)"
            autoCapitalize="none" autoCorrect="off" onChange={(e) => setUsername(e.target.value)} />
          <input className={inputCls} style={inputStyle} value={password} placeholder="secret word" type="password"
            onChange={(e) => setPassword(e.target.value)} />
          {mode === 'create' && (
            <input className={inputCls} style={inputStyle} value={parentEmail} placeholder="parent email (ask a grown-up)"
              type="email" autoCapitalize="none" onChange={(e) => setParentEmail(e.target.value)} />
          )}
          {error && <p className="text-center text-xs font-semibold" style={{ color: ROSE }}>{error}</p>}
          <div className="flex justify-center gap-2">
            <button className="rounded-full px-6 py-2.5 text-sm font-bold text-white active:scale-95 disabled:opacity-50"
              style={{ background: GREEN }}
              disabled={busy || !username.trim() || password.length < 4}
              onPointerDown={() => (mode === 'create' ? doCreate() : doSignIn())}>
              {busy ? 'One moment…' : mode === 'create' ? 'Save my clan! ☁️' : 'Sign in'}
            </button>
            <button className="rounded-full border px-4 py-2.5 text-sm font-bold" style={{ borderColor: LINE, color: INK_SOFT }}
              onPointerDown={() => setMode('idle')}>
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="flex items-center justify-between rounded-2xl border px-4 py-3"
      style={{ borderColor: LINE, background: PAPER }}
      onPointerDown={() => onChange(!value)}>
      <span className="font-semibold">{label}</span>
      <span className="grid h-7 w-12 items-center rounded-full px-0.5 transition-colors"
        style={{ background: value ? GREEN : '#cfc6ad', justifyItems: value ? 'end' : 'start' }}>
        <span className="h-6 w-6 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}
