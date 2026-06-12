// Wildwood — audio engine.
// Everything is synthesized live with the Web Audio API: wind, water, crickets,
// and every bird song (defined as SongEvent sequences in species.ts).

import type { SongEvent } from './species';

export class WildwoodAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private cricketGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  get ready() {
    return !!this.ctx;
  }

  /** must be called from a user gesture */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    // shared white-noise buffer (2s)
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.startAmbience();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
    }
  }

  // ---- ambience ------------------------------------------------------------

  private startAmbience() {
    const ctx = this.ctx!;
    const master = this.master!;

    // wind: filtered noise, slowly breathing
    {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf!;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.025;
      lfo.connect(lfoG).connect(g.gain);
      src.connect(lp).connect(g).connect(master);
      src.start();
      lfo.start();
      this.windGain = g;
    }

    // water: brighter babble, gain set by proximity to water
    {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf!;
      src.loop = true;
      src.playbackRate.value = 0.7;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.5;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.012;
      lfo.connect(lfoG).connect(g.gain);
      src.connect(bp).connect(g).connect(master);
      src.start();
      lfo.start();
      this.waterGain = g;
    }

    // crickets: pulsed high trill from a generated loop, audible at night
    {
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, sr * 4, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const chirpPhase = t % 0.9;
        const inChirp = chirpPhase < 0.45;
        const pulse = Math.sin(2 * Math.PI * 26 * t) > 0.2 ? 1 : 0;
        const tone = Math.sin(2 * Math.PI * 4300 * t) * 0.5 + Math.sin(2 * Math.PI * 4750 * t) * 0.3;
        d[i] = inChirp ? tone * pulse * 0.35 : 0;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(master);
      src.start();
      this.cricketGain = g;
    }
  }

  /** proximity: 0 (far from water) .. 1 (standing at the shore) */
  setWaterProximity(p: number) {
    if (this.waterGain && this.ctx)
      this.waterGain.gain.setTargetAtTime(p * 0.07, this.ctx.currentTime, 0.6);
  }

  /** night: 0 (day) .. 1 (deep night) */
  setNight(n: number) {
    if (!this.ctx) return;
    this.cricketGain?.gain.setTargetAtTime(n * 0.16, this.ctx.currentTime, 1.2);
    this.windGain?.gain.setTargetAtTime(0.035 + (1 - n) * 0.025, this.ctx.currentTime, 1.2);
  }

  // ---- bird songs ------------------------------------------------------------

  /**
   * Schedule a song. pan: -1..1, gain: 0..1 (distance attenuation).
   * Returns the total duration in seconds.
   */
  playSong(song: SongEvent[], pan = 0, gain = 1): number {
    if (!this.ctx || !this.master || gain <= 0.01) {
      return song.reduce((m, e) => Math.max(m, e.t + e.dur), 0);
    }
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.05;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    const out = ctx.createGain();
    out.gain.value = gain * 0.5;
    out.connect(panner).connect(this.master);

    let end = 0;
    for (const e of song) {
      const t0 = now + e.t;
      const t1 = t0 + e.dur;
      end = Math.max(end, e.t + e.dur + (e.release ?? 0.05));
      const vol = (e.vol ?? 1) * 0.7;
      const atk = e.attack ?? 0.012;
      const rel = e.release ?? 0.05;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + atk);
      g.gain.setValueAtTime(vol, Math.max(t0 + atk, t1 - 0.005));
      g.gain.linearRampToValueAtTime(0, t1 + rel);
      g.connect(out);

      if (e.trem) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = e.trem.rate;
        const lg = ctx.createGain();
        lg.gain.value = vol * e.trem.depth * 0.5;
        lfo.connect(lg).connect(g.gain);
        lfo.start(t0);
        lfo.stop(t1 + rel);
      }

      if (e.kind === 'tone') {
        const osc = ctx.createOscillator();
        osc.type = e.type ?? 'sine';
        osc.frequency.setValueAtTime(e.f0, t0);
        osc.frequency.linearRampToValueAtTime(e.f1 ?? e.f0, t1);
        if (e.vibrato) {
          const v = ctx.createOscillator();
          v.frequency.value = e.vibrato.rate;
          const vg = ctx.createGain();
          vg.gain.value = e.vibrato.depth;
          v.connect(vg).connect(osc.frequency);
          v.start(t0);
          v.stop(t1 + rel);
        }
        osc.connect(g);
        osc.start(t0);
        osc.stop(t1 + rel + 0.02);
      } else if (e.kind === 'noise' || e.kind === 'click') {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf!;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(e.f0, t0);
        bp.frequency.linearRampToValueAtTime(e.f1 ?? e.f0, t1);
        bp.Q.value = e.q ?? (e.kind === 'click' ? 2 : 6);
        src.connect(bp).connect(g);
        src.start(t0, Math.random() * 1.5);
        src.stop(t1 + rel + 0.02);
      }
    }
    return end;
  }

  // ---- one-shot effects --------------------------------------------------------

  private blip(f0: number, f1: number, dur: number, vol = 0.3, type: OscillatorType = 'sine', when = 0) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private splashNoise(dur: number, f: number, vol: number, when = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f, t0);
    bp.frequency.exponentialRampToValueAtTime(f * 0.4, t0 + dur);
    bp.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  uiTap() {
    this.blip(660, 880, 0.07, 0.12, 'sine');
  }
  uiOpen() {
    this.blip(440, 660, 0.12, 0.12, 'sine');
    this.blip(660, 990, 0.12, 0.1, 'sine', 0.06);
  }
  discover() {
    // warm little fanfare for a new species
    this.blip(523, 523, 0.12, 0.18, 'triangle');
    this.blip(659, 659, 0.12, 0.18, 'triangle', 0.11);
    this.blip(784, 784, 0.2, 0.2, 'triangle', 0.22);
    this.blip(1047, 1047, 0.34, 0.16, 'triangle', 0.34);
  }
  seeds() {
    this.blip(1200, 1800, 0.08, 0.1, 'sine');
    this.blip(1500, 2100, 0.08, 0.08, 'sine', 0.07);
  }
  cast() {
    this.splashNoise(0.25, 2400, 0.12);
  }
  plop() {
    this.blip(420, 160, 0.16, 0.25, 'sine');
    this.splashNoise(0.2, 1200, 0.15, 0.02);
  }
  nibble() {
    this.blip(300, 220, 0.06, 0.12, 'sine');
  }
  strike() {
    this.blip(220, 110, 0.22, 0.3, 'sine');
    this.splashNoise(0.35, 900, 0.25, 0.02);
  }
  reelTick() {
    this.blip(2200, 1900, 0.025, 0.05, 'square');
  }
  lineSnap() {
    this.blip(1800, 200, 0.3, 0.25, 'sawtooth');
  }
  catchFanfare() {
    this.blip(392, 392, 0.13, 0.18, 'triangle');
    this.blip(523, 523, 0.13, 0.18, 'triangle', 0.12);
    this.blip(659, 659, 0.13, 0.18, 'triangle', 0.24);
    this.blip(784, 784, 0.4, 0.2, 'triangle', 0.36);
    this.splashNoise(0.5, 1500, 0.12);
  }
  flushWings() {
    // rapid soft flutter
    for (let i = 0; i < 6; i++) this.splashNoise(0.05, 600 + i * 60, 0.07, i * 0.05);
  }
  buildThunk() {
    this.blip(180, 90, 0.12, 0.3, 'triangle');
    this.splashNoise(0.08, 800, 0.1);
  }
  wrong() {
    this.blip(330, 220, 0.25, 0.15, 'triangle');
  }
}
