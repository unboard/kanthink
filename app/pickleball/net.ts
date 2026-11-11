// Pickleball — room networking over a Pusher presence channel.
//
// Host-authoritative: the room creator runs the sim and sends snapshots; the guest sends
// only its inputs. Messages are Pusher client events (browser to browser, like the
// Whisker Wilds playdates), which Pusher caps at 10 per second per connection, so every
// send goes through a small token bucket. Between snapshots the guest extrapolates the
// ball with the same physics the sim uses, so ~9 snapshots a second still looks smooth;
// a hit, bounce or point jumps the queue so the guest sees it right away.

import Pusher, { type PresenceChannel } from 'pusher-js';
import type { GameState } from './sim';
import { channelForRoom, memberId, roleOfMember, type Role } from './room';

export type NetStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface WireInput {
  mx: number;
  mz: number;
  /** count of swing presses so far; a press is any increase */
  sw: number;
}

export interface NetEvents {
  onStatus: (status: NetStatus) => void;
  onOpponent: (present: boolean) => void;
  onSnapshot: (state: GameState) => void;
  onInput: (input: WireInput) => void;
  onRematch: () => void;
  /** fatal for this room: full, missing, not configured */
  onFatal: (message: string) => void;
}

const SEND_RATE = 9; // per second, under Pusher's 10/s client-event cap
const BURST = 3;
const SNAPSHOT_EVERY = 0.105; // seconds, when nothing urgent happened

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** numbers rounded to 3 places; everything else as is. Keeps snapshots ~600 bytes. */
export function packState(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s, (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? round(v) : v)));
}

function looksLikeState(v: unknown): v is GameState {
  const s = v as GameState;
  return !!s && typeof s === 'object' && Array.isArray(s.players) && s.players.length === 2 &&
    typeof s.ball === 'object' && Array.isArray(s.scores) && typeof s.phase === 'string';
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0;
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
    // fine: reconnecting just takes a fresh seat
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
  private opponentId: string | null = null;
  private tokens = BURST;
  private lastRefill = 0;
  private lastSnapshotAt = -1;
  private lastSentKey = '';
  private pendingUrgent = false;
  private lastInputKey = '';
  private lastInputAt = 0;
  private wasConnected = false;
  private disposed = false;

  constructor(code: string, role: Role, clientId: string, events: NetEvents) {
    this.code = code;
    this.role = role;
    this.events = events;
    this.myId = memberId(role, clientId);

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) {
      setTimeout(() => events.onFatal('Online play needs the realtime service, and it is not set up here. Practice mode still works.'), 0);
      return;
    }

    events.onStatus('connecting');
    this.pusher = new Pusher(key, {
      cluster,
      forceTLS: true,
      authEndpoint: '/api/pickleball/pusher-auth',
      auth: { params: { role, client_id: clientId, name: role === 'host' ? 'Host' : 'Guest' } },
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
      const others: string[] = [];
      members.each((m) => {
        if (m.id !== this.myId) others.push(m.id);
      });
      const wanted: Role = role === 'host' ? 'guest' : 'host';
      const sameSeat = others.find((id) => roleOfMember(id) === role);
      if (sameSeat) {
        this.events.onFatal('That room is already full.');
        this.dispose();
        return;
      }
      this.opponentId = others.find((id) => roleOfMember(id) === wanted) ?? null;
      if (role === 'guest' && !this.opponentId) {
        this.events.onFatal('No one is hosting that room. Check the code and try again.');
        this.dispose();
        return;
      }
      this.events.onStatus('connected');
      this.events.onOpponent(!!this.opponentId);
    });

    ch.bind('pusher:subscription_error', (err: { status?: number; error?: string }) => {
      const status = err?.status;
      const msg = status === 403
        ? 'That room is full. Only two players fit on a singles court.'
        : status === 404
          ? 'No one is hosting that room. Check the code and try again.'
          : status === 503
            ? 'Online play needs the realtime service, and it is not set up here. Practice mode still works.'
            : 'Could not join the room. Check the code and try again.';
      this.events.onFatal(msg);
      this.dispose();
    });

    ch.bind('pusher:member_added', (m: { id: string }) => {
      const wanted: Role = role === 'host' ? 'guest' : 'host';
      if (roleOfMember(m.id) !== wanted) return;
      if (this.opponentId && this.opponentId !== m.id) return; // a seat stealer; ignore
      this.opponentId = m.id;
      this.events.onOpponent(true);
    });

    ch.bind('pusher:member_removed', (m: { id: string }) => {
      if (m.id !== this.opponentId) return;
      this.events.onOpponent(false);
      // keep opponentId: the same client reconnecting gets its seat back
    });

    // presence client events carry the sender's authenticated user id in metadata
    ch.bind('client-snap', (data: unknown, meta?: { user_id?: string }) => {
      if (role !== 'guest' || !this.fromOpponent(meta)) return;
      if (looksLikeState(data)) this.events.onSnapshot(data);
    });
    ch.bind('client-input', (data: Partial<WireInput>, meta?: { user_id?: string }) => {
      if (role !== 'host' || !this.fromOpponent(meta)) return;
      this.events.onInput({
        mx: clampInt(data?.mx, -1, 1),
        mz: clampInt(data?.mz, -1, 1),
        sw: clampInt(data?.sw, 0, 1e9),
      });
    });
    ch.bind('client-rematch', (_d: unknown, meta?: { user_id?: string }) => {
      if (this.fromOpponent(meta)) this.events.onRematch();
    });
  }

  private fromOpponent(meta?: { user_id?: string }): boolean {
    if (!meta?.user_id) return true; // older servers omit metadata; seat checks still apply
    return meta.user_id === this.opponentId;
  }

  private take(now: number): boolean {
    if (this.lastRefill === 0) this.lastRefill = now;
    this.tokens = Math.min(BURST, this.tokens + ((now - this.lastRefill) / 1000) * SEND_RATE);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private canSend(): boolean {
    return !!this.channel && this.wasConnected && !!this.opponentId && !this.disposed;
  }

  /** host: call every frame; sends when due, or right away after a hit/bounce/point */
  maybeSendSnapshot(state: GameState, now: number) {
    if (!this.canSend()) return;
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
  maybeSendInput(input: WireInput, now: number) {
    if (!this.canSend()) return;
    const key = `${input.mx}|${input.mz}|${input.sw}`;
    if (key === this.lastInputKey && now - this.lastInputAt < 500) return;
    if (!this.take(now)) return;
    this.lastInputKey = key;
    this.lastInputAt = now;
    this.channel!.trigger('client-input', input);
  }

  sendRematch() {
    if (!this.canSend()) return;
    // rare and must not be dropped: spend a token if there is one, send regardless
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
