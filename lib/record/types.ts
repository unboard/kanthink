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
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3';

export interface AspectDims {
  width: number;
  height: number;
}

export const ASPECT_DIMS: Record<AspectRatio, AspectDims> = {
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 960, height: 720 },
};

// Normalized bubble placement (0..1 of canvas) for the floating "overlay" template.
export interface BubblePlacement {
  x: number;       // center x, 0..1
  y: number;       // center y, 0..1
  size: number;    // bubble height as a fraction of canvas height, ~0.15..0.6
}

export interface StudioConfig {
  shape: BubbleShape;
  effect: CamEffect;
  template: LayoutTemplate;
  aspect: AspectRatio;
  borderWidth: number;       // px in canvas space for the bubble white border
  zoom: number;              // webcam zoom: 1 = fill (cover), <1 zooms out to reveal more of the frame
  showWebcam: boolean;
}

export const DEFAULT_CONFIG: StudioConfig = {
  shape: 'circle',
  effect: 'none',
  template: 'overlay',
  aspect: '16:9',
  borderWidth: 6,
  zoom: 1,
  showWebcam: true,
};

export const DEFAULT_BUBBLE: BubblePlacement = {
  x: 0.84,
  y: 0.82,
  size: 0.26,
};
