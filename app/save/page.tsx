'use client'

import { useEffect, useRef, useState, Suspense, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useSession, signIn } from 'next-auth/react'
import { SavedConfirmation } from './SavedConfirmation'
import { KanthinkIcon } from '@/components/icons/KanthinkIcon'

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
type Effort = 'quick' | 'solid' | 'max'

/** Why they're sharing it. Each one changes what Kan does with it. */
const INTENTS: { id: Intent; emoji: string; label: string; does: string; hint: string; action: string }[] = [
  { id: 'brain', emoji: '🧠', label: 'Keep it in my brain', does: 'Kan files it and tells you the one idea worth keeping.', hint: 'What should stick?', action: 'Remember it' },
  { id: 'make', emoji: '🛠️', label: 'Make something like this', does: 'Kan builds your own version as an app.', hint: 'Your twist on it?', action: 'Make it' },
  { id: 'recreate', emoji: '🔁', label: 'Recreate this', does: 'Kan rebuilds it as faithfully as it can.', hint: 'What matters most to get right?', action: 'Recreate it' },
  { id: 'understand', emoji: '🤔', label: 'Help me understand it', does: 'Kan explains it, and can make you something to learn it with.', hint: 'What’s confusing?', action: 'Explain it' },
]

const EFFORT: { id: Effort; label: string; cost: string; blurb: string }[] = [
  { id: 'quick', label: 'Quick', cost: '~5¢', blurb: 'A fast first pass' },
  { id: 'solid', label: 'Solid', cost: '~15¢', blurb: 'A stronger model' },
  { id: 'max', label: 'All out', cost: '~$1', blurb: 'The best model, more care' },
]

/** What they picked last time, so the sheet opens the way they usually use it. */
const LAST_KEY = 'kanthink-share-last'
function readLast(): { intent?: Intent; effort?: Effort; briefFirst?: boolean; emailThoughts?: boolean } {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}') } catch { return {} }
}
function writeLast(v: object) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(v)) } catch { /* private window */ }
}

