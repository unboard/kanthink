'use client'

import { signIn } from 'next-auth/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { bleedSize, shapePath } from '@/lib/print/spec'
import type { PrintSpec } from '@/lib/print/types'

export function SignInGate({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="h-full mat flex items-center justify-center p-6">
      <div className="max-w-[380px] text-center rounded-2xl border p-7" style={{ background: 'var(--chrome)', borderColor: 'var(--line)' }}>
        <h1 className="text-[20px] font-semibold">Print studio</h1>
        <p className="text-[14px] mt-2 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Sign in to design flyers, postcards, cards and signs that are ready for the press.
        </p>
        <button
          type="button"
          onClick={() => signIn('google', { callbackUrl })}
          className="mt-5 h-10 px-5 rounded-xl text-[14px] font-semibold text-white"
          style={{ background: 'var(--magenta)' }}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  )
}

export interface NoticeState {
  id: number
  message: string
}

export function useNotice() {
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notify = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current)
    setNotice({ id: Date.now(), message })
    timer.current = setTimeout(() => setNotice(null), 6000)
  }, [])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return { notice, notify }
}

export function Notice({ notice }: { notice: NoticeState | null }) {
  if (!notice) return null
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-36 z-[80] px-4 w-full max-w-[520px] pointer-events-none" role="status" aria-live="polite">
      <div className="rounded-xl border px-4 py-3 text-[14px] shadow-2xl pointer-events-auto" style={{ background: 'var(--raise)', borderColor: 'var(--line)', color: 'var(--ink)' }}>
        {notice.message}
      </div>
    </div>
  )
}

/** A product's silhouette: its proportions, die-cut and folds, drawn small. */
export function ProductGlyph({ spec, box = 56, active }: { spec: PrintSpec; box?: number; active?: boolean }) {
  const s = bleedSize(spec)
  const trimW = spec.widthIn
  const trimH = spec.heightIn
  const k = (box - 6) / Math.max(trimW, trimH)
  const w = trimW * k
  const h = trimH * k
  const path = shapePath(spec, 0)
  const stroke = active ? 'var(--ink)' : 'var(--ink-2)'
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden>
      <g transform={`translate(${(box - w) / 2} ${(box - h) / 2}) scale(${k}) translate(${-spec.bleedIn} ${-spec.bleedIn})`}>
        {path && spec.guide?.kind !== 'image' ? (
          <path d={path} fill="var(--paper)" fillOpacity={active ? 1 : 0.92} fillRule="evenodd" stroke={stroke} strokeWidth={0.6 / k} />
        ) : (
          <rect x={spec.bleedIn} y={spec.bleedIn} width={trimW} height={trimH} fill="var(--paper)" fillOpacity={active ? 1 : 0.92} />
        )}
        {spec.folds?.at.map((f) =>
          spec.folds!.direction === 'vertical' ? (
            <line key={f} x1={spec.bleedIn + f * trimW} x2={spec.bleedIn + f * trimW} y1={spec.bleedIn} y2={spec.bleedIn + trimH} stroke="#9aa69f" strokeWidth={0.8 / k} strokeDasharray={`${2 / k} ${2 / k}`} />
          ) : (
            <line key={f} y1={spec.bleedIn + f * trimH} y2={spec.bleedIn + f * trimH} x1={spec.bleedIn} x2={spec.bleedIn + trimW} stroke="#9aa69f" strokeWidth={0.8 / k} strokeDasharray={`${2 / k} ${2 / k}`} />
          ),
        )}
      </g>
      <title>{`${s.w} × ${s.h}`}</title>
    </svg>
  )
}
