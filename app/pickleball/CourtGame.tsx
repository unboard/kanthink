'use client';

// The React shell for a court sport (pickleball, volleyball): who's playing, the creator,
// where to play, setting up seats, the online lobby, and the in-game HUD and touch
// controls, over the Three.js court. The game itself lives in controller.ts; this file
// only shows what it reports and sends it what people choose.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, DEVICE_LABEL, type Device, type Hud, type LocalPlayer, type RoomSpot, type SeatPlan } from './controller';
import { GameHud } from './Hud';
import { Creator } from './Creator';
import { TouchControls } from './Touch';
import { TEAM_COLORS } from './render';
import { normalizeRoomCode } from './room';
import {
  STYLE_LABEL, botCharacter, loadLastPicked, loadRoster, makeCharacter, saveLastPicked, saveRoster, type Character,
} from './characters';
import type { BotTier } from './bot';
import type { Format, Team } from './sim';
import type { Sport } from './sport';
import { VENUES, isVenue, type VenueId } from './venue';
import { Center, Portrait, Spinner, btnGhost, btnPrimary, chip, panel } from './ui';

type Screen =
  | { kind: 'loading' }
  | { kind: 'home' }
  | { kind: 'creator'; c: Character; isNew: boolean; then: 'home' | 'setup' | 'invite'; seat?: number }
  | { kind: 'invite' }
  | { kind: 'setup' }
  | { kind: 'online'; role: 'host' | 'guest' }
  | { kind: 'connecting'; label: string }
  | { kind: 'room' }
  | { kind: 'game' }
  | { kind: 'error'; message: string };

const TIERS: Record<BotTier, string> = { chill: 'Chill', club: 'Club', champ: 'Champ' };

