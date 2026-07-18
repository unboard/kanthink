// Whisker Wilds — procedural WebAudio engine
// All sounds are synthesized: no audio assets to load.

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  soundOn = true;
  musicOn = true;

  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private ambientTimer: ReturnType<typeof setInterval> | null = null;
  private stepT = 0;
  private isNight = false;

  /** must be called from a user gesture */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.16 : 0;
      this.musicGain.connect(this.master);
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.35;
      this.ambientGain.connect(this.master);
      this.startMusic();
      this.startAmbient();
      this.startWind();
    } catch {
      this.ctx = null;
    }
  }

  setSound(on: boolean) {
    this.soundOn = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.value = on ? 0.16 : 0;
  }

  setNight(night: boolean) {
    this.isNight = night;
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private env(gain: GainNode, t0: number, a: number, peak: number, d: number) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  private osc(type: OscillatorType, freq: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(dest);
    return o;
  }

  // ——— cat sounds ———

  /** two-part "mee-ow" with per-cat pitch */
  meow(pitch = 1, vol = 0.5) {
    if (!this.ctx || !this.master || !this.soundOn) return;
    const t0 = this.now();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900 * pitch;
    filter.Q.value = 1.6;
    g.connect(filter).connect(this.master);
    const o = this.osc('sawtooth', 380 * pitch, g);
    // mee (rising) — ow (falling)
    o.frequency.setValueAtTime(340 * pitch, t0);
    o.frequency.linearRampToValueAtTime(560 * pitch, t0 + 0.16);
    o.frequency.setValueAtTime(560 * pitch, t0 + 0.24);
    o.frequency.exponentialRampToValueAtTime(240 * pitch, t0 + 0.55);
    filter.frequency.setValueAtTime(700 * pitch, t0);
    filter.frequency.linearRampToValueAtTime(1400 * pitch, t0 + 0.2);
    filter.frequency.exponentialRampToValueAtTime(500 * pitch, t0 + 0.55);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol * 0.5, t0 + 0.07);
    g.gain.setValueAtTime(vol * 0.5, t0 + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    o.start(t0);
    o.stop(t0 + 0.65);
  }

  purr(secs = 1.4, pitch = 1) {
    if (!this.ctx || !this.master || !this.soundOn) return;
    const t0 = this.now();
    const g = this.ctx.createGain();
    g.connect(this.master);
    const o = this.osc('sawtooth', 55 * pitch, g);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 24;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.12;
    lfo.connect(lfoG).connect(g.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.14, t0 + 0.3);
    g.gain.setValueAtTime(0.14, t0 + secs - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + secs);
    o.start(t0); o.stop(t0 + secs);
    lfo.start(t0); lfo.stop(t0 + secs);
  }

  hiss() {
    this.noiseBurst(0.4, 3200, 0.16, 0.05);
  }

  // ——— movement / world ———

  footstep(soft: boolean, onSand: boolean) {
    if (!this.ctx || !this.soundOn) return;
    const t = performance.now() / 1000;
    if (t - this.stepT < 0.13) return;
    this.stepT = t;
    this.noiseBurst(0.05, onSand ? 900 : 1800, soft ? 0.02 : 0.055, 0.001);
  }

  jump() {
    this.sweep(300, 620, 0.12, 0.1, 'sine');
  }

  superJump() {
    this.sweep(280, 980, 0.24, 0.13, 'sine');
    this.chime([880, 1174.7], 0.05, 0.1);
  }

  zoomWhoosh() {
    this.noiseBurst(0.5, 2200, 0.13, 0.08);
    this.sweep(220, 760, 0.4, 0.09, 'sine');
  }

  castPlunk() {
    this.sweep(620, 210, 0.18, 0.11, 'sine');
    this.noiseBurst(0.16, 1100, 0.1, 0.01);
  }

  biteAlert() {
    this.chime([980, 1320], 0.04, 0.16);
  }

  toyFound() {
    this.chime([659.3, 880, 1108.7, 1318.5], 0.1, 0.18);
  }

  land() {
    this.noiseBurst(0.09, 500, 0.1, 0.002);
  }

  splash() {
    this.noiseBurst(0.35, 1200, 0.22, 0.01);
    this.sweep(400, 150, 0.3, 0.08, 'sine');
  }

  swimStroke() {
    this.noiseBurst(0.18, 900, 0.05, 0.02);
  }

  dig() {
    this.noiseBurst(0.12, 600, 0.13, 0.005);
  }

  scratch() {
    this.noiseBurst(0.16, 2600, 0.09, 0.004);
  }

  climbGrip() {
    this.noiseBurst(0.06, 2000, 0.05, 0.002);
  }

  pounce() {
    this.sweep(200, 900, 0.18, 0.12, 'triangle');
  }

  // ——— pickups / UI / events ———

  yarnPickup() {
    this.chime([880, 1174.7], 0.09, 0.14);
  }

  goldenPickup() {
    this.chime([659.3, 880, 1108.7, 1318.5], 0.11, 0.18);
  }

  treatFound() {
    this.chime([740, 988], 0.09, 0.12);
  }

  uiTick() {
    this.chime([1320], 0.04, 0.05);
  }

  success() {
    this.chime([523.3, 659.3, 784, 1046.5], 0.13, 0.2);
  }

  fanfare() {
    if (!this.ctx || !this.master || !this.soundOn) return;
    const notes = [523.3, 659.3, 784, 1046.5, 784, 1046.5, 1318.5];
    notes.forEach((f, i) => setTimeout(() => this.chime([f], 0.12, 0.16), i * 130));
  }

  sadTrombone() {
    this.sweep(400, 300, 0.5, 0.1, 'triangle');
    setTimeout(() => this.sweep(350, 250, 0.6, 0.1, 'triangle'), 350);
  }

  duelWhoosh() {
    this.noiseBurst(0.22, 1500, 0.12, 0.05);
  }

  levelUp() {
    if (!this.ctx) return;
    [659.3, 784, 987.8, 1318.5].forEach((f, i) => setTimeout(() => this.chime([f], 0.1, 0.15), i * 90));
  }

  catJoin() {
    this.fanfare();
    setTimeout(() => this.meow(1.15, 0.4), 500);
  }

  private chime(freqs: number[], attack: number, vol: number) {
    if (!this.ctx || !this.master || !this.soundOn) return;
    const t0 = this.now();
    for (let i = 0; i < freqs.length; i++) {
      const g = this.ctx.createGain();
      g.connect(this.master);
      const o = this.osc('sine', freqs[i], g);
      const o2 = this.osc('triangle', freqs[i] * 2, g);
      const tt = t0 + i * 0.06;
      this.env(g, tt, attack, vol / (1 + i * 0.3), 0.7);
      o.start(tt); o.stop(tt + 1);
      o2.start(tt); o2.stop(tt + 1);
    }
  }

  private sweep(f0: number, f1: number, secs: number, vol: number, type: OscillatorType) {
    if (!this.ctx || !this.master || !this.soundOn) return;
    const t0 = this.now();
    const g = this.ctx.createGain();
    g.connect(this.master);
    const o = this.osc(type, f0, g);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + secs);
    this.env(g, t0, 0.02, vol, secs);
    o.start(t0);
    o.stop(t0 + secs + 0.1);
  }

  private noiseBurst(secs: number, cutoff: number, vol: number, attack: number) {
    if (!this.ctx || !this.master || !this.soundOn) return;
    const t0 = this.now();
    const len = Math.ceil(this.ctx.sampleRate * secs);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    src.connect(filter).connect(g).connect(this.master);
    this.env(g, t0, attack, vol, secs);
    src.start(t0);
  }

  // ——— ambient ———

  private startAmbient() {
    if (this.ambientTimer) return;
    this.ambientTimer = setInterval(() => {
      if (!this.ctx || !this.soundOn || document.hidden) return;
      if (this.isNight) {
        // crickets
        if (Math.random() < 0.75) this.cricket();
      } else {
        // birdsong
        if (Math.random() < 0.55) this.birdsong();
      }
    }, 2400);
  }

  private birdsong() {
    if (!this.ctx || !this.ambientGain) return;
    const t0 = this.now() + Math.random() * 0.8;
    const base = 1800 + Math.random() * 1400;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const g = this.ctx.createGain();
      g.connect(this.ambientGain);
      const o = this.osc('sine', base, g);
      const tt = t0 + i * (0.09 + Math.random() * 0.07);
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.25), tt);
      o.frequency.exponentialRampToValueAtTime(base * (0.75 + Math.random() * 0.5), tt + 0.07);
      this.env(g, tt, 0.01, 0.05 + Math.random() * 0.04, 0.09);
      o.start(tt);
      o.stop(tt + 0.2);
    }
  }

  private cricket() {
    if (!this.ctx || !this.ambientGain) return;
    const t0 = this.now() + Math.random() * 0.6;
    const f = 4200 + Math.random() * 800;
    for (let i = 0; i < 6; i++) {
      const g = this.ctx.createGain();
      g.connect(this.ambientGain);
      const o = this.osc('sine', f, g);
      const tt = t0 + i * 0.055;
      this.env(g, tt, 0.005, 0.025, 0.03);
      o.start(tt);
      o.stop(tt + 0.08);
    }
  }

  private startWind() {
    if (!this.ctx || !this.ambientGain) return;
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.98 + (Math.random() * 2 - 1) * 0.02; // brown-ish noise
      data[i] = last * 6;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.05;
    lfo.connect(lfoG).connect(g.gain);
    src.connect(filter).connect(g).connect(this.ambientGain);
    src.start();
    lfo.start();
  }

  // ——— gentle generative music (pentatonic marimba-ish) ———

  private startMusic() {
    if (this.musicTimer) return;
    const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3]; // C pentatonic-ish
    let step = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || !this.musicGain || !this.musicOn || document.hidden) return;
      step++;
      const t0 = this.now();
      // soft bass every 4 steps
      if (step % 4 === 0) {
        const g = this.ctx.createGain();
        g.connect(this.musicGain);
        const o = this.osc('sine', scale[0] / 2, g);
        this.env(g, t0, 0.05, 0.5, 1.8);
        o.start(t0); o.stop(t0 + 2);
      }
      // melody: wandering pentatonic
      if (Math.random() < 0.75) {
        const note = scale[Math.floor(Math.random() * scale.length)];
        const g = this.ctx.createGain();
        g.connect(this.musicGain);
        const o = this.osc('sine', note, g);
        const o2 = this.osc('triangle', note * 2, g);
        this.env(g, t0 + 0.02, 0.01, 0.55, 1.1);
        o.start(t0); o.stop(t0 + 1.3);
        o2.start(t0); o2.stop(t0 + 1.3);
      }
    }, 620);
  }

  dispose() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    if (this.ambientTimer) clearInterval(this.ambientTimer);
    this.ctx?.close();
    this.ctx = null;
  }
}
