'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

// ===== DATA TYPES =====

interface Point { x: number; y: number }

interface StrokeObj {
  type: 'stroke'
  id: string
  points: Point[]
  color: string
  width: number
  tool: 'pen' | 'eraser'
}

interface StickyObj {
  type: 'sticky'
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  color: string
}

type CanvasObject = StrokeObj | StickyObj

export interface WhiteboardData {
  objects: CanvasObject[]
  viewX: number
  viewY: number
  zoom: number
}

// ===== PROPS =====

interface WhiteboardEditorProps {
  isOpen: boolean
  initialData?: string
  onSave: (dataJson: string) => void
  onClose: () => void
}

// ===== CONSTANTS =====

const COLORS = ['#1a1a1a', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']
const STICKY_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa']
const SIZES = [2, 4, 8, 16]

let _idCounter = 0
function uid() { return `obj_${Date.now()}_${++_idCounter}` }

// ===== WHITEBOARD TEXT DESCRIPTION (for AI context) =====

export function describeWhiteboard(dataJson: string): string {
  try {
    const data: WhiteboardData = JSON.parse(dataJson)
    if (!data.objects || data.objects.length === 0) return '[Empty whiteboard]'

    const parts: string[] = []
    const strokes = data.objects.filter(o => o?.type === 'stroke')
    const stickies = data.objects.filter(o => o?.type === 'sticky') as StickyObj[]

    if (strokes.length > 0) {
      const colors = [...new Set(strokes.map(s => (s as StrokeObj).color))]
      parts.push(`${strokes.length} drawn stroke${strokes.length !== 1 ? 's' : ''} (colors: ${colors.join(', ')})`)
    }

    if (stickies.length > 0) {
      const notes = stickies.map(s => s.text ? `"${s.text}"` : '(empty)').join(', ')
      parts.push(`${stickies.length} sticky note${stickies.length !== 1 ? 's' : ''}: ${notes}`)
    }

    return `[Whiteboard: ${parts.join('; ')}]`
  } catch {
    return '[Whiteboard: unable to read]'
  }
}

// ===== COMPONENT =====

export function WhiteboardEditor({ isOpen, initialData, onSave, onClose }: WhiteboardEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Canvas state — objects stored in ref for immediate access during drawing,
  // plus React state for UI reactivity (save, sticky editing)
  const objectsRef = useRef<CanvasObject[]>([])
  const [objects, setObjectsState] = useState<CanvasObject[]>([])
  const setObjects = useCallback((updater: CanvasObject[] | ((prev: CanvasObject[]) => CanvasObject[])) => {
    const next = typeof updater === 'function' ? updater(objectsRef.current) : updater
    objectsRef.current = next
    setObjectsState(next)
  }, [])
  const [undoStack, setUndoStack] = useState<CanvasObject[][]>([])
  const [redoStack, setRedoStack] = useState<CanvasObject[][]>([])

  // Tool state
  const [activeTool, setActiveTool] = useState<'pen' | 'eraser' | 'sticky' | 'pan' | 'select'>('pen')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [color, setColor] = useState('#1a1a1a')
  const [brushSize, setBrushSize] = useState(4)
  const [showColorPicker, setShowColorPicker] = useState(false)

  // View transform (infinite canvas)
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 })
  const [, forceRender] = useState(0)

  // Drawing state
  const drawState = useRef<{
    drawing: boolean
    panning: boolean
    dragging: boolean
    currentStroke: StrokeObj | null
    panStart: Point | null
    viewStart: Point | null
    editingStickyId: string | null
    dragStart: Point | null
    dragObjStart: Point | null
  }>({
    drawing: false, panning: false, dragging: false, currentStroke: null,
    panStart: null, viewStart: null, editingStickyId: null,
    dragStart: null, dragObjStart: null,
  })

  const [editingStickyId, setEditingStickyId] = useState<string | null>(null)
  const canvasSize = useRef({ w: 0, h: 0 })

  // Load initial data
  useEffect(() => {
    if (!initialData) return
    try {
      const data: WhiteboardData = JSON.parse(initialData)
      if (Array.isArray(data.objects)) {
        const filtered = data.objects.filter(Boolean)
        objectsRef.current = filtered
        setObjectsState(filtered)
      }
      if (data.viewX !== undefined) viewRef.current.x = data.viewX
      if (data.viewY !== undefined) viewRef.current.y = data.viewY
      if (data.zoom !== undefined) viewRef.current.zoom = data.zoom
    } catch { /* start fresh */ }
  }, [initialData])

  // ===== COORDINATE TRANSFORMS =====

  const screenToWorld = useCallback((sx: number, sy: number): Point => {
    const v = viewRef.current
    return { x: (sx - v.x) / v.zoom, y: (sy - v.y) / v.zoom }
  }, [])

  const worldToScreen = useCallback((wx: number, wy: number): Point => {
    const v = viewRef.current
    return { x: wx * v.zoom + v.x, y: wy * v.zoom + v.y }
  }, [])

  // ===== DRAWING =====

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { w, h } = canvasSize.current
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // Background
    ctx.fillStyle = '#f8f8f8'
    ctx.fillRect(0, 0, w, h)

    const v = viewRef.current

    // Grid (in world space)
    const gridSize = 32
    ctx.strokeStyle = '#e8e8e8'
    ctx.lineWidth = 0.5

    const startWX = Math.floor(-v.x / v.zoom / gridSize) * gridSize
    const startWY = Math.floor(-v.y / v.zoom / gridSize) * gridSize
    const endWX = startWX + w / v.zoom + gridSize
    const endWY = startWY + h / v.zoom + gridSize

    for (let wx = startWX; wx < endWX; wx += gridSize) {
      const sx = wx * v.zoom + v.x
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke()
    }
    for (let wy = startWY; wy < endWY; wy += gridSize) {
      const sy = wy * v.zoom + v.y
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke()
    }

    // Draw objects from ref (always current)
    ctx.save()
    ctx.translate(v.x, v.y)
    ctx.scale(v.zoom, v.zoom)

    for (const obj of objectsRef.current) {
      if (!obj || !obj.type) continue
      if (obj.type === 'stroke') drawStroke(ctx, obj)
      else if (obj.type === 'sticky') drawSticky(ctx, obj)
    }

    // Draw current stroke in progress
    if (drawState.current.currentStroke) {
      drawStroke(ctx, drawState.current.currentStroke)
    }

    ctx.restore()
  }, []) // No dependency on objects — reads from ref

  const drawStroke = (ctx: CanvasRenderingContext2D, s: StrokeObj) => {
    if (s.points.length < 2) return
    ctx.beginPath()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = s.color
    }
    ctx.lineWidth = s.width

    const pts = s.points
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  const drawSticky = (ctx: CanvasRenderingContext2D, s: StickyObj) => {
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.08)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 2

    // Card
    ctx.fillStyle = s.color
    const r = 4
    ctx.beginPath()
    ctx.moveTo(s.x + r, s.y)
    ctx.lineTo(s.x + s.width - r, s.y)
    ctx.quadraticCurveTo(s.x + s.width, s.y, s.x + s.width, s.y + r)
    ctx.lineTo(s.x + s.width, s.y + s.height - r)
    ctx.quadraticCurveTo(s.x + s.width, s.y + s.height, s.x + s.width - r, s.y + s.height)
    ctx.lineTo(s.x + r, s.y + s.height)
    ctx.quadraticCurveTo(s.x, s.y + s.height, s.x, s.y + s.height - r)
    ctx.lineTo(s.x, s.y + r)
    ctx.quadraticCurveTo(s.x, s.y, s.x + r, s.y)
    ctx.closePath()
    ctx.fill()

    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    // Text
    if (s.text) {
      ctx.fillStyle = '#1a1a1a'
      ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.textBaseline = 'top'
      const padding = 10
      const maxW = s.width - padding * 2
      const lines = wrapText(ctx, s.text, maxW)
      lines.forEach((line, i) => {
        ctx.fillText(line, s.x + padding, s.y + padding + i * 18)
      })
    }
  }

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
    const words = text.split(' ')
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const test = current ? current + ' ' + word : word
      if (ctx.measureText(test).width > maxW && current) {
        lines.push(current)
        current = word
      } else {
        current = test
      }
    }
    if (current) lines.push(current)
    return lines.length > 0 ? lines : ['']
  }

  // ===== RESIZE =====

  useEffect(() => {
    if (!isOpen) return
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      canvasSize.current = { w: rect.width, h: rect.height }
      redraw()
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [isOpen, redraw])

  // Redraw when objects change
  useEffect(() => { redraw() }, [objects, redraw])

  // ===== INPUT HANDLERS =====

  const getEventPoint = (e: React.TouchEvent | React.MouseEvent): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0]
      return { x: t.clientX - rect.left, y: t.clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handlePointerDown = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    setShowColorPicker(false)
    const sp = getEventPoint(e)
    const ds = drawState.current

    // Two-finger touch = always pan
    const isTwoFinger = 'touches' in e && e.touches.length >= 2
    if (activeTool === 'pan' || isTwoFinger) {
      ds.panning = true
      ds.panStart = sp
      ds.viewStart = { x: viewRef.current.x, y: viewRef.current.y }
      return
    }

    if (activeTool === 'select') {
      const wp = screenToWorld(sp.x, sp.y)
      // Hit test stickies (reverse order = top first)
      const hit = [...objectsRef.current].reverse().find(o => {
        if (o.type === 'sticky') {
          return wp.x >= o.x && wp.x <= o.x + o.width && wp.y >= o.y && wp.y <= o.y + o.height
        }
        if (o.type === 'stroke' && o.points.length > 0) {
          // Simple proximity check for strokes
          return o.points.some(p => Math.hypot(p.x - wp.x, p.y - wp.y) < o.width * 2 + 8)
        }
        return false
      })
      if (hit) {
        setSelectedId(hit.id)
        ds.dragging = true
        ds.dragStart = wp
        if (hit.type === 'sticky') {
          ds.dragObjStart = { x: hit.x, y: hit.y }
        } else if (hit.type === 'stroke' && hit.points.length > 0) {
          ds.dragObjStart = { x: hit.points[0].x, y: hit.points[0].y }
        }
      } else {
        setSelectedId(null)
      }
      return
    }

    if (activeTool === 'sticky') {
      // Check if tapping an existing sticky
      const wp = screenToWorld(sp.x, sp.y)
      const hit = [...objects].reverse().find(o =>
        o.type === 'sticky' && wp.x >= o.x && wp.x <= o.x + o.width && wp.y >= o.y && wp.y <= o.y + o.height
      )
      if (hit && hit.type === 'sticky') {
        setEditingStickyId(hit.id)
        return
      }
      // Create new sticky
      pushUndo()
      const sticky: StickyObj = {
        type: 'sticky', id: uid(),
        x: wp.x - 75, y: wp.y - 50,
        width: 150, height: 100,
        text: '', color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)],
      }
      setObjects(prev => [...prev, sticky])
      setEditingStickyId(sticky.id)
      return
    }

    // Pen or eraser
    ds.drawing = true
    const wp = screenToWorld(sp.x, sp.y)
    ds.currentStroke = {
      type: 'stroke', id: uid(),
      points: [wp],
      color,
      width: activeTool === 'eraser' ? brushSize * 4 : brushSize,
      tool: activeTool as 'pen' | 'eraser',
    }
    setRedoStack([])
  }

  const handlePointerMove = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    const sp = getEventPoint(e)
    const ds = drawState.current

    if (ds.panning && ds.panStart && ds.viewStart) {
      viewRef.current.x = ds.viewStart.x + (sp.x - ds.panStart.x)
      viewRef.current.y = ds.viewStart.y + (sp.y - ds.panStart.y)
      redraw()
      return
    }

    if (ds.dragging && selectedId && ds.dragStart && ds.dragObjStart) {
      const wp = screenToWorld(sp.x, sp.y)
      const dx = wp.x - ds.dragStart.x
      const dy = wp.y - ds.dragStart.y
      const obj = objectsRef.current.find(o => o.id === selectedId)
      if (obj?.type === 'sticky') {
        setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, x: ds.dragObjStart!.x + dx, y: ds.dragObjStart!.y + dy } as StickyObj : o))
      } else if (obj?.type === 'stroke') {
        const origFirst = ds.dragObjStart
        const origObj = objectsRef.current.find(o => o.id === selectedId) as StrokeObj | undefined
        if (origObj) {
          // Move all points by the delta from first point
          const firstDx = (ds.dragObjStart.x + dx) - origObj.points[0].x
          const firstDy = (ds.dragObjStart.y + dy) - origObj.points[0].y
          setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, points: (o as StrokeObj).points.map(p => ({ x: p.x + firstDx, y: p.y + firstDy })) } as StrokeObj : o))
        }
      }
      redraw()
      return
    }

    if (ds.drawing && ds.currentStroke) {
      const wp = screenToWorld(sp.x, sp.y)
      ds.currentStroke.points.push(wp)
      redraw()
    }
  }

  const handlePointerUp = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    const ds = drawState.current

    if (ds.panning) {
      ds.panning = false
      ds.panStart = null
      ds.viewStart = null
      return
    }

    if (ds.dragging) {
      ds.dragging = false
      ds.dragStart = null
      ds.dragObjStart = null
      return
    }

    if (ds.drawing && ds.currentStroke) {
      if (ds.currentStroke.points.length > 1) {
        pushUndo()
        setObjects(prev => [...prev, ds.currentStroke!])
      }
      ds.drawing = false
      ds.currentStroke = null
      // Immediate redraw to show persisted stroke
      requestAnimationFrame(redraw)
    }
  }

  // Wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const v = viewRef.current
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(5, v.zoom * zoomFactor))

    // Zoom toward mouse position
    v.x = mx - (mx - v.x) * (newZoom / v.zoom)
    v.y = my - (my - v.y) * (newZoom / v.zoom)
    v.zoom = newZoom

    forceRender(n => n + 1)
    redraw()
  }, [redraw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !isOpen) return
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [isOpen, handleWheel])

  // ===== UNDO/REDO =====

  const pushUndo = () => {
    setUndoStack(prev => [...prev.slice(-50), objectsRef.current])
  }

  const handleUndo = () => {
    if (undoStack.length === 0) return
    setRedoStack(prev => [...prev, objectsRef.current])
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    setObjects(prev)
    requestAnimationFrame(redraw)
  }

  const handleRedo = () => {
    if (redoStack.length === 0) return
    setUndoStack(prev => [...prev, objectsRef.current])
    const next = redoStack[redoStack.length - 1]
    setRedoStack(s => s.slice(0, -1))
    setObjects(next)
    requestAnimationFrame(redraw)
  }

  // ===== STICKY EDITING =====

  const editingSticky = editingStickyId ? objects.find(o => o.id === editingStickyId && o.type === 'sticky') as StickyObj | undefined : undefined

  const updateStickyText = (text: string) => {
    setObjects(prev => prev.map(o => o.id === editingStickyId ? { ...o, text } as StickyObj : o))
  }

  // ===== SAVE =====

  const handleSave = () => {
    const data: WhiteboardData = {
      objects: objectsRef.current,
      viewX: viewRef.current.x,
      viewY: viewRef.current.y,
      zoom: viewRef.current.zoom,
    }
    onSave(JSON.stringify(data))
  }

  if (!isOpen) return null

  const zoomPct = Math.round(viewRef.current.zoom * 100)

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ colorScheme: 'light' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#171717', borderBottom: '1px solid #262626', flexShrink: 0, position: 'relative', zIndex: 5 }}>
        <button onClick={onClose} style={{ fontSize: 14, color: '#a3a3a3', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#d4d4d4' }}>Whiteboard</span>
        <button onClick={handleSave} style={{ fontSize: 14, fontWeight: 500, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>Save</button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#fafafa', borderBottom: '1px solid #e5e5e5', flexShrink: 0, overflowX: 'auto', position: 'relative', zIndex: 5 }}>
        {/* Undo/Redo (left side) */}
        <button onClick={handleUndo} disabled={undoStack.length === 0} style={{ padding: 4, borderRadius: 6, border: 'none', cursor: undoStack.length > 0 ? 'pointer' : 'default', background: 'transparent', display: 'flex', alignItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={undoStack.length > 0 ? '#404040' : '#d4d4d4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 0 1 15.36-6.36L21 9"/></svg>
        </button>
        <button onClick={handleRedo} disabled={redoStack.length === 0} style={{ padding: 4, borderRadius: 6, border: 'none', cursor: redoStack.length > 0 ? 'pointer' : 'default', background: 'transparent', display: 'flex', alignItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={redoStack.length > 0 ? '#404040' : '#d4d4d4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 0 0-15.36-6.36L3 9"/></svg>
        </button>

        <div style={{ width: 1, height: 20, background: '#e5e5e5', flexShrink: 0 }} />

        {/* Tools */}
        {(['select', 'pen', 'eraser', 'sticky', 'pan'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setActiveTool(t); setShowColorPicker(false); setEditingStickyId(null); }}
            style={{
              padding: '5px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: activeTool === t ? '#e5e5e5' : 'transparent',
              color: '#404040', whiteSpace: 'nowrap',
            }}
          >
            {t === 'select' ? 'Select' : t === 'pen' ? 'Pen' : t === 'eraser' ? 'Eraser' : t === 'sticky' ? 'Sticky' : 'Pan'}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: '#e5e5e5', flexShrink: 0 }} />

        {/* Color */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
            style={{ width: 22, height: 22, borderRadius: 11, background: color, border: `2px solid ${color === '#ffffff' ? '#d4d4d4' : color}`, cursor: 'pointer' }}
          />
          {showColorPicker && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6, background: '#fff', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 20, width: 148 }}
            >
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={(e) => { e.stopPropagation(); setColor(c); setShowColorPicker(false); if (activeTool !== 'pen') setActiveTool('pen'); }}
                  style={{ width: 24, height: 24, borderRadius: 12, background: c, border: c === color ? '2px solid #3b82f6' : `1px solid ${c === '#ffffff' ? '#d4d4d4' : 'transparent'}`, cursor: 'pointer' }}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 20, background: '#e5e5e5', flexShrink: 0 }} />

        {/* Sizes */}
        {SIZES.map(s => (
          <button
            key={s}
            onClick={() => setBrushSize(s)}
            style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: brushSize === s ? '#e5e5e5' : 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <div style={{ width: Math.min(s + 2, 14), height: Math.min(s + 2, 14), borderRadius: '50%', background: '#404040' }} />
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Delete selected */}
        {selectedId && (
          <button
            onClick={() => {
              pushUndo()
              setObjects(prev => prev.filter(o => o.id !== selectedId))
              setSelectedId(null)
              requestAnimationFrame(redraw)
            }}
            style={{ padding: 4, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center' }}
            title="Delete selected"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
          </button>
        )}

        {/* Zoom indicator */}
        <span style={{ fontSize: 11, color: '#a3a3a3', marginRight: 4, whiteSpace: 'nowrap' }}>{zoomPct}%</span>

      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, background: '#f8f8f8', touchAction: 'none', position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          style={{ position: 'absolute', inset: 0, cursor: activeTool === 'pan' ? 'grab' : activeTool === 'eraser' ? 'cell' : activeTool === 'select' ? 'default' : 'crosshair' }}
        />

        {/* Sticky note text editor overlay */}
        {editingSticky && (() => {
          const sp = worldToScreen(editingSticky.x, editingSticky.y)
          const z = viewRef.current.zoom
          return (
            <div
              style={{ position: 'absolute', left: sp.x, top: sp.y, width: editingSticky.width * z, height: editingSticky.height * z, zIndex: 10 }}
              onTouchStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <textarea
                autoFocus
                ref={(el) => { if (el) setTimeout(() => el.focus(), 50); }}
                value={editingSticky.text}
                onChange={(e) => updateStickyText(e.target.value)}
                onBlur={() => setEditingStickyId(null)}
                placeholder="Type here..."
                style={{
                  width: '100%', height: '100%',
                  background: editingSticky.color, border: '2px solid #3b82f6',
                  borderRadius: 4 * z, padding: 10 * z,
                  fontSize: 14 * z, lineHeight: '1.3',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  color: '#1a1a1a', resize: 'none', outline: 'none',
                }}
              />
            </div>
          )
        })()}
      </div>
    </div>
  )
}
