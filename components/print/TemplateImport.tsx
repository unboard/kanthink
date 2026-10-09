'use client'

import { useEffect, useMemo, useState } from 'react'
import { fromUnit, toUnit } from '@/lib/print/spec'
import type { PageDef, PrintSpec, Unit } from '@/lib/print/types'
import { api } from './api'
import { Sheet } from './Sheet'

/**
 * A product from a printer's template: one or two guide sheets (PDF or image) and the
 * person's notes go to Kan, which reads back the size, bleed, safe area, folds and what
 * each panel is. Everything it read stays editable here before it's saved.
 */

interface Reading {
  spec: PrintSpec
  summary: string
  doubts: string[]
}

interface Draft {
  name: string
  kind?: string
  unit: Unit
  width: string
  height: string
  bleed: string
  safe: string
  foldDir: 'none' | 'vertical' | 'horizontal'
  /** Fold positions from the left or top trim edge, comma-separated, in `unit`. */
  folds: string
  pages: { label: string; panels: string[]; hint: string }[]
  guide: PrintSpec['guide']
}

const fmt = (inches: number, unit: Unit) => String(Number(toUnit(inches, unit).toFixed(unit === 'mm' ? 1 : 4)))

function toDraft(spec: PrintSpec): Draft {
  const unit = spec.unit ?? 'in'
  const len = spec.folds?.direction === 'horizontal' ? spec.heightIn : spec.widthIn
  const panels = spec.folds ? spec.folds.at.length + 1 : 0
  return {
    name: spec.name,
    kind: spec.kind,
    unit,
    width: fmt(spec.widthIn, unit),
    height: fmt(spec.heightIn, unit),
    bleed: fmt(spec.bleedIn, unit),
    safe: fmt(spec.safeIn, unit),
    foldDir: spec.folds?.direction ?? 'none',
    folds: spec.folds ? spec.folds.at.map((f) => fmt(f * len, unit)).join(', ') : '',
    pages: spec.pages.map((p) => ({
      label: p.label,
      hint: p.hint ?? '',
      panels: Array.from({ length: panels }, (_, i) => p.panels?.[i] ?? ''),
    })),
    guide: spec.guide,
  }
}

function foldList(d: Draft): number[] {
  return d.folds
    .split(/[,\s]+/)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
}

function fromDraft(d: Draft): PrintSpec | null {
  const n = (v: string) => fromUnit(Number(v), d.unit)
  const [w, h, bleed, safe] = [n(d.width), n(d.height), n(d.bleed), n(d.safe)]
  if (![w, h, bleed, safe].every((v) => Number.isFinite(v) && v >= 0) || w < 0.5 || h < 0.5) return null
  let folds: PrintSpec['folds']
  if (d.foldDir !== 'none') {
    const len = d.foldDir === 'vertical' ? w : h
    const at = foldList(d)
      .map((v) => fromUnit(v, d.unit) / len)
      .filter((f) => f > 0.01 && f < 0.99)
      .sort((a, b) => a - b)
    if (at.length) folds = { direction: d.foldDir, at }
  }
  const panelTotal = folds ? folds.at.length + 1 : 0
  const pages: PageDef[] = d.pages.map((p, i) => {
    const panels = p.panels.slice(0, panelTotal).map((x) => x.trim())
    return {
      label: p.label.trim() || `Page ${i + 1}`,
      hint: p.hint.trim() || undefined,
      panels: panelTotal && panels.length === panelTotal && panels.every(Boolean) ? panels : undefined,
    }
  })
  if (!pages.length) return null
  return { id: 'custom', name: d.name.trim() || 'From template', kind: d.kind, widthIn: w, heightIn: h, bleedIn: bleed, safeIn: safe, unit: d.unit, folds, guide: d.guide, pages }
}

/** Landscape sheets fill the pane; tall ones are kept to a sensible height. */
const previewWidth = (spec: PrintSpec) => (spec.widthIn >= spec.heightIn ? 290 : Math.round((220 * spec.widthIn) / spec.heightIn))

/** Big phone photos of a template are shrunk before sending; PDFs go as they are. */
async function shrink(file: File): Promise<Blob> {
  if (file.type === 'application/pdf' || file.size <= 1.8 * 1024 * 1024) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2800 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t shrink that image'))), 'image/jpeg', 0.88))
}

