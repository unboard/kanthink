import sharp from 'sharp'
import { v2 as cloudinary } from 'cloudinary'
import { isCloudinaryConfigured } from '@/lib/cloudinary'
import type { PrintSpec } from '../types'
import { bleedSize, centerCrop, sheetRatio, shapePath, type Frame } from '../spec'

/**
 * Pixels for the print studio: the canvas a model draws on, the crop to print
 * geometry, the painted-area composite, and storage.
 *
 * Everything is done on the server with sharp so the browser never has to push a 4K
 * page back up through a request body.
 */

// Cloudinary's free plan refuses images over 10 MB; stay clear of it.
const MAX_UPLOAD_BYTES = 9.5 * 1024 * 1024

/** Only images we stored ourselves are fetched — never an arbitrary URL from a client. */
export function isOwnImageUrl(url: string): boolean {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  return !!cloud && url.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`)
}

export async function fetchOwnImage(url: string): Promise<Buffer> {
  if (url.startsWith('data:image/')) {
    const comma = url.indexOf(',')
    return Buffer.from(url.slice(comma + 1), 'base64')
  }
  if (!isOwnImageUrl(url)) throw new Error('That image isn’t one of ours.')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Couldn’t load an image (${res.status}).`)
  return Buffer.from(await res.arrayBuffer())
}

/** An image sized for a model's input: long edge capped, JPEG unless it has alpha. */
export async function forModel(input: Buffer, maxEdge = 1600): Promise<{ data: Buffer; mimeType: string }> {
  const img = sharp(input, { failOn: 'none' }).rotate()
  const meta = await img.metadata()
  const resized = img.resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
  if (meta.hasAlpha) {
    // Logos with transparency go on white: models treat alpha inconsistently, and a
    // logo on a checkerboard is worse than a logo on white.
    const data = await resized.flatten({ background: '#ffffff' }).png().toBuffer()
    return { data, mimeType: 'image/png' }
  }
  return { data: await resized.jpeg({ quality: 90 }).toBuffer(), mimeType: 'image/jpeg' }
}

export async function dimensions(input: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(input, { failOn: 'none' }).metadata()
  return { width: meta.width ?? 0, height: meta.height ?? 0 }
}

/** High-quality JPEG, stepped down only as far as needed to fit the upload limit. */
export async function printJpeg(input: Buffer | sharp.Sharp): Promise<Buffer> {
  const base = Buffer.isBuffer(input) ? sharp(input, { failOn: 'none' }) : input
  const raw = await base.removeAlpha().toColourspace('srgb').toBuffer()
  for (const quality of [94, 90, 86, 80, 72]) {
    const out = await sharp(raw).jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer()
    if (out.length <= MAX_UPLOAD_BYTES) return out
  }
  return sharp(raw).jpeg({ quality: 65, mozjpeg: true }).toBuffer()
}

export interface StoredImage {
  url: string
  width: number
  height: number
}

/**
 * Store an image in the user's print folder. No incoming transformation — these are
 * print masters, and `quality: auto` would quietly recompress them.
 */
export async function storeImage(buffer: Buffer, userId: string, kind: 'pages' | 'assets' | 'guides'): Promise<StoredImage> {
  if (!isCloudinaryConfigured()) {
    const { width, height } = await dimensions(buffer)
    const meta = await sharp(buffer).metadata()
    return { url: `data:image/${meta.format === 'png' ? 'png' : 'jpeg'};base64,${buffer.toString('base64')}`, width, height }
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `kanthink/print/${userId}/${kind}`, resource_type: 'image' },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'))
        resolve({ url: result.secure_url, width: result.width, height: result.height })
      },
    )
    stream.end(buffer)
  })
}

// ---------------------------------------------------------------------------
// The canvas a model draws on
// ---------------------------------------------------------------------------

/**
 * The image handed to the model as page one: the model frame, with the sheet centred
 * in it. A plain product is flat grey (not white — white invites a white border);
 * a shaped one is the die-cut guide, white piece on black.
 */