interface Preview { title?: string; description?: string; ogImage?: string; siteName?: string }

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
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
  // Why they're sharing it, and what Kan should do about it. All optional.
  // They open the way they were used last time. (Compose never renders on the server,
  // so reading localStorage in the initializers is safe.)
  const [last] = useState(readLast)
  const [intent, setIntent] = useState<Intent | null>(() => (INTENTS.some((i) => i.id === last.intent) ? last.intent! : null))
  const [effort, setEffort] = useState<Effort>(() => (EFFORT.some((e) => e.id === last.effort) ? last.effort! : 'solid'))
  const [briefFirst, setBriefFirst] = useState(() => last.briefFirst === true)
  const [emailThoughts, setEmailThoughts] = useState(() => last.emailThoughts === true)
  const [explainer, setExplainer] = useState(() => last.intent === 'understand')
  const [showWhere, setShowWhere] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [imageOk, setImageOk] = useState(true)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const [isPopup] = useState(() => typeof window !== 'undefined' && Boolean(window.opener))

  const pickIntent = useCallback((i: Intent) => {
    setIntent((cur) => {
      const next = cur === i ? null : i
      // Wanting to understand something usually wants something to learn it with.
      setExplainer(next === 'understand')
      return next
    })
    requestAnimationFrame(() => noteRef.current?.focus())
  }, [])

  // The bookmarklet opens a small popup. Give the sheet room to breathe.
  useEffect(() => {
    if (!window.opener) return
    const w = Math.min(window.screen.availWidth, 820)
    const h = Math.min(window.screen.availHeight, 820)
    if (window.outerWidth >= w - 20 && window.outerHeight >= h - 20) return
    try {
      window.resizeTo(w, h)
      window.moveTo(Math.round((window.screen.availWidth - w) / 2), Math.round((window.screen.availHeight - h) / 2))
    } catch { /* not a popup we opened */ }
  }, [])

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

  // What's being shared, read the way the card will read it.
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !/^https?:\/\//i.test(url)) return
    let canceled = false
    fetch(`/api/inbox/preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: Preview) => { if (!canceled) setPreview(d) })
      .catch(() => { if (!canceled) setPreview({}) })
    return () => { canceled = true }
  }, [sessionStatus, url])

  // Changing channel resets the column to that channel's AI target (its inbox).
  const handleChannelChange = (nextChannelId: string) => {
    setChannelId(nextChannelId)
    const next = destinations.find((d) => d.channelId === nextChannelId)
    const preferred = next?.columns.find((c) => c.isAiTarget) ?? next?.columns[0]
    setColumnId(preferred?.id || '')
  }

  const handleSave = useCallback(() => {
    setState('saving')
    setError('')
    writeLast({ intent: intent ?? undefined, effort, briefFirst, emailThoughts })

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
  }, [intent, effort, briefFirst, emailThoughts, explainer, url, text, title, note, channelId, columnId, rememberDestination])

  const handleDone = () => {
    try {
      window.close()
    } catch {
      // window.close() only works for the bookmarklet popup — for the share target
      // there's nothing to close, so leave the confirmation on screen.
    }
  }

  // Keyboard: 1–4 picks why (when not typing), Ctrl/⌘+Enter sends, Esc closes the popup.
  useEffect(() => {
    if (state !== 'compose') return
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave(); return }
      if (e.key === 'Escape' && window.opener) { window.close(); return }
      if (!typing && /^[1-4]$/.test(e.key)) { e.preventDefault(); pickIntent(INTENTS[Number(e.key) - 1].id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, handleSave, pickIntent])

  // The note grows with what they write.
  useEffect(() => {
    const el = noteRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [note])

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

  const host = hostOf(url)
  const shownTitle = preview?.title || title || host || 'Shared text'
  const shownDescription = preview?.description && preview.description !== shownTitle ? preview.description : ''
  const chosen = intent ? INTENTS.find((i) => i.id === intent)! : null
  const busy = state === 'saving'

  if (state === 'compose' || state === 'saving') {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col bg-neutral-950 text-neutral-100">
        <header className="flex shrink-0 items-center gap-2 border-b border-neutral-900 px-5 py-3">
          <KanthinkIcon size={22} />
          <span className="text-sm font-semibold">Share with Kan</span>
          {isPopup && (
            <button type="button" onClick={handleDone} className="ml-auto rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300">
              Esc
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-4xl gap-6 px-5 py-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {/* What's being shared */}
            <section className="md:sticky md:top-0 md:self-start">
              <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
                {preview?.ogImage && imageOk && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.ogImage}
                    alt=""
                    onError={() => setImageOk(false)}
                    className="max-h-56 w-full object-cover"
                  />
                )}
                <div className="p-4">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-neutral-500">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-neutral-800 text-[9px] font-bold text-neutral-300">
                      {(preview?.siteName || host || 'T').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{preview?.siteName || host || 'Text'}</span>
                  </p>
                  <p className="text-[15px] font-semibold leading-snug text-white wrap-anywhere">{shownTitle}</p>
                  {preview === null && url && (
                    <div className="mt-2 space-y-1.5">
                      <div className="h-2.5 w-full animate-pulse rounded bg-neutral-800" />
                      <div className="h-2.5 w-4/5 animate-pulse rounded bg-neutral-800" />
                    </div>
                  )}
                  {shownDescription && (
                    <p className="mt-2 line-clamp-6 whitespace-pre-line text-[13px] leading-relaxed text-neutral-400 wrap-anywhere">{shownDescription}</p>
                  )}
                  {text && (
                    <blockquote className="mt-3 line-clamp-6 border-l-2 border-violet-500/60 pl-3 text-[13px] leading-relaxed text-neutral-300 wrap-anywhere">
                      {text}
                    </blockquote>
                  )}
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer" className="mt-3 block truncate text-[11px] text-neutral-600 hover:text-neutral-400">
                      {url}
                    </a>
                  )}
                </div>
              </div>
            </section>

            {/* What Kan should do with it */}
            <section>
              <p className="mb-2 text-xs font-medium text-neutral-400">Why are you sharing it?</p>
              <div className="space-y-2">
                {INTENTS.map((i, n) => {
                  const on = intent === i.id
                  return (
                    <div key={i.id} className={`rounded-xl border transition-colors ${on ? 'border-violet-500/70 bg-violet-500/10' : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'}`}>
                      <button
                        type="button"
                        onClick={() => pickIntent(i.id)}
                        disabled={busy}
                        aria-pressed={on}
                        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                      >
                        <span className="text-xl leading-none">{i.emoji}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-neutral-100">{i.label}</span>
                          <span className="block text-xs text-neutral-500">{i.does}</span>
                        </span>
                        <kbd className={`hidden rounded border px-1.5 text-[10px] sm:block ${on ? 'border-violet-500/50 text-violet-300' : 'border-neutral-700 text-neutral-600'}`}>{n + 1}</kbd>
                      </button>

                      {on && (i.id === 'make' || i.id === 'recreate') && (
                        <div className="border-t border-violet-500/20 px-3.5 pb-3.5 pt-3">
                          <p className="mb-1.5 text-[11px] text-neutral-500">How much effort?</p>
                          <div className="mb-3 grid grid-cols-3 gap-1.5">
                            {EFFORT.map((e) => (
                              <button
                                key={e.id}
                                type="button"
                                onClick={() => setEffort(e.id)}
                                className={`rounded-lg border px-2 py-2 text-center transition-colors ${effort === e.id ? 'border-violet-500 bg-violet-500/20' : 'border-neutral-800 bg-neutral-950/40 hover:border-neutral-700'}`}
                              >
                                <span className="block text-[13px] font-medium text-neutral-100">{e.label} <span className="text-neutral-500">{e.cost}</span></span>
                                <span className="block text-[10px] text-neutral-500">{e.blurb}</span>
                              </button>
                            ))}
                          </div>
                          <Check checked={briefFirst} onChange={setBriefFirst} label="Send me a brief before you build" sub="By email and in Kan's chat, with a Build it button" />
                        </div>
                      )}

                      {on && (i.id === 'brain' || i.id === 'understand') && (
                        <div className="space-y-2.5 border-t border-violet-500/20 px-3.5 pb-3.5 pt-3">
                          <Check checked={emailThoughts} onChange={setEmailThoughts} label="Email me Kan's thoughts" />
                          <Check checked={explainer} onChange={setExplainer} label="Make an explainer to help me learn it" sub="About 10¢" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-400">
                  {chosen ? chosen.hint : 'Anything to add?'} <span className="font-normal text-neutral-600">Optional</span>
                </span>
                <textarea
                  ref={noteRef}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy}
                  rows={3}
                  placeholder="Say it how you'd say it to a friend…"
                  className={`${inputClass} resize-none leading-relaxed placeholder-neutral-600`}
                />
              </label>

              {destinations.length > 0 && (
                <div className="mt-4">
                  <button type="button" onClick={() => setShowWhere((v) => !v)} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300">
                    <span className={`inline-block transition-transform ${showWhere ? 'rotate-90' : ''}`}>›</span>
                    Goes to <span className="text-neutral-300">{activeChannel?.channelName || 'Kan Bookmarks'}</span>
                    {activeChannel && <span className="text-neutral-600">· {activeChannel.columns.find((c) => c.id === columnId)?.name}</span>}
                  </button>
                  {showWhere && (
                    <div className="mt-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                      <div className="mb-3 flex gap-2">
                        <label className="min-w-0 flex-1">
                          <span className="mb-1 block text-[11px] text-neutral-500">Channel</span>
                          <select value={channelId} onChange={(e) => handleChannelChange(e.target.value)} disabled={busy} className={inputClass}>
                            {destinations.map((d) => (
                              <option key={d.channelId} value={d.channelId}>{d.channelName}</option>
                            ))}
                          </select>
                        </label>
                        <label className="min-w-0 flex-1">
                          <span className="mb-1 block text-[11px] text-neutral-500">Column</span>
                          <select value={columnId} onChange={(e) => setColumnId(e.target.value)} disabled={busy} className={inputClass}>
                            {(activeChannel?.columns || []).map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <Check checked={rememberDestination} onChange={setRememberDestination} label="Make this my default" />
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        <footer className="shrink-0 border-t border-neutral-900 bg-neutral-950/95 px-5 py-3">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-xs text-neutral-500">
              {error ? <span className="text-amber-400">{error}</span> : chosen ? chosen.does : 'Pick a reason, or just save it.'}
            </p>
            <span className="hidden text-[11px] text-neutral-600 sm:block">Ctrl ↵</span>
            <button
              onClick={handleSave}
              disabled={busy}
              className="shrink-0 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
            >
              {busy ? 'Sending…' : chosen ? chosen.action : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {(state === 'loading' || sessionStatus === 'loading') && (
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-neutral-300 text-sm font-medium">
              {sessionStatus === 'loading' ? 'Checking login...' : 'Getting ready...'}
            </p>
            {(title || url || text) && (
              <p className="text-neutral-500 text-xs mt-2 truncate max-w-[320px] mx-auto">{title || url || text}</p>
            )}
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

function Check({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-neutral-200">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500" />
      <span>
        {label}
        {sub && <span className="block text-[11px] text-neutral-500">{sub}</span>}
      </span>
    </label>
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
