'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Column as ColumnType, ID } from '@/lib/types';
import { Column } from './Column';

interface SortableColumnProps {
  column: ColumnType;
  channelId: ID;
  columnCount: number;
}

export function SortableColumn({
  column,
  channelId,
  columnCount,
}: SortableColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `sortable-column-${column.id}`,
    data: {
      type: 'column',
      column,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Column
        column={column}
        channelId={channelId}
        columnCount={columnCount}
        dragHandleProps={listeners}
      />
    </div>
  );
}
