'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { InstructionCard, Column } from '@/lib/types';
import { InstructionCardDisplay } from './InstructionCardDisplay';

interface SortableInstructionCardProps {
  card: InstructionCard;
  columns: Column[];
  onClick: () => void;
  onRun: () => void;
  isRunning?: boolean;
}

export function SortableInstructionCard({
  card,
  columns,
  onClick,
  onRun,
  isRunning,
}: SortableInstructionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <InstructionCardDisplay
        card={card}
        columns={columns}
        onClick={onClick}
        onRun={onRun}
        isRunning={isRunning}
      />
    </div>
  );
}
