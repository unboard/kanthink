// Pickleball: the game loop. Owns the renderer, the keyboard and gamepads, the
// fixed-step sim (when this browser is the authority), the online lobby (when it hosts)
// and the guest's prediction (when it doesn't). React only sees the compact Hud.
//
// Seats are the four (or two) places on court. Each is a person on this computer (with a
// device: the whole keyboard, its left or right half, or a gamepad), a person on another
// computer, or a bot. Players on the same computer can be on the same team or opposite
// teams; when they're on opposite teams the camera moves to the side, like a broadcast,
// and the keys follow the screen.

import { botCharacter, traitsOf, type Character } from './characters';
import { botInput, type BotTier } from './bot';
import { Sfx } from './audio';
import { CourtRenderer, type RenderView } from './render';
import { RoomNet, stableClientId, type Lobby, type NetStatus, type Seat, type WireInput } from './net';
import {
  DT, IDLE, SWING_TOTAL, cloneState, createGame, serveCourtSign, movePlayer, rematch, scoreCall, sgn, stepBall, step,
  type CallKind, type Format, type GameState, type Player, type PlayerInput, type PointResult, type PlayerStats, type Team,
} from './sim';
import type { Role } from './room';

export type Mode = 'attract' | 'local' | 'host' | 'guest';
export type LinkStatus = 'local' | NetStatus;
export type Device = 'keys' | 'keysL' | 'keysR' | 'pad0' | 'pad1' | 'pad2' | 'pad3';

export const DEVICE_LABEL: Record<Device, string> = {
  keys: 'Keyboard',
  keysL: 'Keys: WASD + Space',
  keysR: 'Keys: arrows + Enter',
  pad0: 'Gamepad 1',
  pad1: 'Gamepad 2',
  pad2: 'Gamepad 3',
  pad3: 'Gamepad 4',
};

export interface LocalPlayer {
  char: Character;
  device: Device;
}

export interface SeatPlan {
  kind: 'human' | 'bot';
  char: Character | null;
  device?: Device;
  tier?: BotTier;
}

export interface HudPlayer {
  name: string;
  team: Team;
  heat: number;
  fire: boolean;
  local: boolean;
  bot: boolean;
  away: boolean;
  char: Character;
  stats: PlayerStats;
}

export interface Callout {
  seq: number;
  kind: CallKind;
  text: string;
  sub: string;
  team: Team | null;
}

export interface Hud {
  mode: Mode;
  format: Format;
  phase: GameState['phase'];
  scores: [number, number];
  servingTeam: Team;
  server: number;
  serverNum: 1 | 2;
  scoreCall: string;
  players: HudPlayer[];
  localSeats: number[];
  myTeam: Team;
  lastPoint: PointResult | null;
  pointSeq: number;
  winner: Team | -1;
  status: LinkStatus;
  roomCode: string | null;
  lobby: Lobby | null;
  /** host: guests in the room; guest: whether the host is here */
  guests: number;
  hostHere: boolean;
  myId: string | null;
  callout: Callout | null;
  rematchAsks: number;
  toast: string | null;
}

const KEYS = {
  keys: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], swing: ['Space', 'Enter', 'NumpadEnter'] },
  keysL: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], swing: ['Space', 'KeyF', 'ShiftLeft'] },
  keysR: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], swing: ['Enter', 'NumpadEnter', 'ShiftRight', 'Slash', 'Numpad0'] },
} as const;
const GAME_KEYS = new Set<string>(Object.values(KEYS).flatMap((k) => [...k.up, ...k.down, ...k.left, ...k.right, ...k.swing]));

