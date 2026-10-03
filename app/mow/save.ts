// Clean Cut — per-device persistence (the day in progress, your name, settings, local bests)
// and the online leaderboard.

import type { DayState, Quality } from './types';

const DAY_KEY = 'cleancut-day-v1';
const NAME_KEY = 'cleancut-name';
const QUALITY_KEY = 'cleancut-quality';
const MUTE_KEY = 'cleancut-muted';
const LOCAL_KEY = 'cleancut-local-scores';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — play on without saving */
  }
}

export const loadDay = () => read<DayState>(DAY_KEY);
export const saveDay = (d: DayState | null) => (d ? write(DAY_KEY, d) : write(DAY_KEY, null));
export const loadName = () => read<string>(NAME_KEY) ?? '';
export const saveName = (n: string) => write(NAME_KEY, n);
export const loadMuted = () => read<boolean>(MUTE_KEY) ?? false;
export const saveMuted = (m: boolean) => write(MUTE_KEY, m);

export function loadQuality(): Quality {
  const q = read<Quality>(QUALITY_KEY);
  if (q) return q;
  if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) return 'low';
  // integrated GPUs start on medium; dynamic resolution handles the rest
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    if (/Intel|UHD|Iris|Mali|Adreno|PowerVR|SwiftShader|llvmpipe/i.test(name)) return 'medium';
  } catch {
    /* fall through */
  }
  return 'high';
}
export const saveQuality = (q: Quality) => write(QUALITY_KEY, q);

export interface ScoreRow {
  name: string;
  day: string;
  mode: string;
  money: number;
  jobs: number;
  style: number;
  quality: number;
  at: number;
}

export function localScores(): ScoreRow[] {
  return read<ScoreRow[]>(LOCAL_KEY) ?? [];
}

export function addLocalScore(r: ScoreRow) {
  const list = [...localScores(), r].sort((a, b) => b.money - a.money).slice(0, 30);
  write(LOCAL_KEY, list);
}

export async function fetchBoard(mode: 'daily' | 'free', day: string): Promise<{ today: ScoreRow[]; allTime: ScoreRow[] } | null> {
  try {
    const res = await fetch(`/api/mow/scores?mode=${mode}&day=${encodeURIComponent(day)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function postScore(r: Omit<ScoreRow, 'at'>): Promise<string | null> {
  try {
    const res = await fetch('/api/mow/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) });
    if (res.ok) return null;
    const j = await res.json().catch(() => ({}));
    return (j as { error?: string }).error ?? 'Could not post score';
  } catch {
    return 'Offline — saved on this device';
  }
}
