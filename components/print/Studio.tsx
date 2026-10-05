'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatCents } from '@/lib/print/models'
import { bleedSize, catalogProduct, formatSize, guideLabel } from '@/lib/print/spec'
import { api } from './api'
import type { PrintVersion, VersionMode } from '@/lib/print/types'
import { BrandPanel } from './BrandPanel'
import { Composer, type BrandSection, type ComposerMode } from './Composer'
import { ExportDialog } from './ExportDialog'
import { Inspector } from './Inspector'
import { Sheet, type BrushMode, type SheetHandle } from './Sheet'
import { SignInGate, SurfaceSwitch, useNotice, Notice } from './ui'
import { useDesign, type RenderOptions } from './useDesign'

/** Measures an element's content box. */
function useSize<T extends HTMLElement>() {
  // A callback ref: the element appears only once the design has loaded.
  const [el, ref] = useState<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [ref, size] as const
}

function statusOf(v: PrintVersion | undefined, checking: boolean): { text: string; color: string } {
  if (!v) return { text: 'Not designed yet', color: 'var(--muted)' }
  if (checking) return { text: 'Checking for print…', color: 'var(--ink-2)' }
  if (!v.check) return { text: 'Not checked', color: 'var(--muted)' }
  const errors = v.check.issues.filter((i) => i.severity === 'error').length
  const warns = v.check.issues.length - errors
  if (errors) return { text: `${errors} print issue${errors === 1 ? '' : 's'}`, color: 'var(--err)' }
  if (warns) return { text: `Print-ready · ${warns} note${warns === 1 ? '' : 's'}`, color: 'var(--warn)' }
  return { text: 'Print-ready', color: 'var(--ok)' }
}

