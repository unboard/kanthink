// Saved studio setups, stored per-device in localStorage.
//
// Deliberately not server-side. What gets saved here is bound to the hardware in
// front of you — which camera, which mic, how far you zoom to frame your face,
// which monitor's aspect you record at. Syncing that to another machine would
// restore settings that are wrong for it. Presets follow the desk, not the account.

import { DEFAULT_BUBBLE, DEFAULT_CONFIG, type BubblePlacement, type StudioConfig } from './types';

const PRESETS_KEY = 'kan-record-presets';
const LAST_USED_KEY = 'kan-record-last-used';

export interface StudioPreset {
  id: string;
  name: string;
  config: StudioConfig;
  bubble: BubblePlacement;
  createdAt: number;
}

/** Everything a preset restores. Device ids ride along so a preset can re-select them. */
export interface StudioSnapshot {
  config: StudioConfig;
  bubble: BubblePlacement;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked — presets are a convenience, never block recording.
  }
}

/**
 * Merge a stored snapshot over the current defaults.
 *
 * Shallow-merging against DEFAULT_CONFIG matters: a preset saved before a new
 * setting existed has no key for it, and spreading the stored object directly
 * would leave that setting `undefined` rather than defaulted. Subtitles are
 * merged separately because they are the one nested object.
 */
function hydrate(stored: Partial<StudioSnapshot> | null): StudioSnapshot {
  const config = { ...DEFAULT_CONFIG, ...(stored?.config ?? {}) };
  config.subtitles = { ...DEFAULT_CONFIG.subtitles, ...(stored?.config?.subtitles ?? {}) };
  return {
    config,
    bubble: { ...DEFAULT_BUBBLE, ...(stored?.bubble ?? {}) },
  };
}

export function loadPresets(): StudioPreset[] {
  const raw = read<StudioPreset[]>(PRESETS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
    .map((p) => ({ ...p, ...hydrate(p) }));
}

export function savePreset(name: string, snapshot: StudioSnapshot): StudioPreset[] {
  const presets = loadPresets();
  const trimmed = name.trim().slice(0, 60) || 'Untitled preset';

  // Saving under an existing name overwrites it — "save my current setup as
  // Mobile demo" twice should update that preset, not make a second one.
  const existing = presets.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const next: StudioPreset = existing
    ? { ...existing, config: snapshot.config, bubble: snapshot.bubble }
    : {
        id: crypto.randomUUID(),
        name: trimmed,
        config: snapshot.config,
        bubble: snapshot.bubble,
        createdAt: Date.now(),
      };

  const list = existing ? presets.map((p) => (p.id === existing.id ? next : p)) : [...presets, next];
  write(PRESETS_KEY, list);
  return list;
}

export function deletePreset(id: string): StudioPreset[] {
  const list = loadPresets().filter((p) => p.id !== id);
  write(PRESETS_KEY, list);
  return list;
}

/** The settings in use when the studio was last open, restored on next visit. */
export function loadLastUsed(): StudioSnapshot | null {
  const raw = read<Partial<StudioSnapshot> | null>(LAST_USED_KEY, null);
  return raw ? hydrate(raw) : null;
}

export function saveLastUsed(snapshot: StudioSnapshot): void {
  write(LAST_USED_KEY, snapshot);
}
