/**
 * Kanwatch page script.
 *
 * Asks the background worker first whether this page may be recorded at all. On a
 * private page (banking, email, sign-in, checkout, …) it gets "no" and returns
 * without attaching a single listener.
 *
 * On other pages it reports two things:
 *   - the page's own summary: its first heading and meta description
 *   - engagement as COUNTS: how many keys were pressed, clicks, how far you
 *     scrolled, whether audio/video was playing. It never reads which keys, what
 *     was typed, or form contents.
 *
 * The page's main text is read only when the worker asks, and the worker asks only
 * for public reading that privacy.js allows (a post, article, video, discussion,
 * docs). Anything you could type into (reply boxes, forms, editors) is removed
 * before the text is taken, so a draft is never read.
 */
(() => {
  if (window.top !== window) return;

  // Reloading or updating the extension cuts off the copy of this script already
  // running in open tabs. Every call to chrome.runtime from then on throws
  // "Extension context invalidated" — synchronously, so a .catch never sees it — and
  // it would do that every few seconds until the tab was reloaded. So every call
  // goes through send(), and the first sign of being cut off stops this copy.
  const timers = [];
  const cleanups = [];
  let stopped = false;
  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    timers.forEach(clearInterval);
    cleanups.forEach((fn) => fn());
  };
  const send = (msg, callback) => {
    if (stopped || !alive()) return stop();
    try {
      if (callback) chrome.runtime.sendMessage(msg, callback);
      else chrome.runtime.sendMessage(msg).catch(() => {});
    } catch {
      stop();
    }
  };
  const every = (fn, ms) => timers.push(setInterval(() => (alive() ? fn() : stop()), ms));
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  };

  send({ type: 'hello' }, (reply) => {
    if (chrome.runtime.lastError || !reply?.track) return;
    start();
  });

  function start() {
    let keystrokes = 0;
    let clicks = 0;
    let scrollDepth = 0;
    let mediaSeconds = 0;

    const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const meta = (name) =>
      document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute('content')?.trim() || '';

    const sendMeta = () => {
      send({
        type: 'meta',
        heading: text(document.querySelector('h1')),
        description: (meta('description') || meta('og:description')).slice(0, 300),
        ogType: meta('og:type').slice(0, 40),
      });
    };

    const measureScroll = () => {
      const doc = document.documentElement;
      const height = Math.max(doc.scrollHeight, 1);
      const reached = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / height) * 100));
      if (reached > scrollDepth) scrollDepth = reached;
    };

    const playing = () =>
      [...document.querySelectorAll('video, audio')].some((m) => !m.paused && !m.ended && m.readyState > 2);

    // Counted, never recorded: the event is not inspected beyond "a key was pressed".
    listen(document, 'keydown', () => { keystrokes += 1; }, { capture: true, passive: true });
    listen(document, 'pointerdown', () => { clicks += 1; }, { capture: true, passive: true });
    listen(window, 'scroll', measureScroll, { passive: true });

    every(() => {
      if (document.visibilityState === 'visible' && playing()) mediaSeconds += 5;
    }, 5000);

    const flush = () => {
      measureScroll();
      const isPlaying = document.visibilityState === 'visible' && playing();
      if (!keystrokes && !clicks && !mediaSeconds && !isPlaying && !scrollDepth) return;
      send({
        type: 'engagement',
        keystrokes, clicks, scrollDepth, mediaSeconds,
        playing: isPlaying,
      });
      keystrokes = 0;
      clicks = 0;
      mediaSeconds = 0;
      // scrollDepth is a high-water mark; the worker keeps the max.
    };

    /** The main readable text, with every typing surface stripped out first. */
    const mainText = () => {
      const tweets = [...document.querySelectorAll('article[data-testid="tweet"]')];
      const roots = tweets.length
        ? tweets.slice(0, 12)
        : [document.querySelector('article') || document.querySelector('main') || document.body];
      return roots
        .map((root) => {
          const copy = root.cloneNode(true);
          copy.querySelectorAll('input, textarea, select, form, [contenteditable], [role="textbox"], script, style, noscript, nav, footer, aside')
            .forEach((el) => el.remove());
          return (copy.innerText || copy.textContent || '').replace(/\s+/g, ' ').trim();
        })
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 8000);
    };

    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type !== 'extract') return;
        sendResponse({ text: mainText(), ogType: meta('og:type'), title: document.title });
      });
    } catch {
      return stop();
    }

    sendMeta();
    measureScroll();
    every(flush, 15000);
    listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });

    // Single-page apps change pages without reloading; re-read the heading when the URL moves.
    let lastUrl = location.href;
    every(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        flush();
        scrollDepth = 0;
        setTimeout(sendMeta, 800);
      }
    }, 1000);
  }
})();
