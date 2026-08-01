/**
 * "Kan is working" loops for voice mode.
 *
 * Every earlier round was discrete events with silence between them — a run, a
 * pop, a cascade, then a gap. That is why none of them moved in a wave: there
 * was nothing continuous to carry one. This set is built the opposite way. Each
 * sound is a single unbroken texture whose brightness, level and pitch are all
 * driven by one slow cycle, so it swells and recedes forever with no seam and
 * no repeat point you can hear.
 *
 * The centrepiece is a Risset glissando (the Shepard illusion): octave-spaced
 * voices glide upward through a fixed amplitude window, each fading in at the
 * bottom and out at the top. The ear hears a pitch that rises endlessly and
 * never arrives, which is both seamless by construction and unusually
 * compelling to listen to — motion without destination, which is exactly what
 * "still working" should feel like.
 */

export interface SoundOption {
  id: string;
  name: string;
  description: string;
  start: (ctx: AudioContext) => () => void;
}

/* ── Shared ─────────────────────────────────────────────────────── */

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

function makeSaturator(ctx: AudioContext, amount = 6): WaveShaperNode {
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
  const { seconds = 3.2, decay = 2.2, wet = 0.4, level = 0.6, drive = 5 } = opts;
  const t = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, t);
  master.gain.linearRampToValueAtTime(level, t + 0.9);

  const sat = makeSaturator(ctx, drive);
  const trim = ctx.createGain();
  trim.gain.value = 0.75;
  master.connect(sat); sat.connect(trim); trim.connect(ctx.destination);

  const input = ctx.createGain();
  input.connect(master);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, seconds, decay);
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet;
  const send = ctx.createGain();
  send.connect(convolver); convolver.connect(wetGain); wetGain.connect(master);

  return {
    ctx, input, send, master,
    stop: (release = 0.7) => {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + release);
    },
  };
}

function out(rig: Rig, node: AudioNode, pan = 0, sendAmt = 0.5) {
  const p = rig.ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(p); p.connect(rig.input);
  const s = rig.ctx.createGain();
  s.gain.value = sendAmt;
  p.connect(s); s.connect(rig.send);
}

/** A raised-cosine window: silent at both ends, so voices wrap inaudibly. */
function windowCurve(peak: number, points = 256): Float32Array {
  const c = new Float32Array(points);
  for (let i = 0; i < points; i++) c[i] = peak * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (points - 1)));
  return c;
}

/**
 * Risset glissando. Each voice glides one full span, fading in as it enters and
 * out as it leaves, staggered so the texture is always full. Voices are re-armed
 * ahead of time by a scheduler, which is what makes the loop seamless.
 */
function risset(
  rig: Rig,
  opts: {
    count?: number; fmin?: number; octaves?: number; cycle?: number;
    peak?: number; rising?: boolean; type?: OscillatorType; spread?: number;
  } = {},
): () => void {
  const { ctx } = rig;
  const {
    count = 7, fmin = 55, octaves = 5, cycle = 9,
    peak = 0.05, rising = true, type = 'sine', spread = 0.7,
  } = opts;

  const span = Math.pow(2, octaves);
  const curve = windowCurve(peak);

  const voices = Array.from({ length: count }, (_, i) => {
    const o = ctx.createOscillator();
    o.type = type;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    out(rig, g, ((i / (count - 1)) * 2 - 1) * spread, 0.55);
    o.start();
    return { o, g, next: 0 };
  });

  const now = ctx.currentTime + 0.06;

  // First arming starts each voice partway through the sweep so the texture is
  // complete immediately rather than filling in over a whole cycle.
  voices.forEach((v, i) => {
    const phase = i / count;
    const remain = cycle * (1 - phase);
    const fStart = rising ? fmin * Math.pow(span, phase) : fmin * Math.pow(span, 1 - phase);
    const fEnd = rising ? fmin * span : fmin;
    v.o.frequency.setValueAtTime(fStart, now);
    v.o.frequency.exponentialRampToValueAtTime(fEnd, now + remain);

    const startIdx = Math.floor(phase * (curve.length - 1));
    const partial = curve.slice(startIdx);
    if (partial.length >= 2 && remain > 0.05) {
      v.g.gain.setValueCurveAtTime(partial, now, remain);
    }
    v.next = now + remain;
  });

  let stopped = false;
  const timer: ReturnType<typeof setInterval> = setInterval(() => {
    if (stopped) return;
    const horizon = ctx.currentTime + 2;
    for (const v of voices) {
      while (v.next < horizon) {
        const at = v.next;
        v.o.frequency.setValueAtTime(rising ? fmin : fmin * span, at);
        v.o.frequency.exponentialRampToValueAtTime(rising ? fmin * span : fmin, at + cycle);
        v.g.gain.setValueCurveAtTime(curve, at, cycle);
        v.next = at + cycle;
      }
    }
  }, 400);

  return () => {
    stopped = true;
    clearInterval(timer);
    const t = ctx.currentTime + 0.9;
    voices.forEach(v => { try { v.o.stop(t); } catch { /* already stopped */ } });
  };
}

