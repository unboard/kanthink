// Pickleball: characters. Everyone plays as themselves.
//
// A character is a handful of choices (from the Gemini 4 Neon design pass), small enough
// to send to every screen in the room, and drawn entirely in code: a 2D portrait here for
// menus and the scoreboard, and a big-headed 3D figure in render.ts. Saved per browser in
// localStorage; nothing is uploaded.

import { STYLE_TRAITS, type PlayStyle, type Traits } from './sim';

export type HeightTier = 'kid' | 'youth' | 'adult' | 'tall';
export type HairStyle = 'crop' | 'spiky' | 'buzz' | 'bob' | 'ponytail' | 'pigtails' | 'long' | 'afro' | 'sidepart' | 'bald';
export type Face = 'grin' | 'focused' | 'sparkle' | 'wink' | 'tongue' | 'smirk';
export type FacialHair = 'none' | 'stubble' | 'beard' | 'mustache';
export type Accessory = 'none' | 'glasses' | 'shades' | 'sweatband' | 'visor' | 'cap' | 'clips';
export type Outfit = 'tee' | 'polo-skirt' | 'tank' | 'hoodie';

export interface Character {
  id: string;
  name: string;
  height: HeightTier;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  face: Face;
  facialHair: FacialHair;
  accessory: Accessory;
  outfit: Outfit;
  primary: string;
  accent: string;
  number: number;
  paddle: string;
  style: PlayStyle;
  /** what they do when they win a rally; picked for them from their name when unset */
  victory?: Victory;
}

export type Victory = 'pump' | 'flex' | 'dance' | 'spin' | 'robot' | 'jump';
export const VICTORY_LABEL: Record<Victory, string> = { pump: 'Fist pump', flex: 'Flex', dance: 'Dance', spin: 'Spin', robot: 'Robot', jump: 'Jump for joy' };
/** how a face looks right now, on top of the character's usual expression */
export type Mood = 'play' | 'blink' | 'effort' | 'joy' | 'sad' | 'ouch';

