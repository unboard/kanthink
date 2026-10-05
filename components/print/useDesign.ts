'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BrandKit,
  PageCopy,
  PreflightIssue,
  PreflightResult,
  PrintBrand,
  PrintBrief,
  PrintDesign,
  PrintVersion,
  VersionMode,
} from '@/lib/print/types'
import type { Mark } from '@/lib/print/markup'
import { api, ApiError } from './api'
import type { ModelInfo } from './Composer'

/**
 * One design, loaded and kept: the state every print surface shares.
 *
 * The studio, the easy maker and the chat are three ways to work on the same design.
 * Each is the one writer of it while open: edits save after a short pause, anything
 * that renders flushes first so the server sees the brief it is asked about, and the
 * renders themselves come back as versions this hook places.
 */

export interface Pending {
  label: string
  startedAt: number
  count: number
}

export const PENDING_LABEL: Record<VersionMode, string> = {
  create: 'Designing',
  edit: 'Changing',
  area: 'Changing the area',
  retext: 'Setting the words',
  fix: 'Fixing for print',
  upscale: 'Sharpening',
  fill: 'Filling to the edges',
  markup: 'Working through your marks',
}

export interface RenderOptions {
  prompt?: string
  mask?: string
  copy?: PageCopy
  issues?: PreflightIssue[]
  /** `markup`: the marks to act on. */
  marks?: Mark[]
  takes?: number
  /** Wait for each new version's print check before resolving. */
  awaitCheck?: boolean
  /** Override the brief's model or quality for this render only. */
  modelId?: string
  quality?: 'print' | 'draft'
}

export interface RenderOutcome {
  versions: PrintVersion[]
  errors: string[]
}

interface Options {
  notify: (message: string) => void
}

const sigOf = (d: PrintDesign) => JSON.stringify([d.name, d.brief, d.brandId, d.pages, d.chat])

const body = (d: PrintDesign) => ({ name: d.name, brief: d.brief, brandId: d.brandId, pages: d.pages, chat: d.chat })