/** One slow cycle other parameters can ride on. Returns the LFO's output node. */
function waveLfo(ctx: AudioContext, rateHz: number, depth: number, offset = 0) {
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
  return { osc, amt, bias, stop: (t: number) => { try { osc.stop(t); bias.stop(t); } catch { /* already stopped */ } } };
}

function noiseBuffer(ctx: AudioContext, seconds = 3): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, length, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/* ── The set ──────────────────────────────────────────────────── */

export const SOUND_OPTIONS: SoundOption[] = [
  {
    id: 'endless-rise',
    name: 'Endless rise',
    description:
      'A Risset glissando — seven octave-spaced voices gliding upward through a fixed window, each fading in low and out high. The pitch appears to climb forever without ever arriving, and there is no loop point because there is no loop: it is one continuous sweep that renews itself. Hypnotic, and the clearest possible "still going".',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 3.4, decay: 2, wet: 0.45, level: 0.6 });
      const stopRisset = risset(rig, { count: 7, fmin: 55, octaves: 5, cycle: 9, peak: 0.055, rising: true });

      // A slow breath across the whole thing so the wave has a second, longer swell.
      const breath = waveLfo(ctx, 1 / 11, 0.18, 0.82);
      breath.amt.connect(rig.master.gain);
      breath.bias.connect(rig.master.gain);

      return () => { stopRisset(); breath.stop(ctx.currentTime + 1); rig.stop(0.9); };
    },
  },
  {
    id: 'tidal',
    name: 'Tidal',
    description:
      'One big wave on an eight second cycle. A detuned bed swells up through an opening filter, crests with a wash of air, then draws back — and immediately begins again. The most literal reading of a wave, and the easiest to leave running for a long time.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 4.4, decay: 1.9, wet: 0.6, level: 0.62 });

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 4;
      lp.frequency.value = 300;
      const bodyGain = ctx.createGain();
      bodyGain.gain.value = 0.05;
      lp.connect(bodyGain);
      out(rig, bodyGain, 0, 0.7);

      // Root plus detuned partners — the beating is what gives the swell its motion.
      const oscs = [65.4, 65.9, 98, 130.8, 196].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i > 2 ? 'triangle' : 'sawtooth';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = [1, 0.8, 0.5, 0.35, 0.2][i];
        o.connect(g); g.connect(lp);
        o.start();
        return o;
      });

      // The wave itself: filter and level ride one 8s cycle together.
      const sweep = waveLfo(ctx, 1 / 8, 1500, 1700);
      sweep.amt.connect(lp.frequency);
      sweep.bias.connect(lp.frequency);
      const swell = waveLfo(ctx, 1 / 8, 0.03, 0.05);
      swell.amt.connect(bodyGain.gain);
      swell.bias.connect(bodyGain.gain);

      // Crest: air that brightens with the peak of the wave.
      const air = ctx.createBufferSource();
      air.buffer = noiseBuffer(ctx, 4);
      air.loop = true;
      const airBp = ctx.createBiquadFilter();
      airBp.type = 'bandpass';
      airBp.frequency.value = 4200;
      airBp.Q.value = 0.8;
      const airGain = ctx.createGain();
      airGain.gain.value = 0.006;
      air.connect(airBp); airBp.connect(airGain);
      out(rig, airGain, 0, 0.8);
      const airWave = waveLfo(ctx, 1 / 8, 0.009, 0.01);
      airWave.amt.connect(airGain.gain);
      airWave.bias.connect(airGain.gain);
      air.start();

      return () => {
        rig.stop(1.1);
        const t = ctx.currentTime + 1.3;
        oscs.forEach(o => { try { o.stop(t); } catch { /* already stopped */ } });
        [sweep, swell, airWave].forEach(w => w.stop(t));
        try { air.stop(t); } catch { /* already stopped */ }
      };
    },
  },
  {
    id: 'phase-wash',
    name: 'Phase wash',
    description:
      'A rich bed pushed through a sweeping comb filter, so a notch travels up and down the harmonics on a six second cycle. That travelling notch is the jet-flyover whoosh — motion you feel as a shape moving through the sound rather than as a note changing pitch.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 3, decay: 2.4, wet: 0.35, level: 0.6, drive: 8 });

      const source = ctx.createGain();
      source.gain.value = 0.028;
      const oscs = [82.4, 123.5, 164.8, 247, 329.6].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = (i - 2) * 6;
        const g = ctx.createGain();
        g.gain.value = [1, 0.6, 0.45, 0.3, 0.2][i];
        o.connect(g); g.connect(source);
        o.start();
        return o;
      });

      // Flanger: short modulated delay summed with the dry signal.
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = 0.004;
      const fb = ctx.createGain();
      fb.gain.value = 0.62;
      const wet = ctx.createGain();
      wet.gain.value = 0.85;
      source.connect(delay);
      delay.connect(fb); fb.connect(delay);
      delay.connect(wet);

      const sweep = waveLfo(ctx, 1 / 6, 0.0034, 0.0042);
      sweep.amt.connect(delay.delayTime);
      sweep.bias.connect(delay.delayTime);

      // Dry and wet placed apart so the notch travels across the stereo image.
      out(rig, source, -0.45, 0.4);
      out(rig, wet, 0.45, 0.6);

      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2600;
      wet.connect(tone);

      return () => {
        rig.stop(0.9);
        const t = ctx.currentTime + 1.1;
        oscs.forEach(o => { try { o.stop(t); } catch { /* already stopped */ } });
        sweep.stop(t);
      };
    },
  },
  {
    id: 'surge',
    name: 'Surge',
    description:
      'A continuous sixteenth-note figure whose brightness and level rise and fall on a seven second cycle — the pattern never stops, it just comes forward and recedes like a wave washing in. Rhythmic without being a beat, and the busiest option that still loops seamlessly.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 2.6, decay: 2.6, wet: 0.4, level: 0.58 });

      const bus = ctx.createGain();
      bus.gain.value = 0.02;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 6;
      lp.frequency.value = 700;
      bus.connect(lp);
      out(rig, lp, 0, 0.5);

      // One wave drives both how bright and how loud the figure is.
      const bright = waveLfo(ctx, 1 / 7, 2200, 2500);
      bright.amt.connect(lp.frequency);
      bright.bias.connect(lp.frequency);
      const level = waveLfo(ctx, 1 / 7, 0.016, 0.024);
      level.amt.connect(bus.gain);
      level.bias.connect(bus.gain);

      const pattern = [261.6, 392, 523.3, 392, 329.6, 523.3, 392, 261.6];
      let i = 0;
      let stopped = false;
      const timers: ReturnType<typeof setTimeout>[] = [];
      const tick = () => {
        if (stopped) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = pattern[i % pattern.length] * (i % 16 >= 8 ? 2 : 1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(1, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        o.connect(g); g.connect(bus);
        o.start(t); o.stop(t + 0.18);
        i++;
        timers.push(setTimeout(tick, 125));
      };
      tick();

      return () => {
        stopped = true;
        timers.forEach(clearTimeout);
        rig.stop(0.7);
        const t = ctx.currentTime + 0.9;
        bright.stop(t); level.stop(t);
      };
    },
  },
  {
    id: 'deep-spiral',
    name: 'Deep spiral',
    description:
      'The inverse illusion — a Risset glissando falling forever instead of rising, on a longer cycle and pitched low. Endlessly descending reads as calm and settling where the rising version reads as effort, so this is the one to pick if a long wait should feel unhurried.',
    start: (ctx) => {
      const rig = createRig(ctx, { seconds: 5, decay: 1.7, wet: 0.6, level: 0.64 });
      const stopRisset = risset(rig, {
        count: 6, fmin: 41.2, octaves: 4, cycle: 13, peak: 0.07, rising: false, type: 'triangle', spread: 0.5,
      });

      // A quiet bed so the descent has a floor to settle onto.
      const bed = ctx.createOscillator();
      bed.type = 'sine';
      bed.frequency.value = 41.2;
      const bedGain = ctx.createGain();
      bedGain.gain.value = 0.03;
      bed.connect(bedGain);
      out(rig, bedGain, 0, 0.5);
      bed.start();

      const breath = waveLfo(ctx, 1 / 13, 0.012, 0.03);
      breath.amt.connect(bedGain.gain);
      breath.bias.connect(bedGain.gain);

      return () => {
        stopRisset();
        rig.stop(1.2);
        const t = ctx.currentTime + 1.4;
        try { bed.stop(t); } catch { /* already stopped */ }
        breath.stop(t);
      };
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
