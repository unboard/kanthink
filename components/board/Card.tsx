'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card as CardType, Task } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/settingsStore';
import { CardDetailDrawer } from './CardDetailDrawer';
import { TaskListOnCard } from './TaskListOnCard';
import { TaskDrawer } from './TaskDrawer';
import { getTagStyles } from './TagPicker';

interface CardProps {
  card: CardType;
}

export function Card({ card }: CardProps) {
  const [isCardDrawerOpen, setIsCardDrawerOpen] = useState(false);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const deleteCard = useStore((s) => s.deleteCard);
  const archiveCard = useStore((s) => s.archiveCard);
  const tasks = useStore((s) => s.tasks);
  const channels = useStore((s) => s.channels);
  const theme = useSettingsStore((s) => s.theme);
  const isTerminal = theme === 'terminal';

  // Get tasks for this card
  const cardTasks = (card.taskIds ?? [])
    .map((id) => tasks[id])
    .filter(Boolean) as Task[];

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
  };

  const handleQuickComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    archiveCard(card.id);
  };

  const handleQuickDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteCard(card.id);
  };

  // Use summary for preview, fall back to first message content
  const messages = card.messages ?? [];
  const contentPreview = card.summary
    || (messages.length > 0 ? messages[0].content.slice(0, 150) : '');

  // Get tag definitions for color lookup
  const tagDefinitions = channels[card.channelId]?.tagDefinitions ?? [];

  const getTagColorInfo = (tagName: string) => {
    const tagDef = tagDefinitions.find((t) => t.name === tagName);
    return getTagStyles(tagDef?.color ?? 'gray');
  };

  return (
    <>
      {/* ────────────────────────────────────────────────────────────────────
          CRITICAL: Mobile touch configuration - DO NOT CHANGE without testing

          touch-manipulation: allows scroll (horizontal & vertical)
          touch-none when dragging: prevents scroll interference

          This works with TouchSensor's 250ms delay in Board.tsx.
          See Board.tsx sensors comment for full explanation.
          ──────────────────────────────────────────────────────────────────── */}
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`
          card-container
          group relative cursor-grab rounded-md overflow-hidden transition-shadow
          select-none
          ${isDragging ? 'touch-none' : 'touch-manipulation'}
          ${isTerminal
            ? 'bg-neutral-900 border border-neutral-800 hover:border-neutral-700'
            : 'bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md'
          }
          ${isDragging ? 'opacity-50 shadow-lg' : ''}
          ${card.isProcessing ? 'card-processing' : ''}
        `}
      >
        {/* Cover image */}
        {card.coverImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={card.coverImageUrl}
            alt=""
            className="w-full h-32 object-cover cursor-pointer"
            loading="lazy"
            onClick={() => setIsCardDrawerOpen(true)}
          />
        )}

        {/* Card content with padding */}
        <div className="relative p-3">
        {/* Quick action buttons - positioned in content area, not over image */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
          <button
            onClick={handleQuickComplete}
            className="p-1 rounded text-neutral-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
            title="Archive card"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </button>
          <button
            onClick={handleQuickDelete}
            className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
            title="Delete card"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {/* Clickable content area */}
        <div onClick={() => setIsCardDrawerOpen(true)}>
          {/* Tags - above title */}
          {(card.tags ?? []).length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1 pr-12">
              {(card.tags ?? []).map((tagName) => {
                const colorInfo = getTagColorInfo(tagName);
                return (
                  <span
                    key={tagName}
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${colorInfo.className ?? ''}`}
                    style={colorInfo.style}
                  >
                    {tagName}
                  </span>
                );
              })}
            </div>
          )}

          <h4 className="text-sm font-medium text-neutral-900 dark:text-white pr-6">
            {card.title}
          </h4>
          {contentPreview && (
            <p className="mt-1 text-xs text-neutral-500 line-clamp-2">
              {contentPreview}
            </p>
          )}
        </div>

        {/* Task progress bar */}
        {cardTasks.length > 0 && (
          <div className="mt-2" onClick={() => setIsCardDrawerOpen(true)}>
            <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
              <span>{cardTasks.filter(t => t.status === 'done').length}/{cardTasks.length} tasks</span>
              <span>{Math.round((cardTasks.filter(t => t.status === 'done').length / cardTasks.length) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 dark:bg-green-600 rounded-full transition-all duration-300"
                style={{ width: `${(cardTasks.filter(t => t.status === 'done').length / cardTasks.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Tasks */}
        <div>
          <TaskListOnCard
            cardId={card.id}
            channelId={card.channelId}
            tasks={cardTasks}
            hideCompleted={card.hideCompletedTasks}
            onTaskClick={(task) => {
              setSelectedTask(task);
              setIsCreatingTask(false);
              setIsTaskDrawerOpen(true);
            }}
            onAddTaskClick={() => {
              setSelectedTask(null);
              setIsCreatingTask(true);
              setIsTaskDrawerOpen(true);
            }}
          />
        </div>
        </div>{/* End card content padding wrapper */}
      </div>
      <CardDetailDrawer
        card={card}
        isOpen={isCardDrawerOpen}
        onClose={() => setIsCardDrawerOpen(false)}
      />
      <TaskDrawer
        task={isCreatingTask ? null : selectedTask}
        createForChannelId={isCreatingTask ? card.channelId : undefined}
        createForCardId={isCreatingTask ? card.id : undefined}
        isOpen={isTaskDrawerOpen}
        onClose={() => {
          setIsTaskDrawerOpen(false);
          setSelectedTask(null);
          setIsCreatingTask(false);
        }}
        onOpenCard={() => {
          setIsTaskDrawerOpen(false);
          setSelectedTask(null);
          setIsCreatingTask(false);
          setIsCardDrawerOpen(true);
        }}
      />
    </>
  );
}
