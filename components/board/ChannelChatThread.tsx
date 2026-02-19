'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import type {
  Channel,
  ChannelChatMessage,
  ChannelChatThread as ThreadType,
  ChannelStoredAction,
  CreateCardActionData,
  ChannelCreateTaskActionData,
  CardMessage,
  CardMessageType,
  StoredAction,
} from '@/lib/types';
import { useStore } from '@/lib/store';
import { requireSignInForAI } from '@/lib/settingsStore';
import { ChatMessage } from './ChatMessage';
import { ChatInput, useKeyboardOffset } from './ChatInput';
import { ChannelActionSnippet, resolveColumnId, resolveCardId } from './ChannelActionSnippet';

interface ChannelChatThreadProps {
  thread: ThreadType;
  channel: Channel;
  onBack?: () => void;
  onThreadUpdate: (thread: ThreadType) => void;
}

// Convert ChannelChatMessage to CardMessage shape for ChatMessage component
function toCardMessage(msg: ChannelChatMessage): CardMessage {
  return {
    id: msg.id,
    type: msg.type === 'question' ? 'question' : 'ai_response',
    content: msg.content,
    imageUrls: msg.imageUrls,
    authorId: msg.authorId,
    authorName: msg.authorName,
    authorImage: msg.authorImage,
    createdAt: msg.createdAt,
    replyToMessageId: msg.replyToMessageId,
    proposedActions: msg.proposedActions as unknown as StoredAction[],
  };
}

