'use client'

import { useEffect, useRef, useState } from 'react'
import { KIND_LABEL, MARK_COLOR, badgeAt, bounds, fitMark, markPath, moveMark, movePoint, simplify, type Box, type Mark, type MarkKind, type Pt } from '@/lib/print/markup'

/**
 * Numbered marks over a page: drawn with a tool, picked to move or resize, each with a
 * note typed beside its number.
 *
 * Works in page fractions throughout (see lib/print/markup.ts) and reports finished
 * strokes and edits up; the studio decides what becomes a new mark and saves it.
 */

export type MarkTool = MarkKind | null

interface MarkupLayerProps {
  width: number
  height: number
  marks: Mark[]
  tool: MarkTool
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** A finished gesture with a drawing tool. */
  onStroke: (kind: MarkKind, pts: Pt[]) => void
  onChange: (id: string, mark: Mark) => void
  onNote: (id: string, note: string) => void
  onDelete: (id: string) => void
  onDone: (id: string) => void
}

type Drag =
  | { kind: 'create'; tool: MarkKind; pts: Pt[] }
  | { kind: 'move'; id: string; start: Pt; orig: Mark }
  | { kind: 'corner'; id: string; corner: 0 | 1 | 2 | 3; orig: Mark; box: Box }
  | { kind: 'end'; id: string; index: number; orig: Mark }

const MIN_SHAPE = 0.012

