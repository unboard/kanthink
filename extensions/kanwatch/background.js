/**
 * Kanwatch background worker.
 *
 * Keeps one "current visit" — the active tab in the focused window — and counts
 * time on it only while you are actually there: Chrome focused, you not idle (or a
 * video playing), and recording not paused. When the page changes, the visit is
 * finished, run through privacy.js, and queued. The queue uploads every minute.
 *
 * The full URL, the page, and anything you type never leave this worker. What is
 * queued is the scrubbed record privacy.js allows — and the server applies the same
 * rules again on arrival.
 */

import { sanitizeVisit, readablePageKind, publicUrlOf, isPrivateUrl, isPrivateTitle, scrubText, scrubPageText } from './privacy.js';

// The bare domain redirects to www, and browsers drop the Authorization header on a
// cross-origin redirect — so the key would never arrive. Always talk to www.
const DEFAULT_ENDPOINT = 'https://www.kanthink.com';
const MIN_VISIT_MS = 3000;            // quicker than this is a flip-through, not a visit
const CHECKPOINT_MS = 5 * 60 * 1000;  // long visits are split so the day view stays current
const MEDIA_FRESH_MS = 20000;         // a "video playing" report counts for this long
const MAX_QUEUE = 2000;
const READ_AFTER_MS = 30 * 1000;       // reading this long on a public page earns a read
const REREAD_AFTER_MS = 3 * 60 * 1000; // ...and a fuller one for long threads that kept loading

// ---- storage ------------------------------------------------------------------

const SETTINGS_DEFAULTS = {
  endpoint: DEFAULT_ENDPOINT,
  token: '',
  pausedUntil: 0,          // ms; Infinity-like values mean "until resumed"
  includeSearch: true,
  extraPrivateDomains: [],
  lastUpload: null,        // { at, ok, message }
};

async function getSettings() {
  const s = await chrome.storage.local.get(SETTINGS_DEFAULTS);
  return { ...SETTINGS_DEFAULTS, ...s };
}

// One chain for every state change, so events cannot interleave mid-update.
let chain = Promise.resolve();
function serial(fn) {
  chain = chain.then(fn, fn).catch((err) => console.warn('[kanwatch]', err));
  return chain;
}

async function getSession() {
  const { session } = await chrome.storage.session.get({ session: null });
  return session ?? { current: null, windowFocused: true, idleState: 'active', mediaAt: 0 };
}

async function setSession(session) {
  await chrome.storage.session.set({ session });
}

async function enqueue(visit) {
  const { queue = [] } = await chrome.storage.local.get({ queue: [] });
  queue.push(visit);
  await chrome.storage.local.set({ queue: queue.slice(-MAX_QUEUE) });
}

// ---- visits -------------------------------------------------------------------

const newId = () => crypto.randomUUID().replace(/-/g, '');

const isWeb = (url) => /^https?:\/\//.test(url || '');
const sameUrl = (a, b) => (a || '').split('#')[0] === (b || '').split('#')[0];

function startVisit(tab, now) {
  return {
    id: newId(),
    tabId: tab.id,
    url: tab.url,
    title: tab.title || '',
    heading: '',
    description: '',
    startedAt: now,
    activeMs: 0,
    runningSince: null,
    keystrokes: 0,
    clicks: 0,
    scrollDepth: 0,
    mediaSeconds: 0,
    ogType: '',
    read: null,      // { title, text, ogType, manual } once the page's text is read
    readAt: 0,       // activeMs when it was last read
  };
}

function stopClock(visit, now) {
  if (visit.runningSince) {
    visit.activeMs += Math.max(0, now - visit.runningSince);
    visit.runningSince = null;
  }
}

