// Pickleball: room networking over a Pusher presence channel.
//
// Host-authoritative: the room's creator runs the lobby and the sim and sends both to
// everyone; guests send their characters once (hello) and then only their inputs.
// Messages are Pusher client events (browser to browser, like the Whisker Wilds
// playdates), which Pusher caps at 10 per second per connection, so every send goes
// through a small token bucket. Between snapshots guests extrapolate the ball with the
// same physics the sim uses, so ~9 snapshots a second still looks smooth; a hit, bounce
// or point jumps the queue so everyone sees it right away.

import Pusher, { type PresenceChannel } from 'pusher-js';
import type { BaseState } from './sport';
import { isVenue, type VenueId } from './venue';
import type { Character } from './characters';
import { sanitize } from './characters';
import type { BotTier } from './bot';
import { channelForRoom, memberId, roleOfMember, type Role } from './room';

export type NetStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface WireInput {
  seat: number;
  mx: number;
  mz: number;
  /** count of swing presses so far; a press is any increase */
  sw: number;
  /** the right-thumb shot that went with the latest press: act (0 pass, 1 jump, 2 dive, 3 hit), aim x, aim z */
  g?: [number, number, number];
}

export interface Seat {
  kind: 'human' | 'bot' | 'open';
  /** presence member id of the browser playing it; the host's own id for the host */
  owner: string | null;
  char: Character | null;
  tier: BotTier;
  /** its person dropped; a bot keeps it warm until they're back */
  away: boolean;
}

export interface Lobby {
  format: 'singles' | 'doubles';
  seats: Seat[];
  started: boolean;
  /** bumps for every new game, so guests reset */
  game: number;
  /** which game this room is playing, and where */
  sport: 'pickleball' | 'volleyball' | 'soccer';
  venue: VenueId;
}

export interface NetEvents {
  onStatus: (status: NetStatus) => void;
  /** guests currently in the room (host side), or whether the host is here (guest side) */
  onMembers: (guests: string[], hostHere: boolean) => void;
  onHello?: (from: string, chars: Character[]) => void;
  onLobby?: (lobby: Lobby) => void;
  onSnapshot?: (state: BaseState) => void;
  onInput?: (from: string, inputs: WireInput[]) => void;
  onRematch?: (from: string) => void;
  /** fatal for this room: full, missing, not configured */
  onFatal: (message: string) => void;
}

const SEND_RATE = 9; // per second, under Pusher's 10/s client-event cap
const BURST = 3;
const SNAPSHOT_EVERY = 0.105; // seconds, when nothing urgent happened

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** numbers rounded to 3 places; everything else as is. Keeps snapshots small. */
export function packState(s: BaseState): BaseState {
  return JSON.parse(JSON.stringify(s, (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? round(v) : v)));
}

function looksLikeState(v: unknown): v is BaseState {
  const s = v as BaseState;
  return !!s && typeof s === 'object' && Array.isArray(s.players) && (s.players.length === 2 || s.players.length === 4) &&
    typeof s.ball === 'object' && Array.isArray(s.scores) && typeof s.phase === 'string' && Array.isArray(s.traits);
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0;
}

export function sanitizeLobby(v: unknown): Lobby | null {
  const o = v as Lobby;
  if (!o || typeof o !== 'object' || !Array.isArray(o.seats) || (o.seats.length !== 2 && o.seats.length !== 4)) return null;
  return {
    format: o.format === 'doubles' ? 'doubles' : 'singles',
    started: Boolean(o.started),
    game: clampInt(o.game, 0, 1e9),
    sport: o.sport === 'volleyball' || o.sport === 'soccer' ? o.sport : 'pickleball',
    venue: isVenue(o.venue) ? o.venue : 'park',
    seats: o.seats.map((s) => ({
      kind: s?.kind === 'human' || s?.kind === 'bot' ? s.kind : 'open',
      owner: typeof s?.owner === 'string' ? s.owner.slice(0, 40) : null,
      char: s?.char ? sanitize(s.char) : null,
      tier: s?.tier === 'chill' || s?.tier === 'champ' ? s.tier : 'club',
      away: Boolean(s?.away),
    })),
  };
}

export function stableClientId(): string {
  const key = 'pickleball-client-id';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing && /^[a-zA-Z0-9]{8,24}$/.test(existing)) return existing;
  } catch {
    // private mode; fall through to a fresh id
  }
  const id = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join('') + 'pk';
  try {
    sessionStorage.setItem(key, id);
  } catch {
    // fine: reconnecting just takes a fresh place
  }
  return id;
}

