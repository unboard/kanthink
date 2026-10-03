// Clean Cut — synthesized sound: a twin-cylinder mower engine, blade whine and load,
// a two-stroke string trimmer, and the little rewards (chimes, cash register).

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  // engine
  private engOsc: OscillatorNode[] = [];
  private engGain!: GainNode;
  private engAm!: GainNode;
  private engLfo!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  // blades
  private bladeGain!: GainNode;
  private bladeWhine!: OscillatorNode;
  private bladeNoiseFilter!: BiquadFilterNode;
  private loadGain!: GainNode;
  // trimmer
  private trimOsc!: OscillatorNode;
  private trimGain!: GainNode;
  private trimCut!: GainNode;
  private ambient!: GainNode;
  private birdTimer = 0;
  volume = 0.8;
  muted = false;

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // —— engine: two detuned saws + sub, amplitude-modulated at the firing rate
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 520;
    this.engFilter.Q.value = 2.5;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.6);
    }
    shaper.curve = curve;
    this.engAm = ctx.createGain();
    this.engAm.gain.value = 0.6;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    for (const [type, mul] of [['sawtooth', 1], ['sawtooth', 1.007], ['square', 0.5]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 40 * mul;
      o.connect(shaper);
      o.start();
      this.engOsc.push(o);
    }
    const chug = ctx.createBufferSource();
    chug.buffer = this.noise;
    chug.loop = true;
    const chugF = ctx.createBiquadFilter();
    chugF.type = 'bandpass';
    chugF.frequency.value = 180;
    const chugG = ctx.createGain();
    chugG.gain.value = 0.35;
    chug.connect(chugF).connect(chugG).connect(shaper);
    chug.start();
    shaper.connect(this.engFilter).connect(this.engAm).connect(this.engGain).connect(this.master);
    this.engLfo = ctx.createOscillator();
    this.engLfo.frequency.value = 22;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.4;
    this.engLfo.connect(lfoDepth).connect(this.engAm.gain);
    this.engLfo.start();

    // —— blades: a spinning whine plus airy noise; "load" is the chewing of long grass
    this.bladeGain = ctx.createGain();
    this.bladeGain.gain.value = 0;
    this.bladeWhine = ctx.createOscillator();
    this.bladeWhine.type = 'triangle';
    this.bladeWhine.frequency.value = 160;
    const whineG = ctx.createGain();
    whineG.gain.value = 0.12;
    this.bladeWhine.connect(whineG).connect(this.bladeGain);
    this.bladeWhine.start();
    const bn = ctx.createBufferSource();
    bn.buffer = this.noise;
    bn.loop = true;
    this.bladeNoiseFilter = ctx.createBiquadFilter();
    this.bladeNoiseFilter.type = 'bandpass';
    this.bladeNoiseFilter.frequency.value = 1400;
    this.bladeNoiseFilter.Q.value = 0.7;
    const bnG = ctx.createGain();
    bnG.gain.value = 0.22;
    bn.connect(this.bladeNoiseFilter).connect(bnG).connect(this.bladeGain);
    bn.start();
    this.bladeGain.connect(this.master);
    const ln = ctx.createBufferSource();
    ln.buffer = this.noise;
    ln.loop = true;
    const lf = ctx.createBiquadFilter();
    lf.type = 'lowpass';
    lf.frequency.value = 650;
    this.loadGain = ctx.createGain();
    this.loadGain.gain.value = 0;
    ln.connect(lf).connect(this.loadGain).connect(this.master);
    ln.start();

    // —— trimmer: a buzzy two-stroke
    this.trimOsc = ctx.createOscillator();
    this.trimOsc.type = 'sawtooth';
    this.trimOsc.frequency.value = 120;
    const tf = ctx.createBiquadFilter();
    tf.type = 'peaking';
    tf.frequency.value = 2200;
    tf.gain.value = 9;
    const thp = ctx.createBiquadFilter();
    thp.type = 'highpass';
    thp.frequency.value = 180;
    this.trimGain = ctx.createGain();
    this.trimGain.gain.value = 0;
    this.trimOsc.connect(thp).connect(tf).connect(this.trimGain).connect(this.master);
    this.trimOsc.start();
    const tn = ctx.createBufferSource();
    tn.buffer = this.noise;
    tn.loop = true;
    const tnf = ctx.createBiquadFilter();
    tnf.type = 'bandpass';
    tnf.frequency.value = 3200;
    tnf.Q.value = 1.2;
    this.trimCut = ctx.createGain();
    this.trimCut.gain.value = 0;
    tn.connect(tnf).connect(this.trimCut).connect(this.master);
    tn.start();

    // —— ambience: soft wind
    const an = ctx.createBufferSource();
    an.buffer = this.noise;
    an.loop = true;
    const af = ctx.createBiquadFilter();
    af.type = 'lowpass';
    af.frequency.value = 380;
    this.ambient = ctx.createGain();
    this.ambient.gain.value = 0.05;
    an.connect(af).connect(this.ambient).connect(this.master);
    an.start();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  /** Called every frame. rpm 0..1, blade 0..1 spin, load 0..1 cutting, trim 0..1 rev, trimLoad 0..1. */
  update(dt: number, s: { engineOn: boolean; rpm: number; blade: number; load: number; trim: number; trimLoad: number; near: number }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = 0.06;
    const eng = s.engineOn ? 1 : 0;
    const fire = 18 + s.rpm * 30 - s.load * 4;
    this.engOsc[0].frequency.setTargetAtTime(fire * 2, t, k);
    this.engOsc[1].frequency.setTargetAtTime(fire * 2 * 1.007, t, k);
    this.engOsc[2].frequency.setTargetAtTime(fire, t, k);
    this.engLfo.frequency.setTargetAtTime(fire, t, k);
    this.engFilter.frequency.setTargetAtTime(300 + s.rpm * 900, t, k);
    this.engGain.gain.setTargetAtTime(eng * (0.1 + s.rpm * 0.12) * s.near, t, 0.08);
    this.bladeGain.gain.setTargetAtTime(eng * s.blade * 0.32 * s.near, t, 0.15);
    this.bladeWhine.frequency.setTargetAtTime(90 + s.blade * 110 - s.load * 25, t, 0.1);
    this.bladeNoiseFilter.frequency.setTargetAtTime(700 + s.blade * 900, t, 0.1);
    this.loadGain.gain.setTargetAtTime(eng * s.load * 0.5 * s.near, t, 0.05);
    this.trimOsc.frequency.setTargetAtTime(95 + s.trim * 120 - s.trimLoad * 18, t, 0.04);
    this.trimGain.gain.setTargetAtTime(s.trim > 0.01 ? 0.03 + s.trim * 0.08 : 0, t, 0.05);
    this.trimCut.gain.setTargetAtTime(s.trimLoad * 0.22, t, 0.03);
    this.birdTimer -= dt;
    if (this.birdTimer < 0) {
      this.birdTimer = 2 + Math.random() * 6;
      this.bird();
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(freq: number, when: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, when + dur);
    const g = ctx.createGain();
    this.env(g, when, 0.008, vol, dur);
    o.connect(g).connect(this.master);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  bird() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone(base * (0.9 + Math.random() * 0.25), t + i * 0.11, 0.07, 'sine', 0.025, 1.3 + Math.random() * 0.3);
  }

  chime(level = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [659.25, 830.61, 987.77, 1318.5];
    const shift = Math.pow(2, (level % 4) / 12);
    notes.forEach((f, i) => this.tone(f * shift, t + i * 0.055, 0.35, 'sine', 0.09));
    this.tone(1975 * shift, t + 0.22, 0.5, 'triangle', 0.03);
  }

  tick() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.tone(1400, ctx.currentTime, 0.04, 'square', 0.03);
  }

  stripe() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(880, t, 0.12, 'sine', 0.06);
    this.tone(1318, t + 0.07, 0.2, 'sine', 0.05);
  }

  thud() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(90, t, 0.25, 'sine', 0.4, 0.5);
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    this.env(g, t, 0.004, 0.35, 0.18);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + 0.3);
  }

  cash() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(1567, t, 0.08, 'square', 0.05);
    this.tone(2093, t + 0.07, 0.4, 'square', 0.05);
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 5000;
    const g = ctx.createGain();
    this.env(g, t + 0.05, 0.004, 0.1, 0.25);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + 0.4);
  }

  bladesToggle(on: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(on ? 220 : 330, t, 0.12, 'square', 0.05, on ? 1.5 : 0.6);
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
