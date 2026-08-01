/**
 * "Kan is working" loops for voice mode.
 *
 * Earlier rounds failed for one structural reason: they were a single engine
 * parameterised four ways — same drone, same emitter, same closed filter — so
 * of course they sounded alike. They were also quiet (peak ~0.03), dark
 * (lowpass at 400Hz) and slow to attack, which is a recipe for tasteful
 * background rather than something you enjoy hearing.
 *
 * This set inverts all of that. Each sound is its own engine, and each is built
 * on what actually feels good to hear:
 *
 *   rising pitch that lands  — anticipation then resolution, the coin-collect
 *     effect. A run that resolves is satisfying; a drone that never arrives
 *     anywhere is not.
 *   punchy transients        — 2ms attacks with a pitch blip on the front, so
 *     each event has a body you feel rather than a swell you tolerate.
 *   brightness               — presence up in 1–5kHz instead of everything
 *     buried under a closed filter.
 *   real level               — roughly four times louder than the last set.
 *
 * They still duck under speech, but they are no longer hiding.
 */

export interface SoundOption {
  id: string;
  name: string;
  description: string;
  start: (ctx: AudioContext) => () => void;
}

/* ── Shared polish ───────────────────────────────────────────────
   Deliberately thin: reverb and a touch of saturation. Everything that gives
   each sound its identity lives in its own engine, not here. */

interface Rig {
  ctx: AudioContext;
  input: GainNode;
  send: GainNode;
  master: GainNode;
  stop: (release?: number) => void;
}

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

/** Gentle soft-clip. Adds harmonics so notes read as present rather than thin. */
function makeSaturator(ctx: AudioContext, amount = 8): WaveShaperNode {
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

function createRig(
  ctx: AudioContext,
  opts: { seconds?: number; decay?: number; wet?: number; level?: number; drive?: number } = {},
): Rig {
  const { seconds = 2.4, decay = 2.6, wet = 0.32, level = 0.62, drive = 6 } = opts;
  const t = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, t);
  master.gain.linearRampToValueAtTime(level, t + 0.12);

  const sat = makeSaturator(ctx, drive);
  const trim = ctx.createGain();
  trim.gain.value = 0.7;
  master.connect(sat);
  sat.connect(trim);
  trim.connect(ctx.destination);

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
    ctx, input, send, master,
    stop: (release = 0.35) => {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + release);
    },
  };
}

function out(rig: Rig, node: AudioNode, pan = 0, sendAmt = 0.6) {
  const p = rig.ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(p);
  p.connect(rig.input);
  const s = rig.ctx.createGain();
  s.gain.value = sendAmt;
  p.connect(s);
  s.connect(rig.send);
}

function loop(fn: (again: (ms: number) => void) => void): () => void {
  let stopped = false;
  const timers: number[] = [];
  const again = (ms: number) => { if (!stopped) timers.push(window.setTimeout(run, ms)); };
  const run = () => { if (!stopped) fn(again); };
  run();
  return () => { stopped = true; timers.forEach(clearTimeout); };
}

function noiseBuffer(ctx: AudioContext, seconds = 1): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, length, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/* ── Voices ────────────────────────────────────────────────────── */

/** Bright bell with a fast attack and a pitch blip on the front — reads as a "ping". */
function bell(rig: Rig, freq: number, at: number, gain = 0.11, dur = 1.1, pan = 0) {
  const { ctx } = rig;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0006, at + dur);

  [1, 2.01, 3.02, 4.7].forEach((ratio, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    // Quick upward blip on the attack is what makes it pop rather than fade in.
    o.frequency.setValueAtTime(freq * ratio * 0.94, at);
    o.frequency.exponentialRampToValueAtTime(freq * ratio, at + 0.03);
    const vg = ctx.createGain();
    vg.gain.value = [1, 0.38, 0.16, 0.07][i];
    o.connect(vg); vg.connect(g);
    o.start(at); o.stop(at + dur + 0.05);
  });
  out(rig, g, pan, 0.55);
}