export class RoomNet {
  readonly code: string;
  readonly role: Role;
  readonly myId: string;
  private pusher: Pusher | null = null;
  private channel: PresenceChannel | null = null;
  private events: NetEvents;
  private guests = new Set<string>();
  private hostId: string | null = null;
  private tokens = BURST;
  private lastRefill = 0;
  private lastSnapshotAt = -1;
  private lastSentKey = '';
  private pendingUrgent = false;
  private lastInputKey = '';
  private lastInputAt = 0;
  private wasConnected = false;
  private disposed = false;
  private pendingLobby: Lobby | null = null;

  constructor(code: string, role: Role, clientId: string, name: string, events: NetEvents) {
    this.code = code;
    this.role = role;
    this.events = events;
    this.myId = memberId(role, clientId);

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) {
      setTimeout(() => events.onFatal('Online play needs the realtime service, and it is not set up here. Playing here on one computer still works.'), 0);
      return;
    }

    events.onStatus('connecting');
    this.pusher = new Pusher(key, {
      cluster,
      forceTLS: true,
      authEndpoint: '/api/pickleball/pusher-auth',
      auth: { params: { role, client_id: clientId, name: name.slice(0, 16) || (role === 'host' ? 'Host' : 'Guest') } },
    });

    this.pusher.connection.bind('state_change', (st: { current: string }) => {
      if (this.disposed) return;
      if (st.current === 'connected') {
        if (this.wasConnected) this.events.onStatus('connected');
      } else if (st.current === 'connecting' || st.current === 'unavailable') {
        if (this.wasConnected) this.events.onStatus('reconnecting');
      } else if (st.current === 'failed') {
        this.events.onFatal('Your browser could not open a realtime connection.');
      }
    });

    const ch = this.pusher.subscribe(channelForRoom(code)) as PresenceChannel;
    this.channel = ch;

    ch.bind('pusher:subscription_succeeded', (members: { each: (cb: (m: { id: string }) => void) => void }) => {
      this.wasConnected = true;
      members.each((m) => {
        if (m.id === this.myId) return;
        const r = roleOfMember(m.id);
        if (r === 'host') this.hostId = m.id;
        if (r === 'guest') this.guests.add(m.id);
      });
      if (role === 'host' && this.hostId) {
        this.events.onFatal('Someone else is already hosting that room.');
        this.dispose();
        return;
      }
      if (role === 'guest' && !this.hostId) {
        this.events.onFatal('No one is hosting that room. Check the code and try again.');
        this.dispose();
        return;
      }
      this.events.onStatus('connected');
      this.emitMembers();
      if (this.pendingLobby) this.sendLobby(this.pendingLobby);
    });

    ch.bind('pusher:subscription_error', (err: { status?: number }) => {
      const status = err?.status;
      const msg = status === 403
        ? 'That room is full: four players is a whole court.'
        : status === 404
          ? 'No one is hosting that room. Check the code and try again.'
          : status === 503
            ? 'Online play needs the realtime service, and it is not set up here. Playing here on one computer still works.'
            : 'Could not join the room. Check the code and try again.';
      this.events.onFatal(msg);
      this.dispose();
    });

    ch.bind('pusher:member_added', (m: { id: string }) => {
      const r = roleOfMember(m.id);
      if (r === 'guest') this.guests.add(m.id);
      if (r === 'host') this.hostId = m.id;
      this.emitMembers();
    });
    ch.bind('pusher:member_removed', (m: { id: string }) => {
      this.guests.delete(m.id);
      if (m.id === this.hostId) this.hostId = null;
      this.emitMembers();
    });

