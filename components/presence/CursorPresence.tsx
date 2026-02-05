'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import {
  subscribeToPresence,
  unsubscribeFromPresence,
  sendCursorUpdate,
  setCursorCallback,
  setPresenceCallback,
  getCurrentPresenceChannelId,
  type CursorPosition,
  type PresenceUser,
} from '@/lib/sync/pusherClient'
import { isServerMode } from '@/lib/api/sync'

interface CursorPresenceProps {
  channelId: string | null
}

/**
 * Component that tracks and displays cursor positions for collaborative presence.
 * Shows other users' cursors with their avatar and name when they're on the same channel.
 */
export function CursorPresence({ channelId }: CursorPresenceProps) {
  const [cursors, setCursors] = useState<CursorPosition[]>([])
  const [members, setMembers] = useState<PresenceUser[]>([])
  const lastSentRef = useRef<number>(0)
  const throttleMs = 50 // Send cursor updates at most every 50ms

  // Subscribe to presence when channel changes
  // Note: No cleanup to avoid React StrictMode double-render unsubscribing
  useEffect(() => {
    if (!channelId || !isServerMode()) {
      return
    }

    subscribeToPresence(channelId)
  }, [channelId])

  // Set up callbacks for cursor and member updates
  useEffect(() => {
    setCursorCallback((cursorMap) => {
      setCursors(Array.from(cursorMap.values()))
    })

    setPresenceCallback((memberList) => {
      setMembers(memberList)
    })

    return () => {
      setCursorCallback(null)
      setPresenceCallback(null)
    }
  }, [])

  // Track mouse movement and send updates
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!channelId || getCurrentPresenceChannelId() !== channelId) {
        return
      }

      const now = Date.now()
      if (now - lastSentRef.current < throttleMs) {
        return
      }

      lastSentRef.current = now
      sendCursorUpdate(e.clientX, e.clientY)
    },
    [channelId]
  )

  // Attach mouse move listener
  useEffect(() => {
    if (!channelId || !isServerMode()) {
      return
    }

    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [channelId, handleMouseMove])

  // Don't render anything if no other cursors
  if (cursors.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      {cursors.map((cursor) => (
        <UserCursor key={cursor.userId} cursor={cursor} />
      ))}
    </div>
  )
}

interface UserCursorProps {
  cursor: CursorPosition
}

function UserCursor({ cursor }: UserCursorProps) {
  const { x, y, user } = cursor
  const color = user.info.color
  const name = user.info.name
  const image = user.info.image

  // Fade out cursors that haven't been updated in a while
  const age = Date.now() - cursor.timestamp
  const opacity = age > 3000 ? 0 : age > 2000 ? 0.5 : 1

  if (opacity === 0) {
    return null
  }

  return (
    <div
      className="absolute transition-all duration-75 ease-out"
      style={{
        left: x,
        top: y,
        opacity,
        transform: 'translate(-2px, -2px)',
      }}
    >
      {/* Cursor pointer */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
      >
        <path
          d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 01.35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.85a.5.5 0 00-.85.36z"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>

      {/* User badge */}
      <div
        className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 text-xs font-medium text-white shadow-lg"
        style={{ backgroundColor: color }}
      >
        {image ? (
          <Image
            src={image}
            alt={name}
            width={18}
            height={18}
            className="rounded-full"
          />
        ) : (
          <div
            className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white/20 text-[10px] font-bold"
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="max-w-[80px] truncate">{name.split(' ')[0]}</span>
      </div>
    </div>
  )
}

/**
 * A compact presence indicator showing who else is viewing the current channel.
 * Can be placed in the header or toolbar area.
 */
export function PresenceIndicator({ channelId }: { channelId: string | null }) {
  const [members, setMembers] = useState<PresenceUser[]>([])

  useEffect(() => {
    setPresenceCallback((memberList) => {
      setMembers(memberList)
    })

    return () => {
      setPresenceCallback(null)
    }
  }, [])

  useEffect(() => {
    if (!channelId || !isServerMode()) {
      return
    }

    subscribeToPresence(channelId)

    return () => {
      unsubscribeFromPresence(channelId)
    }
  }, [channelId])

  // Deduplicate by base userId (same user may have multiple tabs)
  const uniqueMembers = Array.from(
    new Map(members.map(m => [m.id.split(':')[0], m])).values()
  )

  if (uniqueMembers.length === 0) {
    return null
  }

  // Show up to 3 avatars, then +N indicator
  const visibleMembers = uniqueMembers.slice(0, 3)
  const remainingCount = uniqueMembers.length - 3

  return (
    <div className="flex items-center -space-x-2">
      {visibleMembers.map((member) => (
        <div
          key={member.id}
          className="relative rounded-full ring-2 ring-zinc-900"
          title={member.info.name}
        >
          {member.info.image ? (
            <Image
              src={member.info.image}
              alt={member.info.name}
              width={28}
              height={28}
              className="rounded-full"
            />
          ) : (
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: member.info.color }}
            >
              {member.info.name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Online indicator dot */}
          <div
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-900"
            style={{ backgroundColor: member.info.color }}
          />
        </div>
      ))}
      {remainingCount > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-xs font-medium text-zinc-300 ring-2 ring-zinc-900">
          +{remainingCount}
        </div>
      )}
    </div>
  )
}
