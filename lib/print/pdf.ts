/**
 * A print-ready PDF, written by hand.
 *
 * Every page is one JPEG at the full bleed size, which is all a print-ready file for
 * an image-based design needs — so rather than pull in a PDF library, this writes the
 * dozen objects directly. Each page carries TrimBox and BleedBox, which is how a print
 * shop's preflight knows where the knife goes; crop marks are optional for people
 * printing it themselves.
 *
 * Runs in the browser (export happens there, because a 4K page is larger than a
 * serverless response may be) and in tests.
 */

import type { PrintSpec } from './types'
import { bleedSize } from './spec'

export interface PdfPageImage {
  jpeg: Uint8Array
  width: number
  height: number
}

export interface PdfOptions {
  cropMarks?: boolean
  title?: string
}

const PT = 72
const SLUG_IN = 0.375
const MARK_LEN_IN = 0.25
const MARK_GAP_IN = 0.0625

/** Colour components of a JPEG, from its frame header. */
export function jpegComponents(jpeg: Uint8Array): number {
  let i = 2
  while (i + 9 < jpeg.length) {
    if (jpeg[i] !== 0xff) {
      i++
      continue
    }
    const marker = jpeg[i + 1]
    const len = (jpeg[i + 2] << 8) | jpeg[i + 3]
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return jpeg[i + 9]
    }
    i += 2 + len
  }
  return 3
}

function n(v: number): string {
  return String(Math.round(v * 1000) / 1000)
}

export function buildPrintPdf(spec: PrintSpec, pages: PdfPageImage[], options: PdfOptions = {}): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }
  const startObject = (id: number) => {
    offsets[id] = length
    push(`${id} 0 obj\n`)
  }

  const sheet = bleedSize(spec)
  const slug = options.cropMarks ? SLUG_IN : 0
  const mediaW = (sheet.w + 2 * slug) * PT
  const mediaH = (sheet.h + 2 * slug) * PT
  const bleedBox = [slug * PT, slug * PT, (slug + sheet.w) * PT, (slug + sheet.h) * PT]
  const trimBox = [
    (slug + spec.bleedIn) * PT,
    (slug + spec.bleedIn) * PT,
    (slug + spec.bleedIn + spec.widthIn) * PT,
    (slug + spec.bleedIn + spec.heightIn) * PT,
  ]

  // Object layout: 1 catalog, 2 pages, 3 info, then per page: page, content, image.
  const pageIds = pages.map((_, i) => 4 + i * 3)
  const total = 3 + pages.length * 3

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')

  startObject(1)
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  startObject(2)
  push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`)

  startObject(3)
  const title = (options.title ?? spec.name).replace(/[()\\]/g, '')
  push(`<< /Title (${title}) /Producer (Kanthink print studio) >>\nendobj\n`)

  pages.forEach((page, i) => {
    const pageId = pageIds[i]
    const contentId = pageId + 1
    const imageId = pageId + 2

    let content = `q\n${n(sheet.w * PT)} 0 0 ${n(sheet.h * PT)} ${n(slug * PT)} ${n(slug * PT)} cm\n/Im0 Do\nQ\n`
    if (options.cropMarks) content += cropMarks(trimBox)

    startObject(pageId)
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(mediaW)} ${n(mediaH)}] ` +
        `/BleedBox [${bleedBox.map(n).join(' ')}] /TrimBox [${trimBox.map(n).join(' ')}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    )

    startObject(contentId)
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`)

    const components = jpegComponents(page.jpeg)
    const colorSpace = components === 1 ? '/DeviceGray' : components === 4 ? '/DeviceCMYK' : '/DeviceRGB'
    // Adobe-written CMYK JPEGs store inverted values; Decode flips them back.
    const decode = components === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : ''
    startObject(imageId)
    push(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode${decode} /Length ${page.jpeg.length} >>\nstream\n`,
    )
    push(page.jpeg)
    push('\nendstream\nendobj\n')
  })

  const xrefAt = length
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`
  for (let id = 1; id <= total; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  push(xref)
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/** Registration-black corner marks just outside the bleed, aligned to the trim. */
function cropMarks(trim: number[]): string {
  const [x0, y0, x1, y1] = trim
  const gap = (MARK_GAP_IN + 0.125) * PT
  const len = MARK_LEN_IN * PT
  const lines: [number, number, number, number][] = []
  for (const x of [x0, x1]) {
    lines.push([x, y0 - gap, x, y0 - gap - len], [x, y1 + gap, x, y1 + gap + len])
  }
  for (const y of [y0, y1]) {
    lines.push([x0 - gap, y, x0 - gap - len, y], [x1 + gap, y, x1 + gap + len, y])
  }
  return `q\n0.25 w 0 0 0 1 K\n${lines.map(([a, b, c, d]) => `${n(a)} ${n(b)} m ${n(c)} ${n(d)} l S`).join('\n')}\nQ\n`
}
