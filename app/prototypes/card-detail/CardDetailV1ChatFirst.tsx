'use client';

import { useState, useRef, useEffect } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

interface Message {
  id: string;
  type: 'question' | 'ai_response' | 'note';
  content: string;
  createdAt: string;
  replyToMessageId?: string;
  proposedActions?: Array<{
    id: string;
    type: 'create_task' | 'add_tag' | 'remove_tag';
    data: { title?: string; description?: string; tagName?: string };
    status: 'pending' | 'approved' | 'rejected';
  }>;
}

interface Task {
  id: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'done';
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface CardDetailV1Props {
  isOpen: boolean;
  onClose: () => void;
  card: {
    id: string;
    title: string;
    summary?: string;
    tags?: string[];
    messages?: Message[];
  };
  tasks: Task[];
  tags: Tag[];
}

export function CardDetailV1ChatFirst({ isOpen, onClose, card, tasks, tags }: CardDetailV1Props) {
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputMode, setInputMode] = useState<'note' | 'question'>('question');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [card.messages]);

  // Close header when clicking outside
  useEffect(() => {
    if (!isHeaderExpanded) return;
    const handleClick = () => setIsHeaderExpanded(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isHeaderExpanded]);

  if (!isOpen) return null;

  const completedTasks = tasks.filter(t => t.status === 'done').length;
  const cardTags = tags.filter(t => card.tags?.includes(t.name));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="w-full h-[95vh] sm:h-[85vh] sm:max-w-md bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Collapsible Header */}
        <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-800">
          {/* Compact header (always visible) */}
          <div
            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setIsHeaderExpanded(!isHeaderExpanded);
            }}
          >
            {/* Expand indicator */}
            <button className="w-6 h-6 flex items-center justify-center text-neutral-400">
              <svg
                className={`w-4 h-4 transition-transform ${isHeaderExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Card title */}
            <h2 className="flex-1 font-medium text-neutral-900 dark:text-white truncate">
              {card.title}
            </h2>

            {/* Quick stats */}
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              {tasks.length > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  {completedTasks}/{tasks.length}
                </span>
              )}
              {cardTags.length > 0 && (
                <div className="flex gap-0.5">
                  {cardTags.slice(0, 2).map(tag => (
                    <span
                      key={tag.id}
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: tag.color === 'red' ? '#f87171' : tag.color === 'blue' ? '#60a5fa' : '#a3a3a3' }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Expanded content */}
          {isHeaderExpanded && (
            <div
              className="px-4 pb-4 space-y-4 border-t border-neutral-100 dark:border-neutral-800 animate-in slide-in-from-top-2 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Summary */}
              {card.summary && (
                <div className="pt-3">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">{card.summary}</p>
                </div>
              )}

              {/* Tags */}
              {cardTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {cardTags.map(tag => (
                    <span
                      key={tag.id}
                      className="px-2 py-0.5 text-xs font-medium rounded"
                      style={{
                        backgroundColor: tag.color === 'red' ? '#fef2f2' : tag.color === 'blue' ? '#eff6ff' : '#f5f5f5',
                        color: tag.color === 'red' ? '#dc2626' : tag.color === 'blue' ? '#2563eb' : '#525252'
                      }}
                    >
                      {tag.name}
                    </span>
                  ))}
                  <button className="px-2 py-0.5 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
                    + Add
                  </button>
                </div>
              )}

              {/* Tasks */}
              {tasks.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Tasks</h3>
                    <button className="text-xs text-violet-600 dark:text-violet-400 hover:underline">
                      View all
                    </button>
                  </div>
                  <div className="space-y-1">
                    {tasks.slice(0, 3).map(task => (
                      <div key={task.id} className="flex items-center gap-2 py-1">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          task.status === 'done'
                            ? 'bg-green-500 border-green-500'
                            : task.status === 'in_progress'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                            : 'border-neutral-300 dark:border-neutral-600'
                        }`}>
                          {task.status === 'done' && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {task.status === 'in_progress' && (
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          )}
                        </div>
                        <span className={`text-sm ${task.status === 'done' ? 'text-neutral-400 line-through' : 'text-neutral-700 dark:text-neutral-300'}`}>
                          {task.title}
                        </span>
                      </div>
                    ))}
                    {tasks.length > 3 && (
                      <p className="text-xs text-neutral-400 pl-6">+{tasks.length - 3} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {card.messages?.map(message => (
            <div key={message.id} className="group">
              <div className={`rounded-2xl px-4 py-3 ${
                message.type === 'ai_response'
                  ? 'bg-neutral-100 dark:bg-neutral-800'
                  : message.type === 'question'
                  ? 'bg-blue-50 dark:bg-blue-900/20 ml-8'
                  : 'bg-neutral-50 dark:bg-neutral-800/50 ml-8'
              }`}>
                {message.type === 'ai_response' && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                    <KanthinkIcon size={14} className="text-violet-500" />
                    Kan
                  </div>
                )}
                <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                  {message.content}
                </p>

                {/* Smart snippets */}
                {message.proposedActions && message.proposedActions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
                    <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Kan suggests</div>
                    {message.proposedActions.map(action => (
                      <div
                        key={action.id}
                        className={`rounded-lg border px-3 py-2 ${
                          action.status === 'approved'
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50'
                            : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className={`w-4 h-4 ${action.status === 'approved' ? 'text-green-500' : 'text-violet-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <span className="flex-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                            {action.data.title}
                          </span>
                          {action.status === 'approved' ? (
                            <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">Added</span>
                          ) : (
                            <div className="flex gap-1">
                              <button className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button className="p-1 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 border-t border-neutral-200 dark:border-neutral-800 p-3 bg-white dark:bg-neutral-900">
          <div className="flex items-end gap-2">
            <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-2xl px-4 py-2">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputMode === 'question' ? 'Ask Kan...' : 'Add a note...'}
                className="w-full bg-transparent text-sm text-neutral-900 dark:text-white placeholder-neutral-400 resize-none focus:outline-none"
                rows={1}
              />
              {/* Mode toggle */}
              <div className="flex items-center gap-1 mt-1">
                <button
                  onClick={() => setInputMode('note')}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    inputMode === 'note'
                      ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white'
                      : 'text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  Note
                </button>
                <button
                  onClick={() => setInputMode('question')}
                  className={`px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1 ${
                    inputMode === 'question'
                      ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                      : 'text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  <KanthinkIcon size={12} />
                  Ask Kan
                </button>
              </div>
            </div>
            <button
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                inputValue.trim()
                  ? 'bg-violet-500 text-white hover:bg-violet-600'
                  : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
