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

interface InstructionRun {
  id: string;
  instructionTitle: string;
  timestamp: string;
  cardsCreated: number;
}

interface CardDetailV2Props {
  isOpen: boolean;
  onClose: () => void;
  card: {
    id: string;
    title: string;
    summary?: string;
    tags?: string[];
    messages?: Message[];
    createdAt?: string;
    updatedAt?: string;
    source?: 'manual' | 'ai';
  };
  tasks: Task[];
  tags: Tag[];
  instructionRuns?: InstructionRun[];
}

type Tab = 'thread' | 'tasks' | 'info';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const tagColorStyles: Record<string, { bg: string; text: string }> = {
  red: { bg: 'bg-red-400', text: 'text-neutral-900' },
  orange: { bg: 'bg-orange-400', text: 'text-neutral-900' },
  yellow: { bg: 'bg-yellow-300', text: 'text-neutral-900' },
  green: { bg: 'bg-green-400', text: 'text-neutral-900' },
  blue: { bg: 'bg-blue-400', text: 'text-neutral-900' },
  purple: { bg: 'bg-purple-400', text: 'text-neutral-900' },
  pink: { bg: 'bg-pink-400', text: 'text-neutral-900' },
  gray: { bg: 'bg-neutral-400', text: 'text-neutral-900' },
};

export function CardDetailV2BottomTabs({ isOpen, onClose, card, tasks, tags, instructionRuns = [] }: CardDetailV2Props) {
  const [activeTab, setActiveTab] = useState<Tab>('thread');
  const [inputValue, setInputValue] = useState('');
  const [inputMode, setInputMode] = useState<'note' | 'question'>('question');
  const [title, setTitle] = useState(card.title);
  const [showRunLogs, setShowRunLogs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'thread') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [card.messages, activeTab]);

  useEffect(() => {
    setTitle(card.title);
  }, [card.title]);

  if (!isOpen) return null;

  const completedTasks = tasks.filter(t => t.status === 'done').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const cardTags = tags.filter(t => card.tags?.includes(t.name));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="w-full h-[95vh] sm:h-[85vh] sm:max-w-md bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="flex-1 font-medium text-neutral-900 dark:text-white truncate">
            {card.title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Thread Tab */}
          {activeTab === 'thread' && (
            <>
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

              {/* Input */}
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
            </>
          )}

          {/* Tasks Tab */}
          {activeTab === 'tasks' && (
            <div className="flex-1 overflow-y-auto">
              {/* Progress bar */}
              <div className="px-4 py-4 border-b border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-neutral-600 dark:text-neutral-400">Progress</span>
                  <span className="font-medium text-neutral-900 dark:text-white">{completedTasks}/{tasks.length}</span>
                </div>
                <div className="h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: tasks.length > 0 ? `${(completedTasks / tasks.length) * 100}%` : '0%' }}
                  />
                </div>
                <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                  <span>{inProgressTasks} in progress</span>
                  <span>{tasks.length - completedTasks - inProgressTasks} not started</span>
                </div>
              </div>

              {/* Task list */}
              <div className="p-4 space-y-2">
                {tasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      task.status === 'done'
                        ? 'bg-green-500 border-green-500'
                        : task.status === 'in_progress'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-neutral-300 dark:border-neutral-600'
                    }`}>
                      {task.status === 'done' && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {task.status === 'in_progress' && (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <span className={`flex-1 text-sm ${task.status === 'done' ? 'text-neutral-400 line-through' : 'text-neutral-800 dark:text-neutral-200'}`}>
                      {task.title}
                    </span>
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                ))}

                {/* Add task button */}
                <button className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-violet-300 hover:text-violet-600 dark:hover:border-violet-700 dark:hover:text-violet-400 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm">Add task</span>
                </button>
              </div>
            </div>
          )}

          {/* Info Tab */}
          {activeTab === 'info' && (
            <div className="flex-1 overflow-y-auto">
              {/* Card header section - mirrors current drawer */}
              <div className="p-4 space-y-4">
                {/* Title */}
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xl font-semibold text-neutral-900 dark:text-white bg-transparent border-none outline-none placeholder-neutral-400"
                  placeholder="Card title"
                />

                {/* Metadata rows */}
                <div className="space-y-3">
                  {/* Source */}
                  <div className="flex items-center">
                    <span className="w-24 text-sm text-neutral-500">Source</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        card.source === 'ai'
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      {card.source === 'ai' ? 'AI Generated' : 'Manual'}
                    </span>
                  </div>

                  {/* Created */}
                  <div className="flex items-center">
                    <span className="w-24 text-sm text-neutral-500">Created</span>
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      {card.createdAt ? formatDate(card.createdAt) : 'Unknown'}
                    </span>
                  </div>

                  {/* Modified */}
                  <div className="flex items-center">
                    <span className="w-24 text-sm text-neutral-500">Modified</span>
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      {card.updatedAt ? formatDate(card.updatedAt) : 'Unknown'}
                    </span>
                  </div>

                  {/* Tags */}
                  <div className="flex items-start">
                    <span className="w-24 text-sm text-neutral-500 pt-0.5">Tags</span>
                    <div className="flex-1 flex flex-wrap items-center gap-1.5">
                      {cardTags.map(tag => {
                        const colorStyle = tagColorStyles[tag.color] || tagColorStyles.gray;
                        return (
                          <span
                            key={tag.id}
                            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-medium ${colorStyle.bg} ${colorStyle.text}`}
                          >
                            {tag.name}
                            <button className="ml-0.5 opacity-60 hover:opacity-100">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        );
                      })}
                      <button className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        {cardTags.length === 0 ? 'Add tag' : ''}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-neutral-200 dark:border-neutral-800" />

              {/* Actions section */}
              <div className="p-4 space-y-1">
                <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Actions</h3>

                {/* Run Logs (if any) */}
                {instructionRuns.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowRunLogs(!showRunLogs)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="flex-1 text-left">Run history</span>
                      <span className="text-xs text-neutral-400">{instructionRuns.length}</span>
                      <svg className={`w-4 h-4 text-neutral-400 transition-transform ${showRunLogs ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {showRunLogs && (
                      <div className="ml-7 mt-1 space-y-2 pb-2">
                        {instructionRuns.map(run => (
                          <div key={run.id} className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{run.instructionTitle}</p>
                            <p className="text-xs text-neutral-500">{formatDate(run.timestamp)}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <button className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 hover:underline">
                                Undo
                              </button>
                              <button className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 hover:underline">
                                Run again
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Create Channel */}
                <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition-colors">
                  <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Create channel from card
                </button>

                {/* Archive */}
                <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition-colors">
                  <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  Archive
                </button>

                {/* Delete */}
                <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Tabs */}
        <div className="flex-shrink-0 flex border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <button
            onClick={() => setActiveTab('thread')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
              activeTab === 'thread'
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-xs font-medium">Thread</span>
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative ${
              activeTab === 'tasks'
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            <div className="relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {tasks.length - completedTasks > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold bg-violet-500 text-white rounded-full flex items-center justify-center">
                  {tasks.length - completedTasks}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">Tasks</span>
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
              activeTab === 'info'
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium">Info</span>
          </button>
        </div>
      </div>
    </div>
  );
}
