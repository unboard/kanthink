/**
 * "Kan is working" loops for voice mode.
 *
 * The brief: a mushroom closing its eyes and thinking hard, with spores going
 * out and working. That is three distinct gestures, and earlier attempts had
 * none of them —
 *
 *   closing its eyes → the sound settles inward. Brightness closes down over
 *     the first second and stays muffled, as if heard from inside the cap.
 *   thinking hard    → a low throb underneath. Concentration, not prettiness:
 *     slightly tense intervals and a pulse that never fully relaxes.
 *   spores going out → events that physically travel. Each one starts at the
 *     centre and moves outward across the stereo field, dropping in pitch and
 *     volume as it goes, trailing an echo behind it.
 *
 * The travelling is the part that makes it read as dispatch rather than
 * decoration, and it is why these need stereo — on a mono speaker they will
 * lose most of their character.
 */

export interface SoundOption {
  id: string;
  name: string;
  description: string;
  start: (ctx: AudioContext) => () => void;
}

/* ── Rig ────────────────────────────────────────────────────────── */

interface Rig {
  ctx: AudioContext;
  /** Dry path. */
  input: GainNode;
  /** Reverb send. */
  send: GainNode;
  /** Echo send — spore trails bounce out through here. */
  echo: GainNode;
  /** The "eyelid": lowpass that closes at the start and stays shut. */
  lid: BiquadFilterNode;
  master: GainNode;
  stop: (release?: number) => void;
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buf;
}

function createRig(
  ctx: AudioContext,
  opts: { seconds?: number; decay?: number; wet?: number; openFrom?: number; closeTo?: number; closeIn?: number; level?: number } = {},
): Rig {
  const {
    seconds = 3.4, decay = 2.2, wet = 0.55,
    openFrom = 2400, closeTo = 460, closeIn = 1.4, level = 0.9,
  } = opts;
  const t = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, t);
  master.gain.linearRampToValueAtTime(level, t + 0.5);

  // The eyelid closing: bright for a moment, then shut and muffled.
  const lid = ctx.createBiquadFilter();
  lid.type = 'lowpass';
  lid.Q.value = 0.9;
  lid.frequency.setValueAtTime(openFrom, t);
  lid.frequency.exponentialRampToValueAtTime(closeTo, t + closeIn);

  master.connect(lid);
  lid.connect(ctx.destination);

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

  // Ping-pong echo: a trail that leaves in one direction, answers in the other.
  const echo = ctx.createGain();
  const dL = ctx.createDelay(1);
  const dR = ctx.createDelay(1);
  dL.delayTime.value = 0.23;
  dR.delayTime.value = 0.34;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const panL = ctx.createStereoPanner();
  panL.pan.value = -0.85;
  const panR = ctx.createStereoPanner();
  panR.pan.value = 0.85;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 1500;

  echo.connect(dL);
  dL.connect(panL); panL.connect(echoTone);
  dL.connect(dR);
  dR.connect(panR); panR.connect(echoTone);
  dR.connect(fb); fb.connect(dL);
  echoTone.connect(master);

  return {
    ctx, input, send, echo, lid, master,
    stop: (release = 0.6) => {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + release);
      fb.gain.setValueAtTime(0, now);
    },
  };
}

/**
 * A spore: leaves the centre, travels outward, loses pitch and weight on the
 * way, and leaves a trail behind it.
 */
