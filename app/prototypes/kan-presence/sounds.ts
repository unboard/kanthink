/**
 * Candidate "Kan is working" loops for voice mode.
 *
 * The earlier attempts were bare oscillators straight into the destination:
 * mono, dry, centered, with arbitrary pitches. That is why they sounded like
 * test tones rather than something designed. This set is built on a small rig
 * instead — convolution reverb for space, stereo placement for width, FM for
 * timbre, and pitches drawn from one pentatonic set so overlapping voices
 * always consonate.
 *
 * Everything stays quiet on purpose: these play underneath speech.
 */

export interface SoundOption {
  id: string;
  name: string;
  description: string;
  start: (ctx: AudioContext) => () => void;
}

/* ── Rig ──────────────────────────────────────────────────────────
   A dry path and a reverb send into a shared master, so every voice in a
   given sound sits in the same room. */

interface Rig {
  ctx: AudioContext;
  /** Connect voices here for the dry signal. */
  input: GainNode;
  /** Connect voices here as well to place them in the room. */
  send: GainNode;
  master: GainNode;
  stop: (release?: number) => void;
}

/** Procedural impulse response: noise shaped by an exponential decay. */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      // Slight per-channel difference is what gives the tail its width.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buf;
}

function createRig(
  ctx: AudioContext,
  opts: { seconds?: number; decay?: number; wet?: number; tone?: number; level?: number } = {},
): Rig {
  const { seconds = 2.8, decay = 2.4, wet = 0.5, tone = 4200, level = 0.9 } = opts;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(level, ctx.currentTime + 0.4);

  // Tame the top end so nothing gets brittle under speech.
  const tilt = ctx.createBiquadFilter();
  tilt.type = 'lowpass';
  tilt.frequency.value = tone;
  master.connect(tilt);
  tilt.connect(ctx.destination);

  const input = ctx.createGain();
  input.connect(master);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, seconds, decay);
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet;
  const send = ctx.createGain();
  send.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(master);

  return {
    ctx,
    input,
    send,
    master,
    stop: (release = 0.5) => {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + release);
    },
  };
}

/** Route one voice into both the dry path and the room. */
function place(rig: Rig, node: AudioNode, pan: number, sendAmount = 0.8): AudioNode {
  const panner = rig.ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(panner);
  panner.connect(rig.input);
  const s = rig.ctx.createGain();
  s.gain.value = sendAmount;
  panner.connect(s);
  s.connect(rig.send);
  return panner;
}

/**
 * A struck tone via frequency modulation — the modulator's decay is faster than
 * the carrier's, which is what gives a mallet its bright attack and warm tail.
 */
function mallet(
  rig: Rig,
  opts: { freq: number; at?: number; dur?: number; gain?: number; ratio?: number; index?: number; pan?: number },
) {
  const { ctx } = rig;
  const { freq, at = ctx.currentTime, dur = 2.2, gain = 0.05, ratio = 2.4, index = 340, pan = 0 } = opts;

  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = freq;

  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = freq * ratio;
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(index, at);
  modGain.gain.exponentialRampToValueAtTime(0.5, at + dur * 0.35);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0004, at + dur);

  carrier.connect(env);
  place(rig, env, pan);

  carrier.start(at);
  mod.start(at);
  carrier.stop(at + dur + 0.1);
  mod.stop(at + dur + 0.1);
}

/** F# pentatonic — no semitone clashes, so overlapping tails stay consonant. */
const SCALE = [370, 415.3, 493.9, 554.4, 622.3, 740, 830.6];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function noiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Schedule a repeating callback that can be cleanly torn down. */
function loop(fn: (again: (ms: number) => void) => void): () => void {
  let stopped = false;
  const timers: number[] = [];
  const again = (ms: number) => {
    if (stopped) return;
    timers.push(window.setTimeout(run, ms));
  };
  const run = () => { if (!stopped) fn(again); };
  run();
  return () => { stopped = true; timers.forEach(clearTimeout); };
}

/* ── The set ──────────────────────────────────────────────────── */

