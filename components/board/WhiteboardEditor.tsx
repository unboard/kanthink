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
  onSave: (dataJson: string, snapshotDataUrl?: string) => void
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
  const undoStackRef = useRef<CanvasObject[][]>([])
  const redoStackRef = useRef<CanvasObject[][]>([])
  const [, forceUndoRender] = useState(0)

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

    // Draw selection bounding box
    if (selectedId) {
      const sel = objectsRef.current.find(o => o.id === selectedId)
      if (sel) {
        let bx = 0, by = 0, bw = 0, bh = 0
        if (sel.type === 'sticky') {
          bx = sel.x; by = sel.y; bw = sel.width; bh = sel.height
        } else if (sel.type === 'stroke' && sel.points.length > 0) {
          let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
          for (const p of sel.points) {
            if (p.x < x1) x1 = p.x; if (p.y < y1) y1 = p.y
            if (p.x > x2) x2 = p.x; if (p.y > y2) y2 = p.y
          }
          const pad = sel.width
          bx = x1 - pad; by = y1 - pad; bw = x2 - x1 + pad * 2; bh = y2 - y1 + pad * 2
        }
        if (bw > 0 && bh > 0) {
          ctx.strokeStyle = '#3b82f6'
          ctx.lineWidth = 1.5 / v.zoom
          ctx.setLineDash([4 / v.zoom, 4 / v.zoom])
          ctx.strokeRect(bx, by, bw, bh)
          ctx.setLineDash([])

          // Corner handles
          const hs = 6 / v.zoom
          const corners = [
            [bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh],
          ]
          for (const [cx, cy] of corners) {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs)
            ctx.strokeStyle = '#3b82f6'
            ctx.lineWidth = 1.5 / v.zoom
            ctx.strokeRect(cx - hs / 2, cy - hs / 2, hs, hs)
          }
        }
      }
    }

    ctx.restore()
  }, []) // No dependency on objects — reads from ref

  const drawStroke = (ctx: CanvasRenderingContext2D, s: StrokeObj, snapshotMode = false) => {
    if (s.points.length < 2) return
    ctx.beginPath()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (s.tool === 'eraser') {
      if (snapshotMode) {
        // In snapshot mode, draw erasers as background color (avoid transparent holes)
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = '#f8f8f8'
      } else {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
      }
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
    redoStackRef.current = []
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
    undoStackRef.current = [...undoStackRef.current.slice(-50), [...objectsRef.current]]
    forceUndoRender(n => n + 1)
  }

  const handleUndo = () => {
    if (undoStackRef.current.length === 0) return
    redoStackRef.current = [...redoStackRef.current, [...objectsRef.current]]
    const prev = undoStackRef.current[undoStackRef.current.length - 1]
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    setObjects(prev)
    forceUndoRender(n => n + 1)
    requestAnimationFrame(redraw)
  }

  const handleRedo = () => {
    if (redoStackRef.current.length === 0) return
    undoStackRef.current = [...undoStackRef.current, [...objectsRef.current]]
    const next = redoStackRef.current[redoStackRef.current.length - 1]
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    setObjects(next)
    forceUndoRender(n => n + 1)
    requestAnimationFrame(redraw)
  }

  // ===== STICKY EDITING =====

  const editingSticky = editingStickyId ? objects.find(o => o.id === editingStickyId && o.type === 'sticky') as StickyObj | undefined : undefined

  const updateStickyText = (text: string) => {
    setObjects(prev => prev.map(o => o.id === editingStickyId ? { ...o, text } as StickyObj : o))
  }

  // ===== SAVE =====

  const handleSave = () => {
    const objs = objectsRef.current
    const data: WhiteboardData = {
      objects: objs,
      viewX: viewRef.current.x,
      viewY: viewRef.current.y,
      zoom: viewRef.current.zoom,
    }

    // Generate a snapshot image of the whiteboard content
    let snapshotUrl: string | undefined
    if (objs.length > 0) {
      try {
        const snapCanvas = document.createElement('canvas')
        const snapW = 600, snapH = 400
        snapCanvas.width = snapW
        snapCanvas.height = snapH
        const ctx = snapCanvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#f8f8f8'
          ctx.fillRect(0, 0, snapW, snapH)

          // Find bounding box
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
          for (const obj of objs) {
            if (!obj) continue
            if (obj.type === 'stroke') {
              for (const p of obj.points) {
                if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
                if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
              }
            } else if (obj.type === 'sticky') {
              if (obj.x < minX) minX = obj.x; if (obj.y < minY) minY = obj.y
              if (obj.x + obj.width > maxX) maxX = obj.x + obj.width
              if (obj.y + obj.height > maxY) maxY = obj.y + obj.height
            }
          }

          const cw = maxX - minX || 1
          const ch = maxY - minY || 1
          const pad = 20
          const scale = Math.min((snapW - pad * 2) / cw, (snapH - pad * 2) / ch, 2)
          const ox = pad + (snapW - pad * 2 - cw * scale) / 2
          const oy = pad + (snapH - pad * 2 - ch * scale) / 2

          ctx.save()
          ctx.translate(ox, oy)
          ctx.scale(scale, scale)
          ctx.translate(-minX, -minY)

          for (const obj of objs) {
            if (!obj || !obj.type) continue
            if (obj.type === 'stroke') drawStroke(ctx, obj, true)
            else if (obj.type === 'sticky') drawSticky(ctx, obj)
          }
          ctx.restore()

          snapshotUrl = snapCanvas.toDataURL('image/png')
        }
      } catch { /* snapshot is optional */ }
    }

    onSave(JSON.stringify(data), snapshotUrl)
  }

  if (!isOpen) return null

  const zoomPct = Math.round(viewRef.current.zoom * 100)
  const hasUndo = undoStackRef.current.length > 0
  const hasRedo = redoStackRef.current.length > 0

  const toolIcons: Record<string, React.ReactNode> = {
    select: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>,
    pen: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18"/></svg>,
    eraser: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 20H7L3 16l9-9 8 8-4 4"/><path d="M6.5 13.5l5-5"/></svg>,
    sticky: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15.5 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V8.5L15.5 3z"/><path d="M14 3v6h6"/></svg>,
    pan: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 11V6a2 2 0 00-4 0v6"/><path d="M14 10V4a2 2 0 00-4 0v7"/><path d="M10 10.5V5a2 2 0 00-4 0v9"/><path d="M18 11a2 2 0 014 0v3a8 8 0 01-8 8h-2c-2.8 0-4.5-.9-5.7-2.4L3.7 16a2 2 0 013-2.6l.3.3"/></svg>,
  }

  const ToolBtn = ({ t }: { t: string }) => (
    <button
      onClick={() => { setActiveTool(t as any); setShowColorPicker(false); setEditingStickyId(null); }}
      style={{
        width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', cursor: 'pointer',
        background: activeTool === t ? '#e5e5e5' : 'transparent',
        color: activeTool === t ? '#1a1a1a' : '#737373',
      }}
      title={t[0].toUpperCase() + t.slice(1)}
    >
      {toolIcons[t]}
    </button>
  )

  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: '#fafafa', position: 'relative', zIndex: 5 }}
      onTouchStart={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
    >
      {/* Undo/Redo */}
      <button onClick={handleUndo} disabled={!hasUndo} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: hasUndo ? 'pointer' : 'default', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hasUndo ? '#404040' : '#d4d4d4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 0 1 15.36-6.36L21 9"/></svg>
      </button>
      <button onClick={handleRedo} disabled={!hasRedo} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: hasRedo ? 'pointer' : 'default', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hasRedo ? '#404040' : '#d4d4d4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 0 0-15.36-6.36L3 9"/></svg>
      </button>

      {selectedId && (
        <button onClick={() => { pushUndo(); setObjects(prev => prev.filter(o => o.id !== selectedId)); setSelectedId(null); requestAnimationFrame(redraw); }}
          style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
        </button>
      )}

      <div style={{ width: 1, height: 24, background: '#e5e5e5', flexShrink: 0, margin: '0 2px' }} />

      {/* Tools */}
      {['select', 'pen', 'eraser', 'sticky', 'pan'].map(t => <ToolBtn key={t} t={t} />)}

      <div style={{ width: 1, height: 24, background: '#e5e5e5', flexShrink: 0, margin: '0 2px' }} />

      {/* Color swatch */}
      <div style={{ position: 'relative' }}>
        <button onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
          style={{ width: 24, height: 24, borderRadius: 12, background: color, border: `2px solid ${color === '#ffffff' ? '#d4d4d4' : color}`, cursor: 'pointer' }} />
        {showColorPicker && (
          <div onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4, padding: 8, background: '#fff', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', zIndex: 20 }}>
            {COLORS.map(c => (
              <button key={c} onClick={e => { e.stopPropagation(); setColor(c); setShowColorPicker(false); if (activeTool !== 'pen') setActiveTool('pen'); }}
                style={{ width: 28, height: 28, borderRadius: 14, background: c, border: c === color ? '2.5px solid #3b82f6' : `1.5px solid ${c === '#ffffff' ? '#d4d4d4' : 'transparent'}`, cursor: 'pointer' }} />
            ))}
          </div>
        )}
      </div>

      {/* Sizes */}
      {SIZES.map(s => (
        <button key={s} onClick={() => setBrushSize(s)}
          style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: brushSize === s ? '#e5e5e5' : 'transparent', border: 'none', cursor: 'pointer' }}>
          <div style={{ width: Math.min(s + 2, 12), height: Math.min(s + 2, 12), borderRadius: '50%', background: '#404040' }} />
        </button>
      ))}

      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 10, color: '#a3a3a3', whiteSpace: 'nowrap' }}>{zoomPct}%</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ colorScheme: 'light' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#171717', borderBottom: '1px solid #262626', flexShrink: 0, position: 'relative', zIndex: 5 }}>
        <button onClick={onClose} style={{ fontSize: 14, color: '#a3a3a3', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#d4d4d4' }}>Whiteboard</span>
        <button onClick={handleSave} style={{ fontSize: 14, fontWeight: 500, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>Save</button>
      </div>

      {/* Desktop toolbar (top) — hidden on small screens */}
      <div className="hidden sm:block" style={{ borderBottom: '1px solid #e5e5e5' }}>
        {toolbar}
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

      {/* Mobile toolbar (bottom) — visible only on small screens */}
      <div className="sm:hidden" style={{ borderTop: '1px solid #e5e5e5', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {toolbar}
      </div>
    </div>
  )
}