    // presence client events carry the sender's authenticated user id in metadata
    const from = (meta?: { user_id?: string }) => meta?.user_id ?? '';
    // only the host sends snapshots and lobbies, so a guest can accept them without metadata
    const fromHost = (meta?: { user_id?: string }) => !meta?.user_id || roleOfMember(meta.user_id) === 'host';
    ch.bind('client-snap', (data: unknown, meta?: { user_id?: string }) => {
      if (role !== 'guest' || !fromHost(meta)) return;
      if (looksLikeState(data)) this.events.onSnapshot?.(data);
    });
    ch.bind('client-lobby', (data: unknown, meta?: { user_id?: string }) => {
      if (role !== 'guest' || !fromHost(meta)) return;
      const lobby = sanitizeLobby(data);
      if (lobby) this.events.onLobby?.(lobby);
    });
    ch.bind('client-hello', (data: { chars?: unknown[] }, meta?: { user_id?: string }) => {
      if (role !== 'host' || roleOfMember(from(meta)) !== 'guest') return;
      const chars = (Array.isArray(data?.chars) ? data.chars : []).slice(0, 2).map(sanitize).filter((c): c is Character => c !== null);
      if (chars.length) this.events.onHello?.(from(meta), chars);
    });
    ch.bind('client-input', (data: { i?: Partial<WireInput>[] }, meta?: { user_id?: string }) => {
      if (role !== 'host' || roleOfMember(from(meta)) !== 'guest') return;
      const list = (Array.isArray(data?.i) ? data.i : []).slice(0, 2).map((x) => ({
        seat: clampInt(x?.seat, 0, 3),
        mx: clampInt(x?.mx, -1, 1),
        mz: clampInt(x?.mz, -1, 1),
        sw: clampInt(x?.sw, 0, 1e9),
        ...(Array.isArray(x?.g) && x.g.length === 3 && x.g.every((n) => typeof n === 'number' && Number.isFinite(n))
          ? { g: [clampInt(x.g[0], 0, 3), Math.max(-1, Math.min(1, x.g[1])), Math.max(-1, Math.min(1, x.g[2]))] as [number, number, number] }
          : {}),
      }));
      this.events.onInput?.(from(meta), list);
    });
    ch.bind('client-rematch', (_d: unknown, meta?: { user_id?: string }) => {
      if (role === 'host' && roleOfMember(from(meta)) === 'guest') this.events.onRematch?.(from(meta));
    });
  }

  private emitMembers() {
    this.events.onMembers([...this.guests], this.role === 'host' || !!this.hostId);
  }

  private take(now: number): boolean {
    if (this.lastRefill === 0) this.lastRefill = now;
    this.tokens = Math.min(BURST, this.tokens + ((now - this.lastRefill) / 1000) * SEND_RATE);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private ready(): boolean {
    return !!this.channel && this.wasConnected && !this.disposed;
  }

  private hasAudience(): boolean {
    return this.role === 'host' ? this.guests.size > 0 : !!this.hostId;
  }

  /** guest: who I am and who I'm bringing */
  sendHello(chars: Character[]) {
    if (!this.ready()) return;
    this.take(performance.now());
    this.channel!.trigger('client-hello', { chars: chars.slice(0, 2) });
  }

  /** host: the lobby, whenever it changes (rare; never dropped) */
  sendLobby(lobby: Lobby) {
    if (!this.ready()) { this.pendingLobby = lobby; return; }
    this.pendingLobby = null;
    if (!this.hasAudience()) return;
    this.take(performance.now());
    this.channel!.trigger('client-lobby', lobby);
  }

  /** host: call every frame; sends when due, or right away after a hit/bounce/point */
  maybeSendSnapshot(state: BaseState, now: number) {
    if (!this.ready() || !this.hasAudience()) return;
    const key = `${state.hitSeq}|${state.bounceSeq}|${state.pointSeq}|${state.phase}`;
    if (key !== this.lastSentKey) this.pendingUrgent = true;
    const due = this.lastSnapshotAt < 0 || (now - this.lastSnapshotAt) / 1000 >= SNAPSHOT_EVERY;
    if (!this.pendingUrgent && !due) return;
    if (!this.take(now)) return;
    this.lastSnapshotAt = now;
    this.lastSentKey = key;
    this.pendingUrgent = false;
    this.channel!.trigger('client-snap', packState(state));
  }

  /** guest: call every frame; sends on change, with a slow heartbeat */
  maybeSendInput(inputs: WireInput[], now: number) {
    if (!this.ready() || !this.hasAudience() || !inputs.length) return;
    const key = inputs.map((i) => `${i.seat}:${i.mx}|${i.mz}|${i.sw}|${i.g?.join('/') ?? ''}`).join(',');
    if (key === this.lastInputKey && now - this.lastInputAt < 500) return;
    if (!this.take(now)) return;
    this.lastInputKey = key;
    this.lastInputAt = now;
    this.channel!.trigger('client-input', { i: inputs });
  }

  sendRematch() {
    if (!this.ready()) return;
    this.take(performance.now());
    this.channel!.trigger('client-rematch', {});
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pusher) {
      this.pusher.unsubscribe(channelForRoom(this.code));
      this.pusher.disconnect();
      this.pusher = null;
    }
    this.channel = null;
  }
}