export const SOUND_OPTIONS: SoundOption[] = [
  {
    id: 'spore-bloom',
    name: 'Spore bloom',
    description:
      'Soft mallet tones from a pentatonic set, panned wide and left to ring out into a long tail. Warm and unhurried — the tails overlap into a slowly shifting chord, so it never repeats exactly.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 3.6, decay: 2.2, wet: 0.62, level: 0.85 });
      const stopLoop = loop((again) => {
        mallet(rig, {
          freq: pick(SCALE),
          dur: 2.4 + Math.random(),
          gain: 0.032 + Math.random() * 0.016,
          ratio: 2.01,
          index: 260,
          pan: (Math.random() * 2 - 1) * 0.75,
        });
        again(620 + Math.random() * 900);
      });
      return () => { stopLoop(); rig.stop(0.9); };
    },
  },
  {
    id: 'cavern-breath',
    name: 'Cavern breath',
    description:
      'A slow pad of detuned voices under a filter that opens and closes like breathing, drifting gently across the stereo field. The most "ambient record" of the set — closest to the current hum, but with somewhere to live.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 4.5, decay: 1.8, wet: 0.72, tone: 2600, level: 0.9 });

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.Q.value = 3.5;
      place(rig, filter, 0, 0.9);

      // Breathing filter sweep
      const sweep = ctx.createOscillator();
      sweep.frequency.value = 0.075;
      const sweepAmt = ctx.createGain();
      sweepAmt.gain.value = 260;
      sweep.connect(sweepAmt);
      sweepAmt.connect(filter.frequency);
      sweep.start();

      // Root, fifth, octave, plus a detuned pair for movement
      const voices = [92.5, 92.9, 138.6, 185, 277.2].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 4 ? 'triangle' : 'sawtooth';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = i === 4 ? 0.016 : 0.026;
        o.connect(g);
        g.connect(filter);
        o.start();
        return o;
      });

      // Slow stereo drift so it never sits perfectly still
      const drift = ctx.createOscillator();
      drift.frequency.value = 0.04;
      const driftAmt = ctx.createGain();
      driftAmt.gain.value = 0.5;
      drift.connect(driftAmt);
      drift.start();

      return () => {
        rig.stop(1.1);
        const t = ctx.currentTime + 1.3;
        voices.forEach(o => o.stop(t));
        sweep.stop(t);
        drift.stop(t);
      };
    },
  },
  {
    id: 'petrichor',
    name: 'Petrichor',
    description:
      'Fine rain with pitched droplets falling into a large reverberant space. The droplets are tuned to the same scale as the mallets, so it reads as designed rather than as a field recording.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 3.2, decay: 2.6, wet: 0.55, tone: 6000, level: 0.85 });

      // Rain bed
      const rain = ctx.createBufferSource();
      rain.buffer = noiseBuffer(ctx, 4);
      rain.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 0.7;
      const rainGain = ctx.createGain();
      rainGain.gain.value = 0.022;
      rain.connect(bp);
      bp.connect(rainGain);
      place(rig, rainGain, 0, 0.35);
      rain.start();

      const shimmer = ctx.createOscillator();
      shimmer.frequency.value = 0.11;
      const shimmerAmt = ctx.createGain();
      shimmerAmt.gain.value = 800;
      shimmer.connect(shimmerAmt);
      shimmerAmt.connect(bp.frequency);
      shimmer.start();

      const stopLoop = loop((again) => {
        mallet(rig, {
          freq: pick(SCALE) * (Math.random() < 0.3 ? 2 : 1),
          dur: 1.5 + Math.random(),
          gain: 0.022 + Math.random() * 0.012,
          ratio: 3.02,
          index: 180,
          pan: (Math.random() * 2 - 1) * 0.85,
        });
        again(700 + Math.random() * 1500);
      });

      return () => {
        stopLoop();
        rig.stop(0.9);
        const t = ctx.currentTime + 1.1;
        try { rain.stop(t); shimmer.stop(t); } catch { /* already stopped */ }
      };
    },
  },
  {
    id: 'mycelium-choir',
    name: 'Mycelium choir',
    description:
      'A soft chord that swells in, changes voicing, and fades — like breath through a pipe organ heard from another room. The most beautiful of the set, and the least busy.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 5, decay: 1.6, wet: 0.8, tone: 3000, level: 0.9 });

      const voicings = [
        [185, 277.2, 370],
        [207.7, 311.1, 415.3],
        [164.8, 246.9, 329.6],
        [185, 246.9, 370],
      ];
      let step = 0;

      const stopLoop = loop((again) => {
        const chord = voicings[step % voicings.length];
        step++;
        const t0 = ctx.currentTime;
        chord.forEach((freq, i) => {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = freq;
          const detune = ctx.createOscillator();
          detune.type = 'sine';
          detune.frequency.value = 0.18 + i * 0.05;
          const detuneAmt = ctx.createGain();
          detuneAmt.gain.value = 1.4;
          detune.connect(detuneAmt);
          detuneAmt.connect(o.frequency);

          const env = ctx.createGain();
          env.gain.setValueAtTime(0, t0);
          env.gain.linearRampToValueAtTime(0.026, t0 + 1.4);
          env.gain.linearRampToValueAtTime(0.02, t0 + 2.6);
          env.gain.exponentialRampToValueAtTime(0.0004, t0 + 4.2);

          o.connect(env);
          place(rig, env, (i - 1) * 0.55, 0.9);
          o.start(t0); detune.start(t0);
          o.stop(t0 + 4.4); detune.stop(t0 + 4.4);
        });
        again(3600);
      });

      return () => { stopLoop(); rig.stop(1.2); };
    },
  },
  {
    id: 'loam-pulse',
    name: 'Loam pulse',
    description:
      'A gentle heartbeat with a soft shaker and an occasional mallet accent over the top. The only one with a pulse you can follow, so a long wait feels measured instead of open-ended.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 2.4, decay: 2.8, wet: 0.4, tone: 5200, level: 0.9 });
      let beat = 0;

      const stopLoop = loop((again) => {
        const t = ctx.currentTime;
        const downbeat = beat % 4 === 0;

        // Low pulse
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(downbeat ? 88 : 74, t);
        o.frequency.exponentialRampToValueAtTime(46, t + 0.24);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(downbeat ? 0.055 : 0.03, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0004, t + 0.38);
        o.connect(g);
        place(rig, g, 0, 0.25);
        o.start(t); o.stop(t + 0.4);

        // Shaker
        const sh = ctx.createBufferSource();
        sh.buffer = noiseBuffer(ctx, 0.09);
        const shf = ctx.createBiquadFilter();
        shf.type = 'highpass';
        shf.frequency.value = 5200;
        const shg = ctx.createGain();
        shg.gain.setValueAtTime(downbeat ? 0.014 : 0.008, t);
        shg.gain.exponentialRampToValueAtTime(0.0003, t + 0.07);
        sh.connect(shf); shf.connect(shg);
        place(rig, shg, beat % 2 === 0 ? -0.35 : 0.35, 0.5);
        sh.start(t); sh.stop(t + 0.1);

        // Occasional melodic accent
        if (beat % 8 === 2) {
          mallet(rig, { freq: pick(SCALE), dur: 1.8, gain: 0.026, ratio: 2.01, index: 220, pan: 0.4 });
        }

        beat++;
        again(560);
      });

      return () => { stopLoop(); rig.stop(0.6); };
    },
  },
];

/** The tone shipping today, for A/B comparison. */
export const CURRENT_SOUND: SoundOption = {
  id: 'current',
  name: 'Current (for comparison)',
  description: 'A 220Hz sine with a 0.3Hz LFO sweep plus a 660Hz harmonic — dry, mono, no space. The "wuuurrruuuur".',
  start: (ctx) => {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.5);
    gain.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(220, ctx.currentTime);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.3, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(15, ctx.currentTime);
    lfo.connect(lfoGain); lfoGain.connect(osc1.frequency);
    lfo.start(); osc1.connect(gain); osc1.start();

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(660, ctx.currentTime);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.015, ctx.currentTime);
    osc2.connect(gain2); gain2.connect(ctx.destination);
    osc2.start();

    return () => {
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      gain2.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc1.stop(ctx.currentTime + 0.4);
      osc2.stop(ctx.currentTime + 0.4);
      lfo.stop(ctx.currentTime + 0.4);
    };
  },
};
