// The clock that drives the studio's canvas compositor.
//
// This is deliberately NOT requestAnimationFrame. rAF is a *rendering* callback:
// Chrome stops firing it entirely when a tab is hidden, and on Windows "hidden"
// includes the Chrome window being fully occluded by another app's window. The
// /record flow asks you to share a window and then go work in that window —
// which backgrounds the studio tab by definition — so an rAF-driven loop stops
// painting the moment the recording gets interesting.
//
// That is not cosmetic. MediaRecorder is fed canvas.captureStream(), and a
// canvas only emits a frame when something draws to it. No rAF -> no draw -> no
// frames. Two real takes were lost this way: 61s and 70s recordings that
// captured 97 and 53 video frames, all bunched into the opening second and the
// closing two, with 57s and 68s of dead air between. They transcode and play
// fine; they are simply one frozen image for their whole middle.
//
// setInterval on the main thread is not the fix — hidden pages clamp timers to
// 1 Hz, then to once a minute under intensive throttling after five minutes.
// Timers inside a dedicated worker are exempt from both, and a message from a
// worker arrives on the main thread as an ordinary task rather than a throttled
// timer. So the clock lives in a worker and posts ticks back.

// Self-correcting so the tick rate doesn't drift against the wall clock over a
// long take. A stall (machine sleep, a blocked main thread) resets the deadline
// instead of firing a burst of catch-up ticks, which would only pile redundant
// draws onto an already-behind page.
const WORKER_SOURCE = `
let timer = null;
let interval = 33;
let next = 0;
function tick() {
  self.postMessage(0);
  const now = Date.now();
  next += interval;
  if (next < now) next = now + interval;
  timer = setTimeout(tick, Math.max(0, next - now));
}
self.onmessage = function (e) {
  const d = e.data || {};
  if (d.type === 'start') {
    if (timer !== null) clearTimeout(timer);
    interval = d.intervalMs;
    next = Date.now() + interval;
    timer = setTimeout(tick, interval);
  } else if (d.type === 'stop') {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
};
`;

export interface FrameClock {
  stop(): void;
  /** True when ticks come from a worker, i.e. they survive a hidden tab. */
  readonly visibilityProof: boolean;
}

/**
 * Call `onTick` at roughly `fps` times a second, whether or not the page is
 * visible. Falls back to rAF only if a worker can't be created.
 */
export function startFrameClock(fps: number, onTick: () => void): FrameClock {
  const intervalMs = Math.max(1, Math.round(1000 / fps));

  // A blob URL rather than a separate worker file: the source is a dozen lines
  // and this keeps the clock a plain import, with no bundler entry or public
  // asset to keep in sync.
  let worker: Worker | null = null;
  let url: string | null = null;
  try {
    url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    worker = new Worker(url);
  } catch {
    if (url) URL.revokeObjectURL(url);
    worker = null;
    url = null;
  }

  if (worker) {
    const w = worker;
    const u = url;
    w.onmessage = () => onTick();
    w.postMessage({ type: 'start', intervalMs });
    return {
      visibilityProof: true,
      stop() {
        w.postMessage({ type: 'stop' });
        w.terminate();
        if (u) URL.revokeObjectURL(u);
      },
    };
  }

  // Last resort. Throttled while hidden — the exact bug this module exists to
  // avoid — but a studio that draws while visible beats one that never draws.
  let raf = 0;
  let stopped = false;
  const loop = () => {
    if (stopped) return;
    onTick();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return {
    visibilityProof: false,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}
