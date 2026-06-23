// Canvas compositor for the /record studio. Each animation frame it draws the
// captured screen plus the webcam (as a draggable shaped bubble, a free-form
// cutout sticker, or a split-screen panel) into a canvas, which is then
// captured into a MediaRecorder together with the mixed audio.

import { ASPECT_DIMS, BUBBLE_ASPECT, type BubblePlacement, type StudioConfig, type SubtitleStyle } from './types';
import { WebcamEffectProcessor } from './segmentation';

export interface CompositorState {
  config: StudioConfig;
  bubble: BubblePlacement;
  screenVideo: HTMLVideoElement | null;
  webcamVideo: HTMLVideoElement | null;
  caption: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Media = HTMLVideoElement | HTMLCanvasElement;

function mediaSize(m: Media): { w: number; h: number } {
  if (m instanceof HTMLVideoElement) return { w: m.videoWidth, h: m.videoHeight };
  return { w: m.width, h: m.height };
}

/** Fit media inside rect, preserving aspect ratio, centered (letterboxed). */
function drawContain(ctx: CanvasRenderingContext2D, m: Media, r: Rect) {
  const { w: mw, h: mh } = mediaSize(m);
  if (!mw || !mh) return;
  const scale = Math.min(r.w / mw, r.h / mh);
  const dw = mw * scale;
  const dh = mh * scale;
  ctx.drawImage(m, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
}

/**
 * Draw the webcam into rect as a digital camera zoom — the image always FILLS
 * the frame; zoom changes how much of the source you see, not the picture size.
 *
 * mode 'cover' (opaque frames): sample a centered region of the source that
 * matches the frame aspect, scaled to fill. zoom=1 (minimum) shows the largest
 * such region (the whole frame, furthest out); zoom>1 samples a smaller region
 * (closer in). No margins, ever.
 *
 * mode 'contain' (cutout sticker): the source has a transparent background, so
 * fit the whole frame inside rect (transparent margins let the screen show
 * through); zoom>1 magnifies the subject.
 */
function drawCam(
  ctx: CanvasRenderingContext2D,
  m: Media,
  r: Rect,
  zoom: number,
  mode: 'cover' | 'contain'
) {
  const { w: mw, h: mh } = mediaSize(m);
  if (!mw || !mh) return;
  const z = Math.max(1, zoom);

  if (mode === 'contain') {
    const scale = Math.min(r.w / mw, r.h / mh) * z;
    const dw = mw * scale;
    const dh = mh * scale;
    ctx.drawImage(m, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
    return;
  }

  // cover: largest centered source region matching the frame aspect (zoom=1),
  // shrinking toward the center as zoom increases.
  const destAspect = r.w / r.h;
  let baseSW: number;
  let baseSH: number;
  if (mw / mh > destAspect) {
    baseSH = mh;
    baseSW = mh * destAspect;
  } else {
    baseSW = mw;
    baseSH = mw / destAspect;
  }
  const sw = baseSW / z;
  const sh = baseSH / z;
  ctx.drawImage(m, (mw - sw) / 2, (mh - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
}

function shapePath(ctx: CanvasRenderingContext2D, r: Rect, shape: StudioConfig['shape']) {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) / 2, 0, Math.PI * 2);
  } else if (shape === 'rounded') {
    ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.18);
  } else if (shape === 'rectangle') {
    ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.12);
  } else {
    ctx.rect(r.x, r.y, r.w, r.h);
  }
}

// ===== Subtitles =====

