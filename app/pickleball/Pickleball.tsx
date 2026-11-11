'use client';

// Pickleball — React shell: menu, lobby, HUD and overlays over the Three.js court.
// The game itself lives in controller.ts; this file only shows what it reports.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, type Hud } from './controller';
import { normalizeRoomCode } from './room';
import { SIDE_COLORS } from './render';
import { FAULT_TEXT, type Side } from './sim';

type Screen =
  | { kind: 'loading' }
  | { kind: 'menu' }
  | { kind: 'connecting'; label: string }
  | { kind: 'game' }
  | { kind: 'error'; message: string };

const panel = 'rounded-2xl border border-white/10 bg-[#0d1626]/80 text-[#f3efe4] shadow-2xl backdrop-blur-md';
const btnPrimary =
  'rounded-xl bg-[#dcff3d] px-5 py-3 text-[15px] font-semibold text-[#14200a] transition hover:bg-[#e8ff7a] active:scale-[0.98] disabled:opacity-50';
const btnGhost =
  'rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-[15px] font-medium text-[#f3efe4] transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50';

export default function Pickleball() {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrl = useRef<Controller | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [hud, setHud] = useState<Hud | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!hostRef.current) return;
    let c: Controller;
    try {
      c = new Controller(
        hostRef.current,
        (h) => setHud(h),
        (message) => setScreen({ kind: 'error', message }),
      );
    } catch (e) {
      console.error('[Pickleball] could not start 3D', e);
      setScreen({ kind: 'error', message: 'This browser could not start 3D graphics (WebGL).' });
      return;
    }
    ctrl.current = c;
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) setJoinCode(room.toUpperCase().slice(0, 4));
    setScreen({ kind: 'menu' });
    return () => {
      c.dispose();
      ctrl.current = null;
    };
  }, []);

  const toMenu = useCallback(() => {
    ctrl.current?.startAttract();
    setScreen({ kind: 'menu' });
  }, []);

  const practice = useCallback(() => {
    ctrl.current?.startPractice();
    setScreen({ kind: 'game' });
  }, []);

  const createRoom = useCallback(async () => {
    setScreen({ kind: 'connecting', label: 'Opening a room…' });
    try {
      const res = await fetch('/api/pickleball/room', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.code) throw new Error(body.error || 'Could not open a room.');
      ctrl.current?.startOnline('host', body.code);
      setScreen({ kind: 'game' });
    } catch (e) {
      setScreen({ kind: 'error', message: (e as Error).message });
    }
  }, []);

  const joinRoom = useCallback(async () => {
    const code = normalizeRoomCode(joinCode);
    if (!code) {
      setScreen({ kind: 'error', message: 'Room codes are four letters, like HKTP.' });
      return;
    }
    setScreen({ kind: 'connecting', label: `Joining ${code}…` });
    try {
      const res = await fetch(`/api/pickleball/room?code=${code}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not reach that room.');
      if (body.status === 'missing') throw new Error(`No one is hosting ${code} right now. Check the code with your opponent.`);
      if (body.status === 'full') throw new Error(`${code} already has two players. Only two fit on a singles court.`);
      ctrl.current?.startOnline('guest', code);
      setScreen({ kind: 'game' });
    } catch (e) {
      setScreen({ kind: 'error', message: (e as Error).message });
    }
  }, [joinCode]);

  const copyLink = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pickleball?room=${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked; the code is on screen anyway
    }
  }, []);

  const inGame = screen.kind === 'game' && hud && hud.mode !== 'attract';

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden bg-[#0d1a2e] text-[#f3efe4] select-none"
      style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' }}
    >
      <div ref={hostRef} className="absolute inset-0" />

      {screen.kind === 'loading' && (
        <Center>
          <div className={`${panel} px-8 py-6 text-[15px] text-white/80`}>Setting up the court…</div>
        </Center>
      )}

      {screen.kind === 'menu' && (
        <Center>
          <div className={`${panel} w-[min(420px,calc(100vw-32px))] p-7`}>
            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#dcff3d]">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#dcff3d]" /> Singles
            </div>
            <h1 className="mt-2 text-[40px] font-bold leading-none tracking-tight">Pickleball</h1>
            <p className="mt-2 text-[14px] text-white/60">First to 11, win by 2. Only the server scores.</p>

            <div className="mt-6 flex flex-col gap-2.5">
              <button className={btnPrimary} onClick={practice}>Practice vs. bot</button>
              <button className={btnGhost} onClick={createRoom}>Create a room</button>
            </div>

            <form
              className="mt-5 border-t border-white/10 pt-5"
              onSubmit={(e) => {
                e.preventDefault();
                void joinRoom();
              }}
            >
              <label className="text-[12px] font-medium uppercase tracking-[0.14em] text-white/50" htmlFor="pb-code">
                Join a friend
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="pb-code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
                  placeholder="CODE"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full min-w-0 rounded-xl border border-white/15 bg-black/30 px-4 py-3 font-mono text-[18px] tracking-[0.4em] text-white outline-none placeholder:text-white/25 focus:border-[#dcff3d]/70"
                />
                <button type="submit" className={btnGhost} disabled={joinCode.length !== 4}>Join</button>
              </div>
            </form>
            <p className="mt-5 text-[12.5px] leading-relaxed text-white/45">
              Online play is two people on two computers. You both use the same keys, and each of you sees the
              court from behind your own baseline.
            </p>
          </div>
        </Center>
      )}

      {screen.kind === 'connecting' && (
        <Center>
          <div className={`${panel} px-8 py-6 text-[15px]`}>
            <Spinner /> {screen.label}
          </div>
        </Center>
      )}

      {screen.kind === 'error' && (
        <Center>
          <div className={`${panel} w-[min(420px,calc(100vw-32px))] p-7`}>
            <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#ff8a7a]">Couldn’t start</div>
            <p className="mt-2 text-[16px] leading-snug">{screen.message}</p>
            <div className="mt-5 flex gap-2.5">
              <button className={btnPrimary} onClick={toMenu}>Back to menu</button>
              <button className={btnGhost} onClick={practice}>Practice instead</button>
            </div>
          </div>
        </Center>
      )}

      {inGame && hud && (
        <GameHud
          hud={hud}
          onLeave={toMenu}
          onRematch={() => ctrl.current?.requestRematch()}
          onCopy={copyLink}
          copied={copied}
        />
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center p-4">{children}</div>;
}

function Spinner() {
  return (
    <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-[#dcff3d] align-[-2px]" />
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-white/20 bg-white/10 px-1.5 font-mono text-[11px] text-white/90">
      {children}
    </kbd>
  );
}

function GameHud({
  hud, onLeave, onRematch, onCopy, copied,
}: {
  hud: Hud;
  onLeave: () => void;
  onRematch: () => void;
  onCopy: (code: string) => void;
  copied: boolean;
}) {
  const me = hud.localSide;
  const them: Side = me === 0 ? 1 : 0;
  const theirName = hud.mode === 'practice' ? 'Bot' : 'Opponent';
  const name = (s: Side) => (s === me ? 'You' : theirName);
  const server = hud.server;
  const receiver: Side = server === 0 ? 1 : 0;
  const online = hud.mode === 'host' || hud.mode === 'guest';

  const waitingFirst = hud.mode === 'host' && !hud.everJoined;
  const opponentGone = online && !waitingFirst && !hud.opponentPresent;
  const reconnecting = online && (hud.status === 'reconnecting' || hud.status === 'connecting') && !waitingFirst;

  const point = hud.phase === 'point' && hud.lastPoint ? hud.lastPoint : null;

  return (
    <>
      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <div className={`${panel} pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5`}>
          <span className="rounded-md bg-[#dcff3d] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#14200a]">
            Singles
          </span>
          <span className="text-[13px] text-white/70">
            {hud.mode === 'practice' ? 'Practice vs. bot' : `Room ${hud.roomCode ?? ''}`}
          </span>
        </div>

        <div className={`${panel} px-5 py-2.5 text-center`}>
          <div className="flex items-baseline justify-center gap-2 font-mono text-[34px] font-bold leading-none tabular-nums">
            <span style={{ color: SIDE_COLORS[server] }}>{hud.scores[server]}</span>
            <span className="text-white/35">–</span>
            <span style={{ color: SIDE_COLORS[receiver] }}>{hud.scores[receiver]}</span>
          </div>
          <div className="mt-1 text-[10.5px] uppercase tracking-[0.16em] text-white/40">server – receiver</div>
          <div className="mt-1.5 text-[13px] text-white/85">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: SIDE_COLORS[server] }} />
            {server === me ? 'You serve' : `${theirName} serves`} from the {hud.serveRight ? 'right' : 'left'}
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {online && <StatusPill hud={hud} />}
          <button className={`${panel} px-3.5 py-2.5 text-[13px] hover:bg-white/10`} onClick={onLeave}>Leave</button>
        </div>
      </div>

      {/* players legend */}
      <div className="pointer-events-none absolute left-4 top-[84px] hidden flex-col gap-1 text-[12.5px] text-white/75 sm:flex">
        {([me, them] as Side[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SIDE_COLORS[s] }} />
            {name(s)} <span className="font-mono tabular-nums text-white/50">{hud.scores[s]}</span>
            {s === server && <span className="text-[10.5px] uppercase tracking-[0.14em] text-[#dcff3d]">serving</span>}
          </div>
        ))}
      </div>

      {/* point result */}
      {point && (
        <div className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center px-4">
          <div className={`${panel} px-6 py-4 text-center`}>
            <div className="text-[22px] font-bold">
              {point.sideOut ? 'Side out' : point.scorer === me ? 'Point — you' : `Point — ${theirName.toLowerCase()}`}
            </div>
            <div className="mt-1 text-[14px] text-white/70">
              {name(point.faultBy)}: {FAULT_TEXT[point.reason]}
            </div>
          </div>
        </div>
      )}

      {/* serve prompt */}
      {hud.phase === 'serve' && server === me && !waitingFirst && !opponentGone && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[86px] flex justify-center">
          <div className={`${panel} px-4 py-2 text-[14px]`}>
            Your serve — press <Key>Space</Key>. Aim for the lit court, past the kitchen line.
          </div>
        </div>
      )}

      {/* controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
        <div className={`${panel} flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-2.5 text-[12.5px] text-white/75`}>
          <span className="flex items-center gap-1">
            <Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key> or <Key>←</Key><Key>↑</Key><Key>↓</Key><Key>→</Key> move
          </span>
          <span className="flex items-center gap-1"><Key>Space</Key> swing / serve</span>
          <span>Hold left/right to aim, up for a dink, down for a lob</span>
          <span className="text-white/45">Let the serve and return bounce. No volleys from the kitchen.</span>
        </div>
      </div>

      {/* lobby: host waiting for the first opponent */}
      {waitingFirst && hud.roomCode && (
        <Center>
          <div className={`${panel} w-[min(420px,calc(100vw-32px))] p-7 text-center`}>
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/50">Your room</div>
            <div className="mt-2 font-mono text-[56px] font-bold tracking-[0.25em] text-[#dcff3d]">{hud.roomCode}</div>
            <p className="mt-1 text-[14px] text-white/70"><Spinner />Waiting for your opponent to join…</p>
            <p className="mt-3 text-[13px] text-white/50">
              They open Pickleball, choose Join a friend, and type this code.
            </p>
            <div className="mt-5 flex justify-center gap-2.5">
              <button className={btnGhost} onClick={() => onCopy(hud.roomCode!)}>{copied ? 'Link copied' : 'Copy invite link'}</button>
              <button className={btnGhost} onClick={onLeave}>Cancel</button>
            </div>
          </div>
        </Center>
      )}

      {/* opponent dropped, or our own connection is recovering */}
      {!waitingFirst && hud.phase !== 'over' && (opponentGone || reconnecting) && (
        <Center>
          <div className={`${panel} w-[min(400px,calc(100vw-32px))] p-6 text-center`}>
            <div className="text-[18px] font-semibold"><Spinner />{reconnecting ? 'Reconnecting…' : `${hud.mode === 'guest' ? 'Host' : 'Opponent'} disconnected`}</div>
            <p className="mt-2 text-[14px] text-white/65">
              {reconnecting
                ? 'Your connection dropped. The game is paused and picks up where it left off.'
                : 'The game is paused. If they come back to this room, play picks up where it left off.'}
            </p>
            <button className={`${btnGhost} mt-4`} onClick={onLeave}>Leave room</button>
          </div>
        </Center>
      )}

      {/* game over */}
      {hud.phase === 'over' && hud.winner !== -1 && (
        <Center>
          <div className={`${panel} w-[min(400px,calc(100vw-32px))] p-7 text-center`}>
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/50">Game</div>
            <div className="mt-1 text-[34px] font-bold" style={{ color: SIDE_COLORS[hud.winner] }}>
              {hud.winner === me ? 'You win' : `${theirName} wins`}
            </div>
            <div className="mt-1 font-mono text-[22px] tabular-nums text-white/80">
              {Math.max(...hud.scores)} – {Math.min(...hud.scores)}
            </div>
            {online && hud.rematch.them && !hud.rematch.me && (
              <p className="mt-3 text-[14px] text-[#dcff3d]">Your opponent wants a rematch.</p>
            )}
            <div className="mt-5 flex justify-center gap-2.5">
              <button className={btnPrimary} onClick={onRematch} disabled={online && (hud.rematch.me || !hud.opponentPresent)}>
                {online && hud.rematch.me ? 'Waiting for opponent…' : 'Rematch'}
              </button>
              <button className={btnGhost} onClick={onLeave}>Menu</button>
            </div>
          </div>
        </Center>
      )}
    </>
  );
}

function StatusPill({ hud }: { hud: Hud }) {
  const waiting = hud.mode === 'host' && !hud.everJoined;
  let label = 'Connected';
  let color = '#7ee08a';
  if (hud.status === 'connecting') { label = 'Connecting…'; color = '#f5c26b'; }
  else if (hud.status === 'reconnecting') { label = 'Reconnecting…'; color = '#f5c26b'; }
  else if (hud.status === 'error') { label = 'Offline'; color = '#ff7a6b'; }
  else if (waiting) { label = 'Waiting for opponent'; color = '#f5c26b'; }
  else if (!hud.opponentPresent) { label = 'Opponent away'; color = '#f5c26b'; }
  return (
    <div className={`${panel} flex items-center gap-2 px-3.5 py-2.5 text-[13px]`}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </div>
  );
}
