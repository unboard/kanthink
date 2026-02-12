'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Button, Input } from '@/components/ui'
import {
  fetchFolderShares,
  createFolderShare,
  updateFolderShare,
  deleteFolderShare,
  type FolderShareData,
  type FolderSharesResponse,
} from '@/lib/api/client'

interface FolderSharePanelProps {
  folderId: string
}

export function FolderSharePanel({ folderId }: FolderSharePanelProps) {
  const { data: session } = useSession()
  const [sharesData, setSharesData] = useState<FolderSharesResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [isInviting, setIsInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const canManage = sharesData?.canManage ?? false
  const shares = sharesData?.shares ?? []
  const owner = sharesData?.owner

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetchFolderShares(folderId)
      setSharesData(res)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load sharing data'
      if (errorMsg.includes('not found')) {
        setSharesData(null)
      } else {
        setError(errorMsg)
      }
    } finally {
      setIsLoading(false)
    }
  }, [folderId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    try {
      setIsInviting(true)
      setInviteError(null)
      const { share } = await createFolderShare(folderId, inviteEmail.trim(), inviteRole)
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

  const handleRoleChange = async (shareId: string, newRole: 'editor' | 'viewer') => {
    try {
      const { share } = await updateFolderShare(folderId, shareId, { role: newRole })
      setSharesData((prev) =>
        prev
          ? { ...prev, shares: prev.shares.map((s) => (s.id === shareId ? { ...s, ...share } : s)) }
          : prev
      )
    } catch {
      setError('Failed to update role')
    }
  }

  const handleRemoveShare = async (shareId: string) => {
    if (!confirm('Remove this person\'s access to the folder and all its channels?')) return
    try {
      await deleteFolderShare(folderId, shareId)
      setSharesData((prev) =>
        prev ? { ...prev, shares: prev.shares.filter((s) => s.id !== shareId) } : prev
      )
    } catch {
      setError('Failed to remove access')
    }
  }

  if (isLoading) {
    return (
      <div className="py-4 text-center text-sm text-neutral-500">
        Loading...
      </div>
    )
  }

  const otherShares = shares.filter((s) => s.userId !== session?.user?.id)
  const isCurrentUserOwner = owner?.id === session?.user?.id

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-2 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700">
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Info about folder sharing */}
      <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300">
          Sharing a folder gives access to all channels inside it. When channels are added or removed from the folder, access updates automatically.
        </p>
      </div>

      {/* Invite by email */}
      {canManage && (
        <form onSubmit={handleInvite} className="space-y-3">
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
              onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
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
            {inviteRole === 'editor'
              ? 'Editors can create, edit, and delete cards in all channels.'
              : 'Viewers can only view cards (read-only) in all channels.'}
            {' '}They&apos;ll get access when they sign in.
          </p>
        </form>
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
                  // eslint-disable-next-line @next/next/no-img-element
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={share.user.image} alt="" className="w-6 h-6 rounded-full" />
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

              {canManage ? (
                <div className="flex items-center gap-1">
                  <select
                    value={share.role}
                    onChange={(e) => handleRoleChange(share.id, e.target.value as 'editor' | 'viewer')}
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
              Only you have access to this folder.
            </p>
          )}
        </div>
      </div>

      {/* Reassurance about deletion */}
      <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Only the folder owner can delete this folder and its channels. Collaborators can never delete them.
          </p>
        </div>
      </div>
    </div>
  )
}