export async function renderCanvas(spec: PrintSpec, frame: Frame, longEdge = 1024): Promise<Buffer> {
  const w = frame.ratio >= 1 ? longEdge : Math.round(longEdge * frame.ratio)
  const h = frame.ratio >= 1 ? Math.round(longEdge / frame.ratio) : longEdge
  const sheet = bleedSize(spec)
  const sx = frame.sheet.x * w
  const sy = frame.sheet.y * h
  const scale = (frame.sheet.w * w) / sheet.w

  if (!spec.guide) {
    return sharp({ create: { width: w, height: h, channels: 3, background: '#bdbdbd' } }).png().toBuffer()
  }

  if (spec.guide.kind === 'image') {
    const guide = await guideMask(spec, Math.round(frame.sheet.w * w))
    const piece = await sharp(guide.png).resize(Math.round(frame.sheet.w * w), Math.round(frame.sheet.h * h), { fit: 'fill' }).png().toBuffer()
    return sharp({ create: { width: w, height: h, channels: 3, background: '#000000' } })
      .composite([{ input: piece, left: Math.round(sx), top: Math.round(sy) }])
      .png()
      .toBuffer()
  }

  const path = shapePath(spec, 0) ?? ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="#000"/>
    <g transform="translate(${sx} ${sy}) scale(${scale})"><path d="${path}" fill="#fff" fill-rule="evenodd"/></g>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/**
 * An uploaded guide as a clean binary mask at the bleed sheet's ratio.
 * Returns the PNG and the raw inside/outside bits at `width` pixels wide.
 */
export async function guideMask(spec: PrintSpec, width: number): Promise<{ png: Buffer; inside: Uint8Array; width: number; height: number }> {
  if (spec.guide?.kind !== 'image') throw new Error('Not a raster guide')
  const source = await fetchOwnImage(spec.guide.url)
  const height = Math.max(1, Math.round(width / sheetRatio(spec)))
  const { data } = await sharp(source, { failOn: 'none' })
    .flatten({ background: '#000000' })
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const inside = new Uint8Array(width * height)
  for (let i = 0; i < inside.length; i++) inside[i] = data[i] > 127 ? 1 : 0
  const png = await sharp(Buffer.from(inside.map((v) => (v ? 255 : 0))), { raw: { width, height, channels: 1 } }).png().toBuffer()
  return { png, inside, width, height }
}

/** Normalize an uploaded guide: threshold to pure black and white, store it. */
export async function normalizeGuide(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: 'none' })
    .flatten({ background: '#000000' })
    .greyscale()
    .threshold(128)
    .png()
    .toBuffer()
}

// ---------------------------------------------------------------------------
// Crop and composite
// ---------------------------------------------------------------------------

/** The centred crop of a model frame to the sheet's exact ratio. */
export async function cropToSheet(raw: Buffer, spec: PrintSpec): Promise<{ buffer: Buffer; width: number; height: number; cropped: boolean }> {
  const { width, height } = await dimensions(raw)
  const crop = centerCrop(width / height, sheetRatio(spec))
  const cw = Math.round(crop.w * width)
  const ch = Math.round(crop.h * height)
  // Under half a percent is rounding (OpenAI's sizes are multiples of 16): keep every pixel.
  if (Math.abs(cw - width) / width < 0.005 && Math.abs(ch - height) / height < 0.005) {
    return { buffer: raw, width, height, cropped: false }
  }
  const buffer = await sharp(raw)
    .extract({ left: Math.round(crop.x * width), top: Math.round(crop.y * height), width: cw, height: ch })
    .toBuffer()
  return { buffer, width: cw, height: ch, cropped: true }
}

/**
 * A mask painted on the page (sheet coordinates), placed into the raw frame. The page
 * is a centred crop of the raw frame, so the mask lands at the same offset.
 */
export async function maskInRawFrame(
  maskPng: Buffer,
  raw: { width: number; height: number },
  spec: PrintSpec,
): Promise<Buffer> {
  const crop = centerCrop(raw.width / raw.height, sheetRatio(spec))
  const cw = Math.round(crop.w * raw.width)
  const ch = Math.round(crop.h * raw.height)
  // The studio paints white strokes on transparency; either alpha or brightness marks the area.
  const { data: rgba } = await sharp(maskPng, { failOn: 'none' })
    .ensureAlpha()
    .resize(cw, ch, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const out = Buffer.alloc(raw.width * raw.height)
  const left = Math.round(crop.x * raw.width)
  const top = Math.round(crop.y * raw.height)
  for (let y = 0; y < ch; y++) {
    const row = (top + y) * raw.width + left
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4
      const lum = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3
      out[row + x] = Math.round((rgba[i + 3] * lum) / 255)
    }
  }
  return sharp(out, { raw: { width: raw.width, height: raw.height, channels: 1 } }).png().toBuffer()
}

