'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Channel, ID, Card as CardType } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Drawer } from '@/components/ui';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

interface ChannelActionsDrawerProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
}

type ActionType = 'newsletter' | 'course' | 'blog' | null;
type GenerationState = 'idle' | 'generating' | 'preview' | 'sending' | 'sent' | 'error';

export function ChannelActionsDrawer({ channel, isOpen, onClose }: ChannelActionsDrawerProps) {
  const allCards = useStore((s) => s.cards);
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [genState, setGenState] = useState<GenerationState>('idle');
  const [generatedContent, setGeneratedContent] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [error, setError] = useState('');
  const [selectedColumnIds, setSelectedColumnIds] = useState<Set<string>>(new Set());

  // Get all cards organized by column
  const columnCards = useMemo(() => {
    return channel.columns.map((col) => {
      const cards = (col.itemOrder || col.cardIds || [])
        .map((id) => allCards[id])
        .filter(Boolean) as CardType[];
      return { column: col, cards };
    });
  }, [channel, allCards]);

  const totalCards = useMemo(() =>
    columnCards.reduce((sum, { cards }) => sum + cards.length, 0),
    [columnCards]
  );

  // Get cards from selected columns (or all if none selected)
  const selectedCards = useMemo(() => {
    const cols = selectedColumnIds.size > 0
      ? columnCards.filter(({ column }) => selectedColumnIds.has(column.id))
      : columnCards;
    return cols.flatMap(({ cards }) => cards);
  }, [columnCards, selectedColumnIds]);

  const toggleColumn = useCallback((colId: string) => {
    setSelectedColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async (type: ActionType) => {
    if (!type) return;
    setGenState('generating');
    setError('');

    const cardContext = selectedCards.map((card) => ({
      title: card.title,
      summary: card.summary || '',
      content: card.messages?.map((m) => m.content).join('\n').slice(0, 500) || '',
      tags: card.tags || [],
    }));

    const typePrompts: Record<string, string> = {
      newsletter: `Create an engaging email newsletter based on the following channel content. The channel is called "${channel.name}"${channel.description ? ` and is about: ${channel.description}` : ''}. Write a compelling subject line, introduction paragraph, and then summarize the key cards as newsletter sections with headers. Keep it concise and scannable. Use a warm, professional tone. Output as HTML suitable for email.`,
      course: `Create a course outline based on the following channel content. The channel is called "${channel.name}". Organize the cards into logical modules/lessons. For each lesson, include a title, learning objective, and key points. Output as clean HTML.`,
      blog: `Create a blog post based on the following channel content. The channel is called "${channel.name}". Write a compelling title, introduction, and body that weaves the card content into a cohesive narrative. Output as clean HTML.`,
    };

    try {
      const res = await fetch('/api/channels/actions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          channelName: channel.name,
          channelDescription: channel.description || '',
          prompt: typePrompts[type],
          cards: cardContext,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Generation failed');
      }

      const data = await res.json();
      setGeneratedContent(data.content);
      setGenState('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to generate content');
      setGenState('error');
    }
  }, [selectedCards, channel]);

  const handleSendEmail = useCallback(async () => {
    if (!recipientEmail.trim()) {
      setError('Please enter a recipient email');
      return;
    }
    setGenState('sending');
    setError('');

    try {
      const res = await fetch('/api/channels/actions/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail.trim(),
          channelName: channel.name,
          html: generatedContent,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Send failed');
      }

      setGenState('sent');
    } catch (err: any) {
      setError(err.message || 'Failed to send email');
      setGenState('error');
    }
  }, [recipientEmail, generatedContent, channel]);

  const handleBack = useCallback(() => {
    setActiveAction(null);
    setGenState('idle');
    setGeneratedContent('');
    setError('');
    setRecipientEmail('');
  }, []);

  const handleClose = useCallback(() => {
    handleBack();
    onClose();
  }, [handleBack, onClose]);

  const actions = [
    {
      type: 'newsletter' as const,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      title: 'Email Newsletter',
      description: 'Generate a newsletter from your cards and send it via email',
      ready: true,
    },
    {
      type: 'course' as const,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      title: 'Course Outline',
      description: 'Turn your cards into a structured course with modules and lessons',
      ready: true,
    },
    {
      type: 'blog' as const,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      ),
      title: 'Blog Post',
      description: 'Generate a blog post or article from your channel content',
      ready: true,
    },
  ];

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} width="lg" floating>
      <div className="p-6 pt-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <KanthinkIcon size={18} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {activeAction ? actions.find((a) => a.type === activeAction)?.title : 'Channel Actions'}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {activeAction
                ? `Generate from ${selectedCards.length} card${selectedCards.length !== 1 ? 's' : ''} in ${channel.name}`
                : `Turn "${channel.name}" content into something shareable`}
            </p>
          </div>
          {activeAction && (
            <button
              onClick={handleBack}
              className="ml-auto text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              Back
            </button>
          )}
        </div>

        {!activeAction ? (
          <>
            {/* Action cards */}
            <div className="space-y-3 mb-6">
              {actions.map((action) => (
                <button
                  key={action.type}
                  onClick={() => setActiveAction(action.type)}
                  className="w-full flex items-start gap-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-all text-left group"
                >
                  <div className="mt-0.5 text-neutral-400 group-hover:text-violet-500 transition-colors">
                    {action.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-neutral-900 dark:text-white text-sm">
                      {action.title}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {action.description}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-neutral-300 dark:text-neutral-600 mt-1 group-hover:text-violet-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

            {/* Channel stats */}
            <div className="text-xs text-neutral-400 dark:text-neutral-500 flex items-center gap-3">
              <span>{totalCards} cards across {channel.columns.length} columns</span>
            </div>
          </>
        ) : genState === 'idle' || genState === 'error' ? (
          /* Column selection + generate */
          <div>
            <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
              Select columns to include
            </h3>
            <div className="space-y-2 mb-4">
              {columnCards.map(({ column, cards }) => (
                <label
                  key={column.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedColumnIds.size === 0 || selectedColumnIds.has(column.id)}
                    onChange={() => toggleColumn(column.id)}
                    className="rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="flex-1 text-sm text-neutral-700 dark:text-neutral-300">
                    {column.name}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {cards.length} card{cards.length !== 1 ? 's' : ''}
                  </span>
                </label>
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={() => handleGenerate(activeAction)}
              disabled={selectedCards.length === 0}
              className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-neutral-300 disabled:dark:bg-neutral-700 text-white font-medium text-sm transition-colors"
            >
              Generate from {selectedCards.length} card{selectedCards.length !== 1 ? 's' : ''}
            </button>
          </div>
        ) : genState === 'generating' ? (
          /* Loading */
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full mb-4" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Kan is generating your {activeAction}...
            </p>
          </div>
        ) : genState === 'preview' ? (
          /* Preview */
          <div>
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden mb-4">
              <div className="max-h-[400px] overflow-y-auto p-4 bg-white dark:bg-neutral-800">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: generatedContent }}
                />
              </div>
            </div>

            {activeAction === 'newsletter' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Send to email
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                />
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => handleGenerate(activeAction)}
                className="flex-1 py-2.5 px-4 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Regenerate
              </button>
              {activeAction === 'newsletter' ? (
                <button
                  onClick={handleSendEmail}
                  disabled={!recipientEmail.trim()}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-neutral-300 disabled:dark:bg-neutral-700 text-white font-medium text-sm transition-colors"
                >
                  Send Newsletter
                </button>
              ) : (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedContent);
                    setError('');
                  }}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium text-sm transition-colors"
                >
                  Copy HTML
                </button>
              )}
            </div>
          </div>
        ) : genState === 'sending' ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full mb-4" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Sending newsletter...</p>
          </div>
        ) : genState === 'sent' ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-neutral-900 dark:text-white mb-1">Newsletter sent!</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Delivered to {recipientEmail}</p>
            <button
              onClick={handleBack}
              className="mt-4 text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400"
            >
              Back to actions
            </button>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
