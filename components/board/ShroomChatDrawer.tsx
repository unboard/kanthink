'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Channel, InstructionCard, InstructionAction, InstructionTarget, ShroomChatMessage } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Drawer } from '@/components/ui/Drawer';
import { ShroomPreview } from './ShroomPreview';

interface ShroomConfigStep {
  action: InstructionAction;
  targetColumnName: string;
  description: string;
  cardCount?: number;
}

interface ShroomConfig {
  title: string;
  instructions: string;
  action: InstructionAction;
  targetColumnName: string;
  cardCount?: number;
  steps?: ShroomConfigStep[];
}

interface ShroomChatDrawerProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  existingShroom?: InstructionCard | null;
  onShroomCreated?: (shroom: InstructionCard) => void;
  onShroomUpdated?: () => void;
  onManualFallback?: () => void;
}

type DrawerMode = 'chat' | 'preview';

export function ShroomChatDrawer({
  channel,
  isOpen,
  onClose,
  existingShroom,
  onShroomCreated,
  onShroomUpdated,
  onManualFallback,
}: ShroomChatDrawerProps) {
  const createInstructionCard = useStore((s) => s.createInstructionCard);
  const updateInstructionCard = useStore((s) => s.updateInstructionCard);
  const instructionCards = useStore((s) => s.instructionCards);

  const [mode, setMode] = useState<DrawerMode>('chat');
  const [messages, setMessages] = useState<ShroomChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shroomConfig, setShroomConfig] = useState<ShroomConfig | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasGreeted = useRef(false);
  const isInitialLoad = useRef(true);

  const isEditMode = !!existingShroom;
  const columnNames = channel.columns.map((c) => c.name);

  // Get existing shroom titles (for the AI to avoid duplicates)
  const existingShrooms = (channel.instructionCardIds ?? [])
    .map((id) => instructionCards[id]?.title)
    .filter(Boolean) as string[];

  // Resolve column name to column ID (fuzzy match)
  const resolveColumnId = useCallback((name: string): string => {
    // Exact match first
    const exact = channel.columns.find((c) => c.name === name);
    if (exact) return exact.id;

    // Case-insensitive match
    const lower = name.toLowerCase();
    const insensitive = channel.columns.find((c) => c.name.toLowerCase() === lower);
    if (insensitive) return insensitive.id;

    // Partial match
    const partial = channel.columns.find((c) =>
      c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
    );
    if (partial) return partial.id;

    // Fallback to first column
    return channel.columns[0]?.id || '';
  }, [channel.columns]);

  // Get target column name for existing shroom
  const getExistingShroomTargetName = useCallback((): string => {
    if (!existingShroom) return columnNames[0] || '';
    const target = existingShroom.target;
    if (target.type === 'column') {
      const col = channel.columns.find((c) => c.id === target.columnId);
      return col?.name || columnNames[0] || '';
    }
    if (target.type === 'columns' && target.columnIds.length > 0) {
      const col = channel.columns.find((c) => c.id === target.columnIds[0]);
      return col?.name || columnNames[0] || '';
    }
    return columnNames[0] || '';
  }, [existingShroom, channel.columns, columnNames]);

  // Reset state when drawer opens/closes
  useEffect(() => {
    if (isOpen) {
      setMode('chat');
      setError(null);
      setShroomConfig(null);
      setInputValue('');
      hasGreeted.current = false;
      isInitialLoad.current = true;

      // Load existing conversation history if editing
      if (existingShroom?.conversationHistory?.length) {
        setMessages([...existingShroom.conversationHistory]);
      } else {
        setMessages([]);
      }
    }
  }, [isOpen, existingShroom]);

  // Auto-fire initial greeting
  useEffect(() => {
    if (!isOpen || hasGreeted.current || messages.length > 0) return;
    hasGreeted.current = true;
    fireGreeting();
  }, [isOpen, messages.length]);

  // Scroll behavior: show greeting at top on initial load, scroll to bottom on subsequent messages
  useEffect(() => {
    if (messages.length === 0) return;
    if (isInitialLoad.current && messages.length === 1 && messages[0].role === 'assistant') {
      // Initial greeting — scroll to top so it's visible
      messagesContainerRef.current?.scrollTo({ top: 0 });
      isInitialLoad.current = false;
    } else {
      // Subsequent messages — scroll to bottom
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Focus input when mode changes to chat
  useEffect(() => {
    if (mode === 'chat' && !isLoading) {
      inputRef.current?.focus();
    }
  }, [mode, isLoading]);

  // Mobile keyboard handling: resize the drawer when virtual keyboard opens
  // This keeps the input pinned above the keyboard
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;
    const handleResize = () => {
      // The difference between window height and viewport height is the keyboard
      const offset = window.innerHeight - viewport.height;
      setKeyboardOffset(offset > 50 ? offset : 0); // Only apply if keyboard-sized
    };

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);
    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }, []);

  const fireGreeting = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const existingShroomConfig = existingShroom
        ? {
            title: existingShroom.title,
            instructions: existingShroom.instructions,
            action: existingShroom.action,
            targetColumnName: getExistingShroomTargetName(),
            cardCount: existingShroom.cardCount,
          }
        : undefined;

      const res = await fetch('/api/instruction-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: '',
          isInitialGreeting: true,
          mode: isEditMode ? 'edit' : 'create',
          context: {
            channelName: channel.name,
            channelDescription: channel.description,
            currentInstructions: channel.aiInstructions,
            columnNames,
            existingShrooms,
            existingShroomConfig,
            conversationHistory: [],
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to get response');
        return;
      }

      const assistantMsg: ShroomChatMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
      };

      setMessages([assistantMsg]);

      if (data.shroomConfig) {
        setShroomConfig(data.shroomConfig);
        setMode('preview');
      }
    } catch {
      setError('Failed to connect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    setInputValue('');
    setError(null);

    const userMsg: ShroomChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const existingShroomConfig = existingShroom
        ? {
            title: existingShroom.title,
            instructions: existingShroom.instructions,
            action: existingShroom.action,
            targetColumnName: getExistingShroomTargetName(),
            cardCount: existingShroom.cardCount,
          }
        : undefined;

      const res = await fetch('/api/instruction-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: text,
          mode: isEditMode ? 'edit' : 'create',
          context: {
            channelName: channel.name,
            channelDescription: channel.description,
            currentInstructions: channel.aiInstructions,
            columnNames,
            existingShrooms,
            existingShroomConfig,
            conversationHistory: updatedMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to get response');
        return;
      }

      const assistantMsg: ShroomChatMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
      };

      setMessages([...updatedMessages, assistantMsg]);

      if (data.shroomConfig) {
        setShroomConfig(data.shroomConfig);
        setMode('preview');
      }
    } catch {
      setError('Failed to connect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleApprove = (finalConfig: ShroomConfig) => {
    const columnId = resolveColumnId(finalConfig.targetColumnName);
    const target: InstructionTarget = { type: 'column', columnId };

    const conversationHistory = [...messages];

    if (isEditMode && existingShroom) {
      // Update existing shroom
      updateInstructionCard(existingShroom.id, {
        title: finalConfig.title,
        instructions: finalConfig.instructions,
        action: finalConfig.action,
        target,
        cardCount: finalConfig.action === 'generate' ? (finalConfig.cardCount ?? 5) : undefined,
        conversationHistory,
      });
      onShroomUpdated?.();
    } else {
      // Create new shroom
      const newCard = createInstructionCard(channel.id, {
        title: finalConfig.title,
        instructions: finalConfig.instructions,
        action: finalConfig.action,
        target,
        runMode: 'manual',
        cardCount: finalConfig.action === 'generate' ? (finalConfig.cardCount ?? 5) : undefined,
        conversationHistory,
      });
      onShroomCreated?.(newCard);
    }

    onClose();
  };

  const handleKeepChatting = () => {
    setMode('chat');
    setShroomConfig(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleManualFallback = () => {
    onManualFallback?.();
    onClose();
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="md" floating hideCloseButton>
      <div
        className="flex flex-col sm:h-full sm:max-h-[calc(100vh-2rem)]"
        style={{ height: keyboardOffset > 0 ? `calc(100dvh - ${keyboardOffset}px)` : '100dvh' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-white dark:bg-neutral-900 flex items-center gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
          <img
            src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
            alt=""
            className="w-8 h-8 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h2 className="font-medium text-neutral-900 dark:text-white">
              {isEditMode ? `Edit: ${existingShroom?.title}` : 'New Shroom'}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              Chat with Kan to {isEditMode ? 'update' : 'set up'} your shroom
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Chat messages area */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <img
                  src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
                  alt="Kan"
                  className="w-7 h-7 flex-shrink-0 mt-0.5"
                />
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white rounded-br-md'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 rounded-bl-md'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-2.5 justify-start">
              <img
                src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
                alt="Kan"
                className="w-7 h-7 flex-shrink-0 mt-0.5 animate-pulse"
              />
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex justify-center">
              <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg">
                {error}
              </p>
            </div>
          )}

          {/* Preview mode */}
          {mode === 'preview' && shroomConfig && (
            <ShroomPreview
              config={shroomConfig}
              columnNames={columnNames}
              onApprove={handleApprove}
              onKeepChatting={handleKeepChatting}
              approveLabel={isEditMode ? 'Update shroom' : 'Create shroom'}
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area (chat mode only) */}
        {mode === 'chat' && (
          <div className="flex-shrink-0 p-4 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you want..."
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 outline-none focus:border-violet-400 dark:focus:border-violet-500 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!inputValue.trim() || isLoading}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            {/* Manual fallback link (creation mode only) */}
            {!isEditMode && (
              <button
                onClick={handleManualFallback}
                className="mt-2 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                Set up manually instead
              </button>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
