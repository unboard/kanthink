'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useChannelMembers } from '@/lib/hooks/useChannelMembers'
import type { Channel } from '@/lib/types'

interface ChannelRowProps {
  channel: Channel
  streak?: { hot: number; cold: number }
}

export function ChannelRow({ channel, streak }: ChannelRowProps) {
  const router = useRouter()
  const { members } = useChannelMembers(channel.id)

  return (
    <div
      onClick={() => router.push(`/channel/${channel.id}`)}
      className="flex items-center gap-3 p-3 rounded-xl cursor-pointer select-none bg-white/[0.03] hover:bg-white/[0.07] active:bg-white/[0.1] border border-transparent hover:border-white/[0.06] transition-all"
    >
      {/* Drag handle (visual only — no DnD here) */}
      <div className="text-white/15 flex-shrink-0">
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      </div>

      {/* Channel name */}
      <span className="text-sm font-medium text-white/80 flex-1 min-w-0 truncate">
        {channel.name}
      </span>

      {/* Shared badge */}
      {channel.sharedBy && (
        <span className="flex-shrink-0 flex items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-px text-[10px] font-medium text-violet-400">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {channel.sharedBy.name?.split(' ')[0] || 'Shared'}
        </span>
      )}

      {/* Streak */}
      {streak && (streak.hot > 0 || streak.cold > 0) && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {streak.hot > 0 ? (
            <>
              <svg className="w-3 h-3 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
              <span className="text-[10px] font-semibold text-orange-400 tabular-nums">{streak.hot}</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3 text-blue-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              <span className="text-[10px] font-medium text-blue-400/50 tabular-nums">{streak.cold}</span>
            </>
          )}
        </div>
      )}

      {/* Member avatars */}
      {members.length > 0 && (
        <div className="flex items-center -space-x-1 flex-shrink-0">
          {members.slice(0, 3).map((member) => (
            <div key={member.id} className="rounded-full ring-1 ring-neutral-900">
              {member.image ? (
                <Image
                  src={member.image}
                  alt={member.name || 'Member'}
                  width={20}
                  height={20}
                  className="rounded-full"
                />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-[8px] font-bold text-white">
                  {(member.name || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          ))}
          {members.length > 3 && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[8px] font-medium text-white/60 ring-1 ring-neutral-900">
              +{members.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