export function victoryOf(c: Pick<Character, 'victory' | 'name' | 'number'>): Victory {
  if (c.victory) return c.victory;
  const all = Object.keys(VICTORY_LABEL) as Victory[];
  let h = c.number;
  for (const ch of c.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return all[h % all.length];
}

export const HEIGHT_SCALE: Record<HeightTier, number> = { kid: 0.82, youth: 0.91, adult: 1, tall: 1.08 };
export const SKINS = ['#FDE2C8', '#F4C7A1', '#E0A87E', '#C68658', '#9E623D', '#75452A', '#522E1C', '#381F14'];
export const HAIR_COLORS = ['#1D1E22', '#3B271C', '#6E4427', '#D9A754', '#EFE8D4', '#C4562B', '#F466A6', '#2B9BF4', '#42D6A4', '#B5BDC4'];
export const OUTFIT_COLORS = ['#FF5A5F', '#1D3557', '#F4C430', '#7B2CBF', '#42D6A4', '#2B9BF4', '#8AC926', '#F466A6', '#FFD166', '#FFFFFF', '#1F2630', '#FF8C42'];
export const PADDLE_COLORS = ['#00B4D8', '#FF5A5F', '#F4C430', '#7B2CBF', '#8AC926', '#F466A6', '#1F2630', '#FF8C42', '#FFFFFF', '#42D6A4', '#2B9BF4', '#C4562B'];

export const HAIR_LABEL: Record<HairStyle, string> = {
  crop: 'Short crop', spiky: 'Spiky', buzz: 'Buzz', bob: 'Bob', ponytail: 'Ponytail', pigtails: 'Pigtails',
  long: 'Long', afro: 'Curly', sidepart: 'Side part', bald: 'Bald',
};
export const FACE_LABEL: Record<Face, string> = { grin: 'Grin', focused: 'Focused', sparkle: 'Sparkle', wink: 'Wink', tongue: 'Goofy', smirk: 'Cool' };
export const FACIAL_LABEL: Record<FacialHair, string> = { none: 'None', stubble: 'Stubble', beard: 'Beard', mustache: 'Mustache' };
export const ACCESSORY_LABEL: Record<Accessory, string> = { none: 'None', glasses: 'Glasses', shades: 'Shades', sweatband: 'Sweatband', visor: 'Visor', cap: 'Cap', clips: 'Star clips' };
export const OUTFIT_LABEL: Record<Outfit, string> = { tee: 'Tee & shorts', 'polo-skirt': 'Polo & skirt', tank: 'Tank & joggers', hoodie: 'Hoodie & shorts' };
export const HEIGHT_LABEL: Record<HeightTier, string> = { kid: 'Kid', youth: 'Youth', adult: 'Adult', tall: 'Tall' };
export const STYLE_LABEL: Record<PlayStyle, { name: string; blurb: string }> = {
  pro: { name: 'Pro Control', blurb: 'Pure physics. Every shot is yours.' },
  arcade: { name: 'Arcade Flow', blurb: 'Longer reach, kinder timing, wild shots pull back in.' },
  turbo: { name: 'Turbo Fun', blurb: 'Huge reach, waits for the bounce for you, shots stay in.' },
};

/** Four starting points to tweak, not finished people. */
export const PRESETS: Array<{ label: string; c: Omit<Character, 'id' | 'name'> }> = [
  { label: 'Court Captain', c: { height: 'adult', skin: '#E0A87E', hair: 'crop', hairColor: '#3B271C', face: 'grin', facialHair: 'beard', accessory: 'visor', outfit: 'polo-skirt', primary: '#1D3557', accent: '#F4C430', number: 1, paddle: '#00B4D8', style: 'pro' } },
  { label: 'Baseline Ace', c: { height: 'adult', skin: '#F4C7A1', hair: 'ponytail', hairColor: '#6E4427', face: 'smirk', facialHair: 'none', accessory: 'shades', outfit: 'tank', primary: '#7B2CBF', accent: '#42D6A4', number: 20, paddle: '#F466A6', style: 'pro' } },
  { label: 'Turbo Kid', c: { height: 'youth', skin: '#F4C7A1', hair: 'sidepart', hairColor: '#D9A754', face: 'tongue', facialHair: 'none', accessory: 'sweatband', outfit: 'hoodie', primary: '#2B9BF4', accent: '#8AC926', number: 9, paddle: '#8AC926', style: 'arcade' } },
  { label: 'Sparkle Smash', c: { height: 'kid', skin: '#FDE2C8', hair: 'pigtails', hairColor: '#C4562B', face: 'sparkle', facialHair: 'none', accessory: 'clips', outfit: 'tee', primary: '#F466A6', accent: '#FFD166', number: 7, paddle: '#F4C430', style: 'turbo' } },
];

/** Polo & skirt reads as a skirt; for a dad in a polo, the preset shows shorts. */
export function wearsSkirt(c: Character): boolean {
  return c.outfit === 'polo-skirt' && c.facialHair === 'none';
}

function newId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('');
}

export function makeCharacter(name: string, preset = 0): Character {
  return { id: newId(), name: name.slice(0, 12), ...PRESETS[preset % PRESETS.length].c };
}

export function randomCharacter(name = 'Player'): Character {
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
  return {
    id: newId(), name,
    height: pick(['kid', 'youth', 'adult', 'tall'] as const),
    skin: pick(SKINS), hair: pick(Object.keys(HAIR_LABEL) as HairStyle[]), hairColor: pick(HAIR_COLORS),
    face: pick(Object.keys(FACE_LABEL) as Face[]), facialHair: Math.random() < 0.75 ? 'none' : pick(['stubble', 'beard', 'mustache'] as const),
    accessory: pick(Object.keys(ACCESSORY_LABEL) as Accessory[]), outfit: pick(Object.keys(OUTFIT_LABEL) as Outfit[]),
    primary: pick(OUTFIT_COLORS), accent: pick(OUTFIT_COLORS), number: Math.floor(Math.random() * 100), paddle: pick(PADDLE_COLORS),
    style: pick(['pro', 'arcade', 'turbo'] as const),
  };
}

export function traitsOf(c: Pick<Character, 'style'> | null | undefined): Traits {
  return STYLE_TRAITS[c?.style ?? 'pro'] ?? STYLE_TRAITS.pro;
}

// ————— bots get characters too —————

export const BOT_NAMES = ['Dinky', 'Lobster', 'Spinny', 'Volley', 'Pickles', 'Kitchen', 'Zippy', 'Ace'];

