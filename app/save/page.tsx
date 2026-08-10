'use client'

import { useEffect, useState, Suspense, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useSession, signIn } from 'next-auth/react'
import { SavedConfirmation } from './SavedConfirmation'

interface DestinationColumn {
  id: string
  name: string
  isAiTarget: boolean
}

interface Destination {
  channelId: string
  channelName: string
  isQuickSave: boolean
  columns: DestinationColumn[]
}

function SaveContent() {
  const searchParams = useSearchParams()
  const { status: sessionStatus } = useSession()

  const url = searchParams.get('url') || ''
  const text = searchParams.get('text') || ''
  const title = searchParams.get('title') || ''

  const [state, setState] = useState<'loading' | 'compose' | 'saving' | 'saved' | 'error'>('loading')
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [channelId, setChannelId] = useState('')
  const [columnId, setColumnId] = useState('')
  const [note, setNote] = useState('')
  const [rememberDestination, setRememberDestination] = useState(false)
  const [savedChannelId, setSavedChannelId] = useState('')
  const [savedColumnId, setSavedColumnId] = useState('')
  const [landedAtTop, setLandedAtTop] = useState(false)
  const [cardTitle, setCardTitle] = useState('')
  const [error, setError] = useState('')

  const activeChannel = useMemo(
    () => destinations.find((d) => d.channelId === channelId),
    [destinations, channelId]
  )

  // Where it actually landed, which isn't always where it was aimed: the server
  // falls back to Kan Bookmarks rather than lose a share. The confirmation shows
  // that channel's real columns, so read them off the resolved destination.
  const landed = useMemo(() => {
    const channel = destinations.find((d) => d.channelId === savedChannelId)
    const index = channel?.columns.findIndex((c) => c.id === savedColumnId) ?? -1
    if (!channel || index < 0) return null
    return { channel, index, columns: channel.columns.map((c) => c.name) }
  }, [destinations, savedChannelId, savedColumnId])

  // Derived, not state: a share with no payload is knowable from the URL on the first
  // render, so it doesn't need an effect to discover it.
  const hasPayload = Boolean(url || text || title)

  // Handle auth redirect
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      const params = new URLSearchParams()
      if (url) params.set('url', url)
      if (text) params.set('text', text)
      if (title) params.set('title', title)
      signIn('google', { callbackUrl: `/save?${params.toString()}` })
    }
  }, [sessionStatus, url, text, title])

  // Load destinations once authenticated, then hand over to the compose step.
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    if (state !== 'loading') return
    if (!hasPayload) return

    let cancelled = false
    fetch('/api/inbox/destinations')
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load your channels')
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const list: Destination[] = data.destinations || []
        setDestinations(list)
        if (data.default) {
          setChannelId(data.default.channelId)
          setColumnId(data.default.columnId)
        } else if (list[0]) {
          setChannelId(list[0].channelId)
          setColumnId(list[0].columns[0]?.id || '')
        }
        setState('compose')
      })
      .catch((err) => {
        if (cancelled) return
        // Don't dead-end the share: without the picker we can still save to the
        // default destination server-side, so fall through to compose with no options.
        setError(err.message || 'Could not load your channels')
        setState('compose')
      })

    return () => { cancelled = true }
  }, [sessionStatus, state, hasPayload])

  // Changing channel resets the column to that channel's AI target (its inbox).
  const handleChannelChange = (nextChannelId: string) => {
    setChannelId(nextChannelId)
    const next = destinations.find((d) => d.channelId === nextChannelId)
    const preferred = next?.columns.find((c) => c.isAiTarget) ?? next?.columns[0]
    setColumnId(preferred?.id || '')
  }

  const handleSave = () => {
    setState('saving')
    setError('')

    fetch('/api/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url || undefined,
        text: text || undefined,
        title: title || undefined,
        note: note.trim() || undefined,
        channelId: channelId || undefined,
        columnId: columnId || undefined,
        rememberDestination,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to save')
        }
        return res.json()
      })
      .then((data) => {
        setCardTitle(data.card?.title || 'Saved')
        setSavedChannelId(data.channelId || '')
        setSavedColumnId(data.columnId || '')
        // Position 0 means it really did take the top slot — columns sorted
        // oldest-first append instead, and the confirmation shouldn't claim
        // otherwise.
        setLandedAtTop(data.card?.position === 0)
        setState('saved')
      })
      .catch((err) => {
        setError(err.message || 'Failed to save')
        setState('error')
      })
  }

  const handleDone = () => {
    try {
      window.close()
    } catch {
      // window.close() only works for the bookmarklet popup — for the share target
      // there's nothing to close, so leave the confirmation on screen.
    }
  }

  const previewLabel = title || url || text
  const inputClass =
    'w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none'

  if (!hasPayload) {
    return (
      <div className="fixed inset-0 z-[9999] bg-neutral-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-white font-medium mb-1">Nothing to save</p>
          <p className="text-neutral-400 text-sm">
            Share a link or some text to Kanthink, or use the bookmarklet from your browser.
          </p>
          <Link
            href="/"
            className="inline-block mt-4 text-violet-400 hover:text-violet-300 text-sm underline underline-offset-2"
          >
            Go to Kanthink
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {(state === 'loading' || sessionStatus === 'loading') && (
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-neutral-300 text-sm font-medium">
              {sessionStatus === 'loading' ? 'Checking login...' : 'Getting ready...'}
            </p>
            {previewLabel && (
              <p className="text-neutral-500 text-xs mt-2 truncate max-w-[280px] mx-auto">{previewLabel}</p>
            )}
          </div>
        )}

        {(state === 'compose' || state === 'saving') && (
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">Save to Kanthink</p>
            <p className="text-white text-sm font-medium mb-4 line-clamp-2 wrap-anywhere">{previewLabel}</p>

            {destinations.length > 0 && (
              <div className="flex gap-2 mb-3">
                <label className="flex-1 min-w-0">
                  <span className="block text-[11px] text-neutral-500 mb-1">Channel</span>
                  <select
                    value={channelId}
                    onChange={(e) => handleChannelChange(e.target.value)}
                    disabled={state === 'saving'}
                    className={inputClass}
                  >
                    {destinations.map((d) => (
                      <option key={d.channelId} value={d.channelId}>{d.channelName}</option>
                    ))}
                  </select>
                </label>
                <label className="flex-1 min-w-0">
                  <span className="block text-[11px] text-neutral-500 mb-1">Column</span>
                  <select
                    value={columnId}
                    onChange={(e) => setColumnId(e.target.value)}
                    disabled={state === 'saving'}
                    className={inputClass}
                  >
                    {(activeChannel?.columns || []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <label className="block mb-3">
              <span className="block text-[11px] text-neutral-500 mb-1">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={state === 'saving'}
                rows={3}
                autoFocus
                placeholder="What caught your eye? Kan will factor this into its take."
                className={`${inputClass} resize-none placeholder-neutral-600`}
              />
            </label>

            {destinations.length > 0 && (
              <label className="flex items-center gap-2 mb-4 text-xs text-neutral-400">
                <input
                  type="checkbox"
                  checked={rememberDestination}
                  onChange={(e) => setRememberDestination(e.target.checked)}
                  disabled={state === 'saving'}
                  className="h-3.5 w-3.5 accent-violet-500"
                />
                Make this my default destination
              </label>
            )}

            {error && <p className="text-xs text-amber-400 mb-3">{error}</p>}

            <button
              onClick={handleSave}
              disabled={state === 'saving'}
              className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60 transition-colors"
            >
              {state === 'saving' ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}

        {state === 'saved' && (
          landed ? (
            <SavedConfirmation
              title={cardTitle}
              channelName={landed.channel.channelName}
              columns={landed.columns}
              targetIndex={landed.index}
              landedAtTop={landedAtTop}
              channelHref={`/channel/${savedChannelId}`}
              onDone={handleDone}
            />
          ) : (
            // No destination list (it failed to load, or the save fell back to a
            // channel we never fetched), so there's no board to draw.
            <div className="text-center">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white font-medium mb-1">Saved</p>
              <p className="text-neutral-400 text-sm truncate max-w-[280px] mx-auto">{cardTitle}</p>
              <div className="mt-4 flex flex-col items-center gap-2">
                {savedChannelId && (
                  <a
                    href={`/channel/${savedChannelId}`}
                    className="text-violet-400 hover:text-violet-300 text-sm underline underline-offset-2"
                  >
                    Open {activeChannel?.channelName || 'channel'}
                  </a>
                )}
                <button onClick={handleDone} className="text-neutral-500 hover:text-neutral-300 text-xs">
                  Done
                </button>
              </div>
            </div>
          )
        )}

        {state === 'error' && (
          <div className="text-center">
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-white font-medium mb-1">Failed to save</p>
            <p className="text-neutral-400 text-sm">{error}</p>
            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                onClick={() => setState('compose')}
                className="text-violet-400 hover:text-violet-300 text-sm underline underline-offset-2"
              >
                Try again
              </button>
              <Link href="/" className="text-neutral-500 hover:text-neutral-300 text-xs">
                Go to Kanthink
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SavePage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[9999] bg-neutral-950 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SaveContent />
    </Suspense>
  )
}