async function finishVisit(visit, now) {
  stopClock(visit, now);
  if (visit.activeMs < MIN_VISIT_MS) return;
  const settings = await getSettings();
  const clean = sanitizeVisit({
    url: visit.url,
    title: visit.title,
    heading: visit.heading,
    description: visit.description,
    includeSearch: settings.includeSearch,
    extraPrivateDomains: settings.extraPrivateDomains,
  });
  const timing = {
    id: visit.id,
    startedAt: visit.startedAt,
    endedAt: now,
    activeSeconds: Math.round(visit.activeMs / 1000),
  };
  if (clean.private) {
    // Private: how long, and nothing else. Not even which site.
    await enqueue({ ...timing, private: true });
    return;
  }
  // Page text only for public reading that privacy.js allows, checked again here, at
  // the last moment, with any sites you've made private since.
  // Scrubbed here, before it leaves the browser, exactly as the server will scrub it again.
  const readable = visit.read
    && !isPrivateTitle(visit.read.title)
    && (visit.read.manual || readablePageKind(visit.url, visit.read.ogType, settings.extraPrivateDomains));
  const read = readable
    ? {
        url: publicUrlOf(visit.url),
        title: scrubText(visit.read.title, 200),
        text: scrubPageText(visit.read.text),
        ogType: visit.read.ogType,
        manual: !!visit.read.manual,
      }
    : undefined;
  await enqueue({
    ...timing,
    ...(read ? { read } : {}),
    domain: clean.domain,
    path: clean.path,
    title: clean.title,
    heading: clean.heading,
    description: clean.description,
    searchQuery: clean.searchQuery,
    keystrokes: visit.keystrokes,
    clicks: visit.clicks,
    scrollDepth: visit.scrollDepth,
    mediaSeconds: Math.min(visit.mediaSeconds, Math.round(visit.activeMs / 1000)),
  });
}

async function isPaused() {
  const { pausedUntil, token } = await getSettings();
  return !token || Date.now() < pausedUntil;
}

/** Re-derive what should be counting right now, finishing or starting visits as needed. */
async function refresh() {
  const now = Date.now();
  const session = await getSession();
  const paused = await isPaused();

  let tab = null;
  if (session.windowFocused && !paused) {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (active && !active.incognito && isWeb(active.url)) tab = active;
  }

  const present =
    session.idleState === 'active' ||
    (session.idleState === 'idle' && now - (session.mediaAt || 0) < MEDIA_FRESH_MS);

  let current = session.current;

  // A different page (or no page) ends the current visit.
  if (current && (!tab || tab.id !== current.tabId || !sameUrl(tab.url, current.url))) {
    await finishVisit(current, now);
    current = null;
  }

  if (tab && !current) current = startVisit(tab, now);
  if (current && tab && tab.title) current.title = tab.title;

  if (current) {
    if (present && !current.runningSince) current.runningSince = now;
    if (!present) stopClock(current, now);

    // Split long visits so an afternoon on one page still shows up as it happens.
    if (now - current.startedAt >= CHECKPOINT_MS) {
      const carry = { ...current };
      await finishVisit(current, now);
      current = { ...startVisit({ id: carry.tabId, url: carry.url, title: carry.title }, now),
        heading: carry.heading, description: carry.description, ogType: carry.ogType,
        // Time on the continued visit keeps counting toward the same read.
        read: carry.read, readAt: 0 };
      if (present) current.runningSince = now;
    }
  }

  session.current = current;
  await setSession(session);

  if (current && present) await maybeReadPage(current);
}

/** Ask the page for its text, if it is public reading and you've been reading it a while. */
async function maybeReadPage(visit, manual = false) {
  const settings = await getSettings();
  if (isPrivateUrl(visit.url, settings.extraPrivateDomains)) return;
  if (!manual) {
    if (!readablePageKind(visit.url, visit.ogType, settings.extraPrivateDomains)) return;
    const active = visit.activeMs + (visit.runningSince ? Date.now() - visit.runningSince : 0);
    const due = visit.read ? active - visit.readAt >= REREAD_AFTER_MS : active >= READ_AFTER_MS;
    if (!due) return;
  }
  let reply;
  try {
    reply = await chrome.tabs.sendMessage(visit.tabId, { type: 'extract' });
  } catch {
    return; // no page script here (it declined, or the page predates the extension)
  }
  if (!reply?.text) return;
  const session = await getSession();
  const current = session.current;
  if (!current || current.id !== visit.id) return;
  current.read = {
    title: reply.title || current.title,
    text: String(reply.text).slice(0, 8000),
    ogType: reply.ogType || current.ogType,
    manual: manual || !!current.read?.manual,
  };
  current.readAt = current.activeMs + (current.runningSince ? Date.now() - current.runningSince : 0);
  await setSession(session);
}

