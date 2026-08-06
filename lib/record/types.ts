// Shared types for the /record studio.

export type BubbleShape = 'circle' | 'rounded' | 'square' | 'rectangle';

// Width-to-height ratio of the webcam bubble per shape. Square-ish shapes are
// 1:1; 'rectangle' is a wider 16:9 frame so gestures near the edges aren't cut off.
export const BUBBLE_ASPECT: Record<BubbleShape, number> = {
  circle: 1,
  rounded: 1,
  square: 1,
  rectangle: 16 / 9,
};
export type CamEffect = 'none' | 'blur' | 'cutout';
export type LayoutTemplate = 'overlay' | 'split-50' | 'split-33';

// 'auto' means "whatever shape the shared window actually is". It's the default
// because picking a ratio independently of the thing you shared is how you end
// up recording a phone-shaped window into a widescreen frame with bars down both
// sides. The fixed ratios remain for the case where you deliberately want a
// different published shape than the surface you captured.
export type AspectRatio = 'auto' | '16:9' | '9:16' | '1:1' | '4:3';

export interface AspectDims {
  width: number;
  height: number;
}

// Composite canvas size = capture resolution. 1080p-class so recordings stay
// crisp when viewed large on a desktop screen (a phone downscales; a desktop
// upscales, which is why 720p looked soft on big screens).
export const ASPECT_DIMS: Record<Exclude<AspectRatio, 'auto'>, AspectDims> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1440, height: 1440 },
  '4:3': { width: 1440, height: 1080 },
};

// Longest edge of an auto-sized canvas. Matches the 1080p-class fixed ratios, so
// a shared window never encodes at a higher resolution than a chosen preset would.
const AUTO_MAX_EDGE = 1920;

/**
 * Canvas dimensions matching a shared surface exactly in shape.
 *
 * Scaled so the long edge is at most AUTO_MAX_EDGE, and never scaled *up* — a
 * small window stays its own size rather than being blown up into a soft 1080p.
 * Both edges are forced even because h264 chroma subsampling requires it; an odd
 * dimension makes encoders either fail or silently pad.
 */
export function autoDims(sourceWidth: number, sourceHeight: number): AspectDims {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return ASPECT_DIMS['16:9'];

  const scale = Math.min(1, AUTO_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const even = (n: number) => Math.max(2, Math.round(n * scale / 2) * 2);
  return { width: even(sourceWidth), height: even(sourceHeight) };
}

/** A "1080:1920"-style label for a set of dims, reduced to lowest terms. */
export function aspectLabel(dims: AspectDims): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(dims.width, dims.height) || 1;
  return `${dims.width / g}:${dims.height / g}`;
}

// Normalized bubble placement (0..1 of canvas) for the floating "overlay" template.
export interface BubblePlacement {
  x: number;       // center x, 0..1
  y: number;       // center y, 0..1
  size: number;    // bubble height as a fraction of canvas height, ~0.15..0.6
}

export type SubtitlePosition = 'bottom' | 'top' | 'center';
export type SubtitleSize = 'sm' | 'md' | 'lg';
export type SubtitleBackground = 'none' | 'dark' | 'pill';

export interface SubtitleStyle {
  enabled: boolean;
  position: SubtitlePosition;
  size: SubtitleSize;
  color: string;
  background: SubtitleBackground;
}

export interface StudioConfig {
  shape: BubbleShape;
  effect: CamEffect;
  template: LayoutTemplate;
  aspect: AspectRatio;
  borderWidth: number;       // px in canvas space for the bubble white border
  zoom: number;              // webcam zoom: 1 = fill (cover), <1 zooms out to reveal more of the frame
  showWebcam: boolean;
  subtitles: SubtitleStyle;
  enhanceAudio: boolean;     // soften harsh mic audio with a Web Audio filter chain
}

export const DEFAULT_CONFIG: StudioConfig = {
  shape: 'circle',
  effect: 'none',
  template: 'overlay',
  aspect: 'auto',
  borderWidth: 6,
  zoom: 1,
  showWebcam: true,
  subtitles: {
    enabled: false,
    position: 'bottom',
    size: 'md',
    color: '#ffffff',
    background: 'dark',
  },
  enhanceAudio: true,
};

export const DEFAULT_BUBBLE: BubblePlacement = {
  x: 0.84,
  y: 0.82,
  size: 0.26,
};