/** The announcer: the Neon design pass's lines, with names. */
function callText(kind: CallKind, name: string, n?: number): { text: string; sub: string } {
  switch (kind) {
    case 'start': return { text: 'Paddles up!', sub: 'Let’s pickle' };
    case 'side-out': return { text: 'New server!', sub: `${name} has the ball` };
    case 'ace': return { text: 'Untouchable!', sub: `${name}, right past them` };
    case 'kitchen': return { text: 'Whoa! Toes in the kitchen!', sub: `${name} gets the chef hat` };
    case 'two-bounce': return { text: 'Hold your horses!', sub: 'Let it bounce' };
    case 'dink': return { text: 'Silky soft!', sub: `${name}, right in the pocket` };
    case 'lob': return { text: 'Sky high!', sub: `${name} says look up` };
    case 'smash': return { text: 'Boom!', sub: `${name}, straight to the floor` };
    case 'rally10': return { text: `${n ?? 10} shots!`, sub: 'Nobody is blinking' };
    case 'rally20': return { text: `${n ?? 20} shots!`, sub: 'Legendary rally' };
    case 'warm': return { text: 'Heating up!', sub: `Watch ${name}’s paddle` };
    case 'fire': return { text: `${name} is on fire!`, sub: 'Call the fire truck' };
    case 'cooled': return { text: 'Ice cold defense!', sub: `${name} is out of flames` };
    case 'doused': return { text: 'Doused!', sub: `${name}’s fire is out` };
    case 'combo': return { text: 'Team combo!', sub: 'Teamwork magic' };
    case 'streak': return { text: `${name} ×${n ?? 3}`, sub: 'Can’t miss right now' };
    case 'tied': return { text: 'All tied up!', sub: 'We got a game' };
    case 'game-point': return { text: 'Game point!', sub: 'One more for glory' };
    case 'overtime': return { text: 'Overtime!', sub: 'Gotta win by two' };
    case 'win': return { text: 'Champs of the court!', sub: 'High fives all around' };
  }
}

function newSeed(): number {
  // only used to pick a game's seed; the sim itself never touches Math.random
  return (Math.random() * 4294967296) >>> 0;
}

function teamsFor(format: Format): Team[] {
  return format === 'doubles' ? [0, 0, 1, 1] : [0, 1];
}

export class Controller {
  private renderer: CourtRenderer;
  private sfx = new Sfx();
  private onHud: (h: Hud) => void;
  private onFatal: (msg: string) => void;
  private raf = 0;
  private last = 0;
  private acc = 0;

  private mode: Mode = 'attract';
  private format: Format = 'doubles';
  private state: GameState;
  private view: GameState;
  /** who's in each seat, for drawing and names */
  private chars: Character[] = [];
  private bots: (BotTier | null)[] = [];
  /** seat → this computer's device for it */
  private locals = new Map<number, Device>();

  // input
  private held = new Set<string>();
  private swings = new Map<number, number>(); // seat → presses so far
  private latched = new Set<number>();
  private padPrev: boolean[] = [];

  // networking
  private net: RoomNet | null = null;
  private status: LinkStatus = 'local';
  private lobby: Lobby | null = null;
  private guests: string[] = [];
  private hostHere = false;
  private myLocals: LocalPlayer[] = [];
  private remote = new Map<number, { input: PlayerInput; sw: number; latched: boolean }>();
  private rematchAsks = new Set<string>();

  // guest prediction
  private snapAt = 0;
  private own = new Map<number, Player>();
  private ownSwing = new Map<number, number>();
  private snapOwn = new Map<number, Player>();

  // sounds and callouts
  private heard = { hit: 0, bounce: 0, point: 0, call: 0 };
  private callout: Callout | null = null;
  private calloutAt = 0;
  private toast: string | null = null;
  private toastAt = 0;
  private fived = -1;
  private hudKey = '';

