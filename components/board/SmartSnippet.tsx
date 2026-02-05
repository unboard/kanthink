'use client';

import { useState } from 'react';
import type { StoredAction, TagDefinition } from '@/lib/types';
import { TaskSnippet } from './TaskSnippet';
import { TagSnippet } from './TagSnippet';

interface SmartSnippetProps {
  action: StoredAction;
  tagDefinitions: TagDefinition[];
  cardTags: string[];
  onApprove: (actionId: string, editedData?: StoredAction['data']) => void;
  onReject: (actionId: string) => void;
}

export function SmartSnippet({
  action,
  tagDefinitions,
  cardTags,
  onApprove,
  onReject,
}: SmartSnippetProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<StoredAction['data']>(action.editedData ?? action.data);

  const isPending = action.status === 'pending';
  const isApproved = action.status === 'approved';
  const isRejected = action.status === 'rejected';

  const handleApprove = () => {
    onApprove(action.id, isEditing ? editedData : undefined);
    setIsEditing(false);
  };

  const handleReject = () => {
    onReject(action.id);
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    setEditedData(action.editedData ?? action.data);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedData(action.editedData ?? action.data);
    setIsEditing(false);
  };

  // Status-based container styles
  const containerStyles = isPending
    ? 'bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700'
    : isApproved
    ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/50'
    : 'bg-neutral-50 dark:bg-neutral-800/30 border-neutral-200 dark:border-neutral-700 opacity-50';

  // Icon color based on status
  const iconColor = isApproved
    ? 'text-green-500 dark:text-green-400'
    : isRejected
    ? 'text-neutral-400 dark:text-neutral-500'
    : 'text-violet-500 dark:text-violet-400';

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${containerStyles}`}>
      <div className="flex items-start gap-2.5">
        {/* Action type icon - non-interactive indicator */}
        <div className={`flex-shrink-0 mt-0.5 ${iconColor}`}>
          {action.type === 'create_task' && (
            isApproved ? (
              // Checkmark for approved tasks
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              // Clipboard/task icon for pending/rejected
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            )
          )}
          {action.type === 'add_tag' && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          )}
          {action.type === 'remove_tag' && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {action.type === 'create_task' && (
            <TaskSnippet
              data={editedData as { title: string; description?: string }}
              isEditing={isEditing}
              isApproved={isApproved}
              isRejected={isRejected}
              onDataChange={(newData) => setEditedData(newData)}
            />
          )}
          {(action.type === 'add_tag' || action.type === 'remove_tag') && (
            <TagSnippet
              data={editedData as { tagName: string; createDefinition?: boolean; suggestedColor?: string }}
              actionType={action.type}
              isEditing={isEditing}
              isRejected={isRejected}
              tagDefinitions={tagDefinitions}
              cardTags={cardTags}
              onDataChange={(newData) => setEditedData(newData)}
            />
          )}
        </div>

        {/* Action buttons for pending items */}
        {isPending && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {isEditing ? (
              <>
                <button
                  onClick={handleApprove}
                  className="p-1.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md transition-colors"
                  title="Save"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors"
                  title="Cancel"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleStartEdit}
                  className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={handleReject}
                  className="p-1.5 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                  title="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <button
                  onClick={handleApprove}
                  className="p-1.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md transition-colors"
                  title="Add"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}

        {/* Status badge for completed actions */}
        {isApproved && (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium flex-shrink-0 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">
            Added
          </span>
        )}
        {isRejected && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0 line-through">
            Dismissed
          </span>
        )}
      </div>
    </div>
  );
}