function isTouch(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

function defaultDevices(n: number): Device[] {
  // on a phone or tablet the first person plays on the screen
  if (isTouch()) return (['touch', 'pad0', 'pad1', 'pad2'] as Device[]).slice(0, Math.max(1, n));
  if (n <= 1) return ['keys'];
  return (['keysL', 'keysR', 'pad0', 'pad1'] as Device[]).slice(0, n);
}

function loadVenue(sport: Sport): VenueId {
  try {
    const v = localStorage.getItem(`court_venue_${sport.id}`);
    if (isVenue(v)) return v;
  } catch { /* storage blocked */ }
  return sport.id === 'volleyball' ? 'beach' : 'park';
}

/** join a room from a link: check it's there, then in (to `seat`, for an invite link) */
async function enterRoom(c: Controller, raw: string, seat: number | null, chars: Character[]): Promise<string | null> {
  const code = normalizeRoomCode(raw);
  if (!code) return 'That link looks broken. Ask for a new one.';
  try {
    const res = await fetch(`/api/pickleball/room?code=${code}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return body.error || 'Could not reach that game.';
    if (body.status === 'missing') return 'That game isn’t open anymore. Ask for a new link.';
    if (body.status === 'full') return 'That game is full.';
  } catch {
    return 'Could not reach that game. Check your connection and open the link again.';
  }
  const devs = defaultDevices(Math.max(1, chars.length));
  c.joinRoom(code, chars.map((char, k) => ({ char, device: devs[k] })), seat, devs[0]);
  return null;
}

function seatTeams(format: Format): Team[] {
  return format === 'doubles' ? [0, 0, 1, 1] : [0, 1];
}

export default function CourtGame({ sport }: { sport: Sport }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrl = useRef<Controller | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [hud, setHud] = useState<Hud | null>(null);
  const [roster, setRoster] = useState<Character[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [format, setFormat] = useState<Format>('doubles');
  const [plan, setPlan] = useState<SeatPlan[]>([]);
  const [here, setHere] = useState<string[]>([]); // online: who is on this computer
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  // the online game the host is laying out: who goes in each spot, and who is them
  const [spots, setSpots] = useState<RoomSpot[]>([]);
  const [meId, setMeId] = useState<string>('');
  const [devices, setDevices] = useState<string[]>([]);
  const [venue, setVenueState] = useState<VenueId>('park');
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    if (!hostRef.current) return;
    let c: Controller;
    const v = loadVenue(sport);
    try {
      c = new Controller(hostRef.current, sport, v, (h) => setHud(h), (message) => setScreen({ kind: 'error', message }));
    } catch (e) {
      console.error(`[${sport.name}] could not start 3D`, e);
      setScreen({ kind: 'error', message: 'This browser could not start 3D graphics (WebGL).' });
      return;
    }
    ctrl.current = c;
    const room = new URLSearchParams(window.location.search).get('room');
    const r = loadRoster();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading saved players once the court exists
    setRoster(r);
    setVenueState(v);
    setTouch(isTouch());
    setPicked(loadLastPicked().filter((id) => r.some((x) => x.id === id)).slice(0, 4));
    if (room) {
      // an invite link: no menus, straight into the game
      const seatParam = new URLSearchParams(window.location.search).get('seat');
      const seat = seatParam !== null && /^[0-3]$/.test(seatParam) ? Number(seatParam) : null;
      const mine = loadLastPicked().map((id) => r.find((x) => x.id === id)).filter((x): x is Character => !!x).slice(0, 1);
      setScreen({ kind: 'connecting', label: 'Joining the game…' });
      void enterRoom(c, room, seat, seat === null ? mine : []).then((err) => {
        if (err) { setScreen({ kind: 'error', message: err }); return; }
        setDevices(defaultDevices(1).map((d) => DEVICE_LABEL[d]));
        setScreen({ kind: 'room' });
      });
    } else {
      setScreen({ kind: 'home' });
    }
    return () => {
      c.dispose();
      ctrl.current = null;
    };
  }, [sport]);

  const pickVenue = (v: VenueId) => {
    setVenueState(v);
    try { localStorage.setItem(`court_venue_${sport.id}`, v); } catch { /* storage blocked */ }
    ctrl.current?.setVenue(v);
  };

  const byId = useCallback((id: string) => roster.find((c) => c.id === id) ?? null, [roster]);
  const pickedChars = useMemo(() => picked.map(byId).filter((c): c is Character => c !== null), [picked, byId]);

  const togglePick = (id: string) => {
    setPicked((p) => {
      const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-4);
      saveLastPicked(next);
      return next;
    });
  };

  const saveChar = (c: Character, then: 'home' | 'setup' | 'invite', seat?: number) => {
    setRoster((r) => {
      const next = r.some((x) => x.id === c.id) ? r.map((x) => (x.id === c.id ? c : x)) : [...r, c];
      saveRoster(next);
      return next;
    });
    if (then === 'invite') {
      // made for a friend: it goes in their spot (or, from "you", becomes you)
      if (seat === undefined || seat === 0) setMeId(c.id);
      else setSpots((sp) => sp.map((x, k) => (k === seat ? { ...x, kind: 'invite', char: c } : x)));
      setScreen({ kind: 'invite' });
      return;
    }
    setPicked((p) => {
      const next = p.includes(c.id) ? p : [...p, c.id].slice(-4);
      saveLastPicked(next);
      return next;
    });
    setScreen({ kind: then === 'setup' ? 'setup' : 'home' });
  };

  const deleteChar = (id: string) => {
    setRoster((r) => { const next = r.filter((x) => x.id !== id); saveRoster(next); return next; });
    setPicked((p) => { const next = p.filter((x) => x !== id); saveLastPicked(next); return next; });
    setScreen({ kind: 'home' });
  };

  const toMenu = useCallback(() => {
    ctrl.current?.startAttract();
    setScreen({ kind: 'home' });
  }, []);

  // ——— play here ———
  const openSetup = (fmt: Format = format) => {
    const teams = seatTeams(fmt);
    const people = pickedChars.slice(0, teams.length);
    const devs = defaultDevices(people.length);
    // the first person on each team, then partners: two people play against each other
    const order = fmt === 'doubles' ? [0, 2, 1, 3] : [0, 1];
    const next: SeatPlan[] = teams.map((_, i) => ({ kind: 'bot', char: null, tier: 'club' }));
    people.forEach((c, k) => { next[order[k]] = { kind: 'human', char: c, device: devs[k] }; });
    setFormat(fmt);
    setPlan(next);
    setScreen({ kind: 'setup' });
  };

  const startLocal = () => {
    ctrl.current?.startLocal(format, plan);
    setDevices(plan.filter((p) => p.kind === 'human').map((p) => DEVICE_LABEL[p.device ?? 'keys']));
    setScreen({ kind: 'game' });
  };

  // ——— online ———
  const goOnline = (role: 'host' | 'guest') => {
    setHere(pickedChars.slice(0, 1).map((c) => c.id));
    setScreen({ kind: 'online', role });
  };

  const locals = (): LocalPlayer[] => {
    const chars = here.map(byId).filter((c): c is Character => c !== null);
    const devs = defaultDevices(chars.length);
    return chars.map((char, k) => ({ char, device: devs[k] }));
  };

  // ——— play online: lay out the spots, then send each friend their link ———
  const spotsFor = (fmt: Format, me: string): RoomSpot[] => {
    const others = roster.filter((c) => c.id !== me);
    let k = 0;
    const friend = (): RoomSpot => {
      const char = others[k] ?? makeCharacter(k ? `Friend ${k + 1}` : 'Friend', roster.length + k);
      k += 1;
      return { kind: 'invite', char };
    };
    return fmt === 'doubles'
      ? [{ kind: 'me' }, { kind: 'bot', tier: 'club' }, friend(), { kind: 'bot', tier: 'club' }]
      : [{ kind: 'me' }, friend()];
  };

  const openInvite = (fmt: Format = format) => {
    const me = meId && roster.some((c) => c.id === meId) ? meId : (pickedChars[0] ?? roster[0])?.id ?? '';
    setMeId(me);
    setFormat(fmt);
    setSpots(spotsFor(fmt, me));
    setScreen({ kind: 'invite' });
  };

  const createInviteRoom = async () => {
    const me = byId(meId);
    if (!me) return;
    setScreen({ kind: 'connecting', label: 'Setting up the game…' });
    try {
      const res = await fetch('/api/pickleball/room', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.code) throw new Error(body.error || 'Could not open a room.');
      const lp: LocalPlayer[] = [{ char: me, device: defaultDevices(1)[0] }];
      ctrl.current?.hostRoom(body.code, format, lp, spots);
      setDevices(lp.map((p) => DEVICE_LABEL[p.device]));
      setScreen({ kind: 'room' });
    } catch (e) {
      setScreen({ kind: 'error', message: (e as Error).message });
    }
  };

  const joinRoom = async () => {
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
      if (body.status === 'missing') throw new Error(`No one is hosting ${code} right now. Check the code with whoever made the room.`);
      if (body.status === 'full') throw new Error(`${code} is full: four players is a whole court.`);
      const lp = locals();
      ctrl.current?.joinRoom(code, lp);
      setDevices(lp.map((p) => DEVICE_LABEL[p.device]));
      setScreen({ kind: 'room' });
    } catch (e) {
      setScreen({ kind: 'error', message: (e as Error).message });
    }
  };

  /** copy (or, on a phone, share) a link; `key` names which button says so */
  const shareLink = useCallback(async (url: string, key: string, title?: string) => {
    try {
      if (navigator.share && isTouch()) {
        await navigator.share({ title: title ?? sport.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
    } catch {
      // share sheet closed, or clipboard blocked; the link is on screen anyway
    }
  }, [sport]);

  const inRoom = screen.kind === 'room' && hud && (hud.mode === 'host' || hud.mode === 'guest');
  const started = !!hud?.lobby?.started;
  const inGame = (screen.kind === 'game' && hud && hud.mode === 'local') || (inRoom && started);

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden bg-[#0d1a2e] text-[#f3efe4] select-none"
      style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif', touchAction: inGame ? 'none' : 'manipulation', WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
      onContextMenu={(e) => { if (inGame) e.preventDefault(); }}
    >
      <style>{`
        @keyframes pbIn { 0% { opacity: 0; transform: translateY(-14px) scale(0.92) skewX(-6deg); } 60% { opacity: 1; transform: translateY(2px) scale(1.03) skewX(-6deg); } 100% { transform: translateY(0) scale(1) skewX(-6deg); } }
        .pb-callout { animation: pbIn 320ms cubic-bezier(.2,.9,.3,1.3) both; }
      `}</style>
      <div ref={hostRef} className="absolute inset-0" />
      {!inGame && <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0d1a2e]/70 via-transparent to-[#0d1a2e]/80" />}

      {screen.kind === 'loading' && (
        <Center><div className={`${panel} px-8 py-6 text-[15px] text-white/80`}>{sport.loading}</div></Center>
      )}

      {screen.kind === 'home' && (
        <Center>
          <div className="w-[min(760px,calc(100vw-32px))]">
            <div className="mb-5 text-center [@media(max-height:520px)]:mb-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#dcff3d] sm:text-[13px]">{sport.tagline}</div>
              <h1 className="mt-1 text-[clamp(40px,11vw,84px)] [@media(max-height:520px)]:text-[40px] font-black italic leading-[0.9] tracking-tight drop-shadow-[0_6px_0_rgba(0,0,0,0.35)]">{sport.name.toUpperCase()}</h1>
            </div>
            <div className={`${panel} p-5 sm:p-6`}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[18px] font-black">Who’s playing?</div>
                <div className="text-[12.5px] text-white/50">{picked.length ? `${picked.length} picked` : 'Tap the people who are here'}</div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-5 sm:gap-3">
                {roster.map((c) => {
                  const on = picked.includes(c.id);
                  return (
                    <div key={c.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => togglePick(c.id)}
                        className={`flex w-full flex-col items-center rounded-2xl border-2 p-3 transition ${on ? 'border-[#dcff3d] bg-[#dcff3d]/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'}`}
                      >
                        <Portrait c={c} size={64} ring={on ? '#dcff3d' : undefined} />
                        <div className="mt-2 w-full truncate text-center text-[14px] font-bold">{c.name}</div>
                        <div className="text-[11px] text-white/45">{STYLE_LABEL[c.style].name}</div>
                      </button>
                      <button type="button" onClick={() => setScreen({ kind: 'creator', c, isNew: false, then: 'home' })} className={`absolute right-1.5 top-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white/80 transition ${touch ? '' : 'opacity-0 group-hover:opacity-100'}`}>Edit</button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setScreen({ kind: 'creator', c: makeCharacter('', roster.length), isNew: true, then: 'home' })}
                  className="flex min-h-[132px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/20 p-3 text-white/60 hover:border-[#dcff3d]/60 hover:text-white"
                >
                  <span className="text-[30px] leading-none">+</span>
                  <span className="mt-2 text-[13px] font-bold">New player</span>
                </button>
              </div>

              <VenuePicker venue={venue} onPick={pickVenue} />

              <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
                <button className={btnPrimary} disabled={!pickedChars.length} onClick={() => openSetup()}>Play here</button>
                <button className={btnGhost} disabled={!roster.length} onClick={() => openInvite()}>Play a friend online</button>
                <button className={btnGhost} disabled={!pickedChars.length} onClick={() => goOnline('guest')}>Join with a code</button>
              </div>
              <p className="mt-4 text-[12.5px] leading-relaxed text-white/45 [@media(max-height:520px)]:hidden">
                {touch
                  ? 'Play here: you on this screen with the stick and button, with bots in any empty spots. Online: set up the game, send a friend their link, and they open it straight into the game with you.'
                  : 'Play here: everyone on this computer, sharing the keyboard (WASD and arrows) or with gamepads, with bots in any empty spots. Online: set up the game, send a friend their link, and they open it straight into the game with you.'}
              </p>
            </div>
          </div>
        </Center>
      )}

      {screen.kind === 'creator' && (
        <Center>
          <Creator
            prop={sport.prop}
            initial={screen.c}
            isNew={screen.isNew}
            onSave={(c) => saveChar(c, screen.then, screen.seat)}
            onCancel={() => setScreen({ kind: screen.then })}
            onDelete={screen.isNew ? undefined : () => deleteChar(screen.c.id)}
          />
        </Center>
      )}

      {screen.kind === 'setup' && (
        <Center>
          <div className={`${panel} w-[min(820px,calc(100vw-32px))] p-5 sm:p-7`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[22px] font-black">{sport.id === 'soccer' ? 'Pick the teams' : 'Set the court'}</div>
              <div className="flex gap-1.5">
                {(['doubles', 'singles'] as Format[]).map((f) => (
                  <button key={f} type="button" className={chip(format === f)} onClick={() => openSetup(f)}>{f === 'doubles' ? 'Doubles' : 'Singles'}</button>
                ))}
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {([0, 1] as Team[]).map((t) => (
                <div key={t} className="rounded-3xl p-3" style={{ background: `${TEAM_COLORS[t]}1f`, boxShadow: `inset 0 0 0 2px ${TEAM_COLORS[t]}55` }}>
                  <div className="mb-2 px-1 text-[12px] font-black uppercase tracking-[0.18em]" style={{ color: TEAM_COLORS[t] }}>{sport.teamNames[t]}</div>
                  <div className="flex flex-col gap-2">
                    {plan.map((s, i) => (seatTeams(format)[i] !== t ? null : (
                      <SeatEditor key={i} seat={s} i={i} people={pickedChars} roster={roster} names={sport.botNames} onChange={(next) => setPlan((p) => p.map((x, k) => (k === i ? next : x)))} />
                    )))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12.5px] leading-relaxed text-white/50">
              {touch
                ? 'You play on the screen: a stick under your left thumb and a button under your right. A paired gamepad adds another player.'
                : 'Two people on one keyboard: one uses WASD and Space, the other the arrows and Enter. Plug in gamepads for more. People on opposite teams get a side view, and the keys follow the screen.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button className={btnPrimary} disabled={!plan.some((p) => p.kind === 'human')} onClick={startLocal}>Start the game</button>
              <button className={btnGhost} onClick={() => setScreen({ kind: 'home' })}>Back</button>
            </div>
          </div>
        </Center>
      )}

      {screen.kind === 'invite' && (
        <Center>
          <div className={`${panel} w-[min(820px,calc(100vw-32px))] max-h-[calc(100dvh-24px)] overflow-y-auto p-5 sm:p-7`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[22px] font-black">Play a friend online</div>
              <div className="flex gap-1.5">
                {(['singles', 'doubles'] as Format[]).map((f) => (
                  <button key={f} type="button" className={chip(format === f)} onClick={() => openInvite(f)}>{f === 'doubles' ? '2 v 2' : '1 v 1'}</button>
                ))}
              </div>
            </div>
            <p className="mt-1.5 text-[13px] text-white/55">Put everyone where you want them. Each friend gets a link that drops them right into their spot as the player you picked: nothing for them to choose.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {([0, 1] as Team[]).map((t) => (
                <div key={t} className="rounded-3xl p-3" style={{ background: `${TEAM_COLORS[t]}1f`, boxShadow: `inset 0 0 0 2px ${TEAM_COLORS[t]}55` }}>
                  <div className="mb-2 px-1 text-[12px] font-black uppercase tracking-[0.18em]" style={{ color: TEAM_COLORS[t] }}>{sport.teamNames[t]}</div>
                  <div className="flex flex-col gap-2">
                    {spots.map((sp, i) => (seatTeams(format)[i] !== t ? null : (
                      <SpotEditor
                        key={i}
                        spot={sp}
                        i={i}
                        me={byId(meId)}
                        roster={roster}
                        taken={[meId, ...spots.filter((x, k) => k !== i && x.kind === 'invite').map((x) => x.char?.id ?? '')]}
                        names={sport.botNames}
                        onMe={(id) => setMeId(id)}
                        onChange={(next) => setSpots((p) => p.map((x, k) => (k === i ? next : x)))}
                        onNew={() => setScreen({ kind: 'creator', c: makeCharacter('', roster.length), isNew: true, then: 'invite', seat: i })}
                      />
                    )))}
                  </div>
                </div>
              ))}
            </div>
            <VenuePicker venue={venue} onPick={pickVenue} />
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button className={btnPrimary} disabled={!byId(meId)} onClick={() => void createInviteRoom()}>
                {spots.some((x) => x.kind === 'invite') ? 'Get the invite link' : 'Start'}
              </button>
              <button className={btnGhost} onClick={() => setScreen({ kind: 'home' })}>Back</button>
            </div>
          </div>
        </Center>
      )}

      {screen.kind === 'online' && (
        <Center>
          <div className={`${panel} w-[min(520px,calc(100vw-32px))] p-6 sm:p-7`}>
            <div className="text-[22px] font-black">Join with a code</div>
            <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">{touch ? 'Playing on this screen' : 'Playing on this computer (one or two)'}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(pickedChars.length ? pickedChars : roster).map((c) => {
                const on = here.includes(c.id);
                return (
                  <button key={c.id} type="button" onClick={() => setHere((h) => (on ? h.filter((x) => x !== c.id) : [...h, c.id].slice(touch ? -1 : -2)))} className={`flex items-center gap-2 rounded-2xl border-2 py-1.5 pl-1.5 pr-3 ${on ? 'border-[#dcff3d] bg-[#dcff3d]/10' : 'border-white/10 bg-white/[0.03]'}`}>
                    <Portrait c={c} size={34} />
                    <span className="text-[14px] font-bold">{c.name}</span>
                  </button>
                );
              })}
              {!roster.length && <span className="text-[13px] text-white/50">Make a player first.</span>}
            </div>
            {here.length === 2 && <p className="mt-2 text-[12.5px] text-white/50">Two here: WASD + Space and arrows + Enter.</p>}
            {(
              <form className="mt-5" onSubmit={(e) => { e.preventDefault(); void joinRoom(); }}>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Room code</div>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
                  placeholder="CODE"
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-center font-mono text-[28px] tracking-[0.5em] text-white outline-none placeholder:text-white/20 focus:border-[#dcff3d]/70"
                />
                <div className="mt-5 flex gap-2.5">
                  <button type="submit" className={btnPrimary} disabled={joinCode.length !== 4 || !here.length}>Join</button>
                  <button type="button" className={btnGhost} onClick={() => setScreen({ kind: 'home' })}>Back</button>
                </div>
                {!here.length && roster.length > 0 && <p className="mt-3 text-[12.5px] text-[#ffd166]">Pick who’s playing on this computer.</p>}
                {!roster.length && (
                  <button type="button" className={`${btnGhost} mt-3`} onClick={() => setScreen({ kind: 'creator', c: makeCharacter('', 0), isNew: true, then: 'home' })}>Make your player</button>
                )}
              </form>
            )}
          </div>
        </Center>
      )}

      {screen.kind === 'connecting' && (
        <Center><div className={`${panel} px-8 py-6 text-[15px]`}><Spinner />{screen.label}</div></Center>
      )}

      {inRoom && !started && hud?.lobby && (
        <Center>
          <RoomLobby hud={hud} copied={copied} onShare={shareLink} ctrl={ctrl.current} onLeave={toMenu} sport={sport} onVenue={pickVenue} />
        </Center>
      )}
      {inRoom && !hud?.lobby && (
        <Center><div className={`${panel} px-8 py-6 text-[15px]`}><Spinner />Finding your seat…</div></Center>
      )}

      {screen.kind === 'error' && (
        <Center>
          <div className={`${panel} w-[min(420px,calc(100vw-32px))] p-7`}>
            <div className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#ff8a7a]">Couldn’t start</div>
            <p className="mt-2 text-[16px] leading-snug">{screen.message}</p>
            <div className="mt-5 flex gap-2.5">
              <button className={btnPrimary} onClick={toMenu}>Back to menu</button>
            </div>
          </div>
        </Center>
      )}

      {inGame && hud && (
        <GameHud
          sport={sport}
          hud={hud}
          devices={devices}
          onLeave={toMenu}
          onRematch={() => ctrl.current?.requestRematch()}
          onLobby={() => ctrl.current?.backToLobby()}
        />
      )}
      {inGame && hud?.touch && hud.phase !== 'over' && (
        <TouchControls
          pad={sport.pad}
          sportId={sport.id}
          ready={hud.ready}
          serving={hud.phase === 'serve' && hud.localSeats.includes(hud.server)}
          preview={(dx, dy) => sport.gesture(dx, dy).word}
          onStick={(x, y) => ctrl.current?.setTouchStick(x, y)} onShot={(dx, dy) => ctrl.current?.touchShot(dx, dy) ?? ''} />
      )}
    </div>
  );
}

function VenuePicker({ venue, onPick, disabled }: { venue: VenueId; onPick: (v: VenueId) => void; disabled?: boolean }) {
  const now = VENUES.find((v) => v.id === venue);
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Where</div>
        <div className="truncate text-[12px] text-white/45">{now?.blurb}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {VENUES.map((v) => (
          <button key={v.id} type="button" disabled={disabled} className={`${chip(venue === v.id)} disabled:opacity-60`} onClick={() => onPick(v.id)}>{v.name}</button>
        ))}
      </div>
    </div>
  );
}

function SeatEditor({ seat, i, people, roster, names, onChange }: {
  seat: SeatPlan;
  names: string[];
  i: number;
  people: Character[];
  roster: Character[];
  onChange: (s: SeatPlan) => void;
}) {
  const choices = people.length ? people : roster;
  const value = seat.kind === 'bot' ? 'bot' : seat.char?.id ?? 'bot';
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/25 p-2.5">
      <Portrait c={seat.kind === 'bot' ? botCharacter(i, names) : seat.char} size={46} />
      <div className="min-w-0 flex-1">
        <select
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'bot') onChange({ kind: 'bot', char: null, tier: seat.tier ?? 'club' });
            else onChange({ kind: 'human', char: choices.find((c) => c.id === v) ?? null, device: seat.device ?? 'keys' });
          }}
          className="w-full rounded-xl border border-white/10 bg-[#0b1424] px-2.5 py-1.5 text-[14px] font-bold text-white outline-none"
        >
          {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="bot">Bot ({botCharacter(i, names).name})</option>
        </select>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {seat.kind === 'bot'
            ? (Object.keys(TIERS) as BotTier[]).map((t) => (
              <button key={t} type="button" className={`${chip((seat.tier ?? 'club') === t)} !px-2.5 !py-1 !text-[11.5px]`} onClick={() => onChange({ ...seat, tier: t })}>{TIERS[t]}</button>
            ))
            : (
              <select
                value={seat.device ?? 'keys'}
                onChange={(e) => onChange({ ...seat, device: e.target.value as Device })}
                className="rounded-lg border border-white/10 bg-[#0b1424] px-2 py-1 text-[12px] text-white/80 outline-none"
              >
                {(Object.keys(DEVICE_LABEL) as Device[]).map((d) => <option key={d} value={d}>{DEVICE_LABEL[d]}</option>)}
              </select>
            )}
        </div>
      </div>
    </div>
  );
}

function SpotEditor({ spot, i, me, roster, taken, names, onMe, onChange, onNew }: {
  spot: RoomSpot;
  i: number;
  me: Character | null;
  roster: Character[];
  taken: string[];
  names: string[];
  onMe: (id: string) => void;
  onChange: (next: RoomSpot) => void;
  onNew: () => void;
}) {
  const select = 'w-full rounded-xl border border-white/10 bg-[#0b1424] px-2.5 py-1.5 text-[14px] font-bold text-white outline-none';
  if (spot.kind === 'me') {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-black/25 p-2.5">
        <Portrait c={me} size={46} />
        <div className="min-w-0 flex-1">
          <select value={me?.id ?? ''} onChange={(e) => (e.target.value === '__new' ? onNew() : onMe(e.target.value))} className={select}>
            {roster.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new">New player…</option>
          </select>
          <div className="mt-1 text-[12px] font-semibold text-[#dcff3d]">You</div>
        </div>
      </div>
    );
  }
  const friend = spot.kind === 'invite';
  const choices = roster.filter((c) => !taken.includes(c.id) || c.id === spot.char?.id);
  // a player made just for this friend (not in your saved players) still shows as a choice
  const extra = friend && spot.char && !roster.some((c) => c.id === spot.char!.id) ? [spot.char] : [];
  const all = [...extra, ...choices];
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/25 p-2.5">
      <Portrait c={friend ? spot.char ?? null : botCharacter(i, names)} size={46} />
      <div className="min-w-0 flex-1">
        <div className="flex gap-1">
          <button type="button" className={`${chip(friend)} !px-2.5 !py-1 !text-[11.5px]`} onClick={() => onChange({ kind: 'invite', char: spot.char ?? choices[0] ?? makeCharacter('Friend', i), tier: spot.tier })}>Friend</button>
          <button type="button" className={`${chip(!friend)} !px-2.5 !py-1 !text-[11.5px]`} onClick={() => onChange({ kind: 'bot', char: spot.char, tier: spot.tier ?? 'club' })}>Bot</button>
        </div>
        {friend ? (
          <select
            value={spot.char?.id ?? ''}
            onChange={(e) => (e.target.value === '__new' ? onNew() : onChange({ ...spot, char: all.find((c) => c.id === e.target.value) ?? spot.char }))}
            className={`${select} mt-1.5`}
          >
            {all.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new">New player for them…</option>
          </select>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[12.5px] font-bold">{botCharacter(i, names).name}</span>
            {(Object.keys(TIERS) as BotTier[]).map((t) => (
              <button key={t} type="button" className={`${chip((spot.tier ?? 'club') === t)} !px-2.5 !py-1 !text-[11.5px]`} onClick={() => onChange({ ...spot, tier: t })}>{TIERS[t]}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoomLobby({ hud, copied, onShare, ctrl, onLeave, sport, onVenue }: {
  sport: Sport;
  onVenue: (v: VenueId) => void;
  hud: Hud;
  copied: string | null;
  onShare: (url: string, key: string, title?: string) => void;
  ctrl: Controller | null;
  onLeave: () => void;
}) {
  const lobby = hud.lobby!;
  const host = hud.mode === 'host';
  const teams = seatTeams(lobby.format);
  const humans = lobby.seats.filter((s) => s.kind === 'human').length;
  const base = typeof window !== 'undefined' ? `${window.location.origin}${sport.path}?room=${hud.roomCode}` : '';
  const linkFor = (i: number) => `${base}&seat=${i}`;
  const waiting = lobby.seats.filter((s) => s.kind === 'invite');
  const mine = lobby.seats.findIndex((s) => !!s.owner && s.owner === hud.myId);
  if (lobby.auto) {
    const title = host
      ? waiting.length
        ? waiting.length === 1 ? `Send ${waiting[0].char?.name ?? 'your friend'} the link` : 'Send each friend their link'
        : 'Everyone’s here'
      : mine >= 0 ? `You’re ${lobby.seats[mine].char?.name ?? 'in'}` : 'You’re in';
    return (
      <div className={`${panel} w-[min(560px,calc(100vw-32px))] max-h-[calc(100dvh-24px)] overflow-y-auto p-5 sm:p-7`}>
        <div className="text-[22px] font-black">{title}</div>
        <p className="mt-1.5 text-[13px] text-white/55">
          {host
            ? 'Opening it puts them straight into the game as the player you picked. It starts the moment everyone’s in.'
            : `On the ${sport.teamNames[teams[Math.max(0, mine)]]}. The game starts the moment everyone’s in.`}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {lobby.seats.map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl p-2.5" style={{ background: `${TEAM_COLORS[teams[i]]}1f`, boxShadow: `inset 0 0 0 2px ${TEAM_COLORS[teams[i]]}44` }}>
              <Portrait c={s.char} size={42} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold">
                  {s.char?.name}
                  {i === mine && <span className="ml-1.5 text-[11px] font-semibold text-[#dcff3d]">you</span>}
                </div>
                <div className="text-[12px]" style={{ color: s.kind === 'invite' ? '#ffd166' : 'rgba(255,255,255,0.5)' }}>
                  {s.kind === 'invite' ? 'Not here yet' : s.kind === 'bot' ? `Bot · ${TIERS[s.tier]}` : `Here · ${sport.teamNames[teams[i]]}`}
                </div>
              </div>
              {host && s.kind === 'invite' && (
                <button type="button" className={`${btnPrimary} !px-4 !py-2 !text-[13.5px]`} onClick={() => onShare(linkFor(i), `seat${i}`, `Play ${sport.name} with me`)}>
                  {copied === `seat${i}` ? 'Copied' : 'Share link'}
                </button>
              )}
            </div>
          ))}
        </div>
        {host && waiting.length > 0 && (
          <div className="mt-3 space-y-1">
            {lobby.seats.map((s, i) => (s.kind !== 'invite' ? null : (
              <div key={i} className="select-text truncate rounded-xl bg-black/30 px-3 py-2 font-mono text-[11.5px] text-white/60" title={linkFor(i)}>{s.char?.name}: {linkFor(i)}</div>
            )))}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {host ? (
            <>
              {waiting.length > 0 && <span className="text-[13.5px] text-white/70"><Spinner />Waiting for {waiting.map((s) => s.char?.name).join(' and ')}</span>}
              <button className={btnGhost} onClick={() => ctrl?.startOnlineGame()}>{waiting.length ? 'Start now (bots fill in)' : 'Start'}</button>
            </>
          ) : (
            <span className="text-[13.5px] text-white/70"><Spinner />{hud.hostHere ? 'Waiting for everyone' : 'Waiting for the host'}</span>
          )}
          <button className={btnGhost} onClick={onLeave}>Leave</button>
        </div>
      </div>
    );
  }
  return (
    <div className={`${panel} w-[min(820px,calc(100vw-32px))] p-5 sm:p-7`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">Room code</div>
          <div className="font-mono text-[clamp(38px,11vw,52px)] font-black leading-none tracking-[0.22em] text-[#dcff3d]">{hud.roomCode}</div>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={() => onShare(base, 'room')}>{copied === 'room' ? 'Link copied' : 'Copy invite link'}</button>
          <button className={btnGhost} onClick={onLeave}>Leave</button>
        </div>
      </div>
      <p className="mt-2 text-[13px] text-white/55">
        {host ? `Everyone opens ${sport.name}, picks their player, chooses Join a room and types this code. Empty spots get bots.` : 'You’re in. The host sets the teams and the place, and starts the game.'}
      </p>
      <VenuePicker venue={hud.venue} onPick={onVenue} disabled={!host} />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {([0, 1] as Team[]).map((t) => (
          <div key={t} className="rounded-3xl p-3" style={{ background: `${TEAM_COLORS[t]}1f`, boxShadow: `inset 0 0 0 2px ${TEAM_COLORS[t]}55` }}>
            <div className="mb-2 px-1 text-[12px] font-black uppercase tracking-[0.18em]" style={{ color: TEAM_COLORS[t] }}>{sport.teamNames[t]}</div>
            <div className="flex flex-col gap-2">
              {lobby.seats.map((s, i) => (teams[i] !== t ? null : (
                <div key={i} className="flex items-center gap-3 rounded-2xl bg-black/25 p-2.5">
                  <Portrait c={s.kind === 'open' ? null : s.char} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold">
                      {s.kind === 'open' ? 'Open spot' : s.char?.name}
                      {s.owner && s.owner === hud.myId && <span className="ml-1.5 text-[11px] font-semibold text-[#dcff3d]">you</span>}
                    </div>
                    <div className="text-[12px] text-white/50">
                      {s.kind === 'human' ? (s.char ? STYLE_LABEL[s.char.style].name : '') : s.kind === 'bot' ? `Bot · ${TIERS[s.tier]}` : 'A bot plays here if no one joins'}
                    </div>
                    {host && s.kind !== 'human' && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(Object.keys(TIERS) as BotTier[]).map((tier) => (
                          <button key={tier} type="button" className={`${chip(s.tier === tier)} !px-2.5 !py-1 !text-[11.5px]`} onClick={() => ctrl?.setSeat(i, { kind: 'bot', tier })}>{TIERS[tier]}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {host && (
                    <button type="button" title="Switch teams" onClick={() => ctrl?.swapSeats(i, lobby.format === 'doubles' ? (i + 2) % 4 : 1 - i)} className="rounded-xl bg-white/[0.06] px-2.5 py-2 text-[13px] font-bold hover:bg-white/15">⇄</button>
                  )}
                </div>
              )))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {host ? (
          <button className={btnPrimary} onClick={() => ctrl?.startOnlineGame()}>Start the game</button>
        ) : (
          <div className="text-[14px] text-white/70"><Spinner />Waiting for the host to start</div>
        )}
        <span className="text-[12.5px] text-white/45">{humans} {humans === 1 ? 'person' : 'people'} · {host ? `${hud.guests} other screen${hud.guests === 1 ? '' : 's'}` : hud.hostHere ? 'host is here' : 'host is away'}</span>
      </div>
    </div>
  );
}
