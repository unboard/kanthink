import sharp from 'sharp'
import { nanoid } from 'nanoid'
import { bleedSize } from '../spec'
import type { PrintSpec, PrintVersion } from '../types'
import { safeFetch } from './crawl'
import { dimensions, normalizeUpload, printJpeg, storeImage } from './images'
import { rasterizePdf } from './pdf'
import { fitFor, type ArtworkFit } from '../orders/rules'

export type { ArtworkFit }

/**
 * Artwork a customer sent, made into the first version of a page.
 *
 * Files arrive in three shapes, and a printer treats each differently:
 *   - full bleed: already the sheet's shape, so it is used as is;
 *   - trim size: the finished size with no bleed, so the edges are extended into the
 *     bleed (mirrored) and the printer is told to look at them;
 *   - another shape altogether: centered and cropped to fit, with how much is lost, so
 *     the printer can decide between printing it as is and rebuilding it to fit.
 * The finding travels with the file, so the proof page can say what happened.
 */

export interface PlacedArtwork {
  version: PrintVersion
  stored: { url: string; width: number; height: number }
  format?: string
  fit: ArtworkFit
}

const MAX_BYTES = 80 * 1024 * 1024
// 24 in at 300 dpi, plus bleed: enough for most signs at full resolution.
const MAX_EDGE = 7800

/** The bytes of a file the sender pointed at: an https link (fetched safely) or a data: URL. */
export async function loadArtwork(url: string): Promise<{ data: Buffer; type: string }> {
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/)
    if (!m) throw new Error('That data: URL can’t be read.')
    const data = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]))
    if (data.length > MAX_BYTES) throw new Error('That file is larger than 80 MB.')
    return { data, type: m[1] ?? '' }
  }
  const res = await safeFetch(url, { maxBytes: MAX_BYTES, accept: 'image/*,application/pdf;q=0.9,*/*;q=0.5', timeoutMs: 45000 })
  return { data: res.body, type: res.type }
}

const isPdf = (data: Buffer, type: string) => /pdf/i.test(type) || data.subarray(0, 5).toString('latin1') === '%PDF-'

/**
 * Every page image in a file: one for an image, one per page for a PDF (a front and
 * back often arrive as one two-page PDF).
 */
export async function artworkImages(data: Buffer, type: string, spec: PrintSpec): Promise<{ buffer: Buffer; format: string }[]> {
  if (isPdf(data, type)) {
    const pages = await rasterizePdf(data, { maxPages: spec.pages.length, targetWidthIn: bleedSize(spec).w })
    return pages.map((buffer) => ({ buffer, format: 'pdf' }))
  }
  const meta = await sharp(data, { failOn: 'none' }).metadata().catch(() => null)
  if (!meta?.format || !meta.width) throw new Error('That file isn’t an image or PDF we can read. Send a PDF, PNG, JPG, TIFF or WebP.')
  return [{ buffer: data, format: meta.format }]
}

/** One page image placed on the sheet, stored, as a version. */
export async function placeArtwork(userId: string, spec: PrintSpec, image: Buffer, format?: string): Promise<PlacedArtwork> {
  const flat = await normalizeUpload(image, { keepAlpha: false, maxEdge: MAX_EDGE })
  const { width, height } = await dimensions(flat)
  const fit = fitFor(width / height, spec)
  const sheet = bleedSize(spec)

  let page: Buffer
  if (fit.kind === 'bleed') {
    page = flat
  } else if (fit.kind === 'trim') {
    // Grow the canvas by the bleed on each side, filled from the art's own edges.
    const bx = Math.round((spec.bleedIn / spec.widthIn) * width)
    const by = Math.round((spec.bleedIn / spec.heightIn) * height)
    page = await sharp(flat).extend({ left: bx, right: bx, top: by, bottom: by, extendWith: 'mirror' }).toBuffer()
  } else {
    // Centered cover crop to the sheet.
    const r = sheet.w / sheet.h
    const cw = width / height > r ? Math.round(height * r) : width
    const ch = width / height > r ? height : Math.round(width / r)
    page = await sharp(flat).extract({ left: Math.round((width - cw) / 2), top: Math.round((height - ch) / 2), width: cw, height: ch }).toBuffer()
  }

  const pageJpeg = await printJpeg(page)
  const [original, stored] = await Promise.all([storeImage(await printJpeg(flat), userId, 'assets'), storeImage(pageJpeg, userId, 'pages')])
  const dims = await dimensions(pageJpeg)
  const version: PrintVersion = {
    id: nanoid(10),
    url: stored.url,
    width: dims.width,
    height: dims.height,
    rawUrl: stored.url,
    rawWidth: dims.width,
    rawHeight: dims.height,
    model: 'upload',
    mode: 'upload',
    at: Math.floor(Date.now() / 1000),
  }
  return { version, stored: { url: original.url, width, height }, format, fit }
}
