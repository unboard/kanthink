'use client'

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { distanceField } from '@/lib/print/preflight'
import { bleedSize, foldPositions, shapePath, trimRect } from '@/lib/print/spec'
import type { PreflightIssue, PrintSpec, PrintVersion } from '@/lib/print/types'
import { thumb } from './api'

export type BrushMode = 'off' | 'paint' | 'erase'

export interface SheetHandle {
  /** White-on-transparent PNG of the painted area, page-sized, or null when nothing is painted. */
  maskPng(): string | null
  clearMask(): void
}

interface SheetProps {
  spec: PrintSpec
  version: PrintVersion | null
  width: number
  showGuides: boolean
  label?: string
  pending?: { label: string; startedAt: number } | null
  brush?: BrushMode
  brushSize?: number
  onMaskChange?: (painted: boolean) => void
  issues?: PreflightIssue[]
  hoverIssue?: string | null
  onClick?: () => void
  selected?: boolean
  imageWidth?: number
}

/** Seconds since a render began, ticking. */
function useElapsed(since: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [since])
  return since ? Math.max(0, Math.round((now - since) / 1000)) : 0
}

/**
 * The cut and safe lines of an uploaded guide, drawn from its raster. A shape we know
 * the formula for is drawn as vectors instead; this is only for guides people upload.
 */
function useRasterGuide(spec: PrintSpec): string | null {
  const [overlay, setOverlay] = useState<{ url: string; data: string } | null>(null)
  const url = spec.guide?.kind === 'image' ? spec.guide.url : null
  useEffect(() => {
    if (!url) return
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      const sheet = bleedSize(spec)
      const w = 640
      const h = Math.round((w * sheet.h) / sheet.w)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const px = ctx.getImageData(0, 0, w, h)
      const inside = new Uint8Array(w * h)
      for (let i = 0; i < inside.length; i++) inside[i] = px.data[i * 4] > 127 ? 1 : 0
      const field = distanceField(inside, w, h)
      const safePx = (spec.safeIn / sheet.w) * w
      const out = ctx.createImageData(w, h)
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x
          const d = field[i]
          const o = i * 4
          if (d < 0) {
            out.data[o + 3] = 120 // dim what is cut away
            continue
          }
          if (d < 1.2) {
            out.data[o] = out.data[o + 1] = out.data[o + 2] = 255
            out.data[o + 3] = 255
          } else if (Math.abs(d - safePx) < 0.8) {
            out.data[o] = 34
            out.data[o + 1] = 184
            out.data[o + 2] = 232
            out.data[o + 3] = 230
          }
        }
      }
      ctx.putImageData(out, 0, 0)
      setOverlay({ url, data: c.toDataURL('image/png') })
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [url, spec])
  return overlay && overlay.url === url ? overlay.data : null
}

