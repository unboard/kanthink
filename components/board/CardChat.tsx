'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Card, CardMessageType, StoredAction, CreateTaskActionData, AddTagActionData, RemoveTagActionData, TagDefinition } from '@/lib/types';
import { useStore } from '@/lib/store';
import { requireSignInForAI } from '@/lib/settingsStore';
import { ChatMessage } from './ChatMessage';
import { ChatInput, useKeyboardOffset } from './ChatInput';
import { useTypewriter } from '@/lib/hooks/useTypewriter';

interface CardChatProps {
  card: Card;
  channelName: string;
  channelDescription: string;
  tagDefinitions?: TagDefinition[];
}

export function CardChat({ card, channelName, channelDescription, tagDefinitions = [] }: CardChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);

  // Track keyboard height for mobile input positioning
  // We pass onFocus/onBlur to ChatInput so they share the same keyboard state
  const { keyboardOffset, onFocus: handleKeyboardFocus, onBlur: handleKeyboardBlur } = useKeyboardOffset();

  const addMessage = useStore((s) => s.addMessage);
  const addAIResponse = useStore((s) => s.addAIResponse);
  const editMessage = useStore((s) => s.editMessage);
  const deleteMessage = useStore((s) => s.deleteMessage);
  const setCardSummary = useStore((s) => s.setCardSummary);
  const updateMessageAction = useStore((s) => s.updateMessageAction);
  const createTask = useStore((s) => s.createTask);
  const addTagDefinition = useStore((s) => s.addTagDefinition);
  const addTagToCard = useStore((s) => s.addTagToCard);
  const removeTagFromCard = useStore((s) => s.removeTagFromCard);
  const tasks = useStore((s) => s.tasks);

  // Get tasks for this card
  const cardTasks = (card.taskIds ?? [])
    .map((id) => tasks[id])
    .filter(Boolean);

  // Safe access to messages array (handles legacy cards)
  const messages = card.messages ?? [];

  // Get card tags
  const cardTags = card.tags ?? [];

  // Track the latest AI message for typewriter effect
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);

  // Track messages that have already been displayed (to avoid replaying on re-mount)
  const seenMessagesRef = useRef<Set<string>>(new Set());

  // On mount, mark all existing messages as "seen" so we don't replay typewriter
  useEffect(() => {
    messages.forEach(m => seenMessagesRef.current.add(m.id));
  }, []); // Only run on mount

  // Find the message being typed
  const typingMessage = typingMessageId
    ? messages.find(m => m.id === typingMessageId)
    : null;

  // Callback to mark typing as complete
  const handleTypingComplete = useCallback(() => {
    if (typingMessageId) {
      seenMessagesRef.current.add(typingMessageId);
    }
    setTypingMessageId(null);
  }, [typingMessageId]);

  // Typewriter effect for the current AI message
  const { displayedText, isTyping, skipToEnd } = useTypewriter(
    typingMessage?.content || '',
    {
      speed: 80,
      startDelay: 100,
      onComplete: handleTypingComplete,
    }
  );

  // When a new AI response is added, start typing it (only if not already seen)
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage?.type === 'ai_response' &&
      lastMessage.id !== typingMessageId &&
      !seenMessagesRef.current.has(lastMessage.id)
    ) {
      setTypingMessageId(lastMessage.id);
    }
  }, [messages, typingMessageId]);

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
    // If it's a question, check auth before proceeding
    if (type === 'question' && !requireSignInForAI()) {
      return;
    }

    // Add the message
    const message = addMessage(card.id, type, content, imageUrls);
    if (!message) return;

    // If it's a question, send to AI
    if (type === 'question') {
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
              cardTags: cardTags,
              availableTags: tagDefinitions,
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to get AI response');
        }

        const data = await response.json();
        // Pass actions to addAIResponse
        addAIResponse(card.id, message.id, data.response, data.actions);

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
    if (isSummaryLoading) return;
    setIsSummaryLoading(true);

    try {
      const response = await fetch('/api/card-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardTitle: card.title,
          messages: messages,
          tasks: cardTasks.map((t) => ({ title: t.title, status: t.status })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCardSummary(card.id, data.summary);
      }
    } catch {
      // Silently fail for summary - it's not critical
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    if (confirm('Delete this message?')) {
      deleteMessage(card.id, messageId);
    }
  };

  // Handle approving a smart snippet action
  const handleActionApprove = (messageId: string, actionId: string, editedData?: StoredAction['data']) => {
    // Find the message and action
    const message = messages.find((m) => m.id === messageId);
    if (!message?.proposedActions) return;

    const action = message.proposedActions.find((a) => a.id === actionId);
    if (!action || action.status !== 'pending') return;

    const dataToUse = editedData ?? action.data;

    // Execute the action based on type
    let resultId: string | undefined;
    const timestamp = new Date().toISOString();

    try {
      if (action.type === 'create_task') {
        const taskData = dataToUse as CreateTaskActionData;
        const task = createTask(card.channelId, card.id, {
          title: taskData.title,
          description: taskData.description,
        });
        resultId = task.id;
      } else if (action.type === 'add_tag') {
        const tagData = dataToUse as AddTagActionData;
        // Check if tag definition needs to be created
        const existingTag = tagDefinitions.find(
          (t) => t.name.toLowerCase() === tagData.tagName.toLowerCase()
        );
        if (!existingTag && tagData.createDefinition !== false) {
          // Create the tag definition
          const newTag = addTagDefinition(
            card.channelId,
            tagData.tagName,
            tagData.suggestedColor ?? 'blue'
          );
          resultId = newTag.id;
        }
        // Add tag to card
        addTagToCard(card.id, tagData.tagName);
      } else if (action.type === 'remove_tag') {
        const tagData = dataToUse as RemoveTagActionData;
        removeTagFromCard(card.id, tagData.tagName);
      }

      // Update the action status
      updateMessageAction(card.id, messageId, actionId, {
        status: 'approved',
        editedData: editedData,
        executedAt: timestamp,
        resultId,
      });
    } catch (error) {
      console.error('Failed to execute action:', error);
    }
  };

  // Handle rejecting a smart snippet action
  const handleActionReject = (messageId: string, actionId: string) => {
    updateMessageAction(card.id, messageId, actionId, {
      status: 'rejected',
    });
  };

  // Handle approving all pending actions in a message
  const handleApproveAll = (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message?.proposedActions) return;

    const pendingActions = message.proposedActions.filter(a => a.status === 'pending');
    for (const action of pendingActions) {
      handleActionApprove(messageId, action.id);
    }
  };

  // Handle rejecting all pending actions in a message
  const handleRejectAll = (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message?.proposedActions) return;

    const pendingActions = message.proposedActions.filter(a => a.status === 'pending');
    for (const action of pendingActions) {
      handleActionReject(messageId, action.id);
    }
  };

  const chatContent = (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* Fullscreen header - only shown in fullscreen mode */}
      {isFullscreen && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2">
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
        <div className="flex-shrink-0 px-4 py-3 bg-violet-50 dark:bg-violet-950/20">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-0.5">
                AI Summary
              </div>
              <p className="text-sm text-violet-800 dark:text-violet-200">
                {card.summary}
              </p>
            </div>
            <button
              onClick={generateSummary}
              disabled={isSummaryLoading}
              className="p-1 rounded text-violet-400 hover:text-violet-600 dark:text-violet-500 dark:hover:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors disabled:opacity-50 flex-shrink-0"
              title="Refresh summary"
            >
              <svg
                className={`w-4 h-4 ${isSummaryLoading ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Messages area - extra bottom padding so content scrolls behind input */}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col h-full">
            {/* Spacer to push suggestions toward bottom */}
            <div className="flex-1" />
            {/* Empty state suggestions - positioned near the input */}
            <div className="px-1 pb-4 space-y-2">
              <button
                onClick={() => {
                  // Switch to note mode and focus
                  const noteBtn = document.querySelector('[data-mode="note"]') as HTMLButtonElement;
                  noteBtn?.click();
                  setTimeout(() => {
                    const textarea = document.querySelector('.chat-textarea') as HTMLTextAreaElement;
                    textarea?.focus();
                  }, 50);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center flex-shrink-0 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors">
                  <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Add a note</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">Jot down thoughts or information</p>
                </div>
              </button>
              <button
                onClick={() => {
                  // Switch to question mode and focus
                  const askKanBtn = document.querySelector('[data-mode="question"]') as HTMLButtonElement;
                  askKanBtn?.click();
                  setTimeout(() => {
                    const textarea = document.querySelector('.chat-textarea') as HTMLTextAreaElement;
                    textarea?.focus();
                  }, 50);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-200 dark:group-hover:bg-violet-900/60 transition-colors">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
                    alt="Kan"
                    className="w-5 h-5"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-violet-700 dark:text-violet-300">Ask Kan</p>
                  <p className="text-xs text-violet-500 dark:text-violet-400">Get AI help with this card</p>
                </div>
              </button>
              <button
                onClick={() => {
                  // Trigger the file input in ChatInput
                  const fileInput = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
                  fileInput?.click();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center flex-shrink-0 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors">
                  <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Upload images</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">Attach photos or screenshots</p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const isMessageTyping = message.id === typingMessageId && isTyping;
            return (
              <ChatMessage
                key={message.id}
                message={message}
                onDelete={() => handleDeleteMessage(message.id)}
                onEdit={(content) => editMessage(card.id, message.id, content)}
                tagDefinitions={tagDefinitions}
                cardTags={cardTags}
                onActionApprove={handleActionApprove}
                onActionReject={handleActionReject}
                onApproveAll={handleApproveAll}
                onRejectAll={handleRejectAll}
                displayText={isMessageTyping ? displayedText : undefined}
                isTyping={isMessageTyping}
                onSkipTyping={isMessageTyping ? skipToEnd : undefined}
              />
            );
          })
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

      {/* Input - absolute positioned at bottom with gradient fade */}
      {/* On mobile, position above keyboard using keyboardOffset */}
      {/* Subtract ~60px to account for the tab bar below this container (keyboardOffset is from screen bottom) */}
      <div
        className="absolute left-0 right-0 bg-gradient-to-t from-white from-70% dark:from-neutral-900 to-transparent pt-8 transition-[bottom] duration-100"
        style={{ bottom: keyboardOffset > 0 ? `${Math.max(0, keyboardOffset - 60)}px` : 0 }}
      >
        <ChatInput
          onSubmit={handleSubmit}
          isLoading={isAILoading}
          cardId={card.id}
          onKeyboardFocus={handleKeyboardFocus}
          onKeyboardBlur={handleKeyboardBlur}
        />
      </div>
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
