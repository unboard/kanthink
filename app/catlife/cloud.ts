// Whisker Wilds — cloud save sync client.
//
// A kid signs in once per tablet (username + secret word). After that every
// autosave is quietly pushed to the server (throttled), and on boot the game
// picks whichever save is newest — so a cleared tablet never loses a clan again.

import type { SaveData } from './types';

const ACC_KEY = 'catlife-account-v1';

export interface CloudAccount {
  username: string;
  token: string;
}

export type SyncState = 'off' | 'syncing' | 'synced' | 'error';

let syncState: SyncState = 'off';
let syncListeners: ((s: SyncState) => void)[] = [];

function setSyncState(s: SyncState) {
  syncState = s;
  for (const l of syncListeners) l(s);
}

export function getSyncState(): SyncState {
  return syncState;
}

export function onSyncState(fn: (s: SyncState) => void): () => void {
  syncListeners.push(fn);
  return () => { syncListeners = syncListeners.filter((f) => f !== fn); };
}

// ——— account storage ———

export function getAccount(): CloudAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACC_KEY);
    if (!raw) return null;
    const acc = JSON.parse(raw) as CloudAccount;
    if (!acc?.token || !acc?.username) return null;
    return acc;
  } catch {
    return null;
  }
}

export function setAccount(acc: CloudAccount) {
  try {
    localStorage.setItem(ACC_KEY, JSON.stringify(acc));
    setSyncState('synced');
  } catch {}
}

export function clearAccount() {
  try {
    localStorage.removeItem(ACC_KEY);
  } catch {}
  setSyncState('off');
}

// ——— API calls ———

export interface AuthResult {
  ok: boolean;
  error?: string;
  save?: SaveData | null;
}

export async function signup(username: string, password: string, parentEmail: string): Promise<AuthResult> {
  try {
    const res = await fetch('/api/catlife/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signup', username, password, parentEmail }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? 'Something went wrong — try again!' };
    setAccount({ username: data.username, token: data.token });
    return { ok: true, save: null };
  } catch {
    return { ok: false, error: 'No internet right now — try again in a bit!' };
  }
}

export async function login(username: string, password: string): Promise<AuthResult> {
  try {
    const res = await fetch('/api/catlife/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username, password }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? 'Something went wrong — try again!' };
    setAccount({ username: data.username, token: data.token });
    return { ok: true, save: (data.save as SaveData | null) ?? null };
  } catch {
    return { ok: false, error: 'No internet right now — try again in a bit!' };
  }
}

export async function fetchCloudSave(): Promise<{ save: SaveData | null } | null> {
  const acc = getAccount();
  if (!acc) return null;
  try {
    const res = await fetch('/api/catlife/save', {
      headers: { Authorization: `Bearer ${acc.token}` },
    });
    if (res.status === 401) {
      // token revoked — stay playable locally, dad can sign back in
      setSyncState('error');
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    return { save: (data.save as SaveData | null) ?? null };
  } catch {
    return null;
  }
}

// ——— recorded meows: upload straight to Cloudinary with a server signature ———

export async function uploadMeow(blob: Blob): Promise<string> {
  const acc = getAccount();
  if (!acc) throw new Error('Not signed in');
  const signRes = await fetch('/api/catlife/meow-sign', {
    method: 'POST',
    headers: { Authorization: `Bearer ${acc.token}` },
  });
  if (!signRes.ok) throw new Error('Could not authorize the upload');
  const { signature, timestamp, apiKey, cloudName, folder } = await signRes.json();

  const form = new FormData();
  form.append('file', blob);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  // audio rides Cloudinary's video pipeline
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  const data = (await res.json()) as { public_id: string };
  // deliver as mp3 so every tablet (Safari included) can play it back
  return `https://res.cloudinary.com/${cloudName}/video/upload/${data.public_id}.mp3`;
}

// ——— throttled push (called from persistSave on every autosave) ———

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: SaveData | null = null;
let pushInFlight = false;

export function queueCloudPush(save: SaveData) {
  const acc = getAccount();
  if (!acc) return;
  pendingSave = save;
  if (pushTimer) return; // a push is already scheduled
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flushCloudPush();
  }, 8000);
}

export async function flushCloudPush(useKeepalive = false): Promise<void> {
  const acc = getAccount();
  const save = pendingSave;
  if (!acc || !save || pushInFlight) return;
  pendingSave = null;
  pushInFlight = true;
  setSyncState('syncing');
  try {
    const res = await fetch('/api/catlife/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${acc.token}` },
      body: JSON.stringify({ save }),
      keepalive: useKeepalive,
    });
    setSyncState(res.ok ? 'synced' : 'error');
  } catch {
    setSyncState('error');
    pendingSave = pendingSave ?? save; // retry on the next autosave
  } finally {
    pushInFlight = false;
  }
}

// flush the latest progress when the kid closes the tab / switches apps
if (typeof window !== 'undefined') {
  if (getAccount()) setSyncState('synced');
  const flush = () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    void flushCloudPush(true);
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