export function botCharacter(seat: number, names: string[] = BOT_NAMES): Character {
  const base = PRESETS[(seat + 1) % PRESETS.length].c;
  return {
    ...base, id: `bot${seat}`, name: names[seat % names.length], style: 'arcade', facialHair: 'none',
    hair: (['spiky', 'afro', 'bob', 'buzz'] as const)[seat % 4], hairColor: HAIR_COLORS[(seat * 3 + 2) % HAIR_COLORS.length],
    skin: SKINS[(seat * 3 + 1) % SKINS.length], primary: OUTFIT_COLORS[(seat * 5 + 3) % OUTFIT_COLORS.length], accessory: 'none', face: 'focused',
  };
}

// ————— storage —————

const KEY = 'pb_family_roster_v1';
const LAST = 'pb_last_picked_v1';

export function loadRoster(): Character[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown[];
    return raw.map(sanitize).filter((c): c is Character => c !== null);
  } catch {
    return [];
  }
}

export function saveRoster(list: Character[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 24))); } catch { /* storage blocked */ }
}

export function loadLastPicked(): string[] {
  try { return (JSON.parse(localStorage.getItem(LAST) || '[]') as string[]).filter((x) => typeof x === 'string'); } catch { return []; }
}
export function saveLastPicked(ids: string[]) {
  try { localStorage.setItem(LAST, JSON.stringify(ids)); } catch { /* storage blocked */ }
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);

