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

const thumbImageCache = new Map<string, HTMLImageElement>()

function getThumbCenter(obj: any): { x: number; y: number } | null {
  if (obj.type === 'sticky' || obj.type === 'rect' || obj.type === 'image') {
    return { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 }
  }
  if (obj.type === 'circle') return { x: obj.cx, y: obj.cy }
  if (obj.type === 'emoji') return { x: obj.x + obj.size / 2, y: obj.y + obj.size / 2 }
  if (obj.type === 'stroke' && obj.points?.length > 0) {
    let sx = 0, sy = 0
    for (const p of obj.points) { sx += p.x; sy += p.y }
    return { x: sx / obj.points.length, y: sy / obj.points.length }
  }
  if (obj.type === 'line') return { x: (obj.x1 + obj.x2) / 2, y: (obj.y1 + obj.y2) / 2 }
  return null
}

function drawThumbnail(canvas: HTMLCanvasElement, data: WhiteboardData, onImageLoad?: () => void) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const dw = canvas.clientWidth
  const dh = canvas.clientHeight
  canvas.width = dw * dpr
  canvas.height = dh * dpr
  ctx.scale(dpr, dpr)

  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(0, 0, dw, dh)

  const objs = data.objects?.filter(Boolean)
  if (!objs || objs.length === 0) return

  // Bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const obj of objs) {
    if (!obj || !obj.type) continue
    if (obj.type === 'stroke') {
      for (const p of obj.points) {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
      }
    } else if (obj.type === 'sticky' || obj.type === 'image') {
      if (obj.x < minX) minX = obj.x; if (obj.y < minY) minY = obj.y
      if (obj.x + obj.width > maxX) maxX = obj.x + obj.width
      if (obj.y + obj.height > maxY) maxY = obj.y + obj.height
    } else if (obj.type === 'emoji') {
      if (obj.x < minX) minX = obj.x; if (obj.y < minY) minY = obj.y
      if (obj.x + obj.size > maxX) maxX = obj.x + obj.size
      if (obj.y + obj.size > maxY) maxY = obj.y + obj.size
    } else if (obj.type === 'rect') {
      if (obj.x < minX) minX = obj.x; if (obj.y < minY) minY = obj.y
      if (obj.x + obj.width > maxX) maxX = obj.x + obj.width
      if (obj.y + obj.height > maxY) maxY = obj.y + obj.height
    } else if (obj.type === 'circle') {
      const rx = Math.abs(obj.rx), ry = Math.abs(obj.ry)
      if (obj.cx - rx < minX) minX = obj.cx - rx; if (obj.cy - ry < minY) minY = obj.cy - ry
      if (obj.cx + rx > maxX) maxX = obj.cx + rx; if (obj.cy + ry > maxY) maxY = obj.cy + ry
    } else if (obj.type === 'line') {
      if (Math.min(obj.x1, obj.x2) < minX) minX = Math.min(obj.x1, obj.x2)
      if (Math.min(obj.y1, obj.y2) < minY) minY = Math.min(obj.y1, obj.y2)
      if (Math.max(obj.x1, obj.x2) > maxX) maxX = Math.max(obj.x1, obj.x2)
      if (Math.max(obj.y1, obj.y2) > maxY) maxY = Math.max(obj.y1, obj.y2)
    } else if (obj.type === 'connector') {
      const src = objs.find((s: any) => s.id === obj.sourceId)
      const tgt = objs.find((s: any) => s.id === obj.targetId)
      if (src && tgt) {
        const sc = getThumbCenter(src)
        const tc = getThumbCenter(tgt)
        if (sc && tc) {
          if (Math.min(sc.x, tc.x) < minX) minX = Math.min(sc.x, tc.x)
          if (Math.min(sc.y, tc.y) < minY) minY = Math.min(sc.y, tc.y)
          if (Math.max(sc.x, tc.x) > maxX) maxX = Math.max(sc.x, tc.x)
          if (Math.max(sc.y, tc.y) > maxY) maxY = Math.max(sc.y, tc.y)
        }
      }
    }
  }

  const cw = maxX - minX || 1
  const ch = maxY - minY || 1
  const pad = 8
  const scale = Math.min((dw - pad * 2) / cw, (dh - pad * 2) / ch, 1)
  const ox = pad + (dw - pad * 2 - cw * scale) / 2
  const oy = pad + (dh - pad * 2 - ch * scale) / 2

  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(scale, scale)
  ctx.translate(-minX, -minY)

  for (const obj of objs) {
    if (!obj || !obj.type) continue
    if (obj.type === 'stroke') {
      if (obj.points.length < 2) continue
      ctx.beginPath()
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      if (obj.tool === 'eraser') {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = '#f8f8f8'
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = obj.color
      }
      ctx.lineWidth = obj.width
      const pts = obj.points
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2
        const my = (pts[i].y + pts[i + 1].y) / 2
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
    } else if (obj.type === 'sticky') {
      ctx.fillStyle = obj.color
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
      if (obj.text) {
        ctx.fillStyle = '#1a1a1a'
        ctx.font = '12px sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillText(obj.text.slice(0, 30), obj.x + 6, obj.y + 6, obj.width - 12)
      }
    } else if (obj.type === 'image') {
      const cached = thumbImageCache.get(obj.url)
      if (cached && cached.complete) {
        ctx.drawImage(cached, obj.x, obj.y, obj.width, obj.height)
      } else if (!cached) {
        // Start loading, redraw when done
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => { thumbImageCache.set(obj.url, img); onImageLoad?.() }
        img.src = obj.url
        thumbImageCache.set(obj.url, img)
        ctx.fillStyle = '#e5e5e5'
        ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
      } else {
        ctx.fillStyle = '#e5e5e5'
        ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
      }
    } else if (obj.type === 'emoji') {
      ctx.font = `${obj.size}px sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(obj.emoji, obj.x, obj.y)
    } else if (obj.type === 'rect') {
      if (obj.fillColor && obj.fillColor !== 'transparent') {
        ctx.fillStyle = obj.fillColor
        ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
      }
      ctx.strokeStyle = obj.color
      ctx.lineWidth = obj.strokeWidth
      ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
    } else if (obj.type === 'circle') {
      ctx.beginPath()
      ctx.ellipse(obj.cx, obj.cy, Math.abs(obj.rx), Math.abs(obj.ry), 0, 0, Math.PI * 2)
      if (obj.fillColor && obj.fillColor !== 'transparent') {
        ctx.fillStyle = obj.fillColor
        ctx.fill()
      }
      ctx.strokeStyle = obj.color
      ctx.lineWidth = obj.strokeWidth
      ctx.stroke()
    } else if (obj.type === 'line') {
      ctx.beginPath()
      ctx.moveTo(obj.x1, obj.y1)
      ctx.lineTo(obj.x2, obj.y2)
      ctx.strokeStyle = obj.color
      ctx.lineWidth = obj.strokeWidth
      ctx.stroke()
    } else if (obj.type === 'connector') {
      const src = objs.find((s: any) => s.id === obj.sourceId)
      const tgt = objs.find((s: any) => s.id === obj.targetId)
      if (src && tgt) {
        const sc = getThumbCenter(src)
        const tc = getThumbCenter(tgt)
        if (sc && tc) {
          ctx.beginPath()
          ctx.moveTo(sc.x, sc.y)
          ctx.lineTo(tc.x, tc.y)
          ctx.strokeStyle = obj.color
          ctx.lineWidth = obj.strokeWidth
          ctx.lineCap = 'round'
          ctx.stroke()
          // Arrowhead
          const angle = Math.atan2(tc.y - sc.y, tc.x - sc.x)
          const headLen = 10
          ctx.beginPath()
          ctx.moveTo(tc.x, tc.y)
          ctx.lineTo(tc.x - headLen * Math.cos(angle - Math.PI / 6), tc.y - headLen * Math.sin(angle - Math.PI / 6))
          ctx.lineTo(tc.x - headLen * Math.cos(angle + Math.PI / 6), tc.y - headLen * Math.sin(angle + Math.PI / 6))
          ctx.closePath()
          ctx.fillStyle = obj.color
          ctx.fill()
        }
      }
    }
  }
  ctx.restore()
}

export function WhiteboardPreview({ snapshotJson, whiteboardId, onUpdate }: WhiteboardPreviewProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const data: WhiteboardData | null = (() => {
    try { return JSON.parse(snapshotJson) } catch { return null }
  })()

  const objCount = data?.objects?.filter(Boolean)?.length ?? 0

  const [thumbVersion, setThumbVersion] = useState(0)
  useEffect(() => {
    if (!canvasRef.current || !data || objCount === 0) return
    drawThumbnail(canvasRef.current, data, () => setThumbVersion(v => v + 1))
  }, [snapshotJson, objCount, data, thumbVersion])

  return (
    <>
      <button
        onClick={() => setIsEditorOpen(true)}
        className="group block w-full rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
      >
        {objCount > 0 ? (
          <canvas ref={canvasRef} style={{ width: '100%', height: 120, display: 'block' }} />
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
            {objCount > 0 ? `${objCount} element${objCount !== 1 ? 's' : ''}` : 'Empty'}
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
