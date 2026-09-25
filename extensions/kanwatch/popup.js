import { isPrivateUrl } from './privacy.js';

const $ = (id) => document.getElementById(id);
const FOREVER = Number.MAX_SAFE_INTEGER;

async function render() {
  const s = await chrome.storage.local.get({
    endpoint: 'https://www.kanthink.com', token: '', pausedUntil: 0, includeSearch: true,
    extraPrivateDomains: [], lastUpload: null, queue: [], nudges: true, nudgeSnoozedUntil: 0,
  });
  const now = Date.now();
  const paused = now < s.pausedUntil;
  const connected = !!s.token;

  $('dot').className = `dot ${!connected ? '' : paused ? 'paused' : 'on'}`;
  $('status').textContent = !connected ? 'Not connected' : paused ? 'Paused' : 'Recording';
  const bits = [];
  if (paused && s.pausedUntil !== FOREVER) bits.push(`until ${new Date(s.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  if (s.queue.length) bits.push(`${s.queue.length} waiting to send`);
  if (s.lastUpload) bits.push(s.lastUpload.message);
  $('detail').textContent = bits.join(' · ');

  $('controls').hidden = !connected;
  $('pause1h').hidden = paused;
  $('pauseAll').hidden = paused;
  $('resume').hidden = !paused;

  $('endpoint').value = s.endpoint;
  $('token').value = '';
  $('token').placeholder = connected ? 'Connected — paste a new key to replace' : 'kw_…';
  $('disconnect').hidden = !connected;
  $('includeSearch').checked = s.includeSearch;
  $('nudges').checked = s.nudges;
  const snoozed = s.nudges && now < s.nudgeSnoozedUntil;
  $('nudgeSnoozed').hidden = !snoozed;
  $('nudgeSnoozed').textContent = snoozed
    ? `Nudges snoozed until ${new Date(s.nudgeSnoozedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { host = new URL(tab?.url || '').hostname.replace(/^www\./, ''); } catch {}
  const alreadyPrivate = !host || isPrivateUrl(tab.url, s.extraPrivateDomains);
  $('siteBox').hidden = !host;
  $('siteName').textContent = host + (alreadyPrivate ? ' (private)' : '');
  $('blockSite').hidden = alreadyPrivate;
  $('readNow').hidden = alreadyPrivate || !connected;
  $('blockSite').dataset.domain = host;

  $('blockedWrap').hidden = s.extraPrivateDomains.length === 0;
  $('blocked').replaceChildren(...s.extraPrivateDomains.map((d) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = d;
    const undo = document.createElement('button');
    undo.textContent = 'Remove';
    undo.onclick = async () => {
      await chrome.storage.local.set({ extraPrivateDomains: s.extraPrivateDomains.filter((x) => x !== d) });
      render();
    };
    li.append(name, undo);
    return li;
  }));

  $('open').onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${s.endpoint.replace(/\/$/, '')}/kanwatch` });
  };
}

$('pause1h').onclick = async () => { await chrome.storage.local.set({ pausedUntil: Date.now() + 3600000 }); render(); };
$('pauseAll').onclick = async () => { await chrome.storage.local.set({ pausedUntil: FOREVER }); render(); };
$('resume').onclick = async () => { await chrome.storage.local.set({ pausedUntil: 0 }); render(); };
$('includeSearch').onchange = async (e) => { await chrome.storage.local.set({ includeSearch: e.target.checked }); };
$('nudges').onchange = async (e) => { await chrome.storage.local.set({ nudges: e.target.checked, nudgeSnoozedUntil: 0 }); render(); };

$('readNow').onclick = async () => {
  $('readNow').textContent = 'Reading...';
  await chrome.runtime.sendMessage({ type: 'readNow' });
  $('readNow').textContent = 'Sent to Kan';
};

$('blockSite').onclick = async (e) => {
  const domain = e.target.dataset.domain;
  if (!domain) return;
  await chrome.runtime.sendMessage({ type: 'blockSite', domain });
  render();
};

$('save').onclick = async () => {
  const endpoint = ($('endpoint').value.trim() || 'https://www.kanthink.com').replace(/\/$/, '');
  const token = $('token').value.trim();
  if (!/^https:\/\/|^http:\/\/localhost(:\d+)?$/.test(endpoint)) {
    $('detail').textContent = 'The address must be https (or http://localhost for testing).';
    return;
  }
  const update = { endpoint };
  if (token) {
    if (!/^kw_[A-Za-z0-9_-]{20,}$/.test(token)) {
      $('detail').textContent = "That doesn't look like a Kanwatch key.";
      return;
    }
    update.token = token;
  }
  await chrome.storage.local.set(update);
  await chrome.runtime.sendMessage({ type: 'flush' });
  render();
};

$('disconnect').onclick = async () => {
  // Stops recording and forgets the key. Anything not yet sent is discarded.
  await chrome.storage.local.set({ token: '', queue: [] });
  render();
};

render();
