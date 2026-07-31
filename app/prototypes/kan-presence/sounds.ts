/**
 * Five candidate "Kan is working" loops for voice mode.
 *
 * The current tone is a 220Hz sine with a slow LFO — the "wuuurrruuuur". These
 * lean organic and damp instead: breath, spores, wood, soil. Each returns a stop
 * function so the caller can audition them one at a time.
 *
 * All are deliberately quiet (peak ~0.05) — this plays under speech, not over it.
 */

export interface SoundOption {
  id: string;
  name: string;
  description: string;
  start: (ctx: AudioContext) => () => void;
}

/** Short burst of filtered noise — the texture behind puffs and rustles. */
function noiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export const SOUND_OPTIONS: SoundOption[] = [
  {
    id: 'spore-puff',
    name: 'Spore puff',
    description:
      'Soft breathy puffs every couple of seconds, like spores releasing from gills. Airy and intermittent rather than a continuous tone — reads as activity without droning.',
    start: (ctx) => {
      const out = ctx.createGain();
      out.gain.value = 0.5;
      out.connect(ctx.destination);

      let stopped = false;
      const timers: number[] = [];

      const puff = () => {
        if (stopped) return;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.6);
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.setValueAtTime(700, ctx.currentTime);
        band.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.35);
        band.Q.value = 1.6;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, ctx.currentTime);
        env.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.08);
        env.gain.exponentialRampToValueAtTime(0.0005, ctx.currentTime + 0.5);
        src.connect(band); band.connect(env); env.connect(out);
        src.start();
        src.stop(ctx.currentTime + 0.6);
        timers.push(window.setTimeout(puff, 900 + Math.random() * 700));
      };
      puff();

      return () => {
        stopped = true;
        timers.forEach(clearTimeout);
        out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
      };
    },
  },
  {
    id: 'mycelium-hum',
    name: 'Mycelium hum',
    description:
      'Two detuned low sines beating slowly against each other, with a gentle swell. Closest to the current sound but warmer and less synthetic — the drone breathes instead of wobbling.',
    start: (ctx) => {
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, ctx.currentTime);
      out.gain.linearRampToValueAtTime(0.045, ctx.currentTime + 0.8);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      out.connect(lp); lp.connect(ctx.destination);

      const oscs = [110, 110.6, 165].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? 'triangle' : 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = i === 2 ? 0.25 : 1;
        o.connect(g); g.connect(out);
        o.start();
        return o;
      });

      // Slow breath on the whole bed
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.14;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain); lfoGain.connect(out.gain);
      lfo.start();

      return () => {
        out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
        oscs.forEach(o => o.stop(ctx.currentTime + 0.4));
        lfo.stop(ctx.currentTime + 0.4);
      };
    },
  },
  {
    id: 'damp-cavern',
    name: 'Damp cavern',
    description:
      'A low bed with occasional water droplets echoing. Evokes the forest floor under a log. The drips give a sense of time passing, which suits a wait of unknown length.',
    start: (ctx) => {
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);

      const bed = ctx.createOscillator();
      bed.type = 'sine';
      bed.frequency.value = 84;
      const bedGain = ctx.createGain();
      bedGain.gain.setValueAtTime(0, ctx.currentTime);
      bedGain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 1);
      bed.connect(bedGain); bedGain.connect(out);
      bed.start();

      let stopped = false;
      const timers: number[] = [];
      const drip = () => {
        if (stopped) return;
        const o = ctx.createOscillator();
        o.type = 'sine';
        const t = ctx.currentTime;
        o.frequency.setValueAtTime(1400, t);
        o.frequency.exponentialRampToValueAtTime(420, t + 0.16);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.045, t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.4);
        const delay = ctx.createDelay();
        delay.delayTime.value = 0.18;
        const fb = ctx.createGain();
        fb.gain.value = 0.28;
        o.connect(g); g.connect(out);
        g.connect(delay); delay.connect(fb); fb.connect(delay); fb.connect(out);
        o.start(t); o.stop(t + 0.45);
        timers.push(window.setTimeout(drip, 1400 + Math.random() * 1800));
      };
      timers.push(window.setTimeout(drip, 500));

      return () => {
        stopped = true;
        timers.forEach(clearTimeout);
        bedGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
        bed.stop(ctx.currentTime + 0.4);
      };
    },
  },
  {
    id: 'gill-flutter',
    name: 'Gill flutter',
    description:
      'A quick soft tick pattern, like gills fluttering or pages riffling. The most "busy" of the five — good if you want the sound to convey that work is actively happening.',
    start: (ctx) => {
      const out = ctx.createGain();
      out.gain.value = 0.5;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      out.connect(hp); hp.connect(ctx.destination);

      let stopped = false;
      let step = 0;
      const timers: number[] = [];
      const tick = () => {
        if (stopped) return;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.08);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2200 + (step % 4) * 260;
        bp.Q.value = 6;
        const env = ctx.createGain();
        const t = ctx.currentTime;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(step % 4 === 0 ? 0.05 : 0.028, t + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0004, t + 0.09);
        src.connect(bp); bp.connect(env); env.connect(out);
        src.start(t); src.stop(t + 0.1);
        step++;
        timers.push(window.setTimeout(tick, 150));
      };
      tick();

      return () => {
        stopped = true;
        timers.forEach(clearTimeout);
        out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
      };
    },
  },
  {
    id: 'forest-floor',
    name: 'Forest floor',
    description:
      'Muted wooden knocks over a faint bed of air, spaced unevenly. Warm and unhurried — the least machine-like option, closest to something growing quietly.',
    start: (ctx) => {
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);

      // Faint air bed
      const air = ctx.createBufferSource();
      air.buffer = noiseBuffer(ctx, 4);
      air.loop = true;
      const airFilter = ctx.createBiquadFilter();
      airFilter.type = 'lowpass';
      airFilter.frequency.value = 380;
      const airGain = ctx.createGain();
      airGain.gain.setValueAtTime(0, ctx.currentTime);
      airGain.gain.linearRampToValueAtTime(0.012, ctx.currentTime + 1.2);
      air.connect(airFilter); airFilter.connect(airGain); airGain.connect(out);
      air.start();

      let stopped = false;
      const timers: number[] = [];
      const knock = () => {
        if (stopped) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(320 + Math.random() * 90, t);
        o.frequency.exponentialRampToValueAtTime(150, t + 0.12);
        const bp = ctx.createBiquadFilter();
        bp.type = 'lowpass';
        bp.frequency.value = 1200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
        o.connect(bp); bp.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.25);
        timers.push(window.setTimeout(knock, 700 + Math.random() * 1100));
      };
      timers.push(window.setTimeout(knock, 300));

      return () => {
        stopped = true;
        timers.forEach(clearTimeout);
        airGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
        try { air.stop(ctx.currentTime + 0.4); } catch { /* already stopped */ }
      };
    },
  },
];

