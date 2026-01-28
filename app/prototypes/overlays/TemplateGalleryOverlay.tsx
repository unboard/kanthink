'use client';

import { useState, useEffect, useRef } from 'react';

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  columns: string[];
}

const templates: Template[] = [
  {
    id: 'reading',
    name: 'Reading List',
    description: 'Track books, articles, and things to read',
    icon: '📚',
    color: 'bg-amber-500',
    columns: ['To Read', 'Reading', 'Finished', 'Favorites'],
  },
  {
    id: 'learning',
    name: 'Learning Path',
    description: 'Courses, tutorials, and skills to develop',
    icon: '🎓',
    color: 'bg-blue-500',
    columns: ['Discover', 'In Progress', 'Completed', 'Review'],
  },
  {
    id: 'ideas',
    name: 'Idea Backlog',
    description: 'Capture and develop project ideas',
    icon: '💡',
    color: 'bg-yellow-500',
    columns: ['Raw Ideas', 'Exploring', 'Building', 'Shipped'],
  },
  {
    id: 'content',
    name: 'Content Pipeline',
    description: 'Plan and track content creation',
    icon: '✍️',
    color: 'bg-purple-500',
    columns: ['Ideas', 'Drafting', 'Review', 'Published'],
  },
  {
    id: 'research',
    name: 'Research Feed',
    description: 'Collect and organize research topics',
    icon: '🔬',
    color: 'bg-green-500',
    columns: ['Inbox', 'Interesting', 'Deep Dive', 'Archive'],
  },
  {
    id: 'personal',
    name: 'Personal Goals',
    description: 'Track habits and personal development',
    icon: '🎯',
    color: 'bg-rose-500',
    columns: ['Goals', 'This Week', 'In Progress', 'Achieved'],
  },
];

interface TemplateGalleryOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function TemplateGalleryOverlay({ isOpen, onClose, onCreate }: TemplateGalleryOverlayProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [customName, setCustomName] = useState('');
  const [view, setView] = useState<'gallery' | 'customize'>('gallery');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedTemplate(null);
      setCustomName('');
      setView('gallery');
    }
  }, [isOpen]);

  useEffect(() => {
    if (view === 'customize') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [view]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'customize') {
          setView('gallery');
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, view, onClose]);

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setCustomName(template.name);
    setView('customize');
  };

  const handleCreateBlank = () => {
    setSelectedTemplate(null);
    setCustomName('');
    setView('customize');
  };

  const handleCreate = () => {
    if (customName.trim()) {
      onCreate(customName.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden">
        {view === 'gallery' ? (
          <>
            {/* Header */}
            <div className="px-6 py-5 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                Create a channel
              </h2>
              <p className="text-sm text-neutral-500 mt-1">
                Start from a template or create your own
              </p>
            </div>

            {/* Template Grid */}
            <div className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Blank option */}
                <button
                  onClick={handleCreateBlank}
                  className="group relative p-4 rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-violet-400 dark:hover:border-violet-500 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/30 transition-colors">
                    <svg className="w-5 h-5 text-neutral-400 group-hover:text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h3 className="font-medium text-neutral-900 dark:text-white text-sm">
                    Blank channel
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Start from scratch
                  </p>
                </button>

                {/* Templates */}
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className="group relative p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-md transition-all text-left"
                  >
                    <div className={`w-10 h-10 rounded-lg ${template.color} flex items-center justify-center mb-3 text-lg`}>
                      {template.icon}
                    </div>
                    <h3 className="font-medium text-neutral-900 dark:text-white text-sm">
                      {template.name}
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
                      {template.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Customize view */}
            <div className="px-6 py-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3">
              <button
                onClick={() => setView('gallery')}
                className="p-1.5 -ml-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                  {selectedTemplate ? 'Customize template' : 'New channel'}
                </h2>
                {selectedTemplate && (
                  <p className="text-sm text-neutral-500">
                    Based on {selectedTemplate.name}
                  </p>
                )}
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Name input */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Channel name
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g., My Reading List"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-violet-500 dark:focus:border-violet-400 transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customName.trim()) {
                      handleCreate();
                    }
                  }}
                />
              </div>

              {/* Preview columns */}
              {selectedTemplate && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Columns
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.columns.map((col) => (
                      <span
                        key={col}
                        className="px-3 py-1.5 text-sm bg-neutral-100 dark:bg-neutral-800 rounded-lg text-neutral-600 dark:text-neutral-400"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-400 mt-2">
                    You can customize columns after creation
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 flex justify-between">
              <button
                onClick={() => setView('gallery')}
                className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              >
                Back to templates
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!customName.trim()}
                  className="px-5 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Create channel
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