export function ChannelChatThread({ thread, channel, onBack, onThreadUpdate }: ChannelChatThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();
  const { keyboardOffset, onFocus: handleKeyboardFocus, onBlur: handleKeyboardBlur } = useKeyboardOffset();

  const createCard = useStore((s) => s.createCard);
  const createTask = useStore((s) => s.createTask);
  const cards = useStore((s) => s.cards);

  const messages = useMemo(() => thread.messages ?? [], [thread.messages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Build context for the API
  const buildContext = useCallback(() => {
    const columns = channel.columns.map((col) => {
      const colCards = col.cardIds
        .map((id) => cards[id])
        .filter(Boolean)
        .slice(0, 15)
        .map((card) => ({
          title: card.title,
          tags: card.tags,
          taskCount: card.taskIds?.length,
        }));
      return { name: col.name, cards: colCards };
    });

    return {
      channelName: channel.name,
      channelDescription: channel.description,
      aiInstructions: channel.aiInstructions,
      columns,
      tagDefinitions: channel.tagDefinitions?.map((t) => ({ name: t.name, color: t.color })),
      threadMessages: messages,
      threadTitle: thread.title !== 'New conversation' ? thread.title : undefined,
    };
  }, [channel, cards, messages, thread.title]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSubmit = async (content: string, _type: CardMessageType) => {
    if (!content.trim() || isLoading) return;
    if (!requireSignInForAI()) return;

    setIsLoading(true);
    setError(null);

    // Optimistically add user message
    const now = new Date().toISOString();
    const optimisticUserMsg: ChannelChatMessage = {
      id: `temp-${Date.now()}`,
      type: 'question',
      content,
      authorId: session?.user?.id,
      authorName: session?.user?.name ?? undefined,
      authorImage: session?.user?.image ?? undefined,
      createdAt: now,
    };

    const updatedThread: ThreadType = {
      ...thread,
      messages: [...messages, optimisticUserMsg],
    };
    onThreadUpdate(updatedThread);

    try {
      const res = await fetch('/api/channel-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          channelId: channel.id,
          questionContent: content,
          context: buildContext(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to get response');
      }

      const data = await res.json();

      // Replace optimistic messages with server messages
      const serverMessages = [...messages, data.userMessage, data.aiMessage];
      const newThread: ThreadType = {
        ...thread,
        messages: serverMessages,
        title: data.threadTitle && thread.title === 'New conversation' ? data.threadTitle : thread.title,
        updatedAt: new Date().toISOString(),
      };
      onThreadUpdate(newThread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Revert optimistic update
      onThreadUpdate(thread);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle action approve/reject
  const handleActionApprove = useCallback(
    (messageId: string, actionId: string, editedData?: StoredAction['data']) => {
      const msgIndex = messages.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return;

      const msg = messages[msgIndex];
      const actions = msg.proposedActions;
      if (!actions) return;

      const actionIndex = actions.findIndex((a) => a.id === actionId);
      if (actionIndex === -1) return;

      const action = actions[actionIndex];
      const finalData = (editedData ?? action.data) as ChannelStoredAction['data'];

      // Execute the action
      if (action.type === 'create_card') {
        const cardData = finalData as CreateCardActionData;
        const columnId = resolveColumnId(cardData.columnName, channel);
        if (columnId) {
          createCard(channel.id, columnId, { title: cardData.title });
        }
      } else if (action.type === 'create_task') {
        const taskData = finalData as ChannelCreateTaskActionData;
        let cardId: string | null = null;
        if (taskData.cardTitle) {
          cardId = resolveCardId(taskData.cardTitle, channel) ?? null;
        }
        createTask(channel.id, cardId, { title: taskData.title, description: taskData.description });
      }

      // Update action status in messages
      const updatedActions = [...actions];
      updatedActions[actionIndex] = {
        ...action,
        status: 'approved' as const,
        editedData: editedData ? (editedData as ChannelStoredAction['data']) : undefined,
        executedAt: new Date().toISOString(),
      };

      const updatedMessages = [...messages];
      updatedMessages[msgIndex] = { ...msg, proposedActions: updatedActions };

      onThreadUpdate({ ...thread, messages: updatedMessages });

      // Persist updated actions to server
      persistActionUpdate(thread.id, updatedMessages);
    },
    [messages, thread, channel, createCard, createTask, onThreadUpdate],
  );

  const handleActionReject = useCallback(
    (messageId: string, actionId: string) => {
      const msgIndex = messages.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return;

      const msg = messages[msgIndex];
      const actions = msg.proposedActions;
      if (!actions) return;

      const actionIndex = actions.findIndex((a) => a.id === actionId);
      if (actionIndex === -1) return;

      const updatedActions = [...actions];
      updatedActions[actionIndex] = { ...actions[actionIndex], status: 'rejected' as const };

      const updatedMessages = [...messages];
      updatedMessages[msgIndex] = { ...msg, proposedActions: updatedActions };

      onThreadUpdate({ ...thread, messages: updatedMessages });
      persistActionUpdate(thread.id, updatedMessages);
    },
    [messages, thread, onThreadUpdate],
  );

  // Persist action status changes to the server
  const persistActionUpdate = async (threadId: string, updatedMessages: ChannelChatMessage[]) => {
    try {
      await fetch('/api/channel-chat/threads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, messages: updatedMessages }),
      });
    } catch {
      // Non-critical - local state already updated
    }
  };

  // Render channel-level action snippet
  const renderChannelAction = useCallback(
    (action: StoredAction) => (
      <ChannelActionSnippet
        key={action.id}
        action={action as unknown as ChannelStoredAction}
        channel={channel}
        onApprove={(actionId, editedData) => {
          // Find the message containing this action
          const msg = messages.find((m) =>
            m.proposedActions?.some((a) => a.id === actionId),
          );
          if (msg) {
            handleActionApprove(msg.id, actionId, editedData as unknown as StoredAction['data']);
          }
        }}
        onReject={(actionId) => {
          const msg = messages.find((m) =>
            m.proposedActions?.some((a) => a.id === actionId),
          );
          if (msg) {
            handleActionReject(msg.id, actionId);
          }
        }}
      />
    ),
    [channel, messages, handleActionApprove, handleActionReject],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
          {thread.title}
        </h3>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        style={{ paddingBottom: keyboardOffset > 0 ? `${keyboardOffset}px` : undefined }}
      >
        {messages.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <p className="text-sm text-neutral-400 dark:text-neutral-500">
              Ask Kan about this channel — create cards, organize work, or get suggestions.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={toCardMessage(msg)}
            onActionApprove={handleActionApprove}
            onActionReject={handleActionReject}
            renderAction={renderChannelAction}
          />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-neutral-400">Kan is thinking...</span>
          </div>
        )}

        {error && (
          <div className="px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ paddingBottom: keyboardOffset > 0 ? `${keyboardOffset}px` : undefined }}>
        <ChatInput
          onSubmit={handleSubmit}
          isLoading={isLoading}
          placeholder="Ask Kan about this channel..."
          onKeyboardFocus={handleKeyboardFocus}
          onKeyboardBlur={handleKeyboardBlur}
        />
      </div>
    </div>
  );
}
