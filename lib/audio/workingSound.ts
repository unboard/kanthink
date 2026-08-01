/**
 * The sound Kan makes while it is working.
 *
 * "Surge": a continuous sixteenth-note figure whose brightness and level rise
 * and fall together on a seven second cycle. The pattern never stops — it comes
 * forward and recedes like a wave washing in, so it loops seamlessly with no
 * audible repeat point.
 *
 * This is the single source of truth. The prototype gallery imports it too, so
 * what you audition there is what plays in voice mode.
 */

export interface WorkingSoundOptions {
  /** Master level. Lower under speech, higher when auditioning on its own. */
  level?: number;
}

/** Reverb impulse: noise under an exponential decay. */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buf;
}

/** Gentle soft-clip so the figure reads as present rather than thin. */
function makeSaturator(ctx: AudioContext, amount = 5): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  return shaper;
}

/** A slow cycle other parameters ride on: an LFO summed with a constant offset. */
function waveLfo(ctx: AudioContext, rateHz: number, depth: number, offset: number) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = rateHz;
  const amt = ctx.createGain();
  amt.gain.value = depth;
  osc.connect(amt);
  osc.start();

  const bias = ctx.createConstantSource();
  bias.offset.value = offset;
  bias.start();

  return {
    amt,
    bias,
    stop: (t: number) => {
      try { osc.stop(t); bias.stop(t); } catch { /* already stopped */ }
    },
  };
}

/** The figure, one note per step. Doubles an octave up on the second half. */
const PATTERN = [261.6, 392, 523.3, 392, 329.6, 523.3, 392, 261.6];
const STEP_MS = 125;
const WAVE_SECONDS = 7;

/**
 * Start the working sound. Returns a stop function that fades out and releases
 * every node — safe to call more than once.
 */
export function startWorkingSound(ctx: AudioContext, opts: WorkingSoundOptions = {}): () => void {
  const { level = 0.26 } = opts;
  const t0 = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(level, t0 + 0.6);

  const sat = makeSaturator(ctx);
  const trim = ctx.createGain();
  trim.gain.value = 0.75;
  master.connect(sat);
  sat.connect(trim);
  trim.connect(ctx.destination);

  // Reverb send
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, 2.6, 2.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  const send = ctx.createGain();
  send.gain.value = 0.5;
  send.connect(convolver);
  convolver.connect(wet);
  wet.connect(master);

  // Voice bus → resonant lowpass. Both ends of the wave are driven from here.
  const bus = ctx.createGain();
  bus.gain.value = 0.02;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 6;
  lp.frequency.value = 700;
  bus.connect(lp);
  lp.connect(master);
  lp.connect(send);

  // One cycle drives how bright and how loud the figure is — this is the wave.
  const bright = waveLfo(ctx, 1 / WAVE_SECONDS, 2200, 2500);
  bright.amt.connect(lp.frequency);
  bright.bias.connect(lp.frequency);
  const swell = waveLfo(ctx, 1 / WAVE_SECONDS, 0.016, 0.024);
  swell.amt.connect(bus.gain);
  swell.bias.connect(bus.gain);

  let step = 0;
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const tick = () => {
    if (stopped || ctx.state === 'closed') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = PATTERN[step % PATTERN.length] * (step % 16 >= 8 ? 2 : 1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 0.18);
    step++;
    timers.push(setTimeout(tick, STEP_MS));
  };
  tick();

  return () => {
    if (stopped) return;
    stopped = true;
    timers.forEach(clearTimeout);
    if (ctx.state === 'closed') return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.35);
    bright.stop(now + 0.5);
    swell.stop(now + 0.5);
  };
}