function wrapCaption(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(candidate).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(-2); // show the two most recent lines
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  text: string,
  style: SubtitleStyle
) {
  const fontPx = Math.round(H * (style.size === 'sm' ? 0.035 : style.size === 'lg' ? 0.058 : 0.046));
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const maxWidth = W * 0.82;
  const lines = wrapCaption(ctx, text, maxWidth);
  if (lines.length === 0) return;

  const lineH = fontPx * 1.28;
  const blockH = lines.length * lineH;
  const padX = fontPx * 0.5;
  const padY = fontPx * 0.32;

  const margin = H * 0.06;
  const topY =
    style.position === 'top' ? margin : style.position === 'center' ? (H - blockH) / 2 : H - margin - blockH;

  const cx = W / 2;

  // Whole-block dark backdrop.
  if (style.background === 'dark') {
    const widest = Math.min(maxWidth, Math.max(...lines.map((l) => ctx.measureText(l).width)));
    const rectW = widest + padX * 2;
    const rectH = blockH + padY * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(cx - rectW / 2, topY - padY, rectW, rectH, fontPx * 0.25);
    ctx.fill();
  }

  lines.forEach((line, i) => {
    const y = topY + i * lineH;
    if (style.background === 'pill') {
      const w = ctx.measureText(line).width + padX * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(cx - w / 2, y - padY * 0.6, w, lineH, lineH * 0.5);
      ctx.fill();
    }
    if (style.background === 'none') {
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = fontPx * 0.18;
    }
    ctx.fillStyle = style.color;
    ctx.fillText(line, cx, y);
    ctx.shadowBlur = 0;
  });
}

export class Compositor {
  private ctx: CanvasRenderingContext2D;
  private rafId = 0;
  private running = false;
  private processor = new WebcamEffectProcessor();
  private effectInitStarted = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private getState: () => CompositorState
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.draw();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  dispose() {
    this.stop();
    this.processor.dispose();
  }

  private draw() {
    const { config, bubble, screenVideo, webcamVideo, caption } = this.getState();
    const dims = ASPECT_DIMS[config.aspect];
    if (this.canvas.width !== dims.width) this.canvas.width = dims.width;
    if (this.canvas.height !== dims.height) this.canvas.height = dims.height;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = this.ctx;

    ctx.fillStyle = '#0b0b0c';
    ctx.fillRect(0, 0, W, H);

    // Kick off model loading the first frame an effect is requested.
    if (config.effect !== 'none' && !this.effectInitStarted) {
      this.effectInitStarted = true;
      this.processor.init();
    }

    const haveCam = config.showWebcam && webcamVideo && webcamVideo.readyState >= 2;

    if (config.template === 'overlay') {
      if (screenVideo && screenVideo.readyState >= 2) {
        drawContain(ctx, screenVideo, { x: 0, y: 0, w: W, h: H });
      }
      if (haveCam) this.drawBubble(ctx, webcamVideo!, config, bubble, W, H);
      if (config.subtitles.enabled && caption) drawCaption(ctx, W, H, caption, config.subtitles);
      return;
    }

    // Split templates: screen on one panel, webcam on the other.
    const camFraction = config.template === 'split-33' ? 0.33 : 0.5;
    const vertical = H > W;
    let screenRect: Rect;
    let camRect: Rect;
    if (vertical) {
      const camH = H * camFraction;
      screenRect = { x: 0, y: 0, w: W, h: H - camH };
      camRect = { x: 0, y: H - camH, w: W, h: camH };
    } else {
      const camW = W * camFraction;
      screenRect = { x: 0, y: 0, w: W - camW, h: H };
      camRect = { x: W - camW, y: 0, w: camW, h: H };
    }

    if (screenVideo && screenVideo.readyState >= 2) {
      drawContain(ctx, screenVideo, screenRect);
    }
    if (haveCam) this.drawCamPanel(ctx, webcamVideo!, config, camRect);
    if (config.subtitles.enabled && caption) drawCaption(ctx, W, H, caption, config.subtitles);
  }

  private camSource(video: HTMLVideoElement, config: StudioConfig): Media {
    const ts = performance.now();
    const processed = this.processor.process(video, config.effect, ts);
    return processed ?? video;
  }

