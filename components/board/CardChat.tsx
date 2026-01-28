'use client';

import { useRef, useEffect, useState } from 'react';
import type { Card, CardMessageType } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useSettingsStore, isAIConfigured } from '@/lib/settingsStore';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface CardChatProps {
  card: Card;
  channelName: string;
  channelDescription: string;
}

export function CardChat({ card, channelName, channelDescription }: CardChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const addMessage = useStore((s) => s.addMessage);
  const addAIResponse = useStore((s) => s.addAIResponse);
  const editMessage = useStore((s) => s.editMessage);
  const deleteMessage = useStore((s) => s.deleteMessage);
  const setCardSummary = useStore((s) => s.setCardSummary);
  const tasks = useStore((s) => s.tasks);

  const ai = useSettingsStore((s) => s.ai);
  const aiConfigured = isAIConfigured();

  // Get tasks for this card
  const cardTasks = (card.taskIds ?? [])
    .map((id) => tasks[id])
    .filter(Boolean);

  // Safe access to messages array (handles legacy cards)
  const messages = card.messages ?? [];

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const handleSubmit = async (content: string, type: CardMessageType, imageUrls?: string[]) => {
    // Add the message
    const message = addMessage(card.id, type, content, imageUrls);
    if (!message) return;

    // If it's a question, send to AI
    if (type === 'question') {
      if (!aiConfigured) {
        setAIError('AI is not configured. Please add your API key in settings.');
        return;
      }

      setIsAILoading(true);
      setAIError(null);

      try {
        const response = await fetch('/api/card-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardId: card.id,
            questionContent: content,
            imageUrls,
            context: {
              cardTitle: card.title,
              channelName,
              channelDescription,
              tasks: cardTasks.map((t) => ({ title: t.title, status: t.status })),
              previousMessages: messages.slice(-10),
            },
            aiConfig: {
              provider: ai.provider,
              apiKey: ai.apiKey,
              model: ai.model,
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to get AI response');
        }

        const data = await response.json();
        addAIResponse(card.id, message.id, data.response);

        // Optionally trigger summary update
        if (messages.length >= 3 && (messages.length % 3 === 0 || !card.summary)) {
          generateSummary();
        }
      } catch (error) {
        setAIError(error instanceof Error ? error.message : 'Failed to get AI response');
      } finally {
        setIsAILoading(false);
      }
    }
  };

  const generateSummary = async () => {
    if (!aiConfigured) return;

    try {
      const response = await fetch('/api/card-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardTitle: card.title,
          messages: messages,
          tasks: cardTasks.map((t) => ({ title: t.title, status: t.status })),
          aiConfig: {
            provider: ai.provider,
            apiKey: ai.apiKey,
            model: ai.model,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCardSummary(card.id, data.summary);
      }
    } catch {
      // Silently fail for summary - it's not critical
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    if (confirm('Delete this message?')) {
      deleteMessage(card.id, messageId);
    }
  };

  const chatContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fullscreen header - only shown in fullscreen mode */}
      {isFullscreen && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 dark:border-neutral-800">
          <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
            {card.title}
          </h3>
          <button
            onClick={() => setIsFullscreen(false)}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
            title="Exit fullscreen"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Summary section */}
      {card.summary && (
        <div className="px-4 py-3 bg-violet-50 dark:bg-violet-950/20 border-b border-violet-100 dark:border-violet-900/30">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            <div>
              <div className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-0.5">
                AI Summary
              </div>
              <p className="text-sm text-violet-800 dark:text-violet-200">
                {card.summary}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 pb-2 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">
              No messages yet
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Add notes or ask AI questions about this card
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onDelete={() => handleDeleteMessage(message.id)}
              onEdit={(content) => editMessage(card.id, message.id, content)}
            />
          ))
        )}

        {/* AI Loading indicator */}
        {isAILoading && (
          <div className="pl-3 relative">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-violet-400 dark:bg-violet-500 rounded-full" />
            <div className="rounded-lg px-3 py-2 bg-violet-50 dark:bg-violet-950/30">
              <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                AI is thinking...
              </div>
            </div>
          </div>
        )}

        {/* AI Error */}
        {aiError && (
          <div className="rounded-lg px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div className="text-sm text-red-700 dark:text-red-300">{aiError}</div>
                <button
                  onClick={() => setAIError(null)}
                  className="text-xs text-red-600 dark:text-red-400 underline mt-1"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSubmit={handleSubmit} isLoading={isAILoading} cardId={card.id} />
    </div>
  );

  // Fullscreen mode - render in a fixed overlay
  if (isFullscreen) {
    return (
      <>
        {/* Keep a placeholder in the drawer */}
        <div className="flex flex-col h-full items-center justify-center bg-neutral-50 dark:bg-neutral-900">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Chat is in fullscreen mode
          </p>
          <button
            onClick={() => setIsFullscreen(false)}
            className="mt-2 text-xs text-violet-600 dark:text-violet-400 hover:underline"
          >
            Exit fullscreen
          </button>
        </div>

        {/* Fullscreen overlay */}
        <div className="fixed inset-0 z-[60] bg-white dark:bg-neutral-900 flex flex-col">
          <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full h-full overflow-hidden">
            {chatContent}
          </div>
        </div>
      </>
    );
  }

  // Normal mode
  return chatContent;
}
