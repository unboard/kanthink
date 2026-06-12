// Paws & Found — audio.
// Synthesized animal voices, cozy jingles, light region ambience,
// and read-aloud story narration via the browser's SpeechSynthesis.

export class RescueAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private ambGain: GainNode | null = null;
  private ambNodes: AudioNode[] = [];
  private ambTimer: ReturnType<typeof setInterval> | null = null;
  private ambPlace = '';
  muted = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.ambGain = this.ctx.createGain();
    this.ambGain.gain.value = 0.5;
    this.ambGain.connect(this.master);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1);
    if (m) window.speechSynthesis?.cancel();
  }

  // ---- low-level helpers ------------------------------------------------------------

  private tone(f0: number, f1: number, dur: number, vol = 0.2, type: OscillatorType = 'sine', when = 0, opts: { vib?: [number, number]; trem?: [number, number]; attack?: number } = {}) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    osc.frequency.linearRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    const atk = opts.attack ?? 0.012;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + atk);
    g.gain.setValueAtTime(vol, t0 + Math.max(atk, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t0 + dur + 0.03);
    if (opts.vib) {
      const v = ctx.createOscillator();
      v.frequency.value = opts.vib[0];
      const vg = ctx.createGain();
      vg.gain.value = opts.vib[1];
      v.connect(vg).connect(osc.frequency);
      v.start(t0);
      v.stop(t0 + dur + 0.05);
    }
    if (opts.trem) {
      const tr = ctx.createOscillator();
      tr.frequency.value = opts.trem[0];
      const tg = ctx.createGain();
      tg.gain.value = vol * opts.trem[1];
      tr.connect(tg).connect(g.gain);
      tr.start(t0);
      tr.stop(t0 + dur + 0.05);
    }
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.06);
  }

  private noise(f: number, dur: number, vol = 0.15, when = 0, q = 4, f1?: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f, t0);
    bp.frequency.linearRampToValueAtTime(f1 ?? f, t0 + dur);
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t0, Math.random() * 0.8);
    src.stop(t0 + dur + 0.05);
  }

  // ---- animal voices -------------------------------------------------------------------

  voice(kind: string, baby = false) {
    const up = baby ? 1.5 : 1;
    switch (kind) {
      case 'meow':
        this.tone(620 * up, 880 * up, 0.16, 0.18, 'sawtooth', 0, { attack: 0.04 });
        this.tone(880 * up, 520 * up, 0.3, 0.18, 'sawtooth', 0.16, { vib: [7, 18] });
        break;
      case 'purr':
        this.tone(70 * up, 65 * up, 0.9, 0.16, 'sawtooth', 0, { trem: [24, 0.95], attack: 0.1 });
        break;
      case 'bark':
        this.noise(900 * up, 0.1, 0.2, 0, 2);
        this.tone(420 * up, 240 * up, 0.12, 0.22, 'square');
        if (!baby) {
          this.noise(900, 0.1, 0.18, 0.18, 2);
          this.tone(400, 230, 0.12, 0.2, 'square', 0.18);
        } else {
          this.tone(640, 420, 0.09, 0.18, 'square', 0.16);
        }
        break;
      case 'chirp':
        this.tone(2200 * up, 2900 * up, 0.08, 0.14);
        this.tone(2700 * up, 2300 * up, 0.09, 0.14, 'sine', 0.12);
        this.tone(2400 * up, 3100 * up, 0.08, 0.12, 'sine', 0.26);
        break;
      case 'bleat':
        this.tone(440 * up, 380 * up, 0.45, 0.18, 'sawtooth', 0, { trem: [16, 0.8] });
        break;
      case 'neigh':
        this.tone(900 * up, 420 * up, 0.55, 0.16, 'sawtooth', 0, { trem: [22, 0.7], vib: [9, 40] });
        break;
      case 'quack':
        this.tone(620 * up, 480 * up, 0.13, 0.18, 'square', 0, { trem: [30, 0.6] });
        this.tone(600, 460, 0.13, 0.16, 'square', 0.18, { trem: [30, 0.6] });
        break;
      case 'squeak':
        this.tone(2400 * up, 3200 * up, 0.09, 0.12);
        this.tone(3000 * up, 2200 * up, 0.1, 0.1, 'sine', 0.12);
        break;
      case 'hoot':
        this.tone(420, 400, 0.18, 0.16, 'sine', 0, { attack: 0.04 });
        this.tone(400, 360, 0.3, 0.16, 'sine', 0.3, { attack: 0.04 });
        break;
      case 'snort':
        this.noise(500, 0.16, 0.16, 0, 1.6, 260);
        break;
      default:
        this.tone(800, 600, 0.12, 0.12);
    }
  }

  // ---- UI & gameplay sounds -------------------------------------------------------------

  tap() {
    this.tone(700, 920, 0.06, 0.08);
  }
  open() {
    this.tone(520, 700, 0.09, 0.08);
    this.tone(700, 1040, 0.1, 0.08, 'sine', 0.07);
  }
  step(soft = false) {
    this.noise(soft ? 500 : 700, 0.05, soft ? 0.025 : 0.04, 0, 1.2);
  }
  found() {
    // evidence discovered
    this.tone(880, 880, 0.09, 0.12, 'triangle');
    this.tone(1175, 1175, 0.12, 0.12, 'triangle', 0.09);
  }
  pageTurn() {
    this.noise(1800, 0.16, 0.07, 0, 1.2, 900);
  }
  coin() {
    this.tone(1320, 1760, 0.07, 0.1, 'triangle');
    this.tone(1760, 2200, 0.1, 0.09, 'triangle', 0.07);
  }
  alertSting() {
    this.tone(330, 310, 0.12, 0.12, 'triangle');
  }
  spook() {
    this.noise(800, 0.2, 0.14, 0, 1.4, 1600);
    this.tone(500, 900, 0.18, 0.1, 'triangle');
  }
  pet() {
    this.voice('purr');
    this.tone(1040, 1320, 0.12, 0.07, 'sine', 0.15);
  }
  pickup() {
    this.tone(620, 940, 0.12, 0.1, 'triangle');
  }
  celebrate() {
    // warm little fanfare: C E G C
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, f, i === 3 ? 0.42 : 0.15, 0.16, 'triangle', i * 0.13));
    this.tone(262, 262, 0.8, 0.07, 'sine', 0, { attack: 0.05 });
    this.noise(4000, 0.5, 0.05, 0.35, 1);
  }
  lullaby() {
    // babies arrive: gentle G E C E G
    const seq = [784, 659, 523, 659, 784];
    seq.forEach((f, i) => this.tone(f, f, 0.22, 0.1, 'sine', i * 0.24, { attack: 0.05 }));
  }
  levelUp() {
    const seq = [523, 587, 659, 784, 880, 1047];
    seq.forEach((f, i) => this.tone(f, f, 0.12, 0.13, 'triangle', i * 0.09));
  }
  wrongPlace() {
    this.tone(440, 392, 0.2, 0.1, 'triangle');
    this.tone(392, 330, 0.3, 0.1, 'triangle', 0.22);
  }
  splash() {
    this.noise(1100, 0.25, 0.12, 0, 1.2, 500);
  }

  // ---- region ambience: occasional gentle sounds ------------------------------------------

  setPlace(place: string) {
    if (place === this.ambPlace) return;
    this.ambPlace = place;
    if (this.ambTimer) clearInterval(this.ambTimer);
    this.ambTimer = setInterval(() => {
      if (!this.ctx || this.muted || document.hidden) return;
      const r = Math.random();
      switch (this.ambPlace) {
        case 'woods':
          if (r < 0.5) this.voice('chirp');
          else this.noise(600, 0.7, 0.025, 0, 0.8); // breeze
          break;
        case 'farm':
          if (r < 0.25) this.voice('chirp');
          else if (r < 0.4) this.voice('bleat');
          else this.noise(500, 0.8, 0.02, 0, 0.8);
          break;
        case 'creek':
          this.noise(900, 1.4, 0.05, 0, 0.9, 700);
          if (r < 0.3) this.voice('chirp');
          break;
        case 'ridge':
          this.noise(400, 1.6, 0.05, 0, 0.7, 300); // wind
          if (r < 0.2) this.tone(2900, 2500, 0.4, 0.04); // distant raptor
          break;
        case 'marsh':
          if (r < 0.5) {
            // frog ribbits
            this.tone(220, 190, 0.1, 0.07, 'sawtooth', 0, { trem: [22, 0.8] });
            this.tone(230, 200, 0.1, 0.06, 'sawtooth', 0.16, { trem: [22, 0.8] });
          } else this.noise(700, 1, 0.03, 0, 0.9);
          break;
        case 'hq':
          if (r < 0.4) this.voice('chirp');
          break;
      }
    }, 3800);
  }

  // ---- read-aloud narration ------------------------------------------------------------------

  speak(text: string) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const clean = text.replace(/\*/g, '').replace(/["“”]/g, '');
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 0.95;
    u.pitch = 1.1;
    const voices = synth.getVoices();
    const nice =
      voices.find((v) => v.lang.startsWith('en') && /female|samantha|aria|jenny|zira/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith('en'));
    if (nice) u.voice = nice;
    synth.speak(u);
  }

  stopSpeaking() {
    window.speechSynthesis?.cancel();
  }
}
