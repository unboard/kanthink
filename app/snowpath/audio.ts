// Snowpath — tiny synthesized audio (no audio files)

export class SnowAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  muted = false;

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // wind: looped filtered noise
    const buf = this.noiseBuffer(2.0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.05;
    src.connect(f); f.connect(this.windGain); this.windGain.connect(this.master);
    src.start();
    // engine: continuous, silent until enabled
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** storm 0..1 drives wind loudness */
  setStorm(intensity: number) {
    if (this.windGain && this.ctx) {
      this.windGain.gain.setTargetAtTime(0.03 + intensity * 0.09, this.ctx.currentTime, 0.5);
    }
  }

  /** mode: 'off' | 'plow' | 'blower'; throttle 0..1 */
  setEngine(mode: 'off' | 'plow' | 'blower', throttle: number) {
    if (!this.ctx || !this.engineGain || !this.engineOsc || !this.engineFilter) return;
    const t = this.ctx.currentTime;
    if (mode === 'off') {
      this.engineGain.gain.setTargetAtTime(0, t, 0.15);
    } else if (mode === 'plow') {
      this.engineOsc.frequency.setTargetAtTime(48 + throttle * 42, t, 0.1);
      this.engineFilter.frequency.setTargetAtTime(220 + throttle * 380, t, 0.1);
      this.engineGain.gain.setTargetAtTime(0.075 + throttle * 0.06, t, 0.12);
    } else {
      this.engineOsc.frequency.setTargetAtTime(120 + throttle * 60, t, 0.08);
      this.engineFilter.frequency.setTargetAtTime(700 + throttle * 500, t, 0.08);
      this.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.035, t, 0.1);
    }
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slide = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, freq: number, gain: number, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur + 0.1);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.1);
  }

  chime() { [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.35, 'sine', 0.12, i * 0.09)); }
  sadHorn() { this.blip(220, 0.5, 'square', 0.06); this.blip(196, 0.7, 'square', 0.06, 0.3); }
  honk() { this.blip(310, 0.22, 'square', 0.07); this.blip(310, 0.22, 'square', 0.07, 0.3); }
  giggle() {
    const base = 700 + Math.random() * 300;
    [0, 1, 2].forEach((i) => this.blip(base + i * 120 + Math.random() * 80, 0.12, 'sine', 0.09, i * 0.08));
  }
  whoosh() { this.noiseBurst(0.25, 900, 0.10, 'highpass'); }
  pop() { this.noiseBurst(0.12, 500, 0.14); this.blip(180, 0.1, 'sine', 0.08, 0, -80); }
  scrape() { this.noiseBurst(0.3, 320, 0.05); }
  ding() { this.blip(880, 0.4, 'triangle', 0.1); }
  brrr() { this.blip(160, 0.35, 'triangle', 0.1, 0, -60); this.noiseBurst(0.2, 2400, 0.05, 'highpass'); }
}
