// Pickleball — the game loop. Owns the renderer, the keyboard, the fixed-step sim (when
// this browser is the authority) and the guest's prediction (when it is not). React only
// sees the compact Hud it emits.

import { botInput } from './bot';
import { Sfx } from './audio';
import { CourtRenderer } from './render';
import { RoomNet, stableClientId, type NetStatus, type WireInput } from './net';
import {
  DT, IDLE, SWING_TOTAL, cloneState, createGame, movePlayer, rematch, serveCourtSign,
  serveFromRight, stepBall, step, type GameState, type Player, type PlayerInput, type PointResult, type Side,
} from './sim';
import type { Role } from './room';

export type Mode = 'attract' | 'practice' | 'host' | 'guest';
export type LinkStatus = 'local' | NetStatus;

export interface Hud {
  mode: Mode;
  localSide: Side;
  phase: GameState['phase'];
  scores: [number, number];
  server: Side;
  serveRight: boolean;
  lastPoint: PointResult | null;
  pointSeq: number;
  winner: Side | -1;
  status: LinkStatus;
  opponentPresent: boolean;
  /** has an opponent ever joined this room (host) */
  everJoined: boolean;
  rematch: { me: boolean; them: boolean };
  roomCode: string | null;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

function newSeed(): number {
  // only used to pick a game's seed; the sim itself never touches Math.random
  return (Math.random() * 4294967296) >>> 0;
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
  private localSide: Side = 0;
  private state: GameState = createGame(newSeed());
  private view: GameState = this.state;

  // keyboard
  private held = new Set<string>();
  private swingLatched = false;
  private swingCount = 0;

  // networking
  private net: RoomNet | null = null;
  private status: LinkStatus = 'local';
  private opponentPresent = false;
  private everJoined = false;
  private remoteInput: PlayerInput = { ...IDLE };
  private remoteSw = -1;
  private remoteSwingLatched = false;
  private votes = { me: false, them: false };

  // guest prediction
  private snapAt = 0;
  private own: Player | null = null;
  private ownSwingT = -1;
  private snapOwn: Player | null = null;

  // sounds
  private heard = { hit: 0, bounce: 0, point: 0 };
  private hudKey = '';

  constructor(container: HTMLElement, onHud: (h: Hud) => void, onFatal: (msg: string) => void) {
    this.renderer = new CourtRenderer(container);
    this.onHud = onHud;
    this.onFatal = onFatal;
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    this.syncHeard(this.state);
    this.raf = requestAnimationFrame(this.frame);
  }

  // ————— modes —————

  startAttract() {
    this.leaveNet();
    this.mode = 'attract';
    this.localSide = 0;
    this.state = createGame(newSeed());
    this.view = this.state;
    this.syncHeard(this.state);
  }

  startPractice() {
    this.leaveNet();
    this.mode = 'practice';
    this.localSide = 0;
    this.state = createGame(newSeed(), 0);
    this.view = this.state;
    this.syncHeard(this.state);
    this.sfx.unlock();
  }

  startOnline(role: Role, code: string) {
    this.leaveNet();
    this.sfx.unlock();
    this.mode = role;
    this.localSide = role === 'host' ? 0 : 1;
    this.state = createGame(newSeed(), 0);
    this.view = this.state;
    this.syncHeard(this.state);
    this.opponentPresent = false;
    this.everJoined = false;
    this.votes = { me: false, them: false };
    this.own = null;
    this.snapOwn = null;
    this.status = 'connecting';
    this.net = new RoomNet(code, role, stableClientId(), {
      onStatus: (s) => { this.status = s; },
      onOpponent: (present) => {
        this.opponentPresent = present;
        if (!present) this.remoteInput = { ...IDLE };
        if (present && role === 'host' && !this.everJoined) {
          // first arrival: a fresh game, host serves first
          this.state = createGame(newSeed(), 0);
          this.syncHeard(this.state);
          this.remoteSw = -1;
        }
        if (present) this.everJoined = true;
      },
      onSnapshot: (s) => this.receiveSnapshot(s),
      onInput: (i) => this.receiveInput(i),
      onRematch: () => {
        this.votes.them = true;
        this.tryRematch();
      },
      onFatal: (msg) => {
        this.startAttract();
        this.onFatal(msg);
      },
    });
  }

  requestRematch() {
    if (this.mode === 'practice') {
      this.state = rematch(this.state, newSeed());
      this.syncHeard(this.state);
      return;
    }
    if (!this.net) return;
    this.votes.me = true;
    this.net.sendRematch();
    this.tryRematch();
  }

  private tryRematch() {
    if (this.mode !== 'host' || !this.votes.me || !this.votes.them) return;
    if (this.state.phase !== 'over') return;
    this.state = rematch(this.state, newSeed());
    this.votes = { me: false, them: false };
    this.syncHeard(this.state);
  }

  private leaveNet() {
    this.net?.dispose();
    this.net = null;
    this.status = 'local';
    this.opponentPresent = false;
    this.everJoined = false;
  }

  // ————— input —————

  private typing(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private keyDown = (e: KeyboardEvent) => {
    if (this.mode === 'attract' || this.typing(e)) return;
    if (MOVE_KEYS[e.code] || e.code === 'Space') e.preventDefault();
    this.sfx.unlock();
    if (e.code === 'Space' && !e.repeat) {
      this.swingLatched = true;
      this.swingCount += 1;
      if (this.mode === 'guest' && this.ownSwingT < 0) this.ownSwingT = 0;
    }
    this.held.add(e.code);
  };

  private keyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private blur = () => {
    this.held.clear();
  };

  private localInput(): PlayerInput {
    let mx = 0;
    let mz = 0;
    for (const k of this.held) {
      const m = MOVE_KEYS[k];
      if (m) {
        mx += m[0];
        mz += m[1];
      }
    }
    return { mx: Math.max(-1, Math.min(1, mx)), mz: Math.max(-1, Math.min(1, mz)), swing: this.swingLatched };
  }

  private receiveInput(i: WireInput) {
    this.remoteInput = { mx: i.mx, mz: i.mz, swing: false };
    if (this.remoteSw >= 0 && i.sw > this.remoteSw) this.remoteSwingLatched = true;
    this.remoteSw = i.sw;
  }

  // ————— guest —————

  private receiveSnapshot(s: GameState) {
    const me = this.localSide;
    const prevPhase = this.view.phase;
    const prevPoint = this.view.pointSeq;
    this.snapAt = performance.now();
    this.snapOwn = { ...s.players[me] };
    this.view = cloneState(s);
    if (this.votes.me || this.votes.them) {
      if (s.phase !== 'over') this.votes = { me: false, them: false };
    }
    const reset = !this.own || (s.phase === 'serve' && (prevPhase !== 'serve' || prevPoint !== s.pointSeq));
    if (reset) {
      this.own = { ...s.players[me] };
    } else if (this.own) {
      const err = Math.hypot(s.players[me].x - this.own.x, s.players[me].z - this.own.z);
      if (err > 4.5) this.own = { ...s.players[me] };
    }
    this.applyOwn();
  }

  private applyOwn() {
    if (!this.own) return;
    this.view.players[this.localSide] = { ...this.own, swingT: this.ownSwingT };
  }

  private guestStep(input: PlayerInput) {
    const v = this.view;
    const me = this.localSide;
    const opp: Side = me === 0 ? 1 : 0;
    v.phaseTicks += 1;
    if (this.own) {
      movePlayer(this.own, me, input, v.phase, v.server === me, serveCourtSign(v, me));
      // standing still, both sides agree on where you are; drift back toward the host's copy
      if (input.mx === 0 && input.mz === 0 && this.snapOwn) {
        this.own.x += (this.snapOwn.x - this.own.x) * 0.04;
        this.own.z += (this.snapOwn.z - this.own.z) * 0.04;
      }
    }
    if (this.ownSwingT >= 0) {
      this.ownSwingT += 1;
      if (this.ownSwingT > SWING_TOTAL) this.ownSwingT = -1;
    }
    const age = (performance.now() - this.snapAt) / 1000;
    if (age < 0.3) {
      const o = v.players[opp];
      o.x += o.vx * DT;
      o.z += o.vz * DT;
      if (o.swingT >= 0 && o.swingT < SWING_TOTAL) o.swingT += 1;
    }
    if (v.phase === 'serve') {
      const sp = v.players[v.server];
      const s = v.server === 0 ? 1 : -1;
      v.ball = { x: sp.x + s * 1.1, y: 1.6, z: sp.z - s * 0.9, vx: 0, vy: 0, vz: 0 };
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

    if (this.mode === 'guest') {
      const input = this.localInput();
      this.net?.maybeSendInput({ mx: input.mx, mz: input.mz, sw: this.swingCount }, now);
      this.swingLatched = false;
      const live = this.opponentPresent && this.status === 'connected';
      if (live) {
        this.acc += dt;
        while (this.acc >= DT) {
          this.guestStep({ ...input, swing: false });
          this.acc -= DT;
        }
      } else {
        this.acc = 0;
      }
    } else {
      const live = this.mode !== 'host' || (this.opponentPresent && this.status === 'connected');
      if (live) {
        this.acc += dt;
        while (this.acc >= DT) {
          this.state = step(this.state, this.inputsFor(this.state));
          this.acc -= DT;
          if (this.mode === 'attract' && this.state.phase === 'over' && this.state.phaseTicks > 240) {
            this.state = createGame(newSeed());
          }
        }
      } else {
        this.acc = 0;
      }
      this.view = this.state;
      if (this.mode === 'host') this.net?.maybeSendSnapshot(this.state, now);
    }

    this.playSounds(this.view);
    const showServeTarget = this.mode !== 'attract' && this.view.server === this.localSide;
    this.renderer.render(this.view, { side: this.localSide, showServeTarget }, dt);
    this.emitHud();
  };

  private inputsFor(s: GameState): [PlayerInput, PlayerInput] {
    if (this.mode === 'attract') return [botInput(s, 0), botInput(s, 1)];
    const local = this.localInput();
    this.swingLatched = false; // a press is consumed by exactly one step
    if (this.mode === 'practice') return [local, botInput(s, 1)];
    const remote: PlayerInput = { ...this.remoteInput, swing: this.remoteSwingLatched };
    this.remoteSwingLatched = false;
    return [local, remote];
  }

  private syncHeard(s: GameState) {
    this.heard = { hit: s.hitSeq, bounce: s.bounceSeq, point: s.pointSeq };
  }

  private playSounds(s: GameState) {
    if (this.mode === 'attract') {
      this.syncHeard(s);
      return;
    }
    if (s.hitSeq > this.heard.hit) this.sfx.hit();
    if (s.bounceSeq > this.heard.bounce && s.phase === 'rally') this.sfx.bounce();
    if (s.pointSeq > this.heard.point && s.lastPoint) {
      const p = s.lastPoint;
      this.sfx.point(p.faultBy !== this.localSide);
    }
    this.syncHeard(s);
  }

  private emitHud() {
    const s = this.view;
    const hud: Hud = {
      mode: this.mode,
      localSide: this.localSide,
      phase: s.phase,
      scores: [s.scores[0], s.scores[1]],
      server: s.server,
      serveRight: serveFromRight(s),
      lastPoint: s.lastPoint,
      pointSeq: s.pointSeq,
      winner: s.winner,
      status: this.status,
      opponentPresent: this.opponentPresent,
      everJoined: this.everJoined,
      rematch: { ...this.votes },
      roomCode: this.net?.code ?? null,
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