export function useDesign(id: string | null, { notify }: Options) {
  const [design, setDesign] = useState<PrintDesign | null>(null)
  const [loadError, setLoadError] = useState<{ message: string; status: number } | null>(null)
  const [brands, setBrands] = useState<PrintBrand[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<Record<number, Pending>>({})
  const [checking, setChecking] = useState<Record<string, boolean>>({})
  // The live design and brands. Writes land here first, so async work never reads a
  // render-old copy; state follows for React.
  const designRef = useRef<PrintDesign | null>(null)
  const brandsRef = useRef<PrintBrand[]>([])

  // ---- loading -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    Promise.all([
      id ? api<{ design: PrintDesign }>(`/api/print/designs/${id}`) : Promise.resolve(null),
      api<{ brands: PrintBrand[] }>('/api/print/brands'),
      api<{ models: ModelInfo[] }>('/api/print/models'),
    ])
      .then(([d, b, m]) => {
        if (cancelled) return
        if (d) {
          designRef.current = d.design
          setDesign(d.design)
        }
        brandsRef.current = b.brands
        setBrands(b.brands)
        setModels(m.models)
        setReady(true)
      })
      .catch((err) => {
        if (!cancelled) setLoadError({ message: err.message, status: err instanceof ApiError ? err.status : 500 })
      })
    return () => {
      cancelled = true
    }
    // A design adopted after creation is already in state; don't reload for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- saving --------------------------------------------------------------
  const savedSig = useRef<string>('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const d = designRef.current
    if (!d) return
    const sig = sigOf(d)
    if (sig === savedSig.current) return
    savedSig.current = sig
    try {
      await api(`/api/print/designs/${d.id}`, { method: 'PATCH', json: body(d) })
    } catch (err) {
      savedSig.current = ''
      notify(err instanceof Error ? `Couldn’t save: ${err.message}` : 'Couldn’t save.')
    }
  }, [notify])

  useEffect(() => {
    if (!design) return
    if (!savedSig.current) {
      savedSig.current = sigOf(design)
      return
    }
    if (sigOf(design) === savedSig.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, 700)
  }, [design, flushSave])

  useEffect(() => {
    const beforeUnload = () => {
      const d = designRef.current
      if (d && sigOf(d) !== savedSig.current) {
        // keepalive lets the save finish after the tab has gone.
        fetch(`/api/print/designs/${d.id}`, {
          method: 'PATCH',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body(d)),
        })
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  // Changes apply to the ref at once, not when React next renders: an action that
  // edits the brief and then renders in the same tick must save the edited brief.
  const patch = useCallback((fn: (d: PrintDesign) => PrintDesign) => {
    const current = designRef.current
    if (!current) return
    const next = fn(current)
    designRef.current = next
    setDesign(next)
  }, [])

  const setBrief = useCallback((p: Partial<PrintBrief>) => patch((d) => ({ ...d, brief: { ...d.brief, ...p } })), [patch])

  /** Take on a design that was just created, without a reload. */
  const adopt = useCallback((d: PrintDesign) => {
    savedSig.current = sigOf(d)
    designRef.current = d
    setDesign(d)
  }, [])

  // ---- brands --------------------------------------------------------------
  const brand = useMemo(() => brands.find((b) => b.id === design?.brandId) ?? null, [brands, design?.brandId])
  const brandTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const changeBrand = useCallback((b: PrintBrand) => {
    const next = brandsRef.current.map((x) => (x.id === b.id ? b : x))
    brandsRef.current = next
    setBrands(next)
    clearTimeout(brandTimers.current[b.id])
    brandTimers.current[b.id] = setTimeout(() => {
      delete brandTimers.current[b.id]
      api(`/api/print/brands/${b.id}`, { method: 'PATCH', json: { name: b.name, data: b.data } }).catch((err) => notify(`Couldn’t save the brand: ${err.message}`))
    }, 600)
  }, [notify])

  const flushBrands = useCallback(async () => {
    const ids = Object.keys(brandTimers.current)
    await Promise.all(
      ids.map(async (bid) => {
        clearTimeout(brandTimers.current[bid])
        delete brandTimers.current[bid]
        const b = brandsRef.current.find((x) => x.id === bid)
        if (b) await api(`/api/print/brands/${b.id}`, { method: 'PATCH', json: { name: b.name, data: b.data } }).catch(() => {})
      }),
    )
  }, [])

  const createBrand = useCallback(async (name: string, data?: Partial<BrandKit>) => {
    try {
      const { brand: created } = await api<{ brand: PrintBrand }>('/api/print/brands', { method: 'POST', json: { name, data: data ?? {} } })
      const next = [created, ...brandsRef.current]
      brandsRef.current = next
      setBrands(next)
      patch((d) => ({ ...d, brandId: created.id }))
      return created
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Couldn’t create the brand.')
      return null
    }
  }, [patch, notify])

  /** The current brand, made if there is none yet. Written straight through. */
  const ensureBrand = useCallback(async (name: string): Promise<PrintBrand | null> => {
    const d = designRef.current
    const existing = d?.brandId ? brandsRef.current.find((b) => b.id === d.brandId) : null
    if (existing) return existing
    return createBrand(name)
  }, [createBrand])

  // ---- versions ------------------------------------------------------------
  const addVersion = useCallback((pageIndex: number, version: PrintVersion, makeCurrent: boolean) => {
    patch((d) => ({
      ...d,
      renders: d.renders + 1,
      spendCents: d.spendCents + (version.costCents ?? 0),
      pages: d.pages.map((p, i) =>
        i === pageIndex
          ? { ...p, versions: [...p.versions, version], current: makeCurrent || p.versions.length === 0 ? p.versions.length : p.current }
          : p,
      ),
    }))
  }, [patch])

  const setCheck = useCallback((pageIndex: number, versionId: string, check: PreflightResult) => {
    patch((d) => ({
      ...d,
      pages: d.pages.map((p, i) => (i === pageIndex ? { ...p, versions: p.versions.map((v) => (v.id === versionId ? { ...v, check } : v)) } : p)),
    }))
  }, [patch])

  const runCheck = useCallback(async (pageIndex: number, version: PrintVersion): Promise<PreflightResult | null> => {
    const d = designRef.current
    if (!d) return null
    setChecking((c) => ({ ...c, [version.id]: true }))
    try {
      const { check } = await api<{ check: PreflightResult }>('/api/print/preflight', { method: 'POST', json: { designId: d.id, version: { ...version, check: undefined } } })
      setCheck(pageIndex, version.id, check)
      return check
    } catch (err) {
      notify(err instanceof Error ? `Print check failed: ${err.message}` : 'Print check failed.')
      return null
    } finally {
      setChecking((c) => {
        const next = { ...c }
        delete next[version.id]
        return next
      })
    }
  }, [notify, setCheck])

  const pendingRef = useRef(pending)
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  const render = useCallback(
    async (pageIndex: number, mode: VersionMode, opts: RenderOptions = {}): Promise<RenderOutcome> => {
      const d0 = designRef.current
      if (!d0 || pendingRef.current[pageIndex]) return { versions: [], errors: ['Already working on that page.'] }
      await Promise.all([flushSave(), flushBrands()])
      const d = designRef.current ?? d0
      const page = d.pages[pageIndex]
      const source = page.versions[page.current]
      const takes = Math.max(1, opts.takes ?? 1)
      const mark = { label: PENDING_LABEL[mode], startedAt: Date.now(), count: takes }
      pendingRef.current = { ...pendingRef.current, [pageIndex]: mark }
      setPending((p) => ({ ...p, [pageIndex]: mark }))
      let first = true
      const versions: PrintVersion[] = []
      const errors: string[] = []
      const one = async () => {
        try {
          const { version } = await api<{ version: PrintVersion; cents: number }>('/api/print/render', {
            method: 'POST',
            json: {
              designId: d.id,
              pageIndex,
              mode,
              prompt: opts.prompt || undefined,
              modelId: opts.modelId ?? d.brief.modelId,
              quality: opts.quality ?? d.brief.quality,
              source: mode === 'create' ? undefined : source && { ...source, check: undefined },
              mask: opts.mask,
              copy: opts.copy,
              issues: opts.issues,
              marks: opts.marks,
            },
          })
          addVersion(pageIndex, version, first)
          first = false
          const check = runCheck(pageIndex, version)
          versions.push(opts.awaitCheck ? { ...version, check: (await check) ?? undefined } : version)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'That didn’t work. Try again.'
          errors.push(message)
          notify(message)
        }
      }
      await Promise.all(Array.from({ length: takes }, one))
      const rest = { ...pendingRef.current }
      delete rest[pageIndex]
      pendingRef.current = rest
      setPending((p) => {
        const next = { ...p }
        delete next[pageIndex]
        return next
      })
      return { versions, errors }
    },
    [flushSave, flushBrands, addVersion, runCheck, notify],
  )

  const selectVersion = useCallback(
    (pageIndex: number, versionIndex: number) =>
      patch((d) => ({ ...d, pages: d.pages.map((p, i) => (i === pageIndex ? { ...p, current: versionIndex } : p)) })),
    [patch],
  )

  return {
    design,
    loadError,
    ready,
    brands,
    models,
    brand,
    pending,
    checking,
    patch,
    adopt,
    setBrief,
    flushSave,
    changeBrand,
    flushBrands,
    createBrand,
    ensureBrand,
    render,
    runCheck,
    selectVersion,
  }
}

export type DesignHandle = ReturnType<typeof useDesign>
