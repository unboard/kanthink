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

  // Status styles
  const containerStyles = isPending
    ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800'
    : isApproved
    ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
    : 'bg-neutral-100 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 opacity-60';

  return (
    <div className={`rounded-lg border px-3 py-2 ${containerStyles}`}>
      <div className="flex items-start gap-2">
        {/* Action type indicator */}
        <div className="flex-shrink-0 mt-0.5">
          {action.type === 'create_task' && (
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                isApproved
                  ? 'bg-green-500 border-green-500'
                  : isRejected
                  ? 'border-neutral-400'
                  : 'border-violet-400'
              }`}
            >
              {isApproved && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          )}
          {(action.type === 'add_tag' || action.type === 'remove_tag') && (
            <div className={`flex items-center justify-center w-4 h-4 ${isRejected ? 'text-neutral-400' : 'text-violet-500'}`}>
              {action.type === 'add_tag' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              )}
            </div>
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

        {/* Action buttons */}
        {isPending && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {isEditing ? (
              <>
                <button
                  onClick={handleApprove}
                  className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                  title="Apply"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                  title="Cancel edit"
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
                  className="p-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={handleApprove}
                  className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                  title="Approve"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  onClick={handleReject}
                  className="p-1 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                  title="Reject"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}

        {/* Status badge for completed actions */}
        {isApproved && (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium flex-shrink-0">
            Applied
          </span>
        )}
        {isRejected && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium flex-shrink-0">
            Skipped
          </span>
        )}
      </div>
    </div>
  );
}