/**
 * A mask as exactly one byte per pixel at a size. sharp keeps three channels through
 * some greyscale operations, and a three-channel buffer read as one smears the mask
 * across the image — so the channel is extracted explicitly and the length checked.
 */
export async function maskChannel(mask: Buffer, width: number, height: number, op?: (img: sharp.Sharp) => sharp.Sharp): Promise<Buffer> {
  let img = sharp(mask, { failOn: 'none' }).resize(width, height, { fit: 'fill' }).removeAlpha().extractChannel(0)
  const base = await img.raw().toBuffer({ resolveWithObject: true })
  if (base.info.channels !== 1 || base.data.length !== width * height) throw new Error('Mask has the wrong shape')
  if (!op) return base.data
  img = op(sharp(base.data, { raw: { width, height, channels: 1 } }))
  const out = await img.raw().toBuffer({ resolveWithObject: true })
  if (out.info.channels !== 1) return (await sharp(out.data, { raw: out.info }).extractChannel(0).raw().toBuffer())
  return out.data
}

/** The raw frame with the painted area washed in magenta, so the model can see where. */
export async function markedImage(raw: Buffer, mask: Buffer, maxEdge = 1600): Promise<Buffer> {
  const { width, height } = await dimensions(raw)
  const alpha = await maskChannel(mask, width, height, (img) => img.linear(0.62, 0))
  const magenta = await sharp({ create: { width, height, channels: 3, background: '#ff00ff' } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer()
  // Two passes: sharp resizes before it composites within one pipeline.
  const washed = await sharp(raw).composite([{ input: magenta }]).png().toBuffer()
  return sharp(washed)
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer()
}

/**
 * Lay the model's edit over the original only where the mask was painted, feathered.
 *
 * Models given "change only this area" still nudge colours and re-render text all over
 * the page. The composite makes "only there" true by construction: outside the mask,
 * every pixel is the original's.
 */
export async function compositeArea(original: Buffer, edited: Buffer, mask: Buffer): Promise<Buffer> {
  const { width, height } = await dimensions(original)
  const feather = Math.max(2, Math.round(Math.max(width, height) * 0.006))
  // Grow the painted area slightly before feathering, so the blend sits outside the stroke.
  const alpha = await maskChannel(mask, width, height, (img) => img.blur(feather).linear(1.6, 0))
  // Separate passes throughout: within one pipeline sharp applies removeAlpha after
  // joinChannel (dropping the alpha just added) and composites after resizing.
  const rgb = await sharp(edited).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer()
  const top = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer()
  const base = await sharp(original).removeAlpha().png().toBuffer()
  return sharp(base).composite([{ input: top }]).jpeg({ quality: 95 }).toBuffer()
}

/** A small RGB copy of a page for pixel checks. */
export async function pagePixels(page: Buffer, width = 480): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(page, { failOn: 'none' })
    .resize({ width, fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** Raw RGBA of an image, small, for palette extraction. */
export async function smallRgba(input: Buffer, size = 96): Promise<Uint8Array> {
  const { data } = await sharp(input, { failOn: 'none' })
    .resize(size, size, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return new Uint8Array(data)
}

/** Any supported upload (including SVG logos) to something we can store and show. */
export async function normalizeUpload(input: Buffer, opts: { keepAlpha: boolean; maxEdge: number }): Promise<Buffer> {
  const img = sharp(input, { failOn: 'none', density: 300 }).rotate()
  const meta = await img.metadata()
  const resized = img.resize({ width: opts.maxEdge, height: opts.maxEdge, fit: 'inside', withoutEnlargement: meta.format !== 'svg' })
  if (opts.keepAlpha && meta.hasAlpha) return resized.png({ compressionLevel: 9 }).toBuffer()
  if (opts.keepAlpha && (meta.format === 'png' || meta.format === 'svg' || meta.format === 'gif')) return resized.png().toBuffer()
  return resized.jpeg({ quality: 92, mozjpeg: true }).toBuffer()
}
