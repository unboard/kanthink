'use client';

import type { TaskStatus } from '@/lib/types';
import { Drawer } from '@/components/ui';

interface Member {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface StatusOption {
  key: TaskStatus;
  label: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { key: 'not_started', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

interface TaskFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  statusFilters: Set<TaskStatus>;
  onStatusFiltersChange: (filters: Set<TaskStatus>) => void;
  statusCounts: Record<TaskStatus, number>;
  assigneeFilters: Set<string>;
  onAssigneeFiltersChange: (filters: Set<string>) => void;
  members: Member[];
  currentUserId?: string;
}

export function TaskFilterDrawer({
  isOpen,
  onClose,
  statusFilters,
  onStatusFiltersChange,
  statusCounts,
  assigneeFilters,
  onAssigneeFiltersChange,
  members,
  currentUserId,
}: TaskFilterDrawerProps) {
  const hasAnyFilter = statusFilters.size > 0 || assigneeFilters.size > 0;

  const toggleStatus = (status: TaskStatus) => {
    const next = new Set(statusFilters);
    if (next.has(status)) {
      next.delete(status);
    } else {
      next.add(status);
    }
    onStatusFiltersChange(next);
  };

  const toggleAssignee = (id: string) => {
    const next = new Set(assigneeFilters);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onAssigneeFiltersChange(next);
  };

  const clearAll = () => {
    onStatusFiltersChange(new Set());
    onAssigneeFiltersChange(new Set());
  };

  const otherMembers = members.filter((m) => m.id !== currentUserId);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="md" floating hideCloseButton>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Filters</h3>
          <div className="flex items-center gap-2">
            {hasAnyFilter && (
              <button
                onClick={clearAll}
                className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status section */}
        <div className="mb-6">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3 block">
            Status
          </label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(({ key, label }) => {
              const isSelected = statusFilters.has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleStatus(key)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    isSelected
                      ? 'border-violet-400 bg-violet-100 text-violet-800 dark:border-violet-600 dark:bg-violet-900/40 dark:text-violet-300'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'
                  }`}
                >
                  {label}
                  <span className="ml-1.5 text-xs opacity-70">{statusCounts[key]}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">
            {statusFilters.size === 0
              ? 'Showing all statuses'
              : `${statusFilters.size} selected`}
          </p>
        </div>

        {/* Assignee section */}
        <div>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3 block">
            Assignee
          </label>
          <div className="space-y-1">
            {/* "Me" quick toggle */}
            {currentUserId && (
              <button
                onClick={() => toggleAssignee(currentUserId)}
                className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                  assigneeFilters.has(currentUserId)
                    ? 'bg-violet-50 dark:bg-violet-900/20'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
              >
                {(() => {
                  const me = members.find((m) => m.id === currentUserId);
                  return me?.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={me.image} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-violet-200 dark:bg-violet-800 flex items-center justify-center text-xs font-medium text-violet-700 dark:text-violet-300">
                      Me
                    </div>
                  );
                })()}
                <span className="flex-1 text-left text-neutral-800 dark:text-neutral-200 font-medium">
                  Me
                </span>
                {assigneeFilters.has(currentUserId) && (
                  <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )}

            {/* Other members */}
            {otherMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => toggleAssignee(member.id)}
                className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                  assigneeFilters.has(member.id)
                    ? 'bg-violet-50 dark:bg-violet-900/20'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
              >
                {member.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={member.image} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {member.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                )}
                <span className="flex-1 text-left text-neutral-700 dark:text-neutral-300">
                  {member.name}
                </span>
                {assigneeFilters.has(member.id) && (
                  <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}

            {members.length === 0 && (
              <p className="text-sm text-neutral-400 dark:text-neutral-500 px-3 py-2">
                No members in this channel
              </p>
            )}
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">
            {assigneeFilters.size === 0
              ? 'Showing tasks assigned to anyone'
              : `${assigneeFilters.size} selected`}
          </p>
        </div>
      </div>
    </Drawer>
  );
}
