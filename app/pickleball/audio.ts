// Pickleball — every sound is synthesized here; no audio files.

export class Sfx {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** call from a user gesture so the browser lets audio start */
  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const len = Math.floor(this.ctx.sampleRate * 0.08);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ready(): AudioContext | null {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  /** the hollow "pock" of a paddle on a plastic ball */
  hit(strength = 1) {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(820, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.06);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.25 * strength, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(og).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  bounce() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** rising two notes for a point won, falling for a point lost */
  point(good: boolean) {
    const ctx = this.ready();
    if (!ctx) return;
    const notes = good ? [523.25, 783.99] : [392, 311.13];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.11;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  private tone(f0: number, f1: number, start: number, dur: number, vol: number, type: OscillatorType = 'triangle') {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private hiss(start: number, dur: number, vol: number, f0: number, f1: number) {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime + start;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
  }

  /** the announcer's stinger for a callout (lib: the Neon design pass's sound sketches) */
  call(kind: string) {
    const v = 0.09;
    const arp = (notes: number[], step: number, dur: number, type: OscillatorType = 'square') => notes.forEach((f, i) => this.tone(f, f, i * step, dur, v * (type === 'square' ? 0.6 : 1), type));
    switch (kind) {
      case 'start': arp([523, 659, 784, 1047], 0.085, 0.2); break;
      case 'side-out': arp([392, 523], 0.11, 0.22, 'triangle'); break;
      case 'ace': this.tone(300, 1250, 0, 0.28, v, 'sawtooth'); this.hiss(0.2, 0.08, 0.2, 3000, 2000); break;
      case 'kitchen': this.tone(820, 260, 0, 0.38, v * 1.2, 'sine'); break;
      case 'two-bounce': this.tone(190, 360, 0, 0.14, v * 1.2); this.tone(190, 360, 0.16, 0.14, v * 1.2); break;
      case 'dink': this.tone(1319, 1319, 0, 0.35, v, 'sine'); this.tone(2637, 2637, 0, 0.2, v * 0.4, 'sine'); break;
      case 'lob': this.tone(420, 1450, 0, 0.35, v, 'sine'); break;
      case 'smash': this.tone(150, 42, 0, 0.4, v * 2.2, 'sine'); this.hiss(0, 0.09, 0.35, 1800, 600); break;
      case 'rally10': this.hiss(0, 0.05, 0.25, 2000, 1500); this.hiss(0.1, 0.05, 0.25, 2000, 1500); arp([392, 587], 0.12, 0.25, 'triangle'); break;
      case 'rally20': arp([349, 440, 523, 659], 0.02, 0.45, 'sawtooth'); break;
      case 'warm': arp([262, 330, 392], 0.06, 0.3, 'sawtooth'); break;
      case 'fire': arp([262, 392, 523], 0, 0.5, 'sawtooth'); this.hiss(0, 0.5, 0.25, 400, 3000); break;
      case 'cooled': case 'doused': [2200, 1600, 1180, 880, 620].forEach((f, i) => this.tone(f, f * 0.98, i * 0.07, 0.3, v, 'sine')); break;
      case 'combo': arp([440, 554, 659], 0.06, 0.2, 'sawtooth'); break;
      case 'streak': arp([523, 659, 784], 0.07, 0.2, 'triangle'); break;
      case 'tied': this.hiss(0, 0.6, 0.12, 500, 1500); arp([523, 659, 784], 0, 0.5, 'triangle'); break;
      case 'game-point': [0, 0.18, 0.36].forEach((t) => this.tone(98, 90, t, 0.16, v * 2, 'sine')); this.tone(1568, 1568, 0.5, 0.4, v * 0.6, 'sine'); break;
      case 'overtime': this.tone(131, 131, 0, 0.48, v * 1.4, 'sawtooth'); this.tone(523, 523, 0, 0.48, v, 'square'); break;
      case 'win': arp([523, 659, 784, 1047, 784, 1047], 0.13, 0.3, 'square'); break;
    }
  }

  /** two teammates' paddles meeting */
  slap() {
    this.hiss(0, 0.06, 0.4, 2500, 1200);
    this.tone(900, 600, 0, 0.08, 0.12, 'sine');
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
