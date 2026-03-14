'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

interface Stroke {
  points: [number, number][]
  color: string
  width: number
  tool: 'pen' | 'eraser'
}

export interface WhiteboardData {
  strokes: Stroke[]
  width: number
  height: number
}

interface WhiteboardEditorProps {
  isOpen: boolean
  initialData?: string  // JSON string of WhiteboardData
  onSave: (dataJson: string) => void
  onClose: () => void
}

const COLORS = [
  '#1a1a1a', '#ffffff', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899',
]

const SIZES = [2, 4, 8, 16]

export function WhiteboardEditor({ isOpen, initialData, onSave, onClose }: WhiteboardEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [undoneStrokes, setUndoneStrokes] = useState<Stroke[]>([])
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null)
  const [color, setColor] = useState('#1a1a1a')
  const [brushSize, setBrushSize] = useState(4)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [showColors, setShowColors] = useState(false)
  const isDrawing = useRef(false)
  const canvasSize = useRef({ width: 0, height: 0 })

  // Load initial data
  useEffect(() => {
    if (initialData) {
      try {
        const data: WhiteboardData = JSON.parse(initialData)
        if (data.strokes) setStrokes(data.strokes)
      } catch {
        // Invalid data, start fresh
      }
    }
  }, [initialData])

  // Set up canvas and redraw
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
      canvasSize.current = { width: rect.width, height: rect.height }

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      redraw(ctx, strokes)
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [isOpen, strokes])

  const redraw = useCallback((ctx: CanvasRenderingContext2D, allStrokes: Stroke[]) => {
    const { width, height } = canvasSize.current
    ctx.clearRect(0, 0, width, height)

    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    // Subtle grid
    ctx.strokeStyle = '#f0f0f0'
    ctx.lineWidth = 0.5
    const gridSize = 24
    for (let x = gridSize; x < width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = gridSize; y < height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    for (const stroke of allStrokes) {
      drawStroke(ctx, stroke)
    }
  }, [])

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length < 2) return

    ctx.beginPath()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = stroke.color
    }

    ctx.lineWidth = stroke.width

    // Smooth curve through points
    const pts = stroke.points
    ctx.moveTo(pts[0][0], pts[0][1])

    if (pts.length === 2) {
      ctx.lineTo(pts[1][0], pts[1][1])
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i][0] + pts[i + 1][0]) / 2
        const midY = (pts[i][1] + pts[i + 1][1]) / 2
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY)
      }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
    }

    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  const getPoint = (e: React.TouchEvent | React.MouseEvent): [number, number] => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    const rect = canvas.getBoundingClientRect()

    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0]
      return [touch.clientX - rect.left, touch.clientY - rect.top]
    }
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    isDrawing.current = true
    const point = getPoint(e)
    const stroke: Stroke = {
      points: [point],
      color,
      width: tool === 'eraser' ? brushSize * 4 : brushSize,
      tool,
    }
    setCurrentStroke(stroke)
    setUndoneStrokes([]) // Clear redo stack on new stroke
  }

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    if (!isDrawing.current || !currentStroke) return
    const point = getPoint(e)

    const updated = {
      ...currentStroke,
      points: [...currentStroke.points, point] as [number, number][],
    }
    setCurrentStroke(updated)

    // Live draw the current stroke
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      redraw(ctx, strokes)
      drawStroke(ctx, updated)
    }
  }

  const stopDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    if (!isDrawing.current || !currentStroke) return
    isDrawing.current = false

    if (currentStroke.points.length > 1) {
      setStrokes((prev) => [...prev, currentStroke])
    }
    setCurrentStroke(null)
  }

  const handleUndo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setUndoneStrokes((u) => [...u, last])
      return prev.slice(0, -1)
    })
  }

  const handleRedo = () => {
    setUndoneStrokes((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setStrokes((s) => [...s, last])
      return prev.slice(0, -1)
    })
  }

  const handleClear = () => {
    setStrokes([])
    setUndoneStrokes([])
  }

  const handleSave = () => {
    const data: WhiteboardData = {
      strokes,
      width: canvasSize.current.width,
      height: canvasSize.current.height,
    }
    onSave(JSON.stringify(data))
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ colorScheme: 'light' }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: '#171717',
          borderBottom: '1px solid #262626',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{ fontSize: 14, color: '#a3a3a3', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#d4d4d4' }}>Whiteboard</span>
        <button
          onClick={handleSave}
          style={{ fontSize: 14, fontWeight: 500, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Save
        </button>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: '#fafafa',
          borderBottom: '1px solid #e5e5e5',
          flexShrink: 0,
          overflow: 'auto',
        }}
      >
        {/* Pen / Eraser */}
        <button
          onClick={() => setTool('pen')}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            background: tool === 'pen' ? '#e5e5e5' : 'transparent',
            color: '#404040',
          }}
        >
          Pen
        </button>
        <button
          onClick={() => setTool('eraser')}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            background: tool === 'eraser' ? '#e5e5e5' : 'transparent',
            color: '#404040',
          }}
        >
          Eraser
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: '#e5e5e5' }} />

        {/* Color picker */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowColors(!showColors)}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              background: color,
              border: `2px solid ${color === '#ffffff' ? '#d4d4d4' : color}`,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}
          />
          {showColors && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 6,
                display: 'flex',
                gap: 4,
                padding: 6,
                background: '#fff',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 10,
              }}
            >
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { setColor(c); setShowColors(false); setTool('pen'); }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: c,
                    border: c === color ? '2px solid #3b82f6' : `2px solid ${c === '#ffffff' ? '#d4d4d4' : c}`,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: '#e5e5e5' }} />

        {/* Brush sizes */}
        {SIZES.map((s) => (
          <button
            key={s}
            onClick={() => setBrushSize(s)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: brushSize === s ? '#e5e5e5' : 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: Math.min(s + 2, 14),
                height: Math.min(s + 2, 14),
                borderRadius: '50%',
                background: '#404040',
              }}
            />
          </button>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Undo/Redo/Clear */}
        <button
          onClick={handleUndo}
          disabled={strokes.length === 0}
          style={{
            padding: '6px 8px',
            borderRadius: 6,
            fontSize: 12,
            border: 'none',
            cursor: strokes.length > 0 ? 'pointer' : 'default',
            background: 'transparent',
            color: strokes.length > 0 ? '#404040' : '#d4d4d4',
          }}
        >
          Undo
        </button>
        <button
          onClick={handleRedo}
          disabled={undoneStrokes.length === 0}
          style={{
            padding: '6px 8px',
            borderRadius: 6,
            fontSize: 12,
            border: 'none',
            cursor: undoneStrokes.length > 0 ? 'pointer' : 'default',
            background: 'transparent',
            color: undoneStrokes.length > 0 ? '#404040' : '#d4d4d4',
          }}
        >
          Redo
        </button>
        <button
          onClick={handleClear}
          disabled={strokes.length === 0}
          style={{
            padding: '6px 8px',
            borderRadius: 6,
            fontSize: 12,
            border: 'none',
            cursor: strokes.length > 0 ? 'pointer' : 'default',
            background: 'transparent',
            color: strokes.length > 0 ? '#ef4444' : '#d4d4d4',
          }}
        >
          Clear
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{ flex: 1, background: '#ffffff', touchAction: 'none', position: 'relative' }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{
            position: 'absolute',
            inset: 0,
            cursor: tool === 'eraser' ? 'cell' : 'crosshair',
          }}
        />
      </div>
    </div>
  )
}
