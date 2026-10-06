/**
 * PDF artwork to page images, on the server.
 *
 * Printers are sent PDFs far more than images. Each page is rendered with pdf.js
 * (unpdf's serverless build) onto a native canvas at print resolution — 300 dpi,
 * capped so a large sign stays a size the rest of the pipeline can handle.
 */

const DPI = 300
const MAX_EDGE = 7800

export async function rasterizePdf(data: Buffer, opts: { maxPages: number; targetWidthIn?: number }): Promise<Buffer[]> {
  const { getDocumentProxy, renderPageAsImage } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(data))
  const count = Math.min(pdf.numPages, Math.max(1, opts.maxPages))
  const out: Buffer[] = []
  for (let n = 1; n <= count; n++) {
    const page = await pdf.getPage(n)
    const view = page.getViewport({ scale: 1 }) // in points, 72 to the inch
    const scale = Math.min(DPI / 72, MAX_EDGE / Math.max(view.width, view.height))
    const png = await renderPageAsImage(pdf, n, { canvasImport: () => import('@napi-rs/canvas'), scale })
    out.push(Buffer.from(png))
  }
  if (!out.length) throw new Error('That PDF has no pages.')
  return out
}
