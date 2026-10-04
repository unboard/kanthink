'use client'

import { useState } from 'react'
import { buildPrintPdf } from '@/lib/print/pdf'
import { bleedSize, effectiveDpi, formatLength, formatSize, shapePath } from '@/lib/print/spec'
import type { PrintDesign } from '@/lib/print/types'
import { thumb } from './api'

function save(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design'
}

/** A JPEG of a stored page. Cloudinary is asked for JPEG explicitly so the PDF can embed it as-is. */
async function pageJpeg(url: string): Promise<Uint8Array> {
  const src = url.includes('/image/upload/') ? url.replace('/image/upload/', '/image/upload/f_jpg,q_95/') : url
  const res = await fetch(src)
  if (!res.ok) throw new Error('Couldn’t fetch a page image.')
  return new Uint8Array(await res.arrayBuffer())
}

/** The print PDF of every designed page, saved to the person's device. */
export async function downloadPrintPdf(design: PrintDesign, cropMarks = false) {
  const ready = design.pages.map((p) => p.versions[p.current]).filter((v): v is NonNullable<typeof v> => !!v)
  const pages = await Promise.all(ready.map(async (v) => ({ jpeg: await pageJpeg(v.url), width: v.width, height: v.height })))
  const bytes = buildPrintPdf(design.spec, pages, { cropMarks, title: design.name })
  save(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${slug(design.name)}-print.pdf`)
}

/** One page as a JPG. */
export async function downloadPageJpg(design: PrintDesign, pageIndex: number) {
  const page = design.pages[pageIndex]
  const v = page?.versions[page.current]
  if (!v) return
  const bytes = await pageJpeg(v.url)
  save(new Blob([bytes as BlobPart], { type: 'image/jpeg' }), `${slug(design.name)}-${slug(page.label)}.jpg`)
}

export function ExportDialog({ design, onClose }: { design: PrintDesign; onClose: () => void }) {
  const [marks, setMarks] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const spec = design.spec
  const ready = design.pages.map((p) => p.versions[p.current] ?? null)
  const missing = design.pages.filter((_, i) => !ready[i]).map((p) => p.label)
  const issues = ready.filter((v) => v?.check && !v.check.ok).length
  const lowestDpi = Math.min(...ready.filter(Boolean).map((v) => effectiveDpi(spec, v!.width)))
  const sheet = bleedSize(spec)

  const pdf = async () => {
    setBusy('pdf')
    setError(null)
    try {
      await downloadPrintPdf(design, marks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy(null)
    }
  }

  const jpgs = async () => {
    setBusy('jpg')
    setError(null)
    try {
      for (let i = 0; i < ready.length; i++) if (ready[i]) await downloadPageJpg(design, i)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy(null)
    }
  }

  const dieline = () => {
    if (spec.guide?.kind === 'image') {
      window.open(spec.guide.url, '_blank')
      return
    }
    const path = shapePath(spec, 0)
    if (!path) return
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.w}in" height="${sheet.h}in" viewBox="0 0 ${sheet.w} ${sheet.h}">
  <title>${design.name} die line</title>
  <path d="${path}" fill="none" stroke="#EC008C" stroke-width="0.01" fill-rule="evenodd"/>
</svg>`
    save(new Blob([svg], { type: 'image/svg+xml' }), `${slug(design.name)}-dieline.svg`)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-label="Export">
      <div className="absolute inset-0" style={{ background: 'rgba(5,8,7,.6)' }} onClick={onClose} />
      <div className="relative w-full max-w-[520px] rounded-2xl border shadow-2xl overflow-hidden" style={{ background: 'var(--chrome)', borderColor: 'var(--line)' }}>
        <div className="mat px-6 py-6 flex items-center justify-center gap-4 overflow-x-auto">
          {ready.map((v, i) =>
            v ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={thumb(v.url, 300)} alt={design.pages[i].label} className="h-32 w-auto paper-shadow" />
            ) : (
              <div key={i} className="h-32 paper-shadow flex items-center justify-center text-[12px]" style={{ aspectRatio: `${sheet.w}/${sheet.h}`, background: 'var(--paper)', color: '#9aa69f' }}>
                {design.pages[i].label}
              </div>
            ),
          )}
        </div>
        <div className="p-5">
          <h2 className="text-[17px] font-semibold">Export for print</h2>
          <p className="text-[13.5px] mt-1 leading-snug" style={{ color: 'var(--ink-2)' }}>
            {formatSize(spec)} trimmed, with {formatLength(spec.bleedIn, spec.unit)} bleed on every side
            {ready.some(Boolean) ? ` · ${lowestDpi} dpi` : ''}. {spec.pages.length > 1 ? `${spec.pages.length} pages in order.` : ''}
          </p>

          {(missing.length > 0 || issues > 0) && (
            <div className="mt-3 rounded-lg px-3 py-2 text-[13px] leading-snug" style={{ background: 'rgba(242,179,61,.1)', color: 'var(--warn)' }}>
              {missing.length > 0 && <div>Not designed yet: {missing.join(', ')}. Those pages are left out.</div>}
              {issues > 0 && <div>{issues === 1 ? 'One page has' : `${issues} pages have`} print check issues.</div>}
            </div>
          )}

          <label className="flex items-center gap-2.5 mt-4 text-[13.5px] cursor-pointer" style={{ color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} className="accent-[color:var(--magenta)] w-4 h-4" />
            Add crop marks (for printing it yourself — print shops don’t need them)
          </label>

          {error && (
            <p className="mt-3 text-[13px]" style={{ color: 'var(--err)' }}>
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 mt-5">
            <button
              type="button"
              onClick={pdf}
              disabled={!!busy || !ready.some(Boolean)}
              className="h-10 px-4 rounded-xl text-[14px] font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--magenta)' }}
            >
              {busy === 'pdf' ? 'Building PDF…' : 'Download print PDF'}
            </button>
            <button
              type="button"
              onClick={jpgs}
              disabled={!!busy || !ready.some(Boolean)}
              className="h-10 px-4 rounded-xl text-[14px] border disabled:opacity-40"
              style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
            >
              {busy === 'jpg' ? 'Saving…' : 'Pages as JPG'}
            </button>
            {spec.guide && (
              <button type="button" onClick={dieline} className="h-10 px-4 rounded-xl text-[14px] border" style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}>
                Die line
              </button>
            )}
            <button type="button" onClick={onClose} className="h-10 px-3 ml-auto text-[14px]" style={{ color: 'var(--muted)' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
