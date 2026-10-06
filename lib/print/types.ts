/**
 * Print studio types, shared by the server pipeline and the studio UI.
 *
 * Everything is measured in inches at the source. Pixels only exist once a model
 * has drawn something, and every pixel decision is derived from these numbers, so
 * the geometry the prompt describes, the crop that is applied, the preflight that
 * checks the result and the PDF that is exported can never disagree.
 */

import type { Mark } from './markup'

export type Unit = 'in' | 'mm'

/**
 * A die-cut or shaped piece.
 *
 * Shapes are described parametrically so the cut line and the safe line can be drawn
 * crisply and checked exactly. An uploaded guide is a raster: it covers the whole
 * bleed canvas, white is the finished piece and black is cut away.
 */
export type GuideShape =
  | { kind: 'circle' }
  | { kind: 'rounded'; radiusIn: number }
  | { kind: 'doorhanger'; holeDiameterIn: number; holeCenterFromTopIn: number; cornerIn: number }
  | { kind: 'image'; url: string; name?: string }

export interface PageDef {
  label: string
  /** What this page is for, in print-designer terms. Goes into the brief. */
  hint?: string
}

/** Fold lines, as fractions of the trim along the axis they divide. */
export interface Folds {
  /** `vertical` folds divide the width into side-by-side panels. */
  direction: 'vertical' | 'horizontal'
  at: number[]
}

export interface PrintSpec {
  /** Catalog product key, preset id, or `custom`. */
  id: string
  name: string
  /** A one-line kind for the brief: "flyer", "mailing postcard". */
  kind?: string
  widthIn: number
  heightIn: number
  /** Bleed past the trim on every side. */
  bleedIn: number
  /** Margin inside the trim (or inside the die line) that important content stays within. */
  safeIn: number
  pages: PageDef[]
  folds?: Folds
  guide?: GuideShape
  /** How sizes are shown to the person. Storage is always inches. */
  unit?: Unit
}

export interface BrandImage {
  id: string
  url: string
  width?: number
  height?: number
  /** What it is or how to use it: "headshot of the owner", "use on the back". */
  note?: string
}

/**
 * An image attached to one design, not kept in the brand kit.
 *
 * `photo` goes on the page as it is, `inspiration` lends its style, and `recreate`
 * is a finished design to rebuild faithfully on this product — same layout, words
 * and look, refitted to this piece's size, bleed, safe area and shape.
 */
export type DesignImageRole = 'photo' | 'inspiration' | 'recreate'

export interface DesignImage extends BrandImage {
  role: DesignImageRole
}

export interface BrandColor {
  hex: string
  name?: string
}

export interface BrandDetails {
  business?: string
  tagline?: string
  phone?: string
  email?: string
  website?: string
  address?: string
  other?: string
}

export interface BrandKit {
  website?: string
  logo?: BrandImage | null
  colors: BrandColor[]
  details: BrandDetails
  assets: BrandImage[]
  inspiration: BrandImage[]
  /** Tone and audience, in their words. */
  voice?: string
}

export interface PrintBrand {
  id: string
  name: string
  data: BrandKit
  updatedAt?: number
}

/** The words on a page, written before it is drawn so they can be checked and edited. */
export interface PageCopy {
  headline?: string
  subhead?: string
  body?: string[]
  cta?: string
  details?: string[]
  /** Art direction for the picture, not printed. */
  imagery?: string
  /** Layout direction, not printed. */
  layout?: string
}

export type IssueKind = 'safe' | 'fold' | 'border' | 'spelling' | 'cut' | 'resolution'

export interface PreflightIssue {
  id: string
  kind: IssueKind
  severity: 'error' | 'warn'
  message: string
  /** Normalized to the trimmed-with-bleed image: [x0, y0, x1, y1], 0..1. */
  box?: [number, number, number, number]
}

export interface PreflightElement {
  kind: 'text' | 'logo' | 'qr' | 'face' | 'other'
  text?: string
  box: [number, number, number, number]
}

export interface PreflightResult {
  at: number
  ok: boolean
  issues: PreflightIssue[]
  elements: PreflightElement[]
  /** Effective resolution at print size. */
  dpi: number
}

export type VersionMode = 'create' | 'edit' | 'area' | 'retext' | 'fix' | 'upscale' | 'fill' | 'markup' | 'upload'

export interface PrintVersion {
  id: string
  /** The page at exact print geometry: trim plus bleed. */
  url: string
  width: number
  height: number
  /**
   * What the model actually returned. A model's frame rarely matches a print ratio
   * exactly, so the page is a centered crop of this. Edits run against the raw frame
   * so the model sees the same canvas it drew, and are cropped again afterwards.
   */
  rawUrl: string
  rawWidth: number
  rawHeight: number
  model: string
  mode: VersionMode
  prompt?: string
  copy?: PageCopy
  check?: PreflightResult
  costCents?: number
  at: number
}

export interface PrintPage {
  id: string
  label: string
  versions: PrintVersion[]
  /** Index into versions of the one in use. */
  current: number
  /** Numbered markup on this page, kept across versions. See lib/print/markup.ts. */
  marks?: Mark[]
}

export type RenderQuality = 'print' | 'draft'

export interface PrintBrief {
  prompt?: string
  useLogo: boolean
  useColors: boolean
  useDetails: boolean
  /** BrandImage ids from the brand kit to put in this design. */
  assetIds: string[]
  inspirationIds: string[]
  /** Images attached to this design only. */
  images?: DesignImage[]
  modelId?: string
  quality?: RenderQuality
}

/** One turn in the chat way of designing. Kept on the design so the conversation resumes. */
export interface ChatMessage {
  id: string
  role: 'user' | 'kan'
  text: string
  /** Page images to show with the message: what was just made or changed. */
  images?: { url: string; label: string; pageIndex: number }[]
  /** Quick replies Kan offers. */
  suggestions?: string[]
  at: number
}

export interface PrintDesign {
  id: string
  name: string
  spec: PrintSpec
  brandId: string | null
  brief: PrintBrief
  pages: PrintPage[]
  renders: number
  spendCents: number
  chat?: ChatMessage[]
  /** Set when this design is an order job's artwork. */
  jobId?: string | null
  createdAt: number
  updatedAt: number
}

export interface PrintPreset {
  id: string
  name: string
  spec: PrintSpec
}

export const EMPTY_BRAND_KIT: BrandKit = {
  colors: [],
  details: {},
  assets: [],
  inspiration: [],
}

export const DEFAULT_BRIEF: PrintBrief = {
  useLogo: true,
  useColors: true,
  useDetails: true,
  assetIds: [],
  inspirationIds: [],
  quality: 'print',
}
