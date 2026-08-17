import { emptyBrief, type DesignAsset, type DesignBrief } from './brief';
import { POSTCARD_9X6 } from './products';

/**
 * The working state of a design session.
 *
 * Held in the browser and mirrored to localStorage — no server record yet, so a
 * session is private to one device and survives a refresh but nothing more.
 * Only URLs are stored, never image bytes: a 2K render is several megabytes of
 * base64 and would exceed the localStorage quota on the second generation.
 */

export interface SideState {
  url: string | null;
  /** The art direction that produced the current image, kept for regeneration. */
  imagePrompt: string | null;
  /** The other side has changed since this one was rendered. */
  stale: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Which side the turn was about, so the transcript reads correctly. */
  sideId: string;
}

export interface DesignSession {
  productId: string;
  activeSide: string;
  brief: DesignBrief;
  assets: DesignAsset[];
  sides: Record<string, SideState>;
  messages: ChatMessage[];
  chips: string[];
}

const STORAGE_KEY = 'kanthink.design.v1';

export function emptySide(): SideState {
  return { url: null, imagePrompt: null, stale: false };
}

export function emptySession(): DesignSession {
  return {
    productId: POSTCARD_9X6.id,
    activeSide: POSTCARD_9X6.sides[0].id,
    brief: emptyBrief(),
    assets: [],
    sides: Object.fromEntries(POSTCARD_9X6.sides.map((s) => [s.id, emptySide()])),
    messages: [],
    chips: [],
  };
}

export function loadSession(): DesignSession {
  if (typeof window === 'undefined') return emptySession();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySession();
    const parsed = JSON.parse(raw) as Partial<DesignSession>;
    const base = emptySession();
    return {
      ...base,
      ...parsed,
      brief: { ...base.brief, ...(parsed.brief ?? {}) },
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      chips: Array.isArray(parsed.chips) ? parsed.chips : [],
      // Merge rather than replace, so a product gaining a side doesn't leave a
      // restored session with an undefined entry for it.
      sides: { ...base.sides, ...(parsed.sides ?? {}) },
    };
  } catch {
    return emptySession();
  }
}

export function saveSession(session: DesignSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Quota or private-mode failure. The session still works in memory for as
    // long as the tab is open, which is better than taking the page down.
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Rendering one side invalidates the other's claim to match it. */
export function markOthersStale(
  sides: Record<string, SideState>,
  renderedSideId: string
): Record<string, SideState> {
  const next: Record<string, SideState> = {};
  for (const [id, state] of Object.entries(sides)) {
    next[id] = id === renderedSideId ? state : { ...state, stale: state.url ? true : false };
  }
  return next;
}