function spore(
  rig: Rig,
  opts: { freq?: number; at?: number; dur?: number; gain?: number; dir?: number; echo?: number } = {},
) {
  const { ctx } = rig;
  const {
    freq = 520, at = ctx.currentTime, dur = 1.5, gain = 0.05,
    dir = Math.random() < 0.5 ? -1 : 1, echo = 0.5,
  } = opts;

  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.setValueAtTime(freq, at);
  // Falls away as it travels — the cue that it is moving off, not just fading.
  carrier.frequency.exponentialRampToValueAtTime(freq * 0.62, at + dur);

  // A little grit so it reads as a body, not a beep.
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = freq * 1.51;
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(freq * 0.5, at);
  modGain.gain.exponentialRampToValueAtTime(1, at + dur * 0.5);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.03);
  env.gain.exponentialRampToValueAtTime(0.0004, at + dur);

  // Outward travel — this is the whole point.
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(0, at);
  panner.pan.linearRampToValueAtTime(dir * 0.95, at + dur);

  carrier.connect(env);
  env.connect(panner);
  panner.connect(rig.input);

  const s = ctx.createGain();
  s.gain.value = 0.7;
  panner.connect(s); s.connect(rig.send);

  const e = ctx.createGain();
  e.gain.value = echo;
  panner.connect(e); e.connect(rig.echo);

  carrier.start(at); mod.start(at);
  carrier.stop(at + dur + 0.1);
  mod.stop(at + dur + 0.1);
}

/** The low effort underneath: a held tone that throbs rather than drones. */
function concentration(
  rig: Rig,
  opts: { root?: number; throb?: number; depth?: number; level?: number; tension?: boolean } = {},
) {
  const { ctx } = rig;
  const { root = 58, throb = 2.6, depth = 0.5, level = 0.05, tension = true } = opts;

  const bus = ctx.createGain();
  bus.gain.value = level;
  bus.connect(rig.input);
  const s = ctx.createGain();
  s.gain.value = 0.4;
  bus.connect(s); s.connect(rig.send);

  // Root, octave, and — when tense — a flat fifth-ish partial that beats slowly.
  const partials = tension ? [root, root * 2, root * 2.98] : [root, root * 2, root * 3];
  const oscs = partials.map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? 'sine' : 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 1 : i === 1 ? 0.34 : 0.16;
    o.connect(g); g.connect(bus);
    o.start();
    return o;
  });

  // The throb: never returns fully to silence, so it reads as sustained effort.
  const pulse = ctx.createOscillator();
  pulse.type = 'sine';
  pulse.frequency.value = 1 / throb;
  const pulseAmt = ctx.createGain();
  pulseAmt.gain.value = level * depth;
  pulse.connect(pulseAmt);
  pulseAmt.connect(bus.gain);
  pulse.start();

  return () => {
    const t = ctx.currentTime + 0.8;
    oscs.forEach(o => { try { o.stop(t); } catch { /* already stopped */ } });
    try { pulse.stop(t); } catch { /* already stopped */ }
  };
}

function loop(fn: (again: (ms: number) => void) => void): () => void {
  let stopped = false;
  const timers: number[] = [];
  const again = (ms: number) => { if (!stopped) timers.push(window.setTimeout(run, ms)); };
  const run = () => { if (!stopped) fn(again); };
  run();
  return () => { stopped = true; timers.forEach(clearTimeout); };
}

function noiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Breath in — the inhale before concentrating. */
function inhale(rig: Rig, at = rig.ctx.currentTime, dur = 1.1) {
  const { ctx } = rig;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur + 0.2);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(320, at);
  bp.frequency.exponentialRampToValueAtTime(900, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(0.03, at + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0004, at + dur);
  src.connect(bp); bp.connect(g); g.connect(rig.input);
  const s = ctx.createGain(); s.gain.value = 0.6;
  g.connect(s); s.connect(rig.send);
  src.start(at); src.stop(at + dur + 0.2);
}

/* ── The set ──────────────────────────────────────────────────── */