  private drawBubble(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    config: StudioConfig,
    bubble: BubblePlacement,
    W: number,
    H: number
  ) {
    const h = bubble.size * H;
    const w = h * BUBBLE_ASPECT[config.shape];
    const s = Math.min(w, h);
    const cx = bubble.x * W;
    const cy = bubble.y * H;
    const rect: Rect = { x: cx - w / 2, y: cy - h / 2, w, h };
    const source = this.camSource(video, config);

    if (config.effect === 'cutout') {
      // Free-form sticker: no bubble, just the person with a soft shadow.
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = s * 0.06;
      ctx.shadowOffsetY = s * 0.02;
      // Cutout has a transparent background — keep the whole subject, transparent margins.
      drawCam(ctx, source, rect, config.zoom, 'contain');
      ctx.restore();
      return;
    }

    ctx.save();
    // Drop shadow + white backing.
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = s * 0.05;
    ctx.shadowOffsetY = s * 0.015;
    ctx.fillStyle = '#ffffff';
    shapePath(ctx, rect, config.shape);
    ctx.fill();
    ctx.restore();

    // Clip to shape and draw the webcam.
    ctx.save();
    shapePath(ctx, rect, config.shape);
    ctx.clip();
    drawCam(ctx, source, rect, config.zoom, 'cover');
    ctx.restore();

    // White border ring.
    if (config.borderWidth > 0) {
      ctx.save();
      ctx.lineWidth = config.borderWidth;
      ctx.strokeStyle = '#ffffff';
      shapePath(ctx, rect, config.shape);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawCamPanel(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    config: StudioConfig,
    rect: Rect
  ) {
    const source = this.camSource(video, config);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    if (config.effect === 'cutout') {
      // Cutout in a panel needs a backdrop behind the person.
      const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
      grad.addColorStop(0, '#1f2937');
      grad.addColorStop(1, '#0b0b0c');
      ctx.fillStyle = grad;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    drawCam(ctx, source, rect, config.zoom, config.effect === 'cutout' ? 'contain' : 'cover');
    ctx.restore();
  }
}

// ===== Audio mixing + enhancement =====

/**
 * "Soften" chain to tame harsh mic audio (e.g. bright bluetooth headset mics):
 * high-shelf cut on the harsh top end, a presence dip around 3 kHz, a gentle
 * low-pass, and a compressor to even out peaks. Returns the tail node.
 */
function softenMic(ctx: AudioContext, source: AudioNode): AudioNode {
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 5500;
  shelf.gain.value = -6;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 1;
  presence.gain.value = -4;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 13000;
  lowpass.Q.value = 0.7;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 30;
  comp.ratio.value = 3;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  source.connect(shelf);
  shelf.connect(presence);
  presence.connect(lowpass);
  lowpass.connect(comp);
  return comp;
}

/**
 * Build the recording audio: mic (optionally softened) plus browser/tab audio,
 * mixed to one stream. Returns null for a silent recording. Caller owns the ctx.
 */
export function buildRecordingAudio(
  ctx: AudioContext,
  opts: { mic?: MediaStream | null; browser?: MediaStream | null; enhance: boolean }
): MediaStream | null {
  const dest = ctx.createMediaStreamDestination();
  let any = false;

  if (opts.mic && opts.mic.getAudioTracks().length > 0) {
    const src = ctx.createMediaStreamSource(opts.mic);
    const tail = opts.enhance ? softenMic(ctx, src) : src;
    tail.connect(dest);
    any = true;
  }
  if (opts.browser && opts.browser.getAudioTracks().length > 0) {
    ctx.createMediaStreamSource(opts.browser).connect(dest);
    any = true;
  }

  return any ? dest.stream : null;
}

// ===== Recording =====

export function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'video/webm';
}

export interface ActiveRecording {
  stop: () => Promise<Blob>;
  mimeType: string;
}

export function startRecording(
  canvas: HTMLCanvasElement,
  audioStream: MediaStream | null,
  fps = 30
): ActiveRecording {
  const canvasStream = canvas.captureStream(fps);
  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
  if (audioStream) tracks.push(...audioStream.getAudioTracks());
  const combined = new MediaStream(tracks);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(1000);

  return {
    mimeType,
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        recorder.stop();
      }),
  };
}
