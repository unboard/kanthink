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

type Intent = 'brain' | 'make' | 'recreate' | 'understand'

/** Why they're sharing it. Each one changes what Kan does with it. */
const INTENTS: { id: Intent; emoji: string; label: string; hint: string; action: string }[] = [
  { id: 'brain', emoji: '🧠', label: 'Keep it in my brain', hint: 'What should stick? (optional)', action: 'Remember it' },
  { id: 'make', emoji: '🛠️', label: 'Make something like this', hint: 'Your twist on it? (optional)', action: 'Make it' },
  { id: 'recreate', emoji: '🔁', label: 'Recreate this', hint: 'What matters most to get right? (optional)', action: 'Recreate it' },
  { id: 'understand', emoji: '🤔', label: 'Help me understand it', hint: 'What’s confusing? (optional)', action: 'Explain it' },
]

const EFFORT: { id: 'quick' | 'solid' | 'max'; label: string; cost: string }[] = [
  { id: 'quick', label: 'Quick', cost: '~5¢' },
  { id: 'solid', label: 'Solid', cost: '~15¢' },
  { id: 'max', label: 'All out', cost: '~$1' },
]

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
  // Why they're sharing it, and what Kan should do about it. All optional.
  const [intent, setIntent] = useState<Intent | null>(null)
  const [effort, setEffort] = useState<'quick' | 'solid' | 'max'>('quick')
  const [briefFirst, setBriefFirst] = useState(false)
  const [emailThoughts, setEmailThoughts] = useState(false)
  const [explainer, setExplainer] = useState(false)
  const [showWhere, setShowWhere] = useState(false)
  const pickIntent = (i: Intent) => {
    const next = intent === i ? null : i
    setIntent(next)
    // Wanting to understand something usually wants something to learn it with.
    setExplainer(next === 'understand')
  }

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

    let canceled = false
    fetch('/api/inbox/destinations')
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load your channels')
        return res.json()
      })
      .then((data) => {
        if (canceled) return
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
        if (canceled) return
        // Don't dead-end the share: without the picker we can still save to the
        // default destination server-side, so fall through to compose with no options.
        setError(err.message || 'Could not load your channels')
        setState('compose')
      })

    return () => { canceled = true }
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
        share: intent ? {
          intent,
          ...(intent === 'make' || intent === 'recreate' ? { effort, briefFirst } : { emailThoughts, explainer }),
        } : undefined,
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
            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">Share with Kan</p>
            <p className="text-white text-sm font-medium mb-4 line-clamp-2 wrap-anywhere">{previewLabel}</p>

            <p className="text-[11px] text-neutral-500 mb-1.5">Why are you sharing it?</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {INTENTS.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => pickIntent(i.id)}
                  disabled={state === 'saving'}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${intent === i.id ? 'border-violet-500 bg-violet-500/15' : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'}`}
                >
                  <span className="block text-base leading-none mb-1">{i.emoji}</span>
                  <span className="block text-[13px] font-medium text-neutral-100 leading-snug">{i.label}</span>
                </button>
              ))}
            </div>

            <label className="block mb-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={state === 'saving'}
                rows={2}
                placeholder={intent ? INTENTS.find((i) => i.id === intent)!.hint : 'Anything to add? (optional)'}
                className={`${inputClass} resize-none placeholder-neutral-600`}
              />
            </label>

            {(intent === 'make' || intent === 'recreate') && (
              <div className="mb-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <p className="text-[11px] text-neutral-500 mb-1.5">How much effort?</p>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {EFFORT.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setEffort(e.id)}
                      className={`rounded-lg border px-2 py-2 text-center ${effort === e.id ? 'border-violet-500 bg-violet-500/15' : 'border-neutral-800 hover:border-neutral-700'}`}
                    >
                      <span className="block text-[13px] font-medium text-neutral-100">{e.label}</span>
                      <span className="block text-[11px] text-neutral-500">{e.cost}</span>
                    </button>
                  ))}
                </div>
                <label className="flex items-start gap-2 text-xs text-neutral-300">
                  <input type="checkbox" checked={briefFirst} onChange={(e) => setBriefFirst(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-violet-500" />
                  <span>Send me a brief before you build <span className="text-neutral-500">(by email and in Kan&apos;s chat)</span></span>
                </label>
              </div>
            )}

            {(intent === 'brain' || intent === 'understand') && (
              <div className="mb-3 space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <label className="flex items-start gap-2 text-xs text-neutral-300">
                  <input type="checkbox" checked={emailThoughts} onChange={(e) => setEmailThoughts(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-violet-500" />
                  <span>Email me Kan&apos;s thoughts</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-neutral-300">
                  <input type="checkbox" checked={explainer} onChange={(e) => setExplainer(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-violet-500" />
                  <span>Make an explainer to help me learn it <span className="text-neutral-500">(about 10¢)</span></span>
                </label>
              </div>
            )}

            {destinations.length > 0 && (
              <button type="button" onClick={() => setShowWhere((v) => !v)} className="mb-2 text-[11px] text-neutral-500 hover:text-neutral-300">
                {showWhere ? 'Hide where it goes' : 'More: where it goes'}
              </button>
            )}
            {showWhere && destinations.length > 0 && (
              <>
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
              </>
            )}

            {error && <p className="text-xs text-amber-400 mb-3">{error}</p>}

            <button
              onClick={handleSave}
              disabled={state === 'saving'}
              className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60 transition-colors"
            >
              {state === 'saving' ? 'Sending...' : intent ? INTENTS.find((i) => i.id === intent)!.action : 'Save'}
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
                <button
                  onClick={handleDone}
                  className="mt-1 w-full max-w-[260px] rounded-lg border border-neutral-700 px-5 py-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-neutral-100 active:bg-neutral-900"
                >
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