  constructor(container: HTMLElement, onHud: (h: Hud) => void, onFatal: (msg: string) => void) {
    this.renderer = new CourtRenderer(container);
    this.onHud = onHud;
    this.onFatal = onFatal;
    this.state = this.attractGame();
    this.view = this.state;
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    this.syncHeard(this.state);
    this.raf = requestAnimationFrame(this.frame);
    // for poking at the game from the console while developing
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __pb: Controller }).__pb = this;
  }

  // ————— modes —————

  private attractGame(): GameState {
    this.format = 'doubles';
    this.chars = [0, 1, 2, 3].map(botCharacter);
    this.bots = ['club', 'club', 'club', 'club'];
    this.locals.clear();
    return createGame(newSeed(), { format: 'doubles', traits: this.chars.map(traitsOf) });
  }

  startAttract() {
    this.leaveNet();
    this.mode = 'attract';
    this.state = this.attractGame();
    this.view = this.state;
    this.syncHeard(this.state);
    this.callout = null;
  }

  /** everyone on this computer, plus bots */
  startLocal(format: Format, plan: SeatPlan[]) {
    this.leaveNet();
    this.sfx.unlock();
    this.mode = 'local';
    this.format = format;
    this.applyPlan(plan);
    this.state = createGame(newSeed(), { format, traits: this.chars.map(traitsOf) });
    this.view = this.state;
    this.syncHeard(this.state);
    this.heard.call = 0;
  }

  private applyPlan(plan: SeatPlan[]) {
    this.chars = plan.map((p, i) => p.char ?? botCharacter(i));
    this.bots = plan.map((p) => (p.kind === 'bot' ? p.tier ?? 'club' : null));
    this.locals.clear();
    plan.forEach((p, i) => { if (p.kind === 'human' && p.device) this.locals.set(i, p.device); });
    this.swings.clear();
    this.latched.clear();
  }

  // ————— online —————

  hostRoom(code: string, format: Format, players: LocalPlayer[]) {
    this.leaveNet();
    this.sfx.unlock();
    this.mode = 'host';
    this.format = format;
    this.myLocals = players.slice(0, format === 'doubles' ? 2 : 1);
    const id = `h_${stableClientId()}`;
    const seats: Seat[] = teamsFor(format).map(() => ({ kind: 'open', owner: null, char: null, tier: 'club', away: false }));
    // the host's players take team 0 (two of them share it in doubles)
    this.myLocals.forEach((lp, k) => { seats[k] = { kind: 'human', owner: id, char: lp.char, tier: 'club', away: false }; });
    this.lobby = { format, seats, started: false, game: 0 };
    this.guests = [];
    this.rematchAsks.clear();
    this.status = 'connecting';
    this.net = new RoomNet(code, 'host', stableClientId(), players[0]?.char.name ?? 'Host', {
      onStatus: (s) => { this.status = s; },
      onMembers: (guests) => this.membersChanged(guests),
      onHello: (from, chars) => this.hello(from, chars),
      onInput: (from, list) => this.receiveInput(from, list),
      onRematch: (from) => { this.rematchAsks.add(from); },
      onFatal: (msg) => { this.startAttract(); this.onFatal(msg); },
    });
    this.lobbyChanged();
  }

  joinRoom(code: string, players: LocalPlayer[]) {
    this.leaveNet();
    this.sfx.unlock();
    this.mode = 'guest';
    this.myLocals = players.slice(0, 2);
    this.lobby = null;
    this.status = 'connecting';
    this.own.clear();
    this.snapOwn.clear();
    const net = new RoomNet(code, 'guest', stableClientId(), players[0]?.char.name ?? 'Guest', {
      onStatus: (s) => {
        this.status = s;
        if (s === 'connected') net.sendHello(this.myLocals.map((p) => p.char));
      },
      onMembers: (_g, hostHere) => {
        const back = hostHere && !this.hostHere;
        this.hostHere = hostHere;
        if (back) net.sendHello(this.myLocals.map((p) => p.char));
      },
      onLobby: (lobby) => this.receiveLobby(lobby),
      onSnapshot: (s) => this.receiveSnapshot(s),
      onFatal: (msg) => { this.startAttract(); this.onFatal(msg); },
    });
    this.net = net;
  }

  private myId(): string | null {
    return this.net?.myId ?? null;
  }

  /** host: a guest arrived with their characters; seat them (or welcome them back) */
  private hello(from: string, chars: Character[]) {
    if (!this.lobby) return;
    const seats = this.lobby.seats;
    const mine = seats.map((s, i) => (s.owner === from ? i : -1)).filter((i) => i >= 0);
    if (mine.length) {
      mine.forEach((i, k) => { seats[i] = { ...seats[i], kind: 'human', char: chars[k] ?? seats[i].char, away: false }; });
    } else {
      for (const c of chars) {
        // an open seat first, then one a bot is keeping
        let i = seats.findIndex((s) => s.kind === 'open');
        if (i < 0) i = seats.findIndex((s) => s.kind === 'bot');
        if (i < 0) break;
        seats[i] = { kind: 'human', owner: from, char: c, tier: 'club', away: false };
      }
    }
    this.lobbyChanged();
  }

  private membersChanged(guests: string[]) {
    this.guests = guests;
    if (!this.lobby) return;
    let changed = false;
    this.lobby.seats.forEach((s, i) => {
      if (s.kind !== 'human' || !s.owner || s.owner === this.myId() || guests.includes(s.owner)) return;
      changed = true;
      // gone: mid-game a bot keeps the seat warm; in the lobby the seat opens up
      this.lobby!.seats[i] = this.lobby!.started ? { ...s, away: true } : { kind: 'open', owner: null, char: null, tier: 'club', away: false };
      this.remote.delete(i);
    });
    for (const id of [...this.rematchAsks]) if (!guests.includes(id)) this.rematchAsks.delete(id);
    if (changed) this.lobbyChanged();
  }

  /** host: change a seat in the lobby (bot on/off, bot tier) */
  setSeat(i: number, patch: Partial<Pick<Seat, 'kind' | 'tier'>>) {
    if (this.mode !== 'host' || !this.lobby || this.lobby.started) return;
    const s = this.lobby.seats[i];
    if (!s || s.kind === 'human') return;
    this.lobby.seats[i] = { ...s, ...patch, char: patch.kind === 'bot' ? botCharacter(i) : patch.kind === 'open' ? null : s.char };
    this.lobbyChanged();
  }

  /** host: swap two seats (to make teams) */
  swapSeats(a: number, b: number) {
    if (this.mode !== 'host' || !this.lobby || this.lobby.started) return;
    const seats = this.lobby.seats;
    if (!seats[a] || !seats[b]) return;
    [seats[a], seats[b]] = [seats[b], seats[a]];
    this.lobbyChanged();
  }

  /** host: start the game; empty seats get bots */
  startOnlineGame() {
    if (this.mode !== 'host' || !this.lobby) return;
    this.lobby.seats = this.lobby.seats.map((s, i) => (s.kind === 'open' ? { kind: 'bot', owner: null, char: botCharacter(i), tier: s.tier, away: false } : s));
    this.lobby.started = true;
    this.lobby.game += 1;
    this.rematchAsks.clear();
    this.adoptLobby(this.lobby);
    this.state = createGame(newSeed(), { format: this.lobby.format, traits: this.chars.map(traitsOf) });
    this.view = this.state;
    this.syncHeard(this.state);
    this.heard.call = 0;
    this.lobbyChanged();
  }

  /** host: everyone back to the lobby */
  backToLobby() {
    if (this.mode !== 'host' || !this.lobby) return;
    this.lobby.started = false;
    this.lobby.seats = this.lobby.seats.map((s) => (s.kind === 'human' && s.away ? { kind: 'open', owner: null, char: null, tier: 'club', away: false } : s));
    this.lobbyChanged();
  }

  private lobbyChanged() {
    if (!this.lobby) return;
    this.adoptLobby(this.lobby);
    this.net?.sendLobby(this.lobby);
  }

  /** derive characters, bots and this computer's seats from the lobby */
  private adoptLobby(lobby: Lobby) {
    this.format = lobby.format;
    this.chars = lobby.seats.map((s, i) => s.char ?? botCharacter(i));
    this.bots = lobby.seats.map((s) => (s.kind === 'bot' || s.away || s.kind === 'open' ? s.tier : null));
    const me = this.myId();
    this.locals.clear();
    let k = 0;
    lobby.seats.forEach((s, i) => {
      if (s.kind === 'human' && s.owner && s.owner === me) {
        this.locals.set(i, this.myLocals[k]?.device ?? 'keys');
        k += 1;
      }
    });
  }

  private receiveLobby(lobby: Lobby) {
    const wasGame = this.lobby?.game;
    this.lobby = lobby;
    this.adoptLobby(lobby);
    if (lobby.started && wasGame !== lobby.game) {
      // a new game: forget the old prediction
      this.own.clear();
      this.snapOwn.clear();
      this.heard.call = 0;
    }
  }

  requestRematch() {
    if (this.mode === 'local') {
      this.state = rematch(this.state, newSeed());
      this.syncHeard(this.state);
      this.heard.call = 0;
      return;
    }
    if (this.mode === 'host') {
      this.rematchAsks.clear();
      this.state = rematch(this.state, newSeed());
      this.syncHeard(this.state);
      this.heard.call = 0;
      return;
    }
    this.net?.sendRematch();
    this.toastNow('Asked the host for a rematch');
  }

  private leaveNet() {
    this.net?.dispose();
    this.net = null;
    this.status = 'local';
    this.lobby = null;
    this.guests = [];
    this.hostHere = false;
    this.remote.clear();
    this.own.clear();
    this.snapOwn.clear();
  }

  // ————— input —————

  private typing(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  private keyDown = (e: KeyboardEvent) => {
    if (this.mode === 'attract' || this.typing(e) || !this.locals.size) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    this.sfx.unlock();
    if (!e.repeat) {
      for (const [seat, dev] of this.locals) {
        if (dev.startsWith('pad')) continue;
        if ((KEYS[dev as keyof typeof KEYS].swing as readonly string[]).includes(e.code)) this.press(seat);
      }
    }
    this.held.add(e.code);
  };

  private keyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private blur = () => {
    this.held.clear();
  };

  private press(seat: number) {
    this.swings.set(seat, (this.swings.get(seat) ?? 0) + 1);
    this.latched.add(seat);
    if (this.mode === 'guest' && (this.ownSwing.get(seat) ?? -1) < 0) this.ownSwing.set(seat, 0);
  }

  /** gamepads: poll once a frame; a button going down is a press */
  private pollPads() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const [seat, dev] of this.locals) {
      if (!dev.startsWith('pad')) continue;
      const k = Number(dev.slice(3));
      const pad = pads[k];
      const down = !!pad && [0, 1, 2, 3, 5, 7].some((b) => pad.buttons[b]?.pressed);
      if (down && !this.padPrev[k]) { this.sfx.unlock(); this.press(seat); }
      this.padPrev[k] = down;
    }
  }

  /** screen-space direction for a device: x right, y up */
  private stick(dev: Device): [number, number] {
    if (dev.startsWith('pad')) {
      const pad = navigator.getGamepads?.()[Number(dev.slice(3))];
      if (!pad) return [0, 0];
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      let x = Math.abs(ax) > 0.4 ? Math.sign(ax) : 0;
      let y = Math.abs(ay) > 0.4 ? -Math.sign(ay) : 0;
      if (pad.buttons[14]?.pressed) x = -1;
      if (pad.buttons[15]?.pressed) x = 1;
      if (pad.buttons[12]?.pressed) y = 1;
      if (pad.buttons[13]?.pressed) y = -1;
      return [x, y];
    }
    const k = KEYS[dev as keyof typeof KEYS];
    const on = (codes: readonly string[]) => codes.some((c) => this.held.has(c));
    return [(on(k.right) ? 1 : 0) - (on(k.left) ? 1 : 0), (on(k.up) ? 1 : 0) - (on(k.down) ? 1 : 0)];
  }

  /** a seat's input from its device, in the player's own frame */
  private localInput(seat: number, s: GameState): PlayerInput {
    const dev = this.locals.get(seat);
    if (!dev) return IDLE;
    const [x, y] = this.stick(dev);
    const swing = this.latched.has(seat);
    if (this.broadcast()) {
      // keys follow the screen: right is toward the far end, up is away from the camera
      const sg = sgn(s.players[seat]?.team ?? 0);
      return { mx: -sg * y, mz: sg * x, swing };
    }
    return { mx: x, mz: y, swing };
  }

  private broadcast(): boolean {
    const teams = new Set([...this.locals.keys()].map((i) => this.view.players[i]?.team ?? (i < this.view.players.length / 2 ? 0 : 1)));
    return teams.size > 1;
  }

  private receiveInput(from: string, list: WireInput[]) {
    if (!this.lobby) return;
    for (const w of list) {
      if (this.lobby.seats[w.seat]?.owner !== from) continue; // only your own seats
      const r = this.remote.get(w.seat) ?? { input: { ...IDLE }, sw: -1, latched: false };
      r.input = { mx: w.mx, mz: w.mz, swing: false };
      if (r.sw >= 0 && w.sw > r.sw) r.latched = true;
      r.sw = w.sw;
      this.remote.set(w.seat, r);
    }
  }

  // ————— guest —————

  private receiveSnapshot(s: GameState) {
    const prevPhase = this.view.phase;
    const prevPoint = this.view.pointSeq;
    this.snapAt = performance.now();
    this.view = cloneState(s);
    for (const seat of this.locals.keys()) {
      const sp = s.players[seat];
      if (!sp) continue;
      this.snapOwn.set(seat, { ...sp });
      const own = this.own.get(seat);
      const reset = !own || (s.phase === 'serve' && (prevPhase !== 'serve' || prevPoint !== s.pointSeq));
      if (reset || Math.hypot(sp.x - own!.x, sp.z - own!.z) > 4.5) this.own.set(seat, { ...sp });
    }
    this.applyOwn();
  }

  private applyOwn() {
    for (const [seat, own] of this.own) {
      if (!this.view.players[seat]) continue;
      this.view.players[seat] = { ...this.view.players[seat], x: own.x, z: own.z, vx: own.vx, vz: own.vz, swingT: this.ownSwing.get(seat) ?? -1 };
    }
  }

  private guestStep() {
    const v = this.view;
    v.phaseTicks += 1;
    for (const [seat, own] of this.own) {
      const input = { ...this.localInput(seat, v), swing: false };
      movePlayer(own, input, v.phase, v.server === seat, serveCourtSign(v, own.team), v.traits[seat]?.speed ?? 1);
      const snap = this.snapOwn.get(seat);
      // standing still, both sides agree on where you are; drift back toward the host's copy
      if (input.mx === 0 && input.mz === 0 && snap) {
        own.x += (snap.x - own.x) * 0.04;
        own.z += (snap.z - own.z) * 0.04;
      }
      const sw = this.ownSwing.get(seat) ?? -1;
      if (sw >= 0) this.ownSwing.set(seat, sw + 1 > SWING_TOTAL ? -1 : sw + 1);
    }
    const age = (performance.now() - this.snapAt) / 1000;
    if (age < 0.3) {
      v.players.forEach((o, i) => {
        if (this.own.has(i)) return;
        o.x += o.vx * DT;
        o.z += o.vz * DT;
        if (o.swingT >= 0 && o.swingT < SWING_TOTAL) o.swingT += 1;
      });
    }
    if (v.phase === 'serve') {
      const sp = v.players[v.server];
      const s = sgn(sp.team);
      v.ball = { ...v.ball, x: sp.x + s * 1.1, y: 1.6, z: sp.z - s * 0.9, vx: 0, vy: 0, vz: 0 };
    } else if (age < 1.5) {
      stepBall(v.ball);
    }
    this.applyOwn();
  }

  // ————— loop —————

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    this.pollPads();

    const playing = this.mode !== 'host' && this.mode !== 'guest' ? true : !!this.lobby?.started;
    if (this.mode === 'guest') {
      if (playing) {
        const list: WireInput[] = [...this.locals.keys()].map((seat) => {
          const i = this.localInput(seat, this.view);
          return { seat, mx: i.mx, mz: i.mz, sw: this.swings.get(seat) ?? 0 };
        });
        this.net?.maybeSendInput(list, now);
      }
      this.latched.clear();
      if (playing && this.hostHere && this.status === 'connected') {
        this.acc += dt;
        while (this.acc >= DT) {
          this.guestStep();
          this.acc -= DT;
        }
      } else {
        this.acc = 0;
      }
    } else {
      const live = playing && (this.mode !== 'host' || this.status === 'connected');
      if (live) {
        this.acc += dt;
        while (this.acc >= DT) {
          this.state = step(this.state, this.inputsFor(this.state));
          this.acc -= DT;
          if (this.mode === 'attract' && this.state.phase === 'over' && this.state.phaseTicks > 240) {
            this.state = this.attractGame();
          }
        }
      } else {
        this.acc = 0;
      }
      this.view = this.state;
      if (this.mode === 'host' && playing) this.net?.maybeSendSnapshot(this.state, now);
    }

    this.renderer.setRoster(this.chars.slice(0, this.view.players.length), this.view.players.map((p) => p.team));
    this.hearCalls(this.view, now);
    this.playSounds(this.view);
    this.highFive(this.view);
    const focus = [...this.locals.keys()];
    const firstTeam: Team = focus.length ? this.view.players[focus[0]]?.team ?? 0 : 0;
    const rv: RenderView = {
      team: firstTeam,
      focus,
      broadcast: this.broadcast(),
      showServeTarget: this.mode !== 'attract' && focus.includes(this.view.server),
    };
    this.renderer.render(this.view, rv, dt);
    if (this.callout && now - this.calloutAt > 1900) this.callout = null;
    if (this.toast && now - this.toastAt > 2200) this.toast = null;
    this.emitHud();
  };

  private inputsFor(s: GameState): PlayerInput[] {
    const humans = [...this.locals.keys()];
    if (this.mode === 'host' && this.lobby) this.lobby.seats.forEach((seat, i) => { if (seat.kind === 'human' && !seat.away) humans.push(i); });
    const out = s.players.map((_, i) => {
      if (this.locals.has(i)) return this.localInput(i, s);
      const r = this.remote.get(i);
      const seat = this.lobby?.seats[i];
      if (this.mode === 'host' && seat?.kind === 'human' && !seat.away && r) {
        const input = { ...r.input, swing: r.latched };
        r.latched = false;
        return input;
      }
      if (this.mode === 'host' && seat?.kind === 'human' && !seat.away) return IDLE;
      return botInput(s, i, { tier: this.bots[i] ?? 'club', humans });
    });
    this.latched.clear(); // a press is consumed by exactly one step
    return out;
  }

  private syncHeard(s: GameState) {
    this.heard = { hit: s.hitSeq, bounce: s.bounceSeq, point: s.pointSeq, call: s.callSeq };
  }

  private nameOf(i: number): string {
    return this.chars[i]?.name ?? 'Player';
  }

  private hearCalls(s: GameState, now: number) {
    if (this.mode === 'attract') { this.heard.call = s.callSeq; return; }
    const fresh = s.calls.filter((c) => c.seq > this.heard.call);
    if (!fresh.length) return;
    this.heard.call = s.callSeq;
    // the most exciting one wins the banner; every one gets its sound
    const rank: CallKind[] = ['win', 'fire', 'doused', 'cooled', 'tied', 'overtime', 'game-point', 'kitchen', 'ace', 'smash', 'combo', 'streak', 'rally20', 'rally10', 'dink', 'lob', 'two-bounce', 'warm', 'side-out', 'start'];
    const best = [...fresh].sort((a, b) => rank.indexOf(a.kind) - rank.indexOf(b.kind))[0];
    const t = callText(best.kind, this.nameOf(best.player), best.n);
    this.callout = { seq: best.seq, kind: best.kind, ...t, team: s.players[best.player]?.team ?? null };
    this.calloutAt = now;
    this.sfx.call(best.kind);
  }

  private playSounds(s: GameState) {
    if (this.mode === 'attract') {
      this.syncHeard(s);
      return;
    }
    if (s.hitSeq > this.heard.hit) this.sfx.hit(s.ball.hot ? 1.4 : 1);
    if (s.bounceSeq > this.heard.bounce && s.phase === 'rally') this.sfx.bounce();
    if (s.pointSeq > this.heard.point && s.lastPoint) {
      const mine = [...this.locals.keys()].map((i) => s.players[i]?.team);
      this.sfx.point(!mine.length || !mine.includes(s.lastPoint.faultTeam));
    }
    this.heard.hit = s.hitSeq;
    this.heard.bounce = s.bounceSeq;
    this.heard.point = s.pointSeq;
  }

  /** after a rally, teammates who run to each other high-five */
  private highFive(s: GameState) {
    if (this.mode === 'attract' || s.format !== 'doubles' || s.phase !== 'point' || !s.lastPoint || this.fived === s.pointSeq) return;
    if (s.phaseTicks > 150) return;
    const team = s.lastPoint.faultTeam === 0 ? 1 : 0;
    const mates = s.players.map((p, i) => (p.team === team ? i : -1)).filter((i) => i >= 0);
    const [a, b] = mates.map((i) => s.players[i]);
    if (a && b && Math.hypot(a.x - b.x, a.z - b.z) < 3.6) {
      this.fived = s.pointSeq;
      this.sfx.slap();
      this.toastNow(`High five! ${this.nameOf(mates[0])} and ${this.nameOf(mates[1])}`);
    }
  }

  private toastNow(text: string) {
    this.toast = text;
    this.toastAt = performance.now();
  }

  private emitHud() {
    const s = this.view;
    const localSeats = [...this.locals.keys()];
    const hud: Hud = {
      mode: this.mode,
      format: s.format,
      phase: s.phase,
      scores: [s.scores[0], s.scores[1]],
      servingTeam: s.servingTeam,
      server: s.server,
      serverNum: s.serverNum,
      scoreCall: scoreCall(s),
      players: s.players.map((p, i) => ({
        name: this.nameOf(i),
        team: p.team,
        heat: Math.round(p.heat),
        fire: p.fire > 0,
        local: this.locals.has(i),
        bot: this.bots[i] !== null && this.bots[i] !== undefined,
        away: !!this.lobby?.seats[i]?.away,
        char: this.chars[i],
        stats: s.phase === 'over' ? p.stats : ZERO_STATS,
      })),
      localSeats,
      myTeam: localSeats.length ? s.players[localSeats[0]]?.team ?? 0 : 0,
      lastPoint: s.lastPoint,
      pointSeq: s.pointSeq,
      winner: s.winner,
      status: this.status,
      roomCode: this.net?.code ?? null,
      lobby: this.lobby,
      guests: this.guests.length,
      hostHere: this.hostHere,
      myId: this.myId(),
      callout: this.callout,
      rematchAsks: this.rematchAsks.size,
      toast: this.toast,
    };
    const key = JSON.stringify(hud);
    if (key === this.hudKey) return;
    this.hudKey = key;
    this.onHud(hud);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    this.leaveNet();
    this.renderer.dispose();
    this.sfx.dispose();
  }
}