export function Studio({ id }: { id: string }) {
  const [focus, setFocus] = useState<number | null>(null)
  const [guides, setGuides] = useState(true)
  const [brush, setBrush] = useState<BrushMode>('off')
  const [brushSize, setBrushSize] = useState(44)
  const [masked, setMasked] = useState(false)
  const [hoverIssue, setHoverIssue] = useState<string | null>(null)
  const [brandSection, setBrandSection] = useState<BrandSection | null>(null)
  const [exporting, setExporting] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [mobileDetails, setMobileDetails] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const { notice, notify } = useNotice()
  const sheetRef = useRef<SheetHandle>(null)
  const [matRef, mat] = useSize<HTMLElement>()
  const {
    design,
    loadError,
    brands,
    models,
    brand,
    pending,
    checking,
    patch,
    setBrief,
    flushSave,
    changeBrand,
    flushBrands,
    createBrand,
    render: renderPage,
    runCheck,
  } = useDesign(id, { notify })

  const render = useCallback(
    async (pageIndex: number, mode: VersionMode, opts: RenderOptions = {}) => {
      await renderPage(pageIndex, mode, opts)
      if (mode === 'area') {
        sheetRef.current?.clearMask()
        setBrush('off')
      }
    },
    [renderPage],
  )

  // ---- derived -------------------------------------------------------------
  if (loadError) {
    if (loadError.status === 401) return <SignInGate callbackUrl={`/print/${id}`} />
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[15px]">{loadError.status === 404 ? 'This design doesn’t exist, or isn’t yours.' : loadError.message}</p>
        <Link href="/print" className="text-[14px] underline" style={{ color: 'var(--ink-2)' }}>
          Back to your designs
        </Link>
      </div>
    )
  }
  if (!design) {
    return <div className="h-full mat" aria-busy="true" />
  }

  const spec = design.spec
  const sheet = bleedSize(spec)
  const pageCount = design.pages.length
  const firstEmpty = design.pages.findIndex((p) => p.versions.length === 0)
  const target = focus ?? (firstEmpty >= 0 ? firstEmpty : 0)
  const targetPage = design.pages[target]
  const targetVersion = targetPage.versions[targetPage.current]
  const composerMode: ComposerMode = !targetVersion ? 'create' : focus !== null && masked ? 'area' : 'edit'
  const anyPending = Object.keys(pending).length > 0


  // Layout: every page side by side, or one page large.
  const pad = 56
  const labelH = 44
  const stripW = focus !== null && pageCount > 1 ? 92 : 0
  const availW = Math.max(160, mat.width - pad * 2 - stripW)
  const availH = Math.max(160, mat.height - pad * 2 - labelH)
  const gap = 48
  const scale =
    focus === null
      ? Math.min((availW - gap * (pageCount - 1)) / (pageCount * sheet.w), availH / sheet.h)
      : Math.min(availW / sheet.w, availH / sheet.h)
  const sheetWidth = Math.max(focus === null ? 140 : 200, Math.floor(scale * sheet.w))

  const submit = (prompt: string, takes: number) => {
    if (composerMode === 'create') {
      if (target === 0 && prompt) setBrief({ prompt })
      render(target, 'create', { prompt: prompt || undefined, takes })
    } else if (composerMode === 'area') {
      const mask = sheetRef.current?.maskPng()
      if (!mask) {
        notify('Paint over the part you want to change first.')
        return
      }
      render(target, 'area', { prompt, mask })
    } else {
      render(target, 'edit', { prompt })
    }
  }

  const deleteVersion = (pageIndex: number, vi: number) =>
    patch((d) => ({
      ...d,
      pages: d.pages.map((p, i) => {
        if (i !== pageIndex) return p
        const versions = p.versions.filter((_, j) => j !== vi)
        const current = Math.max(0, Math.min(versions.length - 1, p.current > vi ? p.current - 1 : p.current === vi ? vi - 1 : p.current))
        return { ...p, versions, current }
      }),
    }))

  // A product cut more than one way (square or rounded corners) can switch here.
  const shapes = catalogProduct(spec.id)?.shapes
  const currentShape = shapes?.find((s) => JSON.stringify(s.guide) === JSON.stringify(spec.guide))?.key ?? ''
  const changeShape = async (key: string) => {
    const shape = shapes?.find((s) => s.key === key)
    if (!shape) return
    try {
      await api(`/api/print/designs/${design.id}`, { method: 'PATCH', json: { shape: key } })
      patch((d) => ({ ...d, spec: { ...d.spec, guide: shape.guide } }))
      notify(`${shape.label} from the next design on. Pages already drawn keep their old shape — redraw or check them.`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Couldn’t change the shape.')
    }
  }

  const focusedPage = focus !== null ? design.pages[focus] : null
  const focusedVersion = focusedPage?.versions[focusedPage.current] ?? null
  const showInspector = !!focusedVersion && inspectorOpen

  // One inspector, shown beside the page on desktop and as a sheet on phones.
  const inspector = (onClose: () => void) =>
    focus !== null && focusedPage ? (
      <Inspector
        spec={spec}
        page={focusedPage}
        pageIndex={focus}
        busy={!!pending[focus]}
        checking={!!(focusedVersion && checking[focusedVersion.id])}
        onSelectVersion={(vi) => patch((d) => ({ ...d, pages: d.pages.map((p, i) => (i === focus ? { ...p, current: vi } : p)) }))}
        onDeleteVersion={(vi) => deleteVersion(focus, vi)}
        onCheck={() => focusedVersion && runCheck(focus, focusedVersion)}
        onFix={(issues) => render(focus, 'fix', { issues })}
        onUpscale={() => render(focus, 'upscale')}
        onFill={() => render(focus, 'fill')}
        onRetext={(copy) => render(focus, 'retext', { copy })}
        onHoverIssue={setHoverIssue}
        onClose={onClose}
      />
    ) : null

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center gap-3 px-3 sm:px-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <Link href="/print" className="w-9 h-9 rounded-lg inline-flex items-center justify-center shrink-0" style={{ color: 'var(--ink-2)' }} aria-label="All designs">
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M10 3L5 8l5 5" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              className="bg-transparent text-[15px] font-semibold outline-none w-full max-w-[420px]"
              defaultValue={design.name}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name) patch((d) => ({ ...d, name }))
                setEditingName(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditingName(false)
              }}
            />
          ) : (
            <button type="button" onClick={() => setEditingName(true)} className="text-[15px] font-semibold truncate max-w-full text-left" title="Rename">
              {design.name}
            </button>
          )}
          <div className="text-[12.5px] truncate" style={{ color: 'var(--muted)' }}>
            {spec.name} · {formatSize(spec)}
            {pageCount > 1 ? ` · ${pageCount} pages` : ''}
            {spec.guide && !shapes ? ` · ${guideLabel(spec.guide)}` : ''}
            {shapes && (
              <>
                {' · '}
                <select
                  value={currentShape}
                  onChange={(e) => void changeShape(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer hover:text-[color:var(--ink)]"
                  aria-label="Die-cut shape"
                  title="The die line this piece is cut to"
                >
                  {shapes.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
        <div className="hidden lg:block">
          <SurfaceSwitch current="studio" designId={design.id} />
        </div>
        <div className="hidden sm:flex flex-col items-end text-[12.5px] leading-tight mr-1" title="Image model spend on this design">
          <span style={{ color: 'var(--ink-2)' }}>{formatCents(design.spendCents)} spent</span>
          <span style={{ color: 'var(--muted)' }}>
            {design.renders} render{design.renders === 1 ? '' : 's'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setGuides((g) => !g)}
          aria-pressed={guides}
          className="h-9 px-3 rounded-lg text-[13.5px] border hidden sm:inline-flex items-center gap-2"
          style={{ borderColor: 'var(--line)', color: guides ? 'var(--ink)' : 'var(--muted)' }}
          title="Show trim, bleed, safe area and folds"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.3}>
            <rect x="3.5" y="3.5" width="9" height="9" strokeDasharray="2 1.5" />
            <path d="M1 3.5h1.5M3.5 1v1.5M15 12.5h-1.5M12.5 15v-1.5" />
          </svg>
          Guides
        </button>
        <button
          type="button"
          onClick={async () => {
            await flushSave()
            setExporting(true)
          }}
          className="h-9 px-3.5 rounded-lg text-[13.5px] font-semibold"
          style={{ background: 'var(--ink)', color: 'var(--chrome)' }}
        >
          Export
        </button>
      </header>

      <div className="flex-1 min-h-0 flex relative">
        {/* The mat */}
        <main ref={matRef} className="mat flex-1 min-w-0 relative overflow-auto print-scroll">
          {focus !== null && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-xl border p-1 shadow-lg" style={{ background: 'rgba(19,24,22,.92)', borderColor: 'var(--line)' }}>
              <button type="button" onClick={() => { setFocus(null); setBrush('off') }} className="h-8 px-2.5 rounded-lg text-[13px]" style={{ color: 'var(--ink-2)' }}>
                {pageCount > 1 ? 'All pages' : 'Done'}
              </button>
              {focusedVersion && (
                <>
                  <span className="w-px h-5 mx-1" style={{ background: 'var(--line)' }} />
                  <button
                    type="button"
                    onClick={() => setBrush((b) => (b === 'paint' ? 'off' : 'paint'))}
                    aria-pressed={brush === 'paint'}
                    className="h-8 px-2.5 rounded-lg text-[13px] inline-flex items-center gap-1.5"
                    style={{ background: brush === 'paint' ? 'var(--magenta-soft)' : 'transparent', color: brush === 'paint' ? '#ff6fb5' : 'var(--ink-2)' }}
                    title="Paint over the part you want to change"
                  >
                    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.4}>
                      <path d="M10.5 2.5l3 3-6.5 6.5H4v-3z" />
                      <path d="M2 14.5h5" />
                    </svg>
                    Paint area
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrush((b) => (b === 'erase' ? 'off' : 'erase'))}
                    aria-pressed={brush === 'erase'}
                    disabled={!masked}
                    className="h-8 px-2.5 rounded-lg text-[13px] disabled:opacity-35"
                    style={{ background: brush === 'erase' ? 'var(--raise)' : 'transparent', color: 'var(--ink-2)' }}
                  >
                    Erase
                  </button>
                  {brush !== 'off' && (
                    <input
                      type="range"
                      min={12}
                      max={140}
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-24 mx-1 accent-[color:var(--magenta)]"
                      aria-label="Brush size"
                    />
                  )}
                  {masked && (
                    <button type="button" onClick={() => sheetRef.current?.clearMask()} className="h-8 px-2.5 rounded-lg text-[13px]" style={{ color: 'var(--ink-2)' }}>
                      Clear
                    </button>
                  )}
                  {!inspectorOpen && (
                    <button type="button" onClick={() => setInspectorOpen(true)} className="hidden md:inline h-8 px-2.5 rounded-lg text-[13px]" style={{ color: 'var(--ink-2)' }}>
                      Details
                    </button>
                  )}
                  <button type="button" onClick={() => setMobileDetails(true)} className="md:hidden h-8 px-2.5 rounded-lg text-[13px]" style={{ color: 'var(--ink-2)' }}>
                    Details
                  </button>
                </>
              )}
            </div>
          )}

          <div className="min-h-full flex items-center justify-center" style={{ padding: pad, paddingTop: focus !== null ? pad + 12 : pad }}>
            {focus === null ? (
              <div className="flex items-start" style={{ gap }}>
                {design.pages.map((p, i) => {
                  const v = p.versions[p.current]
                  const st = statusOf(v, !!(v && checking[v.id]))
                  return (
                    <div key={p.id} className="flex flex-col items-center">
                      <Sheet
                        spec={spec}
                        version={v ?? null}
                        width={sheetWidth}
                        showGuides={guides}
                        label={p.label}
                        pending={pending[i] ?? null}
                        onClick={() => setFocus(i)}
                      />
                      <div className="mt-3 flex items-center gap-2 text-[13px] h-6">
                        <span className="font-medium">{p.label}</span>
                        <span style={{ color: st.color }}>{pending[i] ? `${pending[i].label}${pending[i].count > 1 ? ` ${pending[i].count} takes` : ''}…` : st.text}</span>
                        {v && p.versions.length > 1 && <span style={{ color: 'var(--muted)' }}>· {p.versions.length} versions</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex items-center gap-6">
                {pageCount > 1 && (
                  <div className="flex flex-col gap-3 shrink-0" style={{ width: stripW - 24 }}>
                    {design.pages.map((p, i) => {
                      const v = p.versions[p.current]
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setFocus(i)
                            setBrush('off')
                          }}
                          className="flex flex-col items-center gap-1"
                        >
                          <div className="rounded-[2px] overflow-hidden" style={{ outline: i === focus ? '2px solid var(--ink)' : 'none', outlineOffset: 3, opacity: i === focus ? 1 : 0.75 }}>
                            <Sheet spec={spec} version={v ?? null} width={stripW - 28} showGuides={false} pending={pending[i] ?? null} imageWidth={180} />
                          </div>
                          <span className="text-[11.5px]" style={{ color: i === focus ? 'var(--ink)' : 'var(--muted)' }}>
                            {p.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                <Sheet
                  ref={sheetRef}
                  spec={spec}
                  version={focusedVersion}
                  width={sheetWidth}
                  showGuides={guides}
                  label={focusedPage!.label}
                  pending={pending[focus] ?? null}
                  brush={brush}
                  brushSize={brushSize}
                  onMaskChange={setMasked}
                  issues={focusedVersion?.check?.issues}
                  hoverIssue={hoverIssue}
                  selected
                />
              </div>
            )}
          </div>

          {/* Empty design: a short welcome where the work will appear */}
          {design.renders === 0 && !anyPending && focus === null && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-5 text-center max-w-[460px] px-4">
              <p className="text-[13.5px] leading-snug" style={{ color: 'var(--ink-2)' }}>
                Describe what you need below. The {design.pages[0].label.toLowerCase()} comes first; once you like it, the {pageCount > 1 ? 'other pages follow its look' : 'print check tells you it’s ready'}.
                {guides && ' Cyan dashes mark the safe area; everything outside the white line is trimmed off.'}
              </p>
            </div>
          )}
        </main>

        {showInspector && focus !== null && focusedPage && (
          <aside className="w-[320px] shrink-0 border-l hidden md:block" style={{ borderColor: 'var(--line)', background: 'var(--chrome)' }}>
            {inspector(() => setInspectorOpen(false))}
          </aside>
        )}
        {mobileDetails && focus !== null && focusedVersion && (
          <div className="md:hidden fixed inset-0 z-[65] flex flex-col justify-end" role="dialog" aria-label="Page details">
            <div className="absolute inset-0" style={{ background: 'rgba(5,8,7,.5)' }} onClick={() => setMobileDetails(false)} />
            <div className="relative max-h-[78%] rounded-t-2xl border-t overflow-hidden" style={{ background: 'var(--chrome)', borderColor: 'var(--line)' }}>
              {inspector(() => setMobileDetails(false))}
            </div>
          </div>
        )}
      </div>

      <Composer
        spec={spec}
        brief={design.brief}
        brand={brand}
        models={models}
        mode={composerMode}
        pageLabel={targetPage.label}
        isFirstPage={target === 0}
        busy={!!pending[target]}
        onBrief={setBrief}
        onOpenBrand={(s) => setBrandSection(s)}
        onSubmit={submit}
        onNewTake={targetVersion ? () => render(target, 'create', {}) : undefined}
        notify={notify}
      />

      {brandSection && (
        <BrandPanel
          brands={brands}
          brand={brand}
          brief={design.brief}
          section={brandSection}
          onSelect={(bid) => patch((d) => ({ ...d, brandId: bid }))}
          onCreate={createBrand}
          onChange={changeBrand}
          onBrief={setBrief}
          onClose={() => {
            setBrandSection(null)
            void flushBrands()
          }}
          notify={notify}
        />
      )}

      {exporting && <ExportDialog design={design} onClose={() => setExporting(false)} />}
      <Notice notice={notice} />
    </div>
  )
}