// ---- background media ---------------------------------------------------------
//
// A tab playing sound that isn't the page you're working on — music or a video on your
// other screen. Recorded alongside, never as attention: it adds no active time.
// Same privacy rules; private pages are dropped entirely rather than counted.

async function finishBackground(item, now) {
  const seconds = Math.round((now - item.startedAt) / 1000);
  if (seconds < 30) return;
  const settings = await getSettings();
  const clean = sanitizeVisit({ url: item.url, title: item.title, includeSearch: false, extraPrivateDomains: settings.extraPrivateDomains });
  if (clean.private) return;
  await enqueue({
    id: item.id,
    background: true,
    startedAt: item.startedAt,
    endedAt: now,
    activeSeconds: seconds,
    domain: clean.domain,
    path: clean.path,
    title: clean.title,
  });
}

async function refreshBackground() {
  const now = Date.now();
  const session = await getSession();
  const tracked = session.background ?? {};
  const paused = await isPaused();

  let audible = [];
  if (!paused) {
    audible = (await chrome.tabs.query({ audible: true }))
      .filter((t) => !t.incognito && isWeb(t.url) && t.id !== session.current?.tabId);
  }
  const live = new Map(audible.map((t) => [String(t.id), t]));

  const next = {};
  for (const [tabId, item] of Object.entries(tracked)) {
    const tab = live.get(tabId);
    // Ended: stopped playing, closed, became the page you're on, or moved to another page.
    if (!tab || !sameUrl(tab.url, item.url)) {
      await finishBackground(item, now);
      continue;
    }
    // Long listening is split, like long visits, so it shows up as it happens.
    if (now - item.startedAt >= CHECKPOINT_MS) {
      await finishBackground(item, now);
      next[tabId] = { ...item, id: newId(), startedAt: now, title: tab.title || item.title };
    } else {
      next[tabId] = { ...item, title: tab.title || item.title };
    }
  }
  for (const [tabId, tab] of live) {
    if (!next[tabId]) next[tabId] = { id: newId(), tabId: tab.id, url: tab.url, title: tab.title || '', startedAt: now };
  }

  const latest = await getSession();
  latest.background = next;
  await setSession(latest);
}

// ---- upload -------------------------------------------------------------------

async function upload() {
  const settings = await getSettings();
  const { queue = [] } = await chrome.storage.local.get({ queue: [] });
  if (!settings.token || queue.length === 0) return;

  const batch = queue.slice(0, 200);
  let lastUpload;
  try {
    const base = settings.endpoint.replace(/\/$/, '').replace(/^https:\/\/kanthink\.com$/, DEFAULT_ENDPOINT);
    const res = await fetch(`${base}/api/kanwatch/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.token}` },
      body: JSON.stringify({ visits: batch, tzOffsetMinutes: new Date().getTimezoneOffset() }),
    });
    if (res.ok) {
      const sent = new Set(batch.map((v) => v.id));
      const { queue: latest = [] } = await chrome.storage.local.get({ queue: [] });
      await chrome.storage.local.set({ queue: latest.filter((v) => !sent.has(v.id)) });
      lastUpload = { at: Date.now(), ok: true, message: `Sent ${batch.length}` };
    } else {
      lastUpload = {
        at: Date.now(),
        ok: false,
        message: res.status === 401 ? 'Key rejected — reconnect from Kanwatch in Kanthink' : `Upload failed (${res.status})`,
      };
    }
  } catch {
    lastUpload = { at: Date.now(), ok: false, message: 'Offline — will retry' };
  }
  await chrome.storage.local.set({ lastUpload });
}

// ---- events -------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('tick', { periodInMinutes: 1 });
  chrome.idle.setDetectionInterval(60);
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('tick', { periodInMinutes: 1 });
  chrome.idle.setDetectionInterval(60);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'tick') return;
  serial(async () => {
    await refresh();
    await refreshBackground();
    await upload();
  });
});

