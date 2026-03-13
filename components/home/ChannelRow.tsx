'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useChannelMembers } from '@/lib/hooks/useChannelMembers'
import { useStore } from '@/lib/store'
import type { Channel } from '@/lib/types'

interface ChannelRowProps {
  channel: Channel
  streak?: { hot: number; cold: number }
}

export function ChannelRow({ channel, streak }: ChannelRowProps) {
  const router = useRouter()
  const { members } = useChannelMembers(channel.id)
  const tasks = useStore((s) => s.tasks)

  // Compute task stats for this channel
  const channelTasks = Object.values(tasks).filter(t => t.channelId === channel.id)
  const totalTasks = channelTasks.length
  const doneTasks = channelTasks.filter(t => t.status === 'done').length
  const inProgressTasks = channelTasks.filter(t => t.status === 'in_progress').length

  return (
    <div
      onClick={() => router.push(`/channel/${channel.id}`)}
      className="group/row flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer select-none hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors"
    >
      {/* Channel name */}
      <span className="text-[13px] font-medium text-white/70 group-hover/row:text-white/90 flex-1 min-w-0 truncate transition-colors">
        {channel.name}
      </span>

      {/* Shared badge */}
      {channel.sharedBy && (
        <span className="flex-shrink-0 rounded-full bg-violet-500/12 px-1.5 py-px text-[10px] font-medium text-violet-400/80 tracking-wide uppercase">
          {channel.sharedBy.name?.split(' ')[0] || 'Shared'}
        </span>
      )}

      {/* Task progress — only show if tasks exist */}
      {totalTasks > 0 && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Mini progress bar */}
          <div className="w-8 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500/70 transition-all"
              style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-white/30 tabular-nums font-medium">
            {doneTasks}/{totalTasks}
          </span>
        </div>
      )}

      {/* In-progress indicator */}
      {inProgressTasks > 0 && (
        <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400/70" title={`${inProgressTasks} in progress`} />
      )}

      {/* Streak */}
      {streak && streak.hot > 0 && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <svg className="w-3 h-3 text-orange-400/80" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
          </svg>
          <span className="text-[10px] font-semibold text-orange-400/80 tabular-nums">{streak.hot}</span>
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
                  width={18}
                  height={18}
                  className="rounded-full"
                />
              ) : (
                <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-[7px] font-bold text-white">
                  {(member.name || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          ))}
          {members.length > 3 && (
            <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white/10 text-[7px] font-medium text-white/60 ring-1 ring-neutral-900">
              +{members.length - 3}
            </div>
          )}
        </div>
      )}

      {/* Chevron on hover */}
      <svg className="w-3.5 h-3.5 text-white/0 group-hover/row:text-white/20 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  )
}
