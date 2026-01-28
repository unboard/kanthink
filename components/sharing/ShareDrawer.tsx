'use client'

import { Drawer } from '@/components/ui'
import { SharePanel } from './SharePanel'

interface ShareDrawerProps {
  channelId: string
  channelName: string
  isOpen: boolean
  onClose: () => void
}

export function ShareDrawer({ channelId, channelName, isOpen, onClose }: ShareDrawerProps) {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      width="md"
      floating
      title={`Share "${channelName}"`}
    >
      <div className="p-6 pt-12">
        <SharePanel channelId={channelId} />
      </div>
    </Drawer>
  )
}
