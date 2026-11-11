// Pickleball room codes, shared by the client and the API routes.
// Four letters from an alphabet with no look-alikes (no O/0, I/L/1, S/5, B/8, Z/2, U/V…),
// so a code read aloud or typed from across the room works the first time.

export const ROOM_ALPHABET = 'ACDEFHJKMNPRTWXY';
export const ROOM_LEN = 4;
const CODE_RE = new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_LEN}}$`);

export function makeRoomCode(random: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < ROOM_LEN; i++) c += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)];
  return c;
}

export function isRoomCode(code: string): boolean {
  return CODE_RE.test(code);
}

export function normalizeRoomCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return isRoomCode(code) ? code : null;
}

export const CHANNEL_PREFIX = 'presence-pickleball-';

export function channelForRoom(code: string): string {
  return `${CHANNEL_PREFIX}${code}`;
}

export function roomFromChannel(channel: string): string | null {
  if (!channel.startsWith(CHANNEL_PREFIX)) return null;
  const code = channel.slice(CHANNEL_PREFIX.length);
  return isRoomCode(code) ? code : null;
}

export type Role = 'host' | 'guest';

/** presence member ids carry the role so the server can check seats without a database */
export function memberId(role: Role, clientId: string): string {
  return `${role === 'host' ? 'h' : 'g'}_${clientId}`;
}

export function roleOfMember(id: string): Role | null {
  return id.startsWith('h_') ? 'host' : id.startsWith('g_') ? 'guest' : null;
}

export const CLIENT_ID_RE = /^[a-zA-Z0-9]{8,24}$/;
