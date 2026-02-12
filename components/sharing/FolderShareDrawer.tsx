'use client'

import { Drawer } from '@/components/ui'
import { FolderSharePanel } from './FolderSharePanel'

interface FolderShareDrawerProps {
  folderId: string
  folderName: string
  isOpen: boolean
  onClose: () => void
}

export function FolderShareDrawer({ folderId, folderName, isOpen, onClose }: FolderShareDrawerProps) {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      width="md"
      floating
      title={`Share "${folderName}"`}
    >
      <div className="p-6 pt-12">
        <FolderSharePanel folderId={folderId} />
      </div>
    </Drawer>
  )
}