/** Anything from storage or the network goes through here before it's drawn. */
export function sanitize(v: unknown): Character | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const color = (x: unknown, d: string) => (typeof x === 'string' && HEX.test(x) ? x : d);
  const name = typeof o.name === 'string' ? o.name.replace(/[^\p{L}\p{N} '.-]/gu, '').trim().slice(0, 12) : '';
  return {
    id: typeof o.id === 'string' && /^[a-z0-9]{1,16}$/.test(o.id) ? o.id : newId(),
    name: name || 'Player',
    height: oneOf(o.height, ['kid', 'youth', 'adult', 'tall'] as const, 'adult'),
    skin: color(o.skin, SKINS[2]),
    hair: oneOf(o.hair, Object.keys(HAIR_LABEL) as HairStyle[], 'crop'),
    hairColor: color(o.hairColor, HAIR_COLORS[1]),
    face: oneOf(o.face, Object.keys(FACE_LABEL) as Face[], 'grin'),
    facialHair: oneOf(o.facialHair, Object.keys(FACIAL_LABEL) as FacialHair[], 'none'),
    accessory: oneOf(o.accessory, Object.keys(ACCESSORY_LABEL) as Accessory[], 'none'),
    outfit: oneOf(o.outfit, Object.keys(OUTFIT_LABEL) as Outfit[], 'tee'),
    primary: color(o.primary, OUTFIT_COLORS[0]),
    accent: color(o.accent, OUTFIT_COLORS[9]),
    number: Math.max(0, Math.min(99, Math.round(Number(o.number) || 0))),
    paddle: color(o.paddle, PADDLE_COLORS[0]),
    style: oneOf(o.style, ['pro', 'arcade', 'turbo'] as const, 'pro'),
    ...(typeof o.victory === 'string' && o.victory in VICTORY_LABEL ? { victory: o.victory as Victory } : {}),
  };
}

// ————— drawing a face (shared by the portrait and the 3D head texture) —————

/** Draw a face looking out of a circle of radius r centered at (cx, cy). */
export function drawFace(g: CanvasRenderingContext2D, c0: Character, cx: number, cy: number, r: number, mood: Mood = 'play') {
  // a mood borrows the nearest of the drawn expressions, then changes the eyes and mouth
  const c: Character = mood === 'effort' ? { ...c0, face: 'focused' } : mood === 'joy' ? { ...c0, face: 'grin' } : c0;
  const ink = '#1b1b22';
  const lw = Math.max(2, r * 0.07);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = lw;
  const ex = r * 0.34;
  const ey = cy - r * 0.08;
  const eye = (x: number, kind: 'dot' | 'closed' | 'sparkle' | 'focused') => {
    if (kind === 'closed') {
      g.beginPath();
      g.arc(x, ey + r * 0.03, r * 0.1, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      return;
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(x, ey, r * 0.13, r * 0.16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = ink;
    g.beginPath();
    g.ellipse(x + r * 0.02, ey + r * 0.02, r * 0.08, r * 0.1, 0, 0, Math.PI * 2);
    g.fill();
    if (kind === 'sparkle') {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x + r * 0.05, ey - r * 0.03, r * 0.035, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x - r * 0.02, ey + r * 0.05, r * 0.018, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = ink;
  };
  const left = cx - ex;
  const right = cx + ex;
  if (mood === 'blink') {
    eye(left, 'closed');
    eye(right, 'closed');
  } else if (mood === 'joy') {
    // squeezed shut and smiling
    for (const x of [left, right]) {
      g.beginPath();
      g.arc(x, ey + r * 0.06, r * 0.12, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
  } else if (mood === 'ouch') {
    // seeing stars
    g.lineWidth = lw * 0.9;
    for (const x of [left, right]) {
      g.beginPath();
      g.moveTo(x - r * 0.11, ey - r * 0.11);
      g.lineTo(x + r * 0.11, ey + r * 0.11);
      g.moveTo(x + r * 0.11, ey - r * 0.11);
      g.lineTo(x - r * 0.11, ey + r * 0.11);
      g.stroke();
    }
    g.lineWidth = lw;
  } else {
    eye(left, c.face === 'sparkle' ? 'sparkle' : 'dot');
    eye(right, c.face === 'wink' ? 'closed' : c.face === 'sparkle' ? 'sparkle' : 'dot');
  }
  // brows
  g.lineWidth = lw * 0.9;
  const brow = (x: number, tilt: number) => {
    g.beginPath();
    g.moveTo(x - r * 0.13, ey - r * 0.25 + tilt);
    g.lineTo(x + r * 0.13, ey - r * 0.25 - tilt);
    g.stroke();
  };
  const tilt = mood === 'sad' || mood === 'ouch' ? -r * 0.09 : mood === 'effort' ? r * 0.09 : c.face === 'focused' ? r * 0.06 : c.face === 'smirk' ? r * 0.03 : -r * 0.02;
  brow(left, -tilt);
  brow(right, tilt);
  // cheeks
  g.fillStyle = 'rgba(255, 110, 120, 0.28)';
  g.beginPath();
  g.ellipse(cx - r * 0.5, cy + r * 0.17, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
  g.ellipse(cx + r * 0.5, cy + r * 0.17, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = ink;
  // mouth
  const my = cy + r * 0.32;
  g.lineWidth = lw;
  if (mood === 'sad') {
    g.beginPath();
    g.arc(cx, my + r * 0.2, r * 0.2, 1.15 * Math.PI, 1.85 * Math.PI);
    g.stroke();
  } else if (mood === 'ouch') {
    g.beginPath();
    g.moveTo(cx - r * 0.24, my + r * 0.05);
    for (let k = 1; k <= 6; k++) g.lineTo(cx - r * 0.24 + (k / 6) * r * 0.48, my + r * 0.05 + (k % 2 ? -1 : 1) * r * 0.05);
    g.stroke();
  } else if (mood === 'effort') {
    // gritted teeth
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(cx - r * 0.22, my - r * 0.06, r * 0.44, r * 0.18, r * 0.05);
    g.fill();
    g.stroke();
    g.lineWidth = lw * 0.5;
    g.beginPath();
    for (const k of [-0.11, 0, 0.11]) { g.moveTo(cx + r * k, my - r * 0.06); g.lineTo(cx + r * k, my + r * 0.12); }
    g.stroke();
    g.lineWidth = lw;
  } else if (c.face === 'grin' || c.face === 'sparkle') {
    g.beginPath();
    g.moveTo(cx - r * 0.26, my - r * 0.04);
    g.quadraticCurveTo(cx, my + r * 0.3, cx + r * 0.26, my - r * 0.04);
    g.closePath();
    g.fillStyle = '#5a1f24';
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fillRect(cx - r * 0.18, my - r * 0.03, r * 0.36, r * 0.07);
  } else if (c.face === 'tongue') {
    g.beginPath();
    g.arc(cx, my - r * 0.02, r * 0.2, 0.1 * Math.PI, 0.9 * Math.PI);
    g.stroke();
    g.fillStyle = '#ff7a8a';
    g.beginPath();
    g.ellipse(cx + r * 0.05, my + r * 0.16, r * 0.09, r * 0.11, 0, 0, Math.PI * 2);
    g.fill();
  } else if (c.face === 'smirk') {
    g.beginPath();
    g.moveTo(cx - r * 0.18, my + r * 0.04);
    g.quadraticCurveTo(cx + r * 0.05, my + r * 0.1, cx + r * 0.24, my - r * 0.06);
    g.stroke();
  } else if (c.face === 'focused') {
    g.beginPath();
    g.moveTo(cx - r * 0.16, my + r * 0.04);
    g.lineTo(cx + r * 0.16, my + r * 0.04);
    g.stroke();
  } else {
    g.beginPath();
    g.arc(cx, my - r * 0.08, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }
  // facial hair
  g.fillStyle = c.hairColor;
  g.strokeStyle = c.hairColor;
  if (c.facialHair === 'mustache') {
    g.lineWidth = r * 0.1;
    g.beginPath();
    g.moveTo(cx - r * 0.24, my - r * 0.02);
    g.quadraticCurveTo(cx, my - r * 0.16, cx + r * 0.24, my - r * 0.02);
    g.stroke();
  } else if (c.facialHair === 'beard' || c.facialHair === 'stubble') {
    g.globalAlpha = c.facialHair === 'stubble' ? 0.35 : 0.92;
    g.beginPath();
    g.moveTo(cx - r * 0.72, cy + r * 0.05);
    g.quadraticCurveTo(cx - r * 0.6, cy + r * 0.85, cx, cy + r * 0.9);
    g.quadraticCurveTo(cx + r * 0.6, cy + r * 0.85, cx + r * 0.72, cy + r * 0.05);
    g.quadraticCurveTo(cx + r * 0.45, cy + r * 0.3, cx + r * 0.3, my - r * 0.06);
    g.quadraticCurveTo(cx, my - r * 0.14, cx - r * 0.3, my - r * 0.06);
    g.quadraticCurveTo(cx - r * 0.45, cy + r * 0.3, cx - r * 0.72, cy + r * 0.05);
    g.fill();
    g.globalAlpha = 1;
    if (c.facialHair === 'beard') {
      // keep the mouth visible
      g.fillStyle = '#5a1f24';
      g.beginPath();
      g.ellipse(cx, my + r * 0.05, r * 0.16, r * 0.06, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // glasses and shades sit on the face
  g.strokeStyle = ink;
  if (c.accessory === 'glasses') {
    g.lineWidth = lw * 0.8;
    for (const x of [left, right]) {
      g.beginPath();
      g.arc(x, ey, r * 0.2, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(left + r * 0.2, ey);
    g.lineTo(right - r * 0.2, ey);
    g.stroke();
  } else if (c.accessory === 'shades') {
    g.fillStyle = '#15151c';
    for (const x of [left, right]) {
      g.beginPath();
      g.ellipse(x, ey + r * 0.02, r * 0.22, r * 0.16, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(left, ey - r * 0.06);
    g.lineTo(right, ey - r * 0.06);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(left - r * 0.12, ey - r * 0.06, r * 0.08, r * 0.04);
    g.fillRect(right - r * 0.12, ey - r * 0.06, r * 0.08, r * 0.04);
  }
}

/** Hair seen from the front, behind and around a head circle. Pass 'back' before the face, 'front' after. */
export function drawHair(g: CanvasRenderingContext2D, c: Character, cx: number, cy: number, r: number, layer: 'back' | 'front') {
  g.fillStyle = c.hairColor;
  const h = c.hair;
  if (layer === 'back') {
    if (h === 'long' || h === 'bob') {
      g.beginPath();
      g.ellipse(cx, cy + r * (h === 'long' ? 0.35 : 0.1), r * 1.12, r * (h === 'long' ? 1.25 : 1.0), 0, 0, Math.PI * 2);
      g.fill();
    } else if (h === 'afro') {
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * Math.PI * 2;
        g.beginPath();
        g.arc(cx + Math.cos(a) * r * 0.85, cy - r * 0.2 + Math.sin(a) * r * 0.75, r * 0.45, 0, Math.PI * 2);
        g.fill();
      }
    } else if (h === 'pigtails') {
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.ellipse(cx + sx * r * 1.12, cy + r * 0.05, r * 0.32, r * 0.45, sx * 0.4, 0, Math.PI * 2);
        g.fill();
      }
    } else if (h === 'ponytail') {
      g.beginPath();
      g.ellipse(cx + r * 0.9, cy + r * 0.3, r * 0.28, r * 0.6, -0.5, 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  // front: the cap of hair over the forehead
  if (h === 'bald' || h === 'buzz') {
    if (h === 'buzz') {
      g.globalAlpha = 0.55;
      g.beginPath();
      g.arc(cx, cy, r, Math.PI * 1.08, Math.PI * 1.92);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    }
  } else if (h === 'spiky') {
    g.beginPath();
    g.moveTo(cx - r, cy - r * 0.15);
    for (let k = 0; k <= 7; k++) {
      const x = cx - r + (k / 7) * r * 2;
      const up = k % 2 === 0 ? 1.35 : 0.85;
      g.lineTo(x, cy - r * up);
    }
    g.lineTo(cx + r, cy - r * 0.15);
    g.quadraticCurveTo(cx, cy - r * 0.55, cx - r, cy - r * 0.15);
    g.fill();
  } else if (h === 'afro') {
    // drawn behind
  } else {
    g.beginPath();
    g.arc(cx, cy, r * 1.02, Math.PI * 1.0, Math.PI * 2.0);
    const fringe = h === 'sidepart' ? 0.42 : h === 'bob' || h === 'long' ? 0.38 : h === 'crop' ? 0.5 : 0.45;
    g.quadraticCurveTo(cx + r * 0.3, cy - r * fringe, cx - (h === 'sidepart' ? r * 0.2 : 0), cy - r * (fringe + 0.08));
    g.quadraticCurveTo(cx - r * 0.5, cy - r * fringe, cx - r * 1.02, cy);
    g.fill();
  }
  // things on top of the hair
  if (c.accessory === 'sweatband') {
    g.fillStyle = c.accent;
    g.fillRect(cx - r * 0.98, cy - r * 0.62, r * 1.96, r * 0.2);
  } else if (c.accessory === 'visor' || c.accessory === 'cap') {
    g.fillStyle = c.primary;
    if (c.accessory === 'cap') {
      g.beginPath();
      g.arc(cx, cy - r * 0.15, r * 1.02, Math.PI, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(cx - r * 1.0, cy - r * 0.68, r * 2.0, r * 0.24);
    }
    g.fillStyle = c.accent;
    g.beginPath();
    g.ellipse(cx, cy - r * 0.42, r * 1.05, r * 0.16, 0, 0, Math.PI);
    g.fill();
  } else if (c.accessory === 'clips') {
    for (const sx of [-0.55, 0.55]) star(g, cx + sx * r, cy - r * 0.62, r * 0.17, '#FFD166');
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 === 0 ? r : r * 0.45;
    g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** A head-and-shoulders portrait for menus and the scoreboard. Draws into a square canvas. */
export function drawPortrait(canvas: HTMLCanvasElement, c: Character, opts: { ring?: string } = {}) {
  const size = canvas.width;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, size, size);
  const cx = size / 2;
  const r = size * 0.27;
  const cy = size * 0.44;
  if (opts.ring) {
    g.fillStyle = opts.ring;
    g.beginPath();
    g.arc(cx, size / 2, size / 2, 0, Math.PI * 2);
    g.fill();
  }
  g.save();
  g.beginPath();
  g.arc(cx, size / 2, size / 2 - (opts.ring ? size * 0.04 : 0), 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#16233a';
  g.fillRect(0, 0, size, size);
  // shoulders
  g.fillStyle = c.primary;
  g.beginPath();
  g.ellipse(cx, size * 1.02, size * 0.42, size * 0.32, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.accent;
  g.fillRect(cx - size * 0.42, size * 0.8, size * 0.84, size * 0.035);
  drawHair(g, c, cx, cy, r, 'back');
  g.fillStyle = c.skin;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  // ears
  g.beginPath();
  g.arc(cx - r * 0.98, cy + r * 0.08, r * 0.17, 0, Math.PI * 2);
  g.arc(cx + r * 0.98, cy + r * 0.08, r * 0.17, 0, Math.PI * 2);
  g.fill();
  drawFace(g, c, cx, cy, r);
  drawHair(g, c, cx, cy, r, 'front');
  g.restore();
}
