'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { WhiteboardData } from './WhiteboardEditor'

const WhiteboardEditor = dynamic(
  () => import('./WhiteboardEditor').then(mod => ({ default: mod.WhiteboardEditor })),
  { ssr: false }
)

interface WhiteboardPreviewProps {
  snapshotJson: string
  whiteboardId: string
  onUpdate?: (whiteboardId: string, newSnapshot: string) => void
}

function drawThumbnail(canvas: HTMLCanvasElement, data: WhiteboardData) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const displayW = canvas.clientWidth
  const displayH = canvas.clientHeight
  canvas.width = displayW * dpr
  canvas.height = displayH * dpr
  ctx.scale(dpr, dpr)

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, displayW, displayH)

  if (data.strokes.length === 0) return

  // Find bounding box of all strokes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const stroke of data.strokes) {
    for (const [x, y] of stroke.points) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  const contentW = maxX - minX || 1
  const contentH = maxY - minY || 1
  const padding = 12
  const scaleX = (displayW - padding * 2) / contentW
  const scaleY = (displayH - padding * 2) / contentH
  const scale = Math.min(scaleX, scaleY, 1) // Don't upscale
  const offsetX = padding + (displayW - padding * 2 - contentW * scale) / 2
  const offsetY = padding + (displayH - padding * 2 - contentH * scale) / 2

  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)
  ctx.translate(-minX, -minY)

  for (const stroke of data.strokes) {
    if (stroke.points.length < 2) continue
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

  ctx.restore()
}

export function WhiteboardPreview({ snapshotJson, whiteboardId, onUpdate }: WhiteboardPreviewProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const data: WhiteboardData | null = (() => {
    try {
      return JSON.parse(snapshotJson)
    } catch {
      return null
    }
  })()

  const strokeCount = data?.strokes?.length ?? 0

  useEffect(() => {
    if (!canvasRef.current || !data || strokeCount === 0) return
    drawThumbnail(canvasRef.current, data)
  }, [snapshotJson, strokeCount, data])

  return (
    <>
      <button
        onClick={() => setIsEditorOpen(true)}
        className="group block w-full rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
      >
        {strokeCount > 0 ? (
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: 120, display: 'block' }}
          />
        ) : (
          <div className="flex items-center justify-center h-[80px] bg-neutral-50 dark:bg-neutral-800/50">
            <span className="text-xs text-neutral-400">Empty whiteboard</span>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-200 dark:border-neutral-700">
          <svg className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
          </svg>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {strokeCount > 0 ? `${strokeCount} stroke${strokeCount !== 1 ? 's' : ''}` : 'Empty'}
            {' \u00B7 Tap to edit'}
          </span>
        </div>
      </button>

      {isEditorOpen && (
        <WhiteboardEditor
          isOpen={true}
          initialData={snapshotJson}
          onSave={(newData) => {
            setIsEditorOpen(false)
            if (onUpdate) onUpdate(whiteboardId, newData)
          }}
          onClose={() => setIsEditorOpen(false)}
        />
      )}
    </>
  )
}