export function TemplateImport({ onSpec }: { onSpec: (spec: PrintSpec | null) => void }) {
  const [files, setFiles] = useState<{ file: File; preview: string | null }[]>([])
  const [notes, setNotes] = useState('')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Reading | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), [files])

  const spec = useMemo(() => (draft ? fromDraft(draft) : null), [draft])
  useEffect(() => onSpec(spec), [spec, onSpec])

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = [...files]
    for (const file of Array.from(list)) {
      if (next.length >= 2) break
      if (!/^(image\/(png|jpe?g|webp)|application\/pdf)$/i.test(file.type)) {
        setError('Use a PDF, PNG, JPG or WebP.')
        continue
      }
      next.push({ file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
    }
    setFiles(next)
  }

  const read = async () => {
    setReading(true)
    setError(null)
    try {
      const form = new FormData()
      for (const f of files) form.append('file', await shrink(f.file), f.file.name)
      form.append('notes', notes)
      const r = await api<Reading>('/api/print/presets/read', { method: 'POST', body: form })
      setResult(r)
      setDraft(toDraft(r.spec))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t read that template.')
    } finally {
      setReading(false)
    }
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  // Keep every page's panel list as long as the folds call for.
  const setFolds = (patch: Partial<Pick<Draft, 'foldDir' | 'folds'>>) =>
    setDraft((d) => {
      if (!d) return d
      const next = { ...d, ...patch }
      const n = foldList(next).length
      const count = next.foldDir === 'none' || !n ? 0 : n + 1
      return { ...next, pages: next.pages.map((p) => ({ ...p, panels: Array.from({ length: count }, (_, i) => p.panels[i] ?? '') })) }
    })

  const setPage = (i: number, patch: Partial<Draft['pages'][number]>) =>
    setDraft((d) => (d ? { ...d, pages: d.pages.map((p, j) => (j === i ? { ...p, ...patch } : p)) } : d))

  const field = (key: 'width' | 'height' | 'bleed' | 'safe', label: string) => (
    <label className="block">
      <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <div className="relative">
        <input className="print-input pr-9" inputMode="decimal" value={draft![key]} onChange={(e) => set({ [key]: e.target.value })} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: 'var(--muted)' }}>
          {draft!.unit}
        </span>
      </div>
    </label>
  )

  const thumbs = (
    <div className="flex gap-2">
      {files.map((f, i) => (
        <div key={i} className="relative w-[72px] h-[72px] rounded-lg border overflow-hidden flex items-center justify-center text-[11px]" style={{ borderColor: 'var(--line)', background: 'var(--raise)', color: 'var(--ink-2)' }}>
          {f.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.preview} alt={f.file.name} className="w-full h-full object-contain" />
          ) : (
            <span className="px-1 text-center break-all leading-tight">PDF · {f.file.name}</span>
          )}
          {!draft && (
            <button
              type="button"
              onClick={() => setFiles(files.filter((_, j) => j !== i))}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full inline-flex items-center justify-center text-[12px]"
              style={{ background: 'var(--chrome)', color: 'var(--muted)', border: '1px solid var(--line)' }}
              aria-label={`Remove ${f.file.name}`}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )

  if (!draft || !result) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="text-[17px] font-semibold">From a template</h3>
          <p className="text-[13px] mt-1 leading-snug" style={{ color: 'var(--ink-2)' }}>
            Upload the printer’s guide — a PDF or image, one or two sides. Kan reads the size, bleed, folds and what each panel is, and you check it before it’s saved.
          </p>
        </div>
        {files.length > 0 && thumbs}
        {files.length < 2 && (
          <label className="inline-flex h-9 px-3 rounded-lg items-center cursor-pointer text-[13.5px]" style={{ background: 'var(--raise)', color: 'var(--ink)' }}>
            {files.length ? 'Add the other side' : 'Choose template files'}
            <input
              type="file"
              multiple
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        )}
        <label className="block">
          <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
            Notes <span className="opacity-70">optional</span>
          </span>
          <textarea
            rows={4}
            className="print-input resize-none"
            placeholder="11 × 8.5 in flat, 0.125 bleed. The first image is the outside; the right panel is the cover."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && (
          <p className="text-[12.5px]" style={{ color: 'var(--err)' }}>
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={read}
          disabled={!files.length || reading}
          className="h-9 px-4 rounded-lg text-[13.5px] font-semibold disabled:opacity-40"
          style={{ background: 'var(--ink)', color: 'var(--chrome)' }}
        >
          {reading ? 'Reading the template…' : 'Read template'}
        </button>
      </div>
    )
  }

  const panelCount = draft.pages[0]?.panels.length ?? 0

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[17px] font-semibold">Check what Kan read</h3>
        <button
          type="button"
          onClick={() => {
            setDraft(null)
            setResult(null)
          }}
          className="text-[12.5px] shrink-0 mt-1"
          style={{ color: 'var(--muted)' }}
        >
          Read again
        </button>
      </div>
      {thumbs}
      {result.summary && (
        <p className="text-[13px] leading-snug" style={{ color: 'var(--ink-2)' }}>
          {result.summary}
        </p>
      )}
      {result.doubts.length > 0 && (
        <ul className="rounded-lg border p-2.5 text-[12.5px] leading-snug space-y-1 list-disc pl-6" style={{ borderColor: 'var(--warn)', color: 'var(--ink-2)' }}>
          {result.doubts.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}

      <label className="block">
        <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
          Name
        </span>
        <input className="print-input" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        {field('width', 'Flat width')}
        {field('height', 'Flat height')}
        {field('bleed', 'Bleed')}
        {field('safe', 'Safe margin')}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-2.5 items-end">
        <label className="block">
          <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
            Folds
          </span>
          <select className="print-input" value={draft.foldDir} onChange={(e) => setFolds({ foldDir: e.target.value as Draft['foldDir'] })}>
            <option value="none">None</option>
            <option value="vertical">Side by side</option>
            <option value="horizontal">Stacked</option>
          </select>
        </label>
        {draft.foldDir !== 'none' && (
          <label className="block">
            <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
              At, from the {draft.foldDir === 'vertical' ? 'left' : 'top'} ({draft.unit})
            </span>
            <input className="print-input" inputMode="decimal" placeholder="3.6875, 7.375" value={draft.folds} onChange={(e) => setFolds({ folds: e.target.value })} />
          </label>
        )}
      </div>

      {draft.pages.map((p, i) => (
          <div key={i} className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--line)' }}>
            {spec && (
              <div className="mat rounded-lg flex justify-center py-3">
                <Sheet spec={spec} version={null} width={previewWidth(spec)} showGuides label={p.label} panels={spec.pages[i]?.panels} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input className="print-input" aria-label={`Side ${i + 1} name`} value={p.label} onChange={(e) => setPage(i, { label: e.target.value })} />
              {draft.pages.length > 1 && (
                <button type="button" onClick={() => set({ pages: draft.pages.filter((_, j) => j !== i) })} className="text-[12.5px] shrink-0" style={{ color: 'var(--muted)' }}>
                  Remove
                </button>
              )}
            </div>
            {panelCount > 0 && (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: draft.foldDir === 'vertical' ? `repeat(${panelCount}, minmax(0, 1fr))` : '1fr' }}>
                {p.panels.map((name, j) => (
                  <input
                    key={j}
                    className="print-input text-[12.5px]"
                    placeholder={`Panel ${j + 1}`}
                    aria-label={`${p.label} panel ${j + 1}`}
                    value={name}
                    onChange={(e) => setPage(i, { panels: p.panels.map((x, k) => (k === j ? e.target.value : x)) })}
                  />
                ))}
              </div>
            )}
            <textarea
              rows={2}
              className="print-input resize-none text-[12.5px]"
              placeholder="What this side is for"
              aria-label={`${p.label} notes for the designer`}
              value={p.hint}
              onChange={(e) => setPage(i, { hint: e.target.value })}
            />
          </div>
      ))}
      {draft.pages.length < 12 && (
        <button
          type="button"
          onClick={() => set({ pages: [...draft.pages, { label: `Page ${draft.pages.length + 1}`, hint: '', panels: Array.from({ length: panelCount }, () => '') }] })}
          className="text-[13px]"
          style={{ color: 'var(--ink-2)' }}
        >
          + Add a side
        </button>
      )}
      {!spec && (
        <p className="text-[12.5px]" style={{ color: 'var(--err)' }}>
          Check the size — width and height need to be at least half an inch.
        </p>
      )}
    </div>
  )
}
