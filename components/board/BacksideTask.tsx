'use client';

import type { Task, ID } from '@/lib/types';
import { useStore } from '@/lib/store';

interface BacksideTaskProps {
  task: Task;
  channelId: ID;
  columnId: ID;
}

export function BacksideTask({ task, channelId, columnId }: BacksideTaskProps) {
  const unhideTask = useStore((s) => s.unhideTask);
  const deleteTask = useStore((s) => s.deleteTask);

  return (
    <div className="group relative rounded-md bg-neutral-200/50 dark:bg-neutral-700/30 p-2.5 border border-dashed border-neutral-300 dark:border-neutral-600">
      {/* Quick action buttons - always visible on mobile, hover on desktop */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => unhideTask(channelId, columnId, task.id)}
          className="p-1 rounded text-neutral-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
          title="Restore task"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
        <button
          onClick={() => deleteTask(task.id)}
          className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          title="Delete task"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="flex items-start gap-2">
        <svg className="w-3.5 h-3.5 mt-0.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 pr-12 line-through decoration-neutral-400">
          {task.title}
        </h4>
      </div>
    </div>
  );
}
