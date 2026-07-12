// Whisker Wilds — playdate networking over Pusher presence channels.
// Position/action state flows browser-to-browser via client events (~5Hz);
// the receiving game interpolates, so cats look smooth on both tablets.

import Pusher, { type PresenceChannel } from 'pusher-js';
import type { CatAction, CatSpec } from './types';

export interface RemoteState {
  x: number;
  z: number;
  y: number;
  h: number;      // heading
  a: CatAction;
  s: number;      // move speed (drives gait on the remote side)
}

export interface PlaydateMember {
  id: string;
  name: string;
  color: string;
}

export interface NetEvents {
  onMembers: (members: PlaydateMember[]) => void;
  onJoin: (m: PlaydateMember) => void;
  onLeave: (m: PlaydateMember) => void;
  onSpec: (memberId: string, spec: CatSpec, kittens: CatSpec[]) => void;
  onState: (memberId: string, s: RemoteState) => void;
  onMeow: (memberId: string, pitch: number) => void;
  onYarnCollect: (memberId: string, yarnId: string) => void;
  onError: (msg: string) => void;
  onConnected: () => void;
}

/** kid-friendly room codes like PURR42 */
export function makeRoomCode(): string {
  const words = ['PURR', 'MEOW', 'PAWS', 'FLUF', 'WISK', 'TAIL', 'NAPS', 'YARN'];
  const w = words[(Math.random() * words.length) | 0];
  return `${w}${10 + ((Math.random() * 90) | 0)}`;
}

export function normalizeRoomCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : null;
}

/** deterministic world seed from the room code — same island on every tablet */
export function seedFromCode(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class PlaydateNet {
  readonly code: string;
  readonly playerId: string;
  private pusher: Pusher | null = null;
  private channel: PresenceChannel | null = null;
  private events: NetEvents;
  private lastSend = 0;
  private lastState = '';
  private members = new Map<string, PlaydateMember>();
  connected = false;

  constructor(code: string, catName: string, saveId: string, events: NetEvents) {
    this.code = code;
    this.events = events;
    // stable-ish anonymous id per device save
    this.playerId = `p_${saveId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}_${Math.random().toString(36).slice(2, 8)}`;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) {
      setTimeout(() => events.onError('Playdates need the realtime service — it looks like it is not set up.'), 0);
      return;
    }

    this.pusher = new Pusher(key, {
      cluster,
      forceTLS: true,
      authEndpoint: '/api/catlife/pusher-auth',
      auth: { params: { cat_name: catName, player_id: this.playerId } },
    });

    const channelName = `presence-playdate-${code}`;
    this.channel = this.pusher.subscribe(channelName) as PresenceChannel;

    this.channel.bind('pusher:subscription_succeeded', (members: { each: (cb: (m: { id: string; info: { name: string; color: string } }) => void) => void; me: { id: string } }) => {
      this.connected = true;
      this.members.clear();
      members.each((m) => {
        if (m.id !== this.playerId) {
          this.members.set(m.id, { id: m.id, name: m.info.name, color: m.info.color });
        }
      });
      this.events.onConnected();
      this.events.onMembers([...this.members.values()]);
    });

    this.channel.bind('pusher:subscription_error', () => {
      this.events.onError('Could not join the playdate — check the code and try again!');
    });

    this.channel.bind('pusher:member_added', (m: { id: string; info: { name: string; color: string } }) => {
      if (m.id === this.playerId) return;
      const member = { id: m.id, name: m.info.name, color: m.info.color };
      this.members.set(m.id, member);
      this.events.onJoin(member);
      this.events.onMembers([...this.members.values()]);
    });

    this.channel.bind('pusher:member_removed', (m: { id: string }) => {
      const member = this.members.get(m.id);
      this.members.delete(m.id);
      if (member) this.events.onLeave(member);
      this.events.onMembers([...this.members.values()]);
    });

    this.channel.bind('client-spec', (data: { from: string; spec: CatSpec; kittens: CatSpec[] }) => {
      if (data.from === this.playerId) return;
      this.events.onSpec(data.from, data.spec, data.kittens ?? []);
    });

    this.channel.bind('client-state', (data: { from: string } & RemoteState) => {
      if (data.from === this.playerId) return;
      this.events.onState(data.from, data);
    });

    this.channel.bind('client-meow', (data: { from: string; pitch: number }) => {
      if (data.from === this.playerId) return;
      this.events.onMeow(data.from, data.pitch);
    });

    this.channel.bind('client-yarn', (data: { from: string; yarnId: string }) => {
      if (data.from === this.playerId) return;
      this.events.onYarnCollect(data.from, data.yarnId);
    });
  }

  /** send position/action; throttled + deduped to stay well under rate limits */
  sendState(s: RemoteState) {
    if (!this.channel || !this.connected || this.members.size === 0) return;
    const now = performance.now();
    if (now - this.lastSend < 180) return;
    const key = `${s.x.toFixed(1)}|${s.z.toFixed(1)}|${s.a}|${s.h.toFixed(1)}`;
    if (key === this.lastState && now - this.lastSend < 1500) return; // idle: heartbeat only
    this.lastSend = now;
    this.lastState = key;
    this.channel.trigger('client-state', { from: this.playerId, ...s });
  }

  sendSpec(spec: CatSpec, kittens: CatSpec[]) {
    if (!this.channel || !this.connected) return;
    this.channel.trigger('client-spec', { from: this.playerId, spec, kittens: kittens.slice(0, 2) });
  }

  sendMeow(pitch: number) {
    if (!this.channel || !this.connected) return;
    this.channel.trigger('client-meow', { from: this.playerId, pitch });
  }

  sendYarnCollect(yarnId: string) {
    if (!this.channel || !this.connected) return;
    this.channel.trigger('client-yarn', { from: this.playerId, yarnId });
  }

  getMembers(): PlaydateMember[] {
    return [...this.members.values()];
  }

  dispose() {
    if (this.pusher) {
      this.pusher.unsubscribe(`presence-playdate-${this.code}`);
      this.pusher.disconnect();
      this.pusher = null;
    }
    this.channel = null;
    this.connected = false;
  }
}