const SPORE_PITCHES = [392, 440, 523.3, 587.3, 659.3];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export const SOUND_OPTIONS: SoundOption[] = [
  {
    id: 'eyes-closed',
    name: 'Eyes closed',
    description:
      'The literal brief. A breath in, the brightness closes down like eyelids, then a low throb of concentration underneath while spores leave the centre one at a time and drift outward, falling in pitch as they go. Trails echo out behind them.',
    start: (ctx) => {
      const rig = createRig(ctx, { openFrom: 2600, closeTo: 420, closeIn: 1.5, seconds: 3.6, decay: 2.2, wet: 0.5 });
      inhale(rig);
      const stopDrone = concentration(rig, { root: 58, throb: 2.8, depth: 0.55, level: 0.05 });

      const stopLoop = loop((again) => {
        spore(rig, {
          freq: pick(SPORE_PITCHES),
          dur: 1.4 + Math.random() * 0.8,
          gain: 0.03 + Math.random() * 0.015,
          echo: 0.55,
        });
        again(900 + Math.random() * 900);
      });

      return () => { stopLoop(); stopDrone(); rig.stop(0.8); };
    },
  },
  {
    id: 'deep-focus',
    name: 'Deep focus',
    description:
      'Heavier on the thinking. The throb is slower and closer to the front, with a slight beat between partials so it sounds like strain rather than calm. Spores are rarer and travel further — it is concentrating more than it is dispatching.',
    start: (ctx) => {
      const rig = createRig(ctx, { openFrom: 1800, closeTo: 300, closeIn: 1.8, seconds: 4.2, decay: 1.9, wet: 0.62, level: 0.95 });
      inhale(rig, ctx.currentTime, 1.4);
      const stopDrone = concentration(rig, { root: 49, throb: 3.6, depth: 0.7, level: 0.062, tension: true });

      const stopLoop = loop((again) => {
        spore(rig, {
          freq: pick(SPORE_PITCHES) * 0.75,
          dur: 2.2 + Math.random() * 0.9,
          gain: 0.026,
          echo: 0.7,
        });
        again(1800 + Math.random() * 1600);
      });

      return () => { stopLoop(); stopDrone(); rig.stop(1); };
    },
  },
  {
    id: 'spore-dispatch',
    name: 'Spore dispatch',
    description:
      'Heavier on the working. Spores leave in small clusters — three or four fanning out left and right in quick succession — then a pause while it thinks, then another batch. The busiest option, and the clearest that something is being sent out to do a job.',
    start: (ctx) => {
      const rig = createRig(ctx, { openFrom: 2200, closeTo: 520, closeIn: 1.2, seconds: 3, decay: 2.4, wet: 0.45 });
      inhale(rig, ctx.currentTime, 0.9);
      const stopDrone = concentration(rig, { root: 55, throb: 2.2, depth: 0.4, level: 0.042 });

      const stopLoop = loop((again) => {
        const count = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          spore(rig, {
            freq: SPORE_PITCHES[i % SPORE_PITCHES.length],
            at: ctx.currentTime + i * 0.16,
            dur: 1.2 + Math.random() * 0.5,
            gain: 0.026,
            dir: i % 2 === 0 ? -1 : 1,
            echo: 0.45,
          });
        }
        again(2200 + Math.random() * 1200);
      });

      return () => { stopLoop(); stopDrone(); rig.stop(0.7); };
    },
  },
  {
    id: 'under-the-cap',
    name: 'Under the cap',
    description:
      'The most inward. Everything is heard from inside — the lid shuts almost completely, the throb is felt more than heard, and the spores are distant, as though they have already travelled some way off. Quietest of the four and the easiest to sit under a long wait.',
    start: (ctx) => {
      const rig = createRig(ctx, { openFrom: 1200, closeTo: 220, closeIn: 2.2, seconds: 5, decay: 1.7, wet: 0.8, level: 1 });
      inhale(rig, ctx.currentTime, 1.6);
      const stopDrone = concentration(rig, { root: 43.7, throb: 4.2, depth: 0.6, level: 0.07 });

      const stopLoop = loop((again) => {
        spore(rig, {
          freq: pick(SPORE_PITCHES) * 0.5,
          dur: 2.6 + Math.random(),
          gain: 0.03,
          echo: 0.85,
        });
        again(1500 + Math.random() * 1800);
      });

      return () => { stopLoop(); stopDrone(); rig.stop(1.2); };
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
