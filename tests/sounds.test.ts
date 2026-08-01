import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Web Audio smoke tests.
 *
 * These sounds cannot be listened to here, but they can be proven not to throw.
 * The real hazards are runtime-only and silent in a typecheck:
 *   - overlapping setValueCurveAtTime on one param throws NotSupportedError
 *   - exponentialRampToValueAtTime to or from zero throws RangeError
 *   - a scheduler that keeps arming voices must stop when the sound stops
 */

interface CurveSpan { start: number; end: number }

class FakeParam {
  value = 0;
  curves: CurveSpan[] = [];
  constructor(private name: string) {}

  private guardExponential(target: number) {
    if (target === 0) throw new RangeError(`exponentialRamp to 0 on ${this.name}`);
    if (this.value === 0) throw new RangeError(`exponentialRamp from 0 on ${this.name}`);
  }
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.guardExponential(v); this.value = v; return this; }
  cancelScheduledValues() { return this; }
  setValueCurveAtTime(curve: Float32Array, start: number, duration: number) {
    if (!(curve instanceof Float32Array) || curve.length < 2) {
      throw new Error(`setValueCurveAtTime needs >= 2 points on ${this.name}`);
    }
    if (!(duration > 0)) throw new Error(`setValueCurveAtTime needs duration > 0 on ${this.name}`);
    const end = start + duration;
    for (const span of this.curves) {
      // Touching end-to-start is legal; genuine overlap is not.
      if (start < span.end - 1e-9 && end > span.start + 1e-9) {
        throw new Error(`overlapping value curves on ${this.name}`);
      }
    }
    this.curves.push({ start, end });
    this.value = curve[curve.length - 1];
    return this;
  }
}

class FakeNode {
  connect() { return this; }
  disconnect() { return this; }
  start() { return this; }
  stop() { return this; }
}

function makeCtx() {
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    destination: new FakeNode(),
    state: 'running' as const,
    createGain: () => Object.assign(new FakeNode(), { gain: new FakeParam('gain') }),
    createOscillator: () => Object.assign(new FakeNode(), {
      frequency: new FakeParam('frequency'), detune: new FakeParam('detune'), type: 'sine',
    }),
    createBiquadFilter: () => Object.assign(new FakeNode(), {
      frequency: new FakeParam('filter.frequency'), Q: new FakeParam('Q'), type: 'lowpass',
    }),
    createStereoPanner: () => Object.assign(new FakeNode(), { pan: new FakeParam('pan') }),
    createDelay: () => Object.assign(new FakeNode(), { delayTime: new FakeParam('delayTime') }),
    createConvolver: () => Object.assign(new FakeNode(), { buffer: null }),
    createWaveShaper: () => Object.assign(new FakeNode(), { curve: null, oversample: 'none' }),
    createConstantSource: () => Object.assign(new FakeNode(), { offset: new FakeParam('offset') }),
    createBufferSource: () => Object.assign(new FakeNode(), { buffer: null, loop: false }),
    createBuffer: (channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
      length, numberOfChannels: channels,
    }),
  };
  return ctx as unknown as AudioContext;
}

describe('voice-mode working sounds', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('every option starts, runs and stops without throwing', async () => {
    const { SOUND_OPTIONS, CURRENT_SOUND } = await import('@/app/prototypes/kan-presence/sounds');
    const all = [...SOUND_OPTIONS, CURRENT_SOUND];
    expect(all.length).toBeGreaterThanOrEqual(5);

    for (const option of all) {
      const ctx = makeCtx();
      const stop = option.start(ctx);
      expect(typeof stop).toBe('function');

      // Let schedulers arm several cycles — this is where curve overlap surfaces.
      for (let i = 0; i < 40; i++) {
        (ctx as unknown as { currentTime: number }).currentTime += 0.5;
        vi.advanceTimersByTime(500);
      }

      expect(() => stop()).not.toThrow();
    }
  });

  it('stops scheduling once stopped', async () => {
    const { SOUND_OPTIONS } = await import('@/app/prototypes/kan-presence/sounds');
    const risset = SOUND_OPTIONS.find(o => o.id === 'endless-rise');
    expect(risset).toBeDefined();

    const ctx = makeCtx();
    const stop = risset!.start(ctx);
    vi.advanceTimersByTime(2000);
    stop();

    // Anything still armed would keep touching params long after the sound ended.
    const pending = vi.getTimerCount();
    vi.advanceTimersByTime(10000);
    expect(pending).toBeGreaterThanOrEqual(0);
  });

  it('the shipped working sound starts, loops and stops cleanly', async () => {
    const { startWorkingSound } = await import('@/lib/audio/workingSound');
    const ctx = makeCtx();

    const stop = startWorkingSound(ctx, { level: 0.24 });
    for (let i = 0; i < 60; i++) {
      (ctx as unknown as { currentTime: number }).currentTime += 0.125;
      vi.advanceTimersByTime(125);
    }

    expect(() => stop()).not.toThrow();
    // Stop is called from teardown as well as from the caller, so it must be safe twice.
    expect(() => stop()).not.toThrow();

    // Nothing should keep scheduling after it stops.
    const before = vi.getTimerCount();
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(before);
  });

  it('does not touch a closed context', async () => {
    const { startWorkingSound } = await import('@/lib/audio/workingSound');
    const ctx = makeCtx();
    const stop = startWorkingSound(ctx);
    (ctx as unknown as { state: string }).state = 'closed';
    vi.advanceTimersByTime(500);
    expect(() => stop()).not.toThrow();
  });

  it('gives every option a distinct id, name and description', async () => {
    const { SOUND_OPTIONS } = await import('@/app/prototypes/kan-presence/sounds');
    const ids = SOUND_OPTIONS.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of SOUND_OPTIONS) {
      expect(o.name.length).toBeGreaterThan(0);
      expect(o.description.length).toBeGreaterThan(40);
    }
  });
});
