/**
 * A cat's purr, made on the spot: soft rumbling noise pulsed about 26 times a second,
 * louder on each breath out and quieter breathing in. A pet turns it up for a moment.
 * Phones that can buzz buzz along with each breath out.
 */

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let stopAt: (() => void) | null = null;
let level = 1;

function context() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function startPurr() {
  if (stopAt) return;
  const ac = context();
  if (!ac) return;
  // Brown noise, so the rumble lives low down.
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const low = ac.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 260;
  // The flutter: the noise switched on and off about 26 times a second.
  const pulse = ac.createGain();
  pulse.gain.value = 0.5;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 26;
  const depth = ac.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(pulse.gain);
  const gain = ac.createGain();
  out = gain;
  gain.gain.value = 0;
  noise.connect(low).connect(pulse).connect(gain).connect(ac.destination);
  noise.start();
  lfo.start();

  let alive = true;
  const breathe = () => {
    if (!alive) return;
    const t = ac.currentTime;
    const loud = 0.55 * level;
    // Breathing out: a strong rumble. Breathing in: softer and a touch quicker.
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(loud, t + 0.25);
    gain.gain.linearRampToValueAtTime(loud * 0.8, t + 1.2);
    gain.gain.linearRampToValueAtTime(loud * 0.3, t + 1.45);
    gain.gain.linearRampToValueAtTime(loud * 0.35, t + 2.3);
    lfo.frequency.setValueAtTime(25, t);
    lfo.frequency.setValueAtTime(28, t + 1.4);
    try { navigator.vibrate?.([40, 20, 40, 20, 40, 20, 40, 20, 40]); } catch { /* not a buzzing device */ }
    timer = window.setTimeout(breathe, 2400);
  };
  let timer = window.setTimeout(breathe, 0);
  stopAt = () => {
    alive = false;
    window.clearTimeout(timer);
    const t = ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0, t, 0.15);
    window.setTimeout(() => { noise.stop(); lfo.stop(); gain.disconnect(); }, 800);
    try { navigator.vibrate?.(0); } catch { /* fine */ }
  };
}

export function stopPurr() {
  stopAt?.();
  stopAt = null;
  out = null;
  level = 1;
}

/** A pet: louder for a couple of breaths. */
export function purrHarder() {
  level = 1.7;
  if (out && ctx) { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0.55 * level, ctx.currentTime, 0.1); }
  window.setTimeout(() => { level = 1; }, 4800);
}