export const Sheet = forwardRef<SheetHandle, SheetProps>(function Sheet(
  { spec, version, width, showGuides, label, pending, brush = 'off', brushSize = 40, onMaskChange, issues, hoverIssue, onClick, selected, imageWidth },
  ref,
) {
  const clipId = useId().replace(/:/g, '')
  const sheet = bleedSize(spec)
  const height = Math.round((width * sheet.h) / sheet.w)
  const unit = sheet.w / width // inches per screen pixel
  const elapsed = useElapsed(pending?.startedAt)
  const rasterOverlay = useRasterGuide(spec)
  const shaped = !!spec.guide
  const cutPath = useMemo(() => shapePath(spec, 0), [spec])
  const safePath = useMemo(() => shapePath(spec, spec.safeIn), [spec])
  const trim = trimRect(spec)
  const folds = foldPositions(spec)

  // ---- mask painting -------------------------------------------------------
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const painting = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const painted = useRef(false)
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1

  const clearMask = useCallback(() => {
    const c = canvasRef.current
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    if (painted.current) {
      painted.current = false
      onMaskChange?.(false)
    }
  }, [onMaskChange])

  // A new version or a new size starts with a clean mask.
  useEffect(() => {
    clearMask()
  }, [version?.id, clearMask])

  useImperativeHandle(
    ref,
    () => ({
      maskPng() {
        const c = canvasRef.current
        if (!c || !painted.current) return null
        const ctx = c.getContext('2d')!
        const data = ctx.getImageData(0, 0, c.width, c.height)
        let any = false
        const out = new ImageData(c.width, c.height)
        for (let i = 0; i < data.data.length; i += 4) {
          if (data.data[i + 3] > 10) {
            any = true
            out.data[i] = out.data[i + 1] = out.data[i + 2] = 255
            out.data[i + 3] = 255
          }
        }
        if (!any) return null
        const o = document.createElement('canvas')
        o.width = c.width
        o.height = c.height
        o.getContext('2d')!.putImageData(out, 0, 0)
        return o.toDataURL('image/png')
      },
      clearMask,
    }),
    [clearMask],
  )

  const pointAt = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.globalCompositeOperation = brush === 'erase' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = '#e5007e'
    ctx.fillStyle = '#e5007e'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = brushSize * dpr
    ctx.beginPath()
    ctx.moveTo(from.x * dpr, from.y * dpr)
    ctx.lineTo(to.x * dpr, to.y * dpr)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(to.x * dpr, to.y * dpr, (brushSize * dpr) / 2, 0, Math.PI * 2)
    ctx.fill()
    if (brush === 'paint' && !painted.current) {
      painted.current = true
      onMaskChange?.(true)
    }
  }

  const brushActive = brush !== 'off' && !!version && !pending

  const onPointerDown = (e: React.PointerEvent) => {
    if (!brushActive) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    painting.current = true
    const p = pointAt(e)
    last.current = p
    stroke(p, p)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!brushActive) return
    const p = pointAt(e)
    setCursor(p)
    if (!painting.current || !last.current) return
    stroke(last.current, p)
    last.current = p
  }
  const onPointerUp = () => {
    painting.current = false
    last.current = null
    if (brush === 'erase' && painted.current) {
      // Erasing everything means there is no mask any more.
      const c = canvasRef.current
      if (c) {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
        let any = false
        for (let i = 3; i < d.length; i += 16) if (d[i] > 10) { any = true; break }
        if (!any) {
          painted.current = false
          onMaskChange?.(false)
        }
      }
    }
  }

  // Keep the canvas bitmap in step with the displayed size (strokes scale with it).
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const w = Math.round(width * dpr)
    const h = Math.round(height * dpr)
    if (c.width === w && c.height === h) return
    if (painted.current && c.width > 0) {
      const tmp = document.createElement('canvas')
      tmp.width = c.width
      tmp.height = c.height
      tmp.getContext('2d')!.drawImage(c, 0, 0)
      c.width = w
      c.height = h
      c.getContext('2d')!.drawImage(tmp, 0, 0, w, h)
    } else {
      c.width = w
      c.height = h
    }
  }, [width, height, dpr])

  // ---- rendering -----------------------------------------------------------
  const clipStyle: React.CSSProperties | undefined = shaped && !showGuides
    ? spec.guide?.kind === 'image'
      ? { maskImage: `url(${spec.guide.url})`, WebkitMaskImage: `url(${spec.guide.url})`, maskMode: 'luminance', maskSize: '100% 100%', WebkitMaskSize: '100% 100%' } as React.CSSProperties
      : { clipPath: `url(#${clipId})` }
    : undefined

  const markLen = 16 * unit
  const markGap = 4 * unit
  const t0x = trim.x * sheet.w
  const t0y = trim.y * sheet.h
  const t1x = (trim.x + trim.w) * sheet.w
  const t1y = (trim.y + trim.h) * sheet.h

  const visibleIssues = (issues ?? []).filter((i) => i.box)
  const src = version ? thumb(version.url, imageWidth ?? Math.min(2400, Math.round(width * dpr * 1.25))) : null

  return (
    <div
      className="relative select-none"
      style={{ width, height, filter: shaped && !showGuides ? 'drop-shadow(0 4px 7px rgba(0,0,0,.3))' : undefined }}
      onClick={onClick}
    >
      {/* Clip path for vector die-cuts, in the sheet's own unit box. */}
      {cutPath && shaped && (
        <svg width="0" height="0" className="absolute">
          <defs>
            <clipPath id={clipId} clipPathUnits="objectBoundingBox">
              <path d={cutPath} transform={`scale(${1 / sheet.w} ${1 / sheet.h})`} clipRule="evenodd" fillRule="evenodd" />
            </clipPath>
          </defs>
        </svg>
      )}

      <div
        className={`absolute inset-0 overflow-hidden ${shaped && !showGuides ? '' : 'paper-shadow'} ${pending ? 'render-sweep' : ''}`}
        style={{ ...clipStyle, background: version ? '#fff' : 'var(--paper)', borderRadius: 1 }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label ?? 'Page'} draggable={false} className="w-full h-full object-cover block" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {!pending && label && (
              <span className="text-[13px] tracking-wide" style={{ color: '#9aa69f' }}>
                {label}
              </span>
            )}
          </div>
        )}
        {pending && (
          <div className="absolute inset-x-0 bottom-0 p-3 flex justify-center">
            <span className="text-[12px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(19,24,22,.82)', color: 'var(--ink)' }}>
              {pending.label} · {elapsed}s
            </span>
          </div>
        )}
      </div>

      {/* Guides and marks */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={width}
        height={height}
        viewBox={`0 0 ${sheet.w} ${sheet.h}`}
        preserveAspectRatio="none"
        style={{ overflow: 'visible' }}
      >
        {showGuides && (
          <>
            {/* What gets trimmed or cut away */}
            {cutPath && (
              <path
                d={`M0 0H${sheet.w}V${sheet.h}H0Z ${cutPath}`}
                fill={shaped ? 'rgba(10,14,12,.55)' : 'rgba(10,14,12,.28)'}
                fillRule="evenodd"
              />
            )}
            {cutPath && (
              <>
                <path d={cutPath} fill="none" stroke="rgba(0,0,0,.55)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                <path d={cutPath} fill="none" stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              </>
            )}
            {safePath && (
              <path d={safePath} fill="none" stroke="var(--cyan)" strokeWidth={1} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            )}
            {folds.map((f) =>
              spec.folds?.direction === 'vertical' ? (
                <line key={f} x1={f * sheet.w} x2={f * sheet.w} y1={0} y2={sheet.h} stroke="var(--fold)" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
              ) : (
                <line key={f} y1={f * sheet.h} y2={f * sheet.h} x1={0} x2={sheet.w} stroke="var(--fold)" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
              ),
            )}
          </>
        )}
        {/* Crop marks sit on the mat, outside the sheet, aligned to the trim. */}
        {(showGuides || selected) && (
          <g stroke="rgba(214,226,220,.55)" strokeWidth={1} vectorEffect="non-scaling-stroke">
            {[t0x, t1x].map((x) => (
              <g key={`v${x}`}>
                <line x1={x} x2={x} y1={-markGap} y2={-markGap - markLen} vectorEffect="non-scaling-stroke" />
                <line x1={x} x2={x} y1={sheet.h + markGap} y2={sheet.h + markGap + markLen} vectorEffect="non-scaling-stroke" />
              </g>
            ))}
            {[t0y, t1y].map((y) => (
              <g key={`h${y}`}>
                <line y1={y} y2={y} x1={-markGap} x2={-markGap - markLen} vectorEffect="non-scaling-stroke" />
                <line y1={y} y2={y} x1={sheet.w + markGap} x2={sheet.w + markGap + markLen} vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </g>
        )}
        {visibleIssues.map((issue) => {
          const [x0, y0, x1, y1] = issue.box!
          const hot = hoverIssue === issue.id
          return (
            <rect
              key={issue.id}
              x={x0 * sheet.w}
              y={y0 * sheet.h}
              width={(x1 - x0) * sheet.w}
              height={(y1 - y0) * sheet.h}
              fill={hot ? 'rgba(255,90,95,.18)' : 'none'}
              stroke={issue.severity === 'error' ? 'var(--err)' : 'var(--warn)'}
              strokeWidth={hot ? 2.5 : 1.5}
              strokeDasharray={issue.severity === 'error' ? undefined : '4 3'}
              vectorEffect="non-scaling-stroke"
              rx={2 * unit}
            />
          )
        })}
      </svg>

      {showGuides && rasterOverlay && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rasterOverlay} alt="" className="absolute inset-0 w-full h-full pointer-events-none" style={{ imageRendering: 'auto' }} />
      )}

      {/* Painted area */}
      {version && (
        <div
          className="absolute inset-0"
          style={{ cursor: brushActive ? 'none' : onClick ? 'pointer' : 'default', touchAction: brushActive ? 'none' : 'auto', pointerEvents: brushActive || onClick ? 'auto' : 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            setCursor(null)
            onPointerUp()
          }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: 0.55, mixBlendMode: 'normal' }} />
          {brushActive && cursor && (
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                left: cursor.x - brushSize / 2,
                top: cursor.y - brushSize / 2,
                width: brushSize,
                height: brushSize,
                border: `1.5px solid ${brush === 'erase' ? '#fff' : 'var(--magenta)'}`,
                boxShadow: '0 0 0 1px rgba(0,0,0,.35)',
              }}
            />
          )}
        </div>
      )}
    </div>
  )
})