const ZERO_STATS: PlayerStats = { hits: 0, dinks: 0, lobs: 0, winners: 0, run: 0, fires: 0, bestStreak: 0, kitchen: 0 };

/** Everyone gets an award at the end, winners and runners-up alike. */
export function awardsFor(players: HudPlayer[]): Array<{ player: number; title: string; line: string }> {
  const kinds: Array<{ title: string; score: (s: PlayerStats) => number; line: (s: PlayerStats) => string }> = [
    { title: 'Fire Starter', score: (s) => s.fires * 3, line: (s) => `Caught fire ${s.fires} time${s.fires === 1 ? '' : 's'}` },
    { title: 'Closer', score: (s) => s.winners * 1.2, line: (s) => `${s.winners} winners` },
    { title: 'Streak Machine', score: (s) => (s.bestStreak >= 3 ? s.bestStreak * 2 : 0), line: (s) => `${s.bestStreak} in a row` },
    { title: 'Dink Chef', score: (s) => s.dinks * 1.1, line: (s) => `${s.dinks} soft dinks` },
    { title: 'Sky Watcher', score: (s) => s.lobs * 1.3, line: (s) => `${s.lobs} lobs` },
    { title: 'Cardio Champ', score: (s) => s.run / 250, line: (s) => `Ran ${Math.round(s.run)} feet` },
    { title: 'Workhorse', score: (s) => s.hits / 6, line: (s) => `${s.hits} shots` },
    { title: 'Kitchen Regular', score: (s) => s.kitchen * 2.5, line: (s) => `${s.kitchen} chef hat${s.kitchen === 1 ? '' : 's'}` },
  ];
  const taken = new Set<string>();
  const order = players.map((_, i) => i).sort((a, b) => players[b].stats.hits - players[a].stats.hits);
  const out: Array<{ player: number; title: string; line: string }> = [];
  for (const i of order) {
    const s = players[i].stats;
    const best = kinds.filter((k) => !taken.has(k.title)).sort((a, b) => b.score(s) - a.score(s))[0] ?? kinds[6];
    taken.add(best.title);
    out.push({ player: i, title: best.title, line: best.line(s) });
  }
  return out.sort((a, b) => a.player - b.player);
}

export type { Role };
