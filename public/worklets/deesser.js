// De-esser AudioWorklet for the /record studio.
//
// Ducks the sibilance band (~4.5 kHz and up) only while it spikes above the
// running speech level. Unlike DynamicsCompressorNode there is NO automatic
// makeup gain and NO lookahead latency, so when nothing is being reduced the
// output is bit-identical to the input: the band split is done by subtraction
// (high = in - lowpass(in)), which reconstructs perfectly at unity gain.
//
// Detection is relative — the high band is allowed up to a fraction of the
// overall speech envelope — so it keeps working regardless of mic level or
// AGC drift, and it ignores quiet hiss (absolute floor) instead of pumping it.

class Biquad {
  constructor(type, freq, q) {
    const w = (2 * Math.PI * freq) / sampleRate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    if (type === 'lowpass') {
      this.b0 = (1 - cos) / 2 / a0;
      this.b1 = (1 - cos) / a0;
      this.b2 = this.b0;
    } else {
      this.b0 = (1 + cos) / 2 / a0;
      this.b1 = -(1 + cos) / a0;
      this.b2 = this.b0;
    }
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  run(x) {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

const SPLIT_HZ = 4500; // band split for the reduction path
const DET_HZ = 5200;   // steeper 4th-order detector centered on ess energy
const SIB_RATIO = 0.45; // high band may reach this fraction of the speech envelope
const FLOOR = 0.0015;  // ~-56 dBFS: below this, leave the signal alone (hiss)
const MIN_GAIN = 0.25; // cap reduction at ~12 dB

class DeEsser extends AudioWorkletProcessor {
  constructor() {
    super();
    this.splits = [];
    this.det1 = new Biquad('highpass', DET_HZ, Math.SQRT1_2);
    this.det2 = new Biquad('highpass', DET_HZ, Math.SQRT1_2);
    const tc = (ms) => Math.exp(-1000 / (ms * sampleRate));
    this.envHiA = tc(2);
    this.envHiR = tc(40);
    this.envWideA = tc(8);
    this.envWideR = tc(250);
    this.gA = tc(1.5);
    this.gR = tc(90);
    this.envHi = 0;
    this.envWide = 0;
    this.gain = 1;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    while (this.splits.length < input.length) {
      this.splits.push(new Biquad('lowpass', SPLIT_HZ, Math.SQRT1_2));
    }
    const n = input[0].length;
    for (let i = 0; i < n; i++) {
      const x0 = input[0][i];

      // Sibilance detector (4th-order highpass) and wideband speech envelope.
      const d = Math.abs(this.det2.run(this.det1.run(x0)));
      this.envHi =
        d > this.envHi
          ? this.envHiA * this.envHi + (1 - this.envHiA) * d
          : this.envHiR * this.envHi + (1 - this.envHiR) * d;
      const a = Math.abs(x0);
      this.envWide =
        a > this.envWide
          ? this.envWideA * this.envWide + (1 - this.envWideA) * a
          : this.envWideR * this.envWide + (1 - this.envWideR) * a;

      // How loud is the high band allowed to be right now?
      const allowed = Math.max(this.envWide * SIB_RATIO, FLOOR);
      let target = this.envHi > allowed ? allowed / this.envHi : 1;
      if (target < MIN_GAIN) target = MIN_GAIN;
      this.gain =
        target < this.gain
          ? this.gA * this.gain + (1 - this.gA) * target
          : this.gR * this.gain + (1 - this.gR) * target;

      for (let c = 0; c < input.length; c++) {
        const x = input[c][i];
        const low = this.splits[c].run(x);
        output[c][i] = low + (x - low) * this.gain;
      }
    }
    return true;
  }
}

registerProcessor('deesser', DeEsser);