/**
 * Second batch — further from an ambient drone. These lean on pitch movement,
 * rhythm and timbre rather than texture alone, so they read as "something is
 * happening" from across a room.
 */
export const SOUND_OPTIONS_2: SoundOption[] = [
  {
    id: 'underground-pulse',
    name: 'Underground pulse',
    description:
      'A slow sub-bass heartbeat with a soft skin of noise on each beat. Feels like something large and patient working below ground. The steady pulse reads as alive rather than as a machine.',
    start: (ctx) => {
      const out = ctx.createGain();
      out.gain.value = 1;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      out.connect(lp); lp.connect(ctx.destination);

      let stopped = false;
      const timers: number[] = [];
      const beat = (strong: boolean) => {
        if (stopped) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(strong ? 74 : 62, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.28);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(strong ? 0.06 : 0.035, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0004, t + 0.42);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.45);

        const skin = ctx.createBufferSource();
        skin.buffer = noiseBuffer(ctx, 0.12);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.012, t);
        sg.gain.exponentialRampToValueAtTime(0.0003, t + 0.1);
        skin.connect(sg); sg.connect(out);
        skin.start(t); skin.stop(t + 0.13);

        timers.push(window.setTimeout(() => beat(!strong), strong ? 380 : 900));
      };
      beat(true);

      return () => {
        stopped = true;
        timers.forEach(clearTimeout);
        out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
      };
    },
  },
  {
    id: 'glass-spores',
    name: 'Glass spores',
    description:
      'Sparse bell tones from a pentatonic set, struck at random with long tails. Delicate and slightly magical — the most "charming" option, and the one people are most likely to comment on.',
    start: (ctx) => {
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);

      const notes = [523.25, 587.33, 698.46, 783.99, 1046.5];
      let stopped = false;
      const timers: number[] = [];

      const chime = () => {
        if (stopped) return;
        const t = ctx.currentTime;
        const freq = notes[Math.floor(Math.random() * notes.length)];
        [1, 2.76].forEach((ratio, i) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = freq * ratio;
          const g = ctx.createGain();
          const peak = i === 0 ? 0.035 : 0.008;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(peak, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0003, t + (i === 0 ? 1.9 : 0.9));
          o.connect(g); g.connect(out);
          o.start(t); o.stop(t + 2);
        });
        timers.push(window.setTimeout(chime, 700 + Math.random() * 1300));
      };
      chime();

      return () => {
        stopped = true;
        timers.forEach(clearTimeout);
        out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      };
    },
  },
  {
    id: 'rain-on-leaves',
    name: 'Rain on leaves',
    description:
      'A continuous wash of fine rain with heavier drops landing now and then. Very easy to ignore, which is the point — it can run for thirty seconds without wearing on you.',
    start: (ctx) => {
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, ctx.currentTime);
      out.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1);
      out.connect(ctx.destination);

      const rain = ctx.createBufferSource();
      rain.buffer = noiseBuffer(ctx, 4);
      rain.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3200;
      bp.Q.value = 0.6;
      const rg = ctx.createGain();
      rg.gain.value = 0.035;
      rain.connect(bp); bp.connect(rg); rg.connect(out);
      rain.start();

      // Slow shimmer so it never sits perfectly still
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 900;
      lfo.connect(lfoGain); lfoGain.connect(bp.frequency);
      lfo.start();

      let stopped = false;
      const timers: number[] = [];
      const bigDrop = () => {
        if (stopped) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(900 + Math.random() * 500, t);
        o.frequency.exponentialRampToValueAtTime(300, t + 0.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.03, t);
        g.gain.exponentialRampToValueAtTime(0.0004, t + 0.25);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.28);
        timers.push(window.setTimeout(bigDrop, 800 + Math.random() * 2200));
      };
      timers.push(window.setTimeout(bigDrop, 600));

      return () => {
        stopped = true;
        timers.forEach(clearTimeout);
        out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        try { rain.stop(ctx.currentTime + 0.5); lfo.stop(ctx.currentTime + 0.5); } catch { /* already stopped */ }
      };
    },
  },
  {
    id: 'growth-swell',
    name: 'Growth swell',
    description:
      'A tone that rises slowly through a fifth, then resets and climbs again. The only option that suggests forward motion, so a long wait feels like progress rather than a hang.',
    start: (ctx) => {
      const out = ctx.createGain();
      out.gain.value = 1;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      out.connect(lp); lp.connect(ctx.destination);

      let stopped = false;
      const timers: number[] = [];
      const swell = () => {
        if (stopped) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(160, t);
        o.frequency.exponentialRampToValueAtTime(240, t + 2.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.04, t + 0.9);
        g.gain.linearRampToValueAtTime(0.028, t + 2);
        g.gain.exponentialRampToValueAtTime(0.0004, t + 2.7);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 2.8);
        timers.push(window.setTimeout(swell, 2600));
      };
      swell();

      return () => {
        stopped = true;
        timers.forEach(clearTimeout);
        out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      };
    },
  },
  {
    id: 'bubbling-loam',
    name: 'Bubbling loam',
    description:
      'Short wet blips at irregular intervals, like soil fizzing after rain. Playful and a bit odd — the least serious of the ten, and the most obviously mushroom.',
    start: (ctx) => {
      const out = ctx.createGain();
      out.gain.value = 1;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2000;
      out.connect(lp); lp.connect(ctx.destination);

      let stopped = false;
      const timers: number[] = [];
      const blip = () => {
        if (stopped) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'sine';
        const base = 220 + Math.random() * 380;
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * 2.6, t + 0.09);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.045, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0004, t + 0.14);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.16);
        timers.push(window.setTimeout(blip, 260 + Math.random() * 900));
      };
      blip();

      return () => {
        stopped = true;
        timers.forEach(clearTimeout);
        out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
      };
    },
  },
];

/** The tone shipping today, for A/B comparison. */
export const CURRENT_SOUND: SoundOption = {
  id: 'current',
  name: 'Current (for comparison)',
  description: 'A 220Hz sine with a 0.3Hz LFO sweep plus a 660Hz harmonic — the "wuuurrruuuur".',
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
