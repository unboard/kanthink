'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'

function SaveContent() {
  const searchParams = useSearchParams()
  const { status: sessionStatus } = useSession()

  const url = searchParams.get('url') || ''
  const text = searchParams.get('text') || ''
  const title = searchParams.get('title') || ''

  const [state, setState] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')
  const [cardTitle, setCardTitle] = useState('')
  const [channelId, setChannelId] = useState('')
  const [error, setError] = useState('')

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

  // Save once authenticated
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    if (state !== 'loading') return
    if (!url && !text && !title) {
      setError('Nothing to save')
      setState('error')
      return
    }

    setState('saving')

    fetch('/api/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url || undefined, text: text || undefined, title: title || undefined }),
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
        setChannelId(data.channelId || '')
        setState('saved')

        // Auto-close after 2s (works for bookmarklet popup)
        setTimeout(() => {
          try {
            window.close()
          } catch {
            // window.close() may fail for share target — that's fine
          }
        }, 2000)
      })
      .catch((err) => {
        setError(err.message || 'Failed to save')
        setState('error')
      })
  }, [sessionStatus, state, url, text, title])

  return (
    <div className="fixed inset-0 z-[9999] bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        {(state === 'loading' || state === 'saving' || sessionStatus === 'loading') && (
          <div>
            <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-neutral-300 text-sm font-medium">
              {sessionStatus === 'loading' ? 'Checking login...' : 'Saving...'}
            </p>
            {url && (
              <p className="text-neutral-500 text-xs mt-2 truncate max-w-[280px] mx-auto">{url}</p>
            )}
          </div>
        )}

        {state === 'saved' && (
          <div>
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-medium mb-1">Saved</p>
            <p className="text-neutral-400 text-sm truncate max-w-[280px] mx-auto">{cardTitle}</p>
            {channelId && (
              <a
                href={`/channel/${channelId}`}
                className="inline-block mt-4 text-violet-400 hover:text-violet-300 text-sm underline underline-offset-2"
              >
                Go to Quick Save channel
              </a>
            )}
          </div>
        )}

        {state === 'error' && (
          <div>
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-white font-medium mb-1">Failed to save</p>
            <p className="text-neutral-400 text-sm">{error}</p>
            <a
              href="/"
              className="inline-block mt-4 text-violet-400 hover:text-violet-300 text-sm underline underline-offset-2"
            >
              Go to Kanthink
            </a>
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