export function MarkupLayer({ width, height, marks, tool, selectedId, onSelect, onStroke, onChange, onNote, onDelete, onDone }: MarkupLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Mirrored in refs: a quick drag can end before React has rendered its start.
  const [drag, setDragState] = useState<Drag | null>(null)
  const [live, setLiveState] = useState<Mark | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const liveRef = useRef<Mark | null>(null)
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }
  const setLive = (m: Mark | null) => {
    liveRef.current = m
    setLiveState(m)
  }
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const selected = marks.find((m) => m.id === selectedId) ?? null
  const shown = live ? marks.map((m) => (m.id === live.id ? live : m)) : marks

  // A newly picked mark opens its note, ready to type.
  useEffect(() => {
    if (selectedId) noteRef.current?.focus()
  }, [selectedId])

  const at = (e: React.PointerEvent): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]
  }

  const start = (e: React.PointerEvent, d: Drag) => {
    e.preventDefault()
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    setDrag(d)
  }

  const onDown = (e: React.PointerEvent) => {
    if (!tool) {
      // A click on empty page lets go of the selection.
      onSelect(null)
      return
    }
    const p = at(e)
    start(e, { kind: 'create', tool, pts: [p] })
  }

  const onMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const p = at(e)
    if (drag.kind === 'create') {
      setDrag(drag.tool === 'draw' ? { ...drag, pts: [...drag.pts, p] } : { ...drag, pts: [drag.pts[0], p] })
    } else if (drag.kind === 'move') {
      setLive(moveMark(drag.orig, p[0] - drag.start[0], p[1] - drag.start[1]))
    } else if (drag.kind === 'end') {
      setLive(movePoint(drag.orig, 0, drag.index, p))
    } else {
      // The dragged corner follows the pointer; the opposite one stays.
      const b = drag.box
      const box: Box = {
        x0: drag.corner === 0 || drag.corner === 3 ? Math.min(p[0], b.x1 - 0.01) : b.x0,
        y0: drag.corner === 0 || drag.corner === 1 ? Math.min(p[1], b.y1 - 0.01) : b.y0,
        x1: drag.corner === 1 || drag.corner === 2 ? Math.max(p[0], b.x0 + 0.01) : b.x1,
        y1: drag.corner === 2 || drag.corner === 3 ? Math.max(p[1], b.y0 + 0.01) : b.y1,
      }
      setLive(fitMark(drag.orig, box))
    }
  }

  const onUp = () => {
    const drag = dragRef.current
    const live = liveRef.current
    if (!drag) return
    if (drag.kind === 'create') {
      const pts = drag.tool === 'draw' ? simplify(drag.pts) : drag.pts
      const [a, b] = [pts[0], pts[pts.length - 1]]
      const big = !!a && !!b && Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) >= MIN_SHAPE
      if (drag.tool === 'draw' ? pts.length > 1 || big : big && pts.length === 2) onStroke(drag.tool, pts)
    } else if (live) {
      onChange(live.id, live)
    }
    setDrag(null)
    setLive(null)
  }

  const preview: Mark | null =
    drag?.kind === 'create'
      ? { id: 'preview', n: 0, kind: drag.tool, pts: [drag.pts.length === 1 ? [drag.pts[0], drag.pts[0]] : drag.pts], note: '', status: 'open', at: 0 }
      : null

  const sw = 2.5
  const sel = selected ? (live?.id === selected.id ? live : selected) : null
  const selBox = sel ? bounds(sel) : null
  // Arrow ends, or the four corners of anything else.
  const handles: { key: string; x: number; y: number; drag: Drag; cursor: string }[] =
    sel && selBox
      ? sel.kind === 'arrow'
        ? sel.pts[0].map(([x, y], i) => ({ key: `e${i}`, x, y, drag: { kind: 'end', id: sel.id, index: i, orig: sel }, cursor: 'grab' }))
        : ([[selBox.x0, selBox.y0], [selBox.x1, selBox.y0], [selBox.x1, selBox.y1], [selBox.x0, selBox.y1]] as Pt[]).map(([x, y], i) => ({
            key: `c${i}`,
            x,
            y,
            drag: { kind: 'corner', id: sel.id, corner: i as 0 | 1 | 2 | 3, orig: sel, box: selBox },
            cursor: i % 2 ? 'nesw-resize' : 'nwse-resize',
          }))
      : []

  // Where the note box opens: beside the mark, never over it — right, else left, else below.
  const notePos = sel
    ? (() => {
        const b = bounds(sel)
        const top = Math.max(4, Math.min(height - 110, b.y0 * height))
        if (b.x1 * width + 248 <= width) return { left: b.x1 * width + 14, top }
        if (b.x0 * width - 248 >= 0) return { left: b.x0 * width - 246, top }
        return { left: Math.max(4, Math.min(width - 236, b.x0 * width)), top: Math.min(height + 8, b.y1 * height + 14) }
      })()
    : null

  return (
    <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="absolute inset-0"
        style={{ pointerEvents: tool || drag ? 'all' : 'none', cursor: tool ? 'crosshair' : 'default', touchAction: tool ? 'none' : 'auto', overflow: 'visible' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {[...shown, ...(preview ? [preview] : [])].map((m) => {
          const d = markPath(m, width, height)
          if (!d) return null
          const isSel = m.id === selectedId
          return (
            <g key={m.id} opacity={m.status === 'done' ? 0.45 : 1}>
              <path d={d} fill="none" stroke="#fff" strokeWidth={sw * 2.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
              <path d={d} fill="none" stroke={MARK_COLOR} strokeWidth={isSel ? sw + 1 : sw} strokeLinecap="round" strokeLinejoin="round" />
              {m.id !== 'preview' && !tool && (
                // A wide invisible stroke, so a thin mark is easy to pick up.
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ pointerEvents: 'stroke', cursor: 'move' }}
                  onPointerDown={(e) => {
                    onSelect(m.id)
                    start(e, { kind: 'move', id: m.id, start: at(e), orig: m })
                  }}
                />
              )}
            </g>
          )
        })}
        {sel && selBox && !tool && (
          <g>
            <rect
              x={selBox.x0 * width - 6}
              y={selBox.y0 * height - 6}
              width={(selBox.x1 - selBox.x0) * width + 12}
              height={(selBox.y1 - selBox.y0) * height + 12}
              fill="none"
              stroke={MARK_COLOR}
              strokeWidth={1}
              strokeDasharray="4 3"
              style={{ pointerEvents: 'none' }}
            />
            {handles.map((h) => (
              <rect
                key={h.key}
                x={h.x * width - 5}
                y={h.y * height - 5}
                width={10}
                height={10}
                rx={2}
                fill="#fff"
                stroke={MARK_COLOR}
                strokeWidth={1.5}
                style={{ cursor: h.cursor, pointerEvents: 'all' }}
                onPointerDown={(e) => start(e, h.drag)}
              />
            ))}
          </g>
        )}
      </svg>

      {/* Numbers */}
      {shown.map((m) => {
        const [x, y] = badgeAt(m)
        const isSel = m.id === selectedId
        return (
          <button
            key={m.id}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(isSel ? null : m.id)
            }}
            className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full text-[12px] font-bold inline-flex items-center justify-center shadow"
            style={{
              left: x * width,
              top: y * height,
              background: m.status === 'done' ? '#7a7f7c' : MARK_COLOR,
              color: '#fff',
              border: `2px solid ${isSel ? '#111' : '#fff'}`,
              pointerEvents: 'auto',
            }}
            title={m.note || `${KIND_LABEL[m.kind]} ${m.n}`}
          >
            {m.n}
          </button>
        )
      })}

      {/* The note, beside the number */}
      {sel && notePos && !drag && (
        <div
          className="absolute w-[232px] rounded-xl border p-2 shadow-2xl"
          style={{ left: notePos.left, top: notePos.top, background: 'var(--chrome-2)', borderColor: 'var(--line)', pointerEvents: 'auto' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-1 text-[12px]" style={{ color: 'var(--muted)' }}>
            <span>
              <b style={{ color: MARK_COLOR }}>{sel.n}</b> · {KIND_LABEL[sel.kind]}
            </span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => onDone(sel.id)} className="px-1.5 h-6 rounded hover:text-[color:var(--ink)]">
                {sel.status === 'done' ? 'Reopen' : 'Done'}
              </button>
              <button type="button" onClick={() => onDelete(sel.id)} className="px-1.5 h-6 rounded hover:text-[color:var(--err)]">
                Delete
              </button>
            </span>
          </div>
          <textarea
            ref={noteRef}
            rows={2}
            value={sel.note}
            onChange={(e) => onNote(sel.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault()
                onSelect(null)
              }
            }}
            placeholder="What should happen here? (optional)"
            className="w-full resize-none bg-transparent outline-none text-[13px] leading-snug"
            style={{ color: 'var(--ink)' }}
          />
        </div>
      )}
    </div>
  )
}
