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

// ===== COMPONENT =====

export function WhiteboardEditor({ isOpen, initialData, onSave, onClose }: WhiteboardEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Canvas state
  const [objects, setObjects] = useState<CanvasObject[]>([])
  const [undoStack, setUndoStack] = useState<CanvasObject[][]>([])
  const [redoStack, setRedoStack] = useState<CanvasObject[][]>([])

  // Tool state
  const [activeTool, setActiveTool] = useState<'pen' | 'eraser' | 'sticky' | 'pan'>('pen')
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
    currentStroke: StrokeObj | null
    panStart: Point | null
    viewStart: Point | null
    editingStickyId: string | null
  }>({
    drawing: false, panning: false, currentStroke: null,
    panStart: null, viewStart: null, editingStickyId: null,
  })

  const [editingStickyId, setEditingStickyId] = useState<string | null>(null)
  const canvasSize = useRef({ w: 0, h: 0 })

  // Load initial data
  useEffect(() => {
    if (!initialData) return
    try {
      const data: WhiteboardData = JSON.parse(initialData)
      if (data.objects) setObjects(data.objects)
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

    // Draw objects
    ctx.save()
    ctx.translate(v.x, v.y)
    ctx.scale(v.zoom, v.zoom)

    for (const obj of objects) {
      if (obj.type === 'stroke') drawStroke(ctx, obj)
      else if (obj.type === 'sticky') drawSticky(ctx, obj)
    }

    // Draw current stroke in progress
    if (drawState.current.currentStroke) {
      drawStroke(ctx, drawState.current.currentStroke)
    }

    ctx.restore()
  }, [objects])

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

    if (activeTool === 'pan') {
      ds.panning = true
      ds.panStart = sp
      ds.viewStart = { x: viewRef.current.x, y: viewRef.current.y }
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

    if (ds.drawing && ds.currentStroke) {
      if (ds.currentStroke.points.length > 1) {
        pushUndo()
        setObjects(prev => [...prev, ds.currentStroke!])
      }
      ds.drawing = false
      ds.currentStroke = null
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
    setUndoStack(prev => [...prev.slice(-50), objects])
  }

  const handleUndo = () => {
    if (undoStack.length === 0) return
    setRedoStack(prev => [...prev, objects])
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    setObjects(prev)
  }

  const handleRedo = () => {
    if (redoStack.length === 0) return
    setUndoStack(prev => [...prev, objects])
    const next = redoStack[redoStack.length - 1]
    setRedoStack(s => s.slice(0, -1))
    setObjects(next)
  }

  // ===== STICKY EDITING =====

  const editingSticky = editingStickyId ? objects.find(o => o.id === editingStickyId && o.type === 'sticky') as StickyObj | undefined : undefined

  const updateStickyText = (text: string) => {
    setObjects(prev => prev.map(o => o.id === editingStickyId ? { ...o, text } as StickyObj : o))
  }

  // ===== SAVE =====

  const handleSave = () => {
    const data: WhiteboardData = {
      objects,
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#171717', borderBottom: '1px solid #262626', flexShrink: 0 }}>
        <button onClick={onClose} style={{ fontSize: 14, color: '#a3a3a3', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#d4d4d4' }}>Whiteboard</span>
        <button onClick={handleSave} style={{ fontSize: 14, fontWeight: 500, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>Save</button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#fafafa', borderBottom: '1px solid #e5e5e5', flexShrink: 0, overflowX: 'auto' }}>
        {/* Tools */}
        {(['pen', 'eraser', 'sticky', 'pan'] as const).map(t => (
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
            {t === 'pen' ? 'Pen' : t === 'eraser' ? 'Eraser' : t === 'sticky' ? 'Sticky' : 'Pan'}
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

        {/* Zoom indicator */}
        <span style={{ fontSize: 11, color: '#a3a3a3', marginRight: 4, whiteSpace: 'nowrap' }}>{zoomPct}%</span>

        {/* Undo/Redo */}
        <button onClick={handleUndo} disabled={undoStack.length === 0} style={{ padding: '4px 6px', borderRadius: 6, fontSize: 11, border: 'none', cursor: undoStack.length > 0 ? 'pointer' : 'default', background: 'transparent', color: undoStack.length > 0 ? '#404040' : '#d4d4d4' }}>Undo</button>
        <button onClick={handleRedo} disabled={redoStack.length === 0} style={{ padding: '4px 6px', borderRadius: 6, fontSize: 11, border: 'none', cursor: redoStack.length > 0 ? 'pointer' : 'default', background: 'transparent', color: redoStack.length > 0 ? '#404040' : '#d4d4d4' }}>Redo</button>
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
          style={{ position: 'absolute', inset: 0, cursor: activeTool === 'pan' ? 'grab' : activeTool === 'eraser' ? 'cell' : activeTool === 'sticky' ? 'crosshair' : 'crosshair' }}
        />

        {/* Sticky note text editor overlay */}
        {editingSticky && (() => {
          const sp = worldToScreen(editingSticky.x, editingSticky.y)
          const z = viewRef.current.zoom
          return (
            <div style={{ position: 'absolute', left: sp.x, top: sp.y, width: editingSticky.width * z, height: editingSticky.height * z, zIndex: 10 }}>
              <textarea
                autoFocus
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
