'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import Link from 'next/link'

interface InviteInfo {
  channelId: string
  channelName: string
  channelDescription: string
  ownerName: string | null
  ownerImage: string | null
  defaultRole: 'editor' | 'viewer'
  requiresApproval: boolean
}

interface UserStatus {
  isAuthenticated: boolean
  hasAccess: boolean
  role: string | null
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null)
  const [acceptResult, setAcceptResult] = useState<{
    status: 'accepted' | 'pending_approval'
    channelId?: string
    channelName?: string
    message?: string
  } | null>(null)

  useEffect(() => {
    async function fetchInvite() {
      try {
        const response = await fetch(`/api/invite/${token}`)
        if (!response.ok) {
          const data = await response.json()
          setError(data.error || 'Invalid invite link')
          return
        }

        const data = await response.json()
        setInvite(data.invite)
        setUserStatus(data.userStatus)
      } catch {
        setError('Failed to load invite')
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      fetchInvite()
    }
  }, [token])

  const handleAccept = async () => {
    setAccepting(true)
    setError(null)

    try {
      const response = await fetch(`/api/invite/${token}`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Failed to accept invite')
        return
      }

      const data = await response.json()
      setAcceptResult(data)
    } catch {
      setError('Failed to accept invite')
    } finally {
      setAccepting(false)
    }
  }

  const handleSignIn = () => {
    signIn('google', { callbackUrl: `/invite/${token}` })
  }

  if (loading || sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
      </div>
    )
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl max-w-md w-full p-8 text-center">
          <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Invalid Invite</h1>
          <p className="text-neutral-400 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium"
          >
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  if (acceptResult) {
    if (acceptResult.status === 'pending_approval') {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl max-w-md w-full p-8 text-center">
            <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">Request Submitted</h1>
            <p className="text-neutral-400 mb-6">{acceptResult.message}</p>
            <Link
              href="/"
              className="inline-block px-5 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium"
            >
              Go to Home
            </Link>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl max-w-md w-full p-8 text-center">
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">You&apos;re In!</h1>
          <p className="text-neutral-400 mb-6">
            You now have access to <strong className="text-white">{acceptResult.channelName}</strong>
          </p>
          <Link
            href={`/channel/${acceptResult.channelId}`}
            className="inline-block px-5 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium"
          >
            Open Channel
          </Link>
        </div>
      </div>
    )
  }

  if (!invite) {
    return null
  }

  // User already has access
  if (userStatus?.hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl max-w-md w-full p-8 text-center">
          <div className="w-12 h-12 bg-violet-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Already a Member</h1>
          <p className="text-neutral-400 mb-2">
            You already have access to <strong className="text-white">{invite.channelName}</strong>
          </p>
          <p className="text-sm text-neutral-500 mb-6">
            Your role: <span className="capitalize">{userStatus.role}</span>
          </p>
          <Link
            href={`/channel/${invite.channelId}`}
            className="inline-block px-5 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium"
          >
            Open Channel
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          {invite.ownerImage && (
            <img
              src={invite.ownerImage}
              alt={invite.ownerName || 'Owner'}
              className="w-14 h-14 rounded-full mx-auto mb-4 ring-2 ring-neutral-700"
            />
          )}
          <p className="text-sm text-neutral-400 mb-1">
            {invite.ownerName || 'Someone'} invited you to join
          </p>
          <h1 className="text-2xl font-bold text-white">{invite.channelName}</h1>
          {invite.channelDescription && (
            <p className="text-neutral-400 mt-2 text-sm">{invite.channelDescription}</p>
          )}
        </div>

        <div className="bg-neutral-800/50 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-400">Your role will be</span>
            <span className="font-medium text-white capitalize">{invite.defaultRole}</span>
          </div>
          {invite.requiresApproval && (
            <p className="text-xs text-amber-400 mt-2">
              Requires owner approval
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {!userStatus?.isAuthenticated ? (
          <div className="space-y-3">
            <p className="text-sm text-neutral-400 text-center mb-4">
              Sign in to accept this invite
            </p>
            <button
              onClick={handleSignIn}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl hover:bg-neutral-700 transition-colors flex items-center justify-center gap-3 font-medium text-white"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </button>
          </div>
        ) : (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full px-4 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {accepting ? 'Joining...' : 'Accept Invite'}
          </button>
        )}
      </div>
    </div>
  )
}
