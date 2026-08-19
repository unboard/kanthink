import { describe, it, expect, vi, afterEach } from 'vitest';
import { startFrameClock } from '@/lib/record/frameClock';

// Two real recordings — 61s and 70s — came out as a single frozen picture
// because the compositor drew on requestAnimationFrame. Chrome stops firing rAF
// in a hidden tab, and sharing a window then working in it hides the studio tab
// by definition. canvas.captureStream() only emits a frame when something draws,
// so capture froze on the last frame painted before the switch: 97 and 53 video
// frames for takes that should have held ~1,800 and ~2,100.
//
// The invariant these tests protect: the clock driving the recording must not be
// a rendering callback, and must not be a main-thread timer either (hidden pages
// clamp those to 1 Hz, then to once a minute). It has to be a worker. If anyone
// "simplifies" frameClock.ts back to rAF, this fails.

interface FakeWorker {
  posted: unknown[];
  terminated: boolean;
  onmessage: ((e: { data: number }) => void) | null;
}

/**
 * Install a Worker/Blob/URL trio. Returns the workers constructed and the source
 * strings handed to Blob, so the worker body can be exercised for real below.
 */
function stubWorkerEnvironment() {
  const workers: FakeWorker[] = [];
  const sources: string[] = [];

  class W {
    posted: unknown[] = [];
    terminated = false;
    onmessage: ((e: { data: number }) => void) | null = null;
    constructor() { workers.push(this as unknown as FakeWorker); }
    postMessage(m: unknown) { this.posted.push(m); }
    terminate() { this.terminated = true; }
  }

  vi.stubGlobal('Worker', W);
  vi.stubGlobal('Blob', class {
    constructor(parts: unknown[]) { sources.push(String(parts[0])); }
  });
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:frame-clock',
    revokeObjectURL: () => {},
  });

  return { workers, sources };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('frame clock', () => {
  it('drives ticks from a worker, never requestAnimationFrame', () => {
    const { workers } = stubWorkerEnvironment();
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);

    const clock = startFrameClock(30, () => {});

    expect(workers).toHaveLength(1);
    // The whole point: a hidden tab must not stop the recording.
    expect(clock.visibilityProof).toBe(true);
    expect(raf).not.toHaveBeenCalled();
    clock.stop();
  });

  it('asks the worker for the requested frame interval', () => {
    const { workers } = stubWorkerEnvironment();
    const clock = startFrameClock(30, () => {});

    expect(workers[0].posted[0]).toEqual({ type: 'start', intervalMs: 33 });
    clock.stop();
  });

  it('forwards worker messages to the draw callback', () => {
    const { workers } = stubWorkerEnvironment();
    const onTick = vi.fn();
    const clock = startFrameClock(30, onTick);

    workers[0].onmessage?.({ data: 0 });
    workers[0].onmessage?.({ data: 0 });

    expect(onTick).toHaveBeenCalledTimes(2);
    clock.stop();
  });

  it('stops and terminates the worker so a finished take leaves nothing running', () => {
    const { workers } = stubWorkerEnvironment();
    const clock = startFrameClock(30, () => {});
    clock.stop();

    expect(workers[0].posted).toContainEqual({ type: 'stop' });
    expect(workers[0].terminated).toBe(true);
  });

  it('falls back to rAF only when a worker cannot be created, and admits it', () => {
    stubWorkerEnvironment();
    vi.stubGlobal('Worker', class { constructor() { throw new Error('no workers'); } });
    const raf = vi.fn(() => 7);
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', cancel);

    const clock = startFrameClock(30, () => {});

    expect(raf).toHaveBeenCalled();
    // Callers can tell this clock will stall when hidden.
    expect(clock.visibilityProof).toBe(false);
    clock.stop();
    expect(cancel).toHaveBeenCalledWith(7);
  });
});

describe('frame clock worker body', () => {
  // The worker ships as a source string, so a typo in it is invisible to both
  // tsc and eslint — and would silently downgrade every recording. Evaluate the
  // real body against a fake worker scope and check it actually ticks.
  function runWorkerBody(source: string) {
    const ticks: number[] = [];
    const scope = {
      postMessage: () => ticks.push(Date.now()),
      onmessage: null as null | ((e: { data: unknown }) => void),
    };
    // The body references setTimeout/clearTimeout from its own global scope,
    // which in a real worker is `self`; here they resolve to the test globals.
    new Function('self', `with (self) { ${source} }`)(scope);
    return { ticks, send: (data: unknown) => scope.onmessage?.({ data }) };
  }

  it('ticks at the requested rate until told to stop', () => {
    const { sources } = stubWorkerEnvironment();
    const clock = startFrameClock(30, () => {});
    expect(sources).toHaveLength(1);

    vi.useFakeTimers();
    try {
      const { ticks, send } = runWorkerBody(sources[0]);
      send({ type: 'start', intervalMs: 33 });

      vi.advanceTimersByTime(1000);
      // ~30 ticks per second, with slack for the rounded 33ms interval.
      expect(ticks.length).toBeGreaterThanOrEqual(28);
      expect(ticks.length).toBeLessThanOrEqual(32);

      send({ type: 'stop' });
      const settled = ticks.length;
      vi.advanceTimersByTime(1000);
      expect(ticks.length).toBe(settled);
    } finally {
      vi.useRealTimers();
    }
    clock.stop();
  });

  it('does not fire a burst of catch-up ticks after a long stall', () => {
    const { sources } = stubWorkerEnvironment();
    const clock = startFrameClock(30, () => {});

    vi.useFakeTimers();
    try {
      const { ticks, send } = runWorkerBody(sources[0]);
      send({ type: 'start', intervalMs: 33 });

      // Machine sleeps for a minute: the deadline resets rather than trying to
      // replay ~1,800 missed frames into an already-behind page.
      vi.setSystemTime(Date.now() + 60_000);
      vi.advanceTimersByTime(33);
      expect(ticks.length).toBeLessThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
    clock.stop();
  });
});
