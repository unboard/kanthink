'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Button, Input } from '@/components/ui'
import {
  fetchShares,
  createShare,
  updateShare,
  deleteShare,
  fetchInviteLinks,
  createInviteLink,
  deleteInviteLink,
  type ChannelShare,
  type InviteLink,
  type ChannelRole,
  type SharesResponse,
} from '@/lib/api/client'

interface SharePanelProps {
  channelId: string
}

export function SharePanel({ channelId }: SharePanelProps) {
  const { data: session } = useSession()
  const [sharesData, setSharesData] = useState<SharesResponse | null>(null)
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<ChannelRole>('editor')
  const [isInviting, setIsInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Link creation state
  const [isCreatingLink, setIsCreatingLink] = useState(false)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)

  const canManageShares = sharesData?.canManage ?? false
  const shares = sharesData?.shares ?? []
  const owner = sharesData?.owner

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const sharesRes = await fetchShares(channelId)
      setSharesData(sharesRes)

      // Only fetch invite links if user can manage
      if (sharesRes.canManage) {
        const linksRes = await fetchInviteLinks(channelId)
        setInviteLinks(linksRes.links)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sharing data')
    } finally {
      setIsLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    try {
      setIsInviting(true)
      setInviteError(null)
      const { share } = await createShare(channelId, inviteEmail.trim(), inviteRole)
      setSharesData((prev) =>
        prev ? { ...prev, shares: [...prev.shares, share] } : prev
      )
      setInviteEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setIsInviting(false)
    }
  }

  const handleRoleChange = async (shareId: string, newRole: ChannelRole) => {
    try {
      const { share } = await updateShare(channelId, shareId, newRole)
      setSharesData((prev) =>
        prev
          ? { ...prev, shares: prev.shares.map((s) => (s.id === shareId ? share : s)) }
          : prev
      )
    } catch (err) {
      setError('Failed to update role')
    }
  }

  const handleRemoveShare = async (shareId: string) => {
    if (!confirm('Remove this person\'s access?')) return
    try {
      await deleteShare(channelId, shareId)
      setSharesData((prev) =>
        prev ? { ...prev, shares: prev.shares.filter((s) => s.id !== shareId) } : prev
      )
    } catch (err) {
      setError('Failed to remove access')
    }
  }

  const handleCreateLink = async () => {
    try {
      setIsCreatingLink(true)
      const { link, url } = await createInviteLink(channelId, { defaultRole: 'editor' })
      setInviteLinks((prev) => [...prev, link])
      // Copy to clipboard
      await navigator.clipboard.writeText(url)
      setCopiedLinkId(link.id)
      setTimeout(() => setCopiedLinkId(null), 2000)
    } catch (err) {
      setError('Failed to create invite link')
    } finally {
      setIsCreatingLink(false)
    }
  }

  const handleCopyLink = async (link: InviteLink) => {
    const url = `${window.location.origin}/invite/${link.token}`
    await navigator.clipboard.writeText(url)
    setCopiedLinkId(link.id)
    setTimeout(() => setCopiedLinkId(null), 2000)
  }

  const handleDeleteLink = async (linkId: string) => {
    if (!confirm('Revoke this invite link?')) return
    try {
      await deleteInviteLink(channelId, linkId)
      setInviteLinks((prev) => prev.filter((l) => l.id !== linkId))
    } catch (err) {
      setError('Failed to revoke link')
    }
  }

  if (isLoading) {
    return (
      <div className="py-4 text-center text-sm text-neutral-500">
        Loading...
      </div>
    )
  }

  // Filter out the current user from shares (they see themselves as owner or in the shares list)
  const otherShares = shares.filter((s) => s.userId !== session?.user?.id)
  const isCurrentUserOwner = owner?.id === session?.user?.id

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-2 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700">
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Invite by email */}
      {canManageShares && (
        <form onSubmit={handleInvite} className="space-y-2">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Invite by email
          </label>
          <div className="flex gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as ChannelRole)}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button type="submit" size="sm" disabled={isInviting || !inviteEmail.trim()}>
              {isInviting ? 'Sending...' : 'Invite'}
            </Button>
          </div>
          {inviteError && (
            <p className="text-xs text-red-600 dark:text-red-400">{inviteError}</p>
          )}
          <p className="text-xs text-neutral-500">
            They&apos;ll get access when they sign in with this email.
          </p>
        </form>
      )}

      {/* Invite link */}
      {canManageShares && (
        <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Invite link
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreateLink}
              disabled={isCreatingLink}
            >
              {isCreatingLink ? 'Creating...' : '+ New link'}
            </Button>
          </div>

          {inviteLinks.length === 0 ? (
            <p className="text-xs text-neutral-500">
              No active invite links. Create one to share with anyone.
            </p>
          ) : (
            <div className="space-y-2">
              {inviteLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-2 rounded-md bg-neutral-50 dark:bg-neutral-800/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-neutral-600 dark:text-neutral-400 truncate">
                      /invite/{link.token.slice(0, 8)}...
                    </p>
                    <p className="text-xs text-neutral-500">
                      {link.useCount} use{link.useCount !== 1 ? 's' : ''} · {link.defaultRole}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyLink(link)}
                    >
                      {copiedLinkId === link.id ? (
                        <span className="text-green-600 dark:text-green-400">Copied!</span>
                      ) : (
                        'Copy'
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteLink(link.id)}
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* People with access */}
      <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          People with access
        </label>

        <div className="space-y-2">
          {/* Show owner first */}
          {owner && (
            <div className="flex items-center justify-between p-2 rounded-md bg-neutral-50 dark:bg-neutral-800/50">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {owner.image ? (
                  <img src={owner.image} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center text-xs font-medium text-white">
                    {(owner.name?.[0] || owner.email[0]).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-900 dark:text-white truncate">
                    {owner.name || owner.email}
                    {isCurrentUserOwner && (
                      <span className="text-neutral-500 ml-1">(you)</span>
                    )}
                  </p>
                  {owner.name && (
                    <p className="text-xs text-neutral-500 truncate">{owner.email}</p>
                  )}
                </div>
              </div>
              <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">Owner</span>
            </div>
          )}

          {/* Show other shares */}
          {otherShares.map((share) => (
            <div
              key={share.id}
              className="flex items-center justify-between p-2 rounded-md bg-neutral-50 dark:bg-neutral-800/50"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {share.user?.image ? (
                  <img
                    src={share.user.image}
                    alt=""
                    className="w-6 h-6 rounded-full"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-neutral-300 dark:bg-neutral-600 flex items-center justify-center text-xs font-medium">
                    {(share.user?.name?.[0] || share.email[0]).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-900 dark:text-white truncate">
                    {share.user?.name || share.email}
                  </p>
                  {share.user?.name && (
                    <p className="text-xs text-neutral-500 truncate">{share.email}</p>
                  )}
                  {!share.acceptedAt && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">Pending</p>
                  )}
                </div>
              </div>

              {canManageShares ? (
                <div className="flex items-center gap-1">
                  <select
                    value={share.role}
                    onChange={(e) => handleRoleChange(share.id, e.target.value as ChannelRole)}
                    className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveShare(share.id)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400 px-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-neutral-500 capitalize">{share.role}</span>
              )}
            </div>
          ))}

          {!owner && otherShares.length === 0 && (
            <p className="text-xs text-neutral-500">
              Only you have access to this channel.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