const refreshAll = async () => {
  await refresh();
  await refreshBackground();
};

chrome.tabs.onActivated.addListener(() => serial(refreshAll));
chrome.tabs.onRemoved.addListener(() => serial(refreshAll));
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (change.url || change.title || change.status === 'complete' || 'audible' in change) serial(refreshAll);
});
chrome.windows.onFocusChanged.addListener((windowId) => serial(async () => {
  const session = await getSession();
  session.windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  await setSession(session);
  await refresh();
}));
chrome.idle.onStateChanged.addListener((state) => serial(async () => {
  const session = await getSession();
  session.idleState = state; // 'active' | 'idle' | 'locked'
  await setSession(session);
  await refresh();
}));

chrome.storage.onChanged.addListener((changes, area) => {
  // Pausing, resuming or connecting takes effect immediately.
  if (area === 'local' && (changes.pausedUntil || changes.token)) serial(refresh);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tab = sender.tab;
  if (msg?.type === 'hello') {
    // The content script asks before doing anything. Private pages get "no", and the
    // script then attaches no listeners at all.
    (async () => {
      const settings = await getSettings();
      const clean = tab && !tab.incognito
        ? sanitizeVisit({ url: tab.url, title: tab.title, extraPrivateDomains: settings.extraPrivateDomains })
        : { private: true };
      sendResponse({ track: !clean.private && !!settings.token });
    })();
    return true;
  }

  if (!tab) return;
  if (msg?.type === 'meta' || msg?.type === 'engagement') {
    serial(async () => {
      const session = await getSession();
      const current = session.current;
      const isCurrent = current && current.tabId === tab.id && sameUrl(current.url, tab.url);
      // A video keeps you "present" only on the page you're on. One playing on your
      // other screen is background, tracked separately — it isn't attention here.
      if (msg.type === 'engagement' && msg.playing && isCurrent) session.mediaAt = Date.now();
      if (isCurrent) {
        if (msg.type === 'meta') {
          current.heading = String(msg.heading || '').slice(0, 300);
          current.description = String(msg.description || '').slice(0, 500);
          current.ogType = String(msg.ogType || '').slice(0, 40);
        } else {
          current.keystrokes += Math.max(0, Math.min(5000, msg.keystrokes | 0));
          current.clicks += Math.max(0, Math.min(5000, msg.clicks | 0));
          current.scrollDepth = Math.max(current.scrollDepth, Math.max(0, Math.min(100, msg.scrollDepth | 0)));
          current.mediaSeconds += Math.max(0, Math.min(60, msg.mediaSeconds | 0));
        }
      }
      await setSession(session);
      if (msg.type === 'engagement' && msg.playing) await refresh();
    });
  }
});

// Popup actions.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'flush') {
    serial(async () => {
      await refresh();
      await upload();
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === 'readNow') {
    // "Kan, read this page": read it now and send it, rather than waiting a minute.
    serial(async () => {
      await refresh();
      const session = await getSession();
      if (!session.current) return;
      await maybeReadPage(session.current, true);
      const after = await getSession();
      if (after.current?.read?.manual) {
        const carry = after.current;
        await finishVisit(carry, Date.now());
        after.current = { ...startVisit({ id: carry.tabId, url: carry.url, title: carry.title }, Date.now()),
          heading: carry.heading, description: carry.description, ogType: carry.ogType, read: carry.read };
        after.current.runningSince = Date.now();
        await setSession(after);
        await upload();
      }
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === 'blockSite' && typeof msg.domain === 'string') {
    (async () => {
      const settings = await getSettings();
      const list = [...new Set([...settings.extraPrivateDomains, msg.domain.toLowerCase()])];
      await chrome.storage.local.set({ extraPrivateDomains: list });
      // Anything from this site still waiting to upload is dropped, not sent.
      const { queue = [] } = await chrome.storage.local.get({ queue: [] });
      await chrome.storage.local.set({
        queue: queue.filter((v) => !v.domain || !(v.domain === msg.domain || v.domain.endsWith(`.${msg.domain}`))),
      });
      serial(refresh);
      sendResponse({ ok: true });
    })();
    return true;
  }
});