/** Wet resonant pop — the bubble-wrap sound. */
function pop(rig: Rig, freq: number, at: number, gain = 0.13, pan = 0) {
  const { ctx } = rig;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 0.35, at);
  o.frequency.exponentialRampToValueAtTime(freq * 1.9, at + 0.045);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(freq * 1.4, at);
  bp.frequency.exponentialRampToValueAtTime(freq * 3, at + 0.05);
  bp.Q.value = 4;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0005, at + 0.16);

  o.connect(bp); bp.connect(g);
  out(rig, g, pan, 0.4);
  o.start(at); o.stop(at + 0.2);
}

/** Tiny bright grain for cascades. */
function grain(rig: Rig, freq: number, at: number, gain = 0.05, pan = 0) {
  const { ctx } = rig;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0004, at + 0.28);
  o.connect(g);
  out(rig, g, pan, 0.75);
  o.start(at); o.stop(at + 0.3);
}

// C major pentatonic, high and bright.
const PENTA = [523.3, 587.3, 659.3, 784, 880, 1046.5, 1174.7, 1318.5];

/* ── The set ──────────────────────────────────────────────────── */

export const SOUND_OPTIONS: SoundOption[] = [
  {
    id: 'bloom',
    name: 'Bloom',
    description:
      'A six-note run climbs the scale and lands on the octave, with a shimmer on the resolve. The rise-then-arrival is the hook — it is the coin-collect shape, slowed down enough to live under a conversation. Repeats about every two and a half seconds, starting from a different rung each time so it never feels looped.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 2.6, decay: 2.4, wet: 0.4, level: 0.6 });
      let offset = 0;

      const stopLoop = loop((again) => {
        const t = ctx.currentTime;
        const start = offset % 3;
        const run = [0, 1, 2, 3, 4].map(i => PENTA[start + i]);
        run.forEach((f, i) => bell(rig, f, t + i * 0.085, 0.075, 0.75, (i - 2) * 0.25));
        // The landing — louder, longer, an octave up, with a sparkle on top.
        const landAt = t + run.length * 0.085;
        bell(rig, PENTA[start + 5] ?? PENTA[PENTA.length - 1], landAt, 0.13, 1.9, 0);
        grain(rig, (PENTA[start + 5] ?? 1318.5) * 2, landAt + 0.02, 0.045, 0.5);
        offset++;
        again(2400);
      });

      return () => { stopLoop(); rig.stop(0.5); };
    },
  },
  {
    id: 'bubble-pop',
    name: 'Bubble pop',
    description:
      'Wet resonant pops, each one a tiny upward blip, arriving in loose clusters and climbing in pitch through the cluster. Tactile and a bit compulsive — closest to bubble wrap or water dripping into a tin. The most physically satisfying of the five and the least musical.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 1.9, decay: 3, wet: 0.3, level: 0.62, drive: 10 });

      const stopLoop = loop((again) => {
        const t = ctx.currentTime;
        const count = 2 + Math.floor(Math.random() * 4);
        const base = 260 + Math.random() * 180;
        for (let i = 0; i < count; i++) {
          // Rising through the cluster is what turns a noise into a gesture.
          pop(rig, base * (1 + i * 0.28), t + i * (0.085 + Math.random() * 0.05), 0.12, (Math.random() * 2 - 1) * 0.7);
        }
        again(520 + Math.random() * 700);
      });

      return () => { stopLoop(); rig.stop(0.3); };
    },
  },
  {
    id: 'the-groove',
    name: 'The groove',
    description:
      'An actual beat: soft kick, shaker on the offbeat, a bouncing bass note and a melodic blip that answers it. Around 100bpm, so it nods along rather than rushing. Completely different family from everything else here — this one has momentum instead of atmosphere.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 1.6, decay: 3.2, wet: 0.22, level: 0.6, drive: 5 });
      const step = 150; // ms per 16th at ~100bpm
      let i = 0;

      const stopLoop = loop((again) => {
        const t = ctx.currentTime;
        const beat = i % 8;

        if (beat === 0 || beat === 5) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(120, t);
          o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.16, t + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0005, t + 0.3);
          o.connect(g); out(rig, g, 0, 0.12);
          o.start(t); o.stop(t + 0.32);
        }

        if (beat % 2 === 1) {
          const s = ctx.createBufferSource();
          s.buffer = noiseBuffer(ctx, 0.06);
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 6500;
          const g = ctx.createGain();
          g.gain.setValueAtTime(beat === 3 ? 0.05 : 0.03, t);
          g.gain.exponentialRampToValueAtTime(0.0004, t + 0.05);
          s.connect(hp); hp.connect(g);
          out(rig, g, beat % 4 === 1 ? -0.4 : 0.4, 0.3);
          s.start(t); s.stop(t + 0.07);
        }

        if (beat === 2 || beat === 6) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = beat === 2 ? 130.8 : 174.6;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.075, t + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0005, t + 0.26);
          o.connect(g); out(rig, g, -0.2, 0.25);
          o.start(t); o.stop(t + 0.28);
        }

        if (beat === 4) bell(rig, PENTA[2 + (Math.floor(i / 8) % 3)], t, 0.07, 0.7, 0.45);

        i++;
        again(step);
      });

      return () => { stopLoop(); rig.stop(0.3); };
    },
  },
  {
    id: 'sparkle-cascade',
    name: 'Sparkle cascade',
    description:
      'Fast runs of tiny bright grains tumbling down the scale, like a thumb dragged across a harp. Pure ear candy, and the brightest thing here — it sparkles rather than hums, which is the fastest way to feel like something good just happened.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 3, decay: 2, wet: 0.55, level: 0.55 });

      const stopLoop = loop((again) => {
        const t = ctx.currentTime;
        const down = Math.random() < 0.6;
        const n = 9;
        for (let i = 0; i < n; i++) {
          const idx = down ? PENTA.length - 1 - (i % PENTA.length) : i % PENTA.length;
          grain(rig, PENTA[idx] * (i > 6 ? 2 : 1), t + i * 0.042, 0.05, ((i / n) * 2 - 1) * 0.8);
        }
        // A soft landing note so the run resolves rather than just stopping.
        bell(rig, down ? PENTA[0] : PENTA[5], t + n * 0.042 + 0.05, 0.085, 1.5, 0);
        again(1900 + Math.random() * 900);
      });

      return () => { stopLoop(); rig.stop(0.5); };
    },
  },
  {
    id: 'tension-reward',
    name: 'Tension & reward',
    description:
      'A build and a payoff on a loop: pitch and brightness climb for a second and a half while a tremolo tightens, then it breaks into a resolved major chord with a sparkle over the top. The most overtly gratifying of the five — it is the dopamine loop in its plainest form, so it may be too much for a long wait.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 2.8, decay: 2.2, wet: 0.42, level: 0.58 });

      const stopLoop = loop((again) => {
        const t = ctx.currentTime;
        const build = 1.5;

        // Rising tension
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(160, t);
        o.frequency.exponentialRampToValueAtTime(430, t + build);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 7;
        lp.frequency.setValueAtTime(360, t);
        lp.frequency.exponentialRampToValueAtTime(3200, t + build);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.004, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + build);
        g.gain.exponentialRampToValueAtTime(0.0005, t + build + 0.12);
        // Tremolo tightening as it climbs
        const trem = ctx.createOscillator();
        trem.frequency.setValueAtTime(5, t);
        trem.frequency.linearRampToValueAtTime(17, t + build);
        const tremAmt = ctx.createGain();
        tremAmt.gain.value = 0.022;
        trem.connect(tremAmt); tremAmt.connect(g.gain);
        o.connect(lp); lp.connect(g);
        out(rig, g, 0, 0.3);
        o.start(t); trem.start(t);
        o.stop(t + build + 0.2); trem.stop(t + build + 0.2);

        // The payoff — a major triad, spread wide, with sparkle on top
        const hit = t + build;
        [523.3, 659.3, 784, 1046.5].forEach((f, i) => {
          bell(rig, f, hit + i * 0.012, i === 3 ? 0.07 : 0.115, 2.2, (i - 1.5) * 0.4);
        });
        for (let i = 0; i < 5; i++) grain(rig, 1568 + i * 220, hit + 0.03 + i * 0.035, 0.035, (Math.random() * 2 - 1) * 0.8);

        again(3400);
      });

      return () => { stopLoop(); rig.stop(0.5); };
    },
  },
];

/** The tone shipping today, for A/B comparison. */
export const CURRENT_SOUND: SoundOption = {
  id: 'current',
  name: 'Current (for comparison)',
  description: 'A 220Hz sine with a 0.3Hz LFO sweep plus a 660Hz harmonic — dry, mono, motionless. The "wuuurrruuuur".',
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
