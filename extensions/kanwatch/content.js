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
 *     was typed, form contents, or the page text.
 */
(() => {
  if (window.top !== window) return;

  chrome.runtime.sendMessage({ type: 'hello' }, (reply) => {
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
      chrome.runtime.sendMessage({
        type: 'meta',
        heading: text(document.querySelector('h1')),
        description: (meta('description') || meta('og:description')).slice(0, 300),
      }).catch?.(() => {});
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
    document.addEventListener('keydown', () => { keystrokes += 1; }, { capture: true, passive: true });
    document.addEventListener('pointerdown', () => { clicks += 1; }, { capture: true, passive: true });
    window.addEventListener('scroll', measureScroll, { passive: true });

    setInterval(() => {
      if (document.visibilityState === 'visible' && playing()) mediaSeconds += 5;
    }, 5000);

    const flush = () => {
      measureScroll();
      const isPlaying = document.visibilityState === 'visible' && playing();
      if (!keystrokes && !clicks && !mediaSeconds && !isPlaying && !scrollDepth) return;
      chrome.runtime.sendMessage({
        type: 'engagement',
        keystrokes, clicks, scrollDepth, mediaSeconds,
        playing: isPlaying,
      }).catch?.(() => {});
      keystrokes = 0;
      clicks = 0;
      mediaSeconds = 0;
      // scrollDepth is a high-water mark; the worker keeps the max.
    };

    sendMeta();
    measureScroll();
    setInterval(flush, 15000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });

    // Single-page apps change pages without reloading; re-read the heading when the URL moves.
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        flush();
        scrollDepth = 0;
        setTimeout(sendMeta, 800);
      }
    }, 1000);
  }
})();
