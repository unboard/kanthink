// Webcam background effects (blur + person cutout) powered by MediaPipe
// Selfie Segmentation, running entirely in the browser. The library and model
// are lazy-loaded from a CDN the first time an effect is enabled, so they add
// nothing to the bundle and cost nothing until used.

import type { CamEffect } from './types';

const PKG_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18';
const WASM_BASE = `${PKG_BASE}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

// Hide the dynamic import from the bundler so it's fetched at runtime as a real
// ES module from the CDN (works under both webpack and turbopack).
const cdnImport = (url: string): Promise<unknown> =>
  (new Function('u', 'return import(u)') as (u: string) => Promise<unknown>)(url);

interface MpMask {
  getAsFloat32Array(): Float32Array;
  width: number;
  height: number;
  close(): void;
}

interface SegmenterResult {
  confidenceMasks?: MpMask[];
  close(): void;
}

interface ImageSegmenterLike {
  segmentForVideo(video: HTMLVideoElement, timestamp: number): SegmenterResult;
  close(): void;
}

export class WebcamEffectProcessor {
  private segmenter: ImageSegmenterLike | null = null;
  private loading = false;
  ready = false;

  // Scratch canvases, reused across frames to avoid per-frame allocation.
  private personCanvas = document.createElement('canvas');
  private maskCanvas = document.createElement('canvas');
  private outCanvas = document.createElement('canvas');
  private maskImageData: ImageData | null = null;

  async init(): Promise<void> {
    if (this.ready || this.loading) return;
    this.loading = true;
    try {
      const vision = (await cdnImport(`${PKG_BASE}/vision_bundle.mjs`)) as {
        FilesetResolver: { forVisionTasks(base: string): Promise<unknown> };
        ImageSegmenter: {
          createFromOptions(fileset: unknown, opts: unknown): Promise<ImageSegmenterLike>;
        };
      };
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      this.segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      this.ready = true;
    } catch (err) {
      console.error('[record] failed to load segmentation model', err);
      this.ready = false;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Returns a canvas with the effect applied, or null if the segmenter isn't
   * ready yet (caller should fall back to the raw video frame).
   */
  process(video: HTMLVideoElement, effect: CamEffect, timestamp: number): HTMLCanvasElement | null {
    if (effect === 'none' || !this.ready || !this.segmenter) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    let result: SegmenterResult;
    try {
      result = this.segmenter.segmentForVideo(video, timestamp);
    } catch {
      return null;
    }
    const mask = result.confidenceMasks?.[0];
    if (!mask) {
      result.close();
      return null;
    }

    const probs = mask.getAsFloat32Array();
    const mw = mask.width;
    const mh = mask.height;

    // Build a white mask whose alpha = person probability.
    if (this.maskCanvas.width !== mw || this.maskCanvas.height !== mh || !this.maskImageData) {
      this.maskCanvas.width = mw;
      this.maskCanvas.height = mh;
      this.maskImageData = new ImageData(mw, mh);
    }
    const data = this.maskImageData.data;
    for (let i = 0; i < probs.length; i++) {
      const a = probs[i];
      const o = i * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = a > 0.5 ? 255 : a < 0.2 ? 0 : Math.round(a * 255);
    }
    const maskCtx = this.maskCanvas.getContext('2d')!;
    maskCtx.putImageData(this.maskImageData, 0, 0);

    result.close();

    // person = webcam frame with background removed (transparent).
    this.personCanvas.width = vw;
    this.personCanvas.height = vh;
    const pCtx = this.personCanvas.getContext('2d')!;
    pCtx.clearRect(0, 0, vw, vh);
    pCtx.drawImage(video, 0, 0, vw, vh);
    pCtx.globalCompositeOperation = 'destination-in';
    pCtx.imageSmoothingEnabled = true;
    pCtx.drawImage(this.maskCanvas, 0, 0, vw, vh);
    pCtx.globalCompositeOperation = 'source-over';

    if (effect === 'cutout') {
      return this.personCanvas;
    }

    // blur: blurred full frame, with the sharp person composited on top.
    this.outCanvas.width = vw;
    this.outCanvas.height = vh;
    const oCtx = this.outCanvas.getContext('2d')!;
    oCtx.clearRect(0, 0, vw, vh);
    oCtx.filter = `blur(${Math.round(vw / 90)}px)`;
    oCtx.drawImage(video, 0, 0, vw, vh);
    oCtx.filter = 'none';
    oCtx.drawImage(this.personCanvas, 0, 0, vw, vh);
    return this.outCanvas;
  }

  dispose(): void {
    try {
      this.segmenter?.close();
    } catch {
      /* noop */
    }
    this.segmenter = null;
    this.ready = false;
  }
}
