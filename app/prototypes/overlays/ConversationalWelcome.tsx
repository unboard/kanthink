'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { SporeBackground } from '@/components/ambient/SporeBackground';
import { useKeyboardOffset } from '@/components/board/ChatInput';
import { useMessageTypewriter } from '@/lib/hooks/useTypewriter';
import { ChannelPreview } from '@/components/board/ChannelPreview';
import type { ChannelConfig } from '@/lib/channelCreation/extractChannelConfig';
import { VoiceMicButton } from '@/components/ui/VoiceMicButton';

// Types shared with WelcomeFlowOverlay
interface ChannelStructure {
  channelName: string;
  channelDescription: string;
  instructions: string;
  columns: Array<{
    name: string;
    description: string;
    isAiTarget?: boolean;
  }>;
  instructionCards: Array<{
    title: string;
    instructions: string;
    action: 'generate' | 'modify' | 'move';
    targetColumnName: string;
    cardCount?: number;
  }>;
}

export interface ConversationalWelcomeResultData {
  channelName: string;
  channelDescription: string;
  instructions: string;
  choices: Record<string, string>;
  structure?: ChannelStructure;
}

interface ConversationalWelcomeProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (result: ConversationalWelcomeResultData) => void;
  signInAction?: (formData: FormData) => Promise<void>;
  signInRedirectTo?: string;
  isSignedIn?: boolean;
  /** When true, shows welcome/onboarding language. When false, shows "new channel" language. Default: true */
  isWelcome?: boolean;
  /** Names of existing channels, so AI can avoid duplicates */
  existingChannelNames?: string[];
}

interface Message {
  id: string;
  type: 'user' | 'kan';
  content: string;
}

// Quick-start chips for the opening state
const QUICK_START_OPTIONS = [
  { label: 'Research competitors', value: 'I want to research and track my competitors' },
  { label: 'Generate product ideas', value: 'I want to brainstorm and develop product ideas' },
  { label: 'Plan a feature', value: 'I want to plan and manage a feature or project' },
  { label: 'Track industry trends', value: 'I want to track industry news and trends' },
];

export function ConversationalWelcome({
  isOpen,
  onClose,
  onCreate,
  signInAction,
  signInRedirectTo = '/',
  isSignedIn = false,
  isWelcome = true,
  existingChannelNames = [],
}: ConversationalWelcomeProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelConfig, setChannelConfig] = useState<ChannelConfig | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isInitialMount = useRef(true);
  const hasGreeted = useRef(false);
  // Track the conversation history for the API (role: user/assistant)
  const conversationRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  // Mobile keyboard handling
  const [inputActivated, setInputActivated] = useState(false);
  const { keyboardOffset, onFocus: kbOnFocus, onBlur: kbOnBlur } = useKeyboardOffset();

  // Typewriter effect for Kan's messages
  const { getDisplayText, isTyping: isKanTyping, skipToEnd, typingMessageId } = useMessageTypewriter(
    messages,
    { speed: 80 }
  );

  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      isInitialMount.current = true;
      hasGreeted.current = false;
      conversationRef.current = [];
      setMessages([]);
      setInputValue('');
      setIsLoading(false);
      setError(null);
      setChannelConfig(null);
      setNeedsSignIn(false);
      setInputActivated(false);
    }
  }, [isOpen]);

  // Auto-fire greeting when opened
  useEffect(() => {
    if (!isOpen || hasGreeted.current) return;
    hasGreeted.current = true;
    fireGreeting();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Scroll to bottom when messages change (but not on initial load)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (messages.length > 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Reset input activation when modal closes
  useEffect(() => {
    if (!isOpen) {
      setInputActivated(false);
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  const fireGreeting = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/channel-creation-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: '',
          isInitialGreeting: true,
          isWelcome,
          context: {
            existingChannelNames,
            conversationHistory: [],
          },
        }),
      });

      const data = await res.json();

      if (res.status === 401) {
        // Not signed in — show fallback greeting + sign-in prompt
        setNeedsSignIn(true);
        const fallbackGreeting = isWelcome
          ? "Hi, I'm Kan.\n\nWelcome to Kanthink — a space to organize ideas, research topics, and get things done.\n\nSign in to unlock AI-powered channel creation, or skip to set up a blank board."
          : "Let's set up a new channel.\n\nSign in to get AI-powered suggestions, or skip to create a blank board.";
        const msg: Message = {
          id: generateId(),
          type: 'kan',
          content: fallbackGreeting,
        };
        setMessages([msg]);
        return;
      }

      if (!res.ok) {
        setError(data.error || 'Failed to get response');
        return;
      }

      const assistantMsg: Message = {
        id: generateId(),
        type: 'kan',
        content: data.response,
      };
      conversationRef.current.push({ role: 'assistant', content: data.response });
      setMessages([assistantMsg]);

      if (data.channelConfig) {
        setChannelConfig(data.channelConfig);
      }
    } catch {
      setError('Failed to connect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    setError(null);
    setChannelConfig(null);

    const userMsg: Message = {
      id: generateId(),
      type: 'user',
      content: text,
    };

    const updatedHistory = [...conversationRef.current, { role: 'user' as const, content: text }];
    conversationRef.current = updatedHistory;
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/channel-creation-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: text,
          isWelcome,
          context: {
            existingChannelNames,
            conversationHistory: updatedHistory,
          },
        }),
      });

      const data = await res.json();

      if (res.status === 401) {
        setNeedsSignIn(true);
        setError('Please sign in to continue.');
        return;
      }

      if (!res.ok) {
        setError(data.error || 'Failed to get response');
        return;
      }

      const assistantMsg: Message = {
        id: generateId(),
        type: 'kan',
        content: data.response,
      };
      conversationRef.current.push({ role: 'assistant', content: data.response });
      setMessages(prev => [...prev, assistantMsg]);

      if (data.channelConfig) {
        setChannelConfig(data.channelConfig);
      }
    } catch {
      setError('Failed to connect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isWelcome, existingChannelNames]);

  // Handle input submission
  const handleInputSubmit = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    const value = inputValue.trim();
    setInputValue('');
    sendMessage(value);
  }, [inputValue, isLoading, sendMessage]);

  // Handle chip click — sends the chip value as a message
  const handleChipClick = useCallback((value: string) => {
    if (isLoading) return;
    sendMessage(value);
  }, [isLoading, sendMessage]);

  // Handle keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInputSubmit();
    }
  }, [handleInputSubmit]);

  // Handle channel creation from preview
  const handleApprove = useCallback((config: ChannelConfig) => {
    const result: ConversationalWelcomeResultData = {
      channelName: config.name,
      channelDescription: config.description,
      instructions: config.instructions,
      choices: {},
      structure: {
        channelName: config.name,
        channelDescription: config.description,
        instructions: config.instructions,
        columns: config.columns,
        instructionCards: config.shrooms,
      },
    };

    onClose();
    onCreate(result);
  }, [onClose, onCreate]);

  // Handle keep chatting from preview
  const handleKeepChatting = useCallback(() => {
    setChannelConfig(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  if (!isOpen) return null;

  const showInput = !channelConfig && !needsSignIn;
  const showQuickChips = messages.length === 1 && messages[0]?.type === 'kan' && !isLoading && !isKanTyping && !channelConfig && !needsSignIn;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950">
      {/* Spore particles background */}
      <SporeBackground
        className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
        id="welcome-spores"
      />

      {/* Header */}
      <div className="relative z-10 flex-shrink-0 flex items-center justify-between px-6 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-full-v1_lc5ai6.svg"
          alt="Kanthink"
          className="h-6"
        />
        <button
          onClick={onClose}
          className="text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Skip for now
        </button>
      </div>

      {/* Messages area */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-6">
          {messages.map((message) => {
            const isCurrentlyTyping = typingMessageId === message.id;
            const displayText = getDisplayText(message.id, message.content, message.type);

            return (
              <div key={message.id}>
                {/* Message bubble */}
                <div className={`flex items-start gap-3 ${message.type === 'user' ? 'justify-end' : ''}`}>
                  {message.type === 'kan' && (
                    <div className="flex-shrink-0 mt-1">
                      <KanthinkIcon size={24} className="text-violet-400" />
                    </div>
                  )}
                  <div
                    onClick={isCurrentlyTyping ? skipToEnd : undefined}
                    className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                      message.type === 'kan'
                        ? `bg-neutral-900 border border-neutral-800 ${isCurrentlyTyping ? 'cursor-pointer' : ''}`
                        : 'bg-violet-600'
                    }`}
                  >
                    <p className="text-neutral-100 text-sm leading-relaxed whitespace-pre-line">
                      {displayText}
                      {isCurrentlyTyping && (
                        <span className="inline-block w-0.5 h-4 ml-0.5 bg-violet-400 animate-pulse align-middle" />
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Quick-start chips — shown after first Kan greeting only */}
          {showQuickChips && (
            <div className="flex flex-wrap gap-2 ml-9 animate-in fade-in duration-300">
              {QUICK_START_OPTIONS.map((chip) => (
                <button
                  key={chip.value}
                  onClick={() => handleChipClick(chip.value)}
                  className="px-3 py-2 text-sm rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 hover:border-violet-500 hover:text-violet-300 hover:bg-violet-900 transition-all"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {/* AI thinking indicator */}
          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <KanthinkIcon size={24} className="text-violet-400" />
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex justify-center">
              <p className="text-xs text-red-400 bg-red-900/20 px-3 py-1.5 rounded-lg">
                {error}
              </p>
            </div>
          )}

          {/* Channel config preview */}
          {channelConfig && !isLoading && !isKanTyping && (
            <div className="ml-9 animate-in fade-in duration-300">
              <ChannelPreview
                config={channelConfig}
                onApprove={handleApprove}
                onKeepChatting={handleKeepChatting}
                dark
              />
            </div>
          )}

          {/* Sign-in prompt for unauthenticated users */}
          {needsSignIn && signInAction && (
            <div className="ml-9 space-y-4 animate-in fade-in duration-300">
              <form action={signInAction} className="inline-block">
                <input type="hidden" name="redirectTo" value={signInRedirectTo} />
                <button
                  type="submit"
                  className="w-full px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm transition-colors"
                >
                  Sign in with Google
                </button>
              </form>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area - fixed at bottom, positioned above keyboard on mobile */}
      {showInput && (
        <div
          className="relative z-10 flex-shrink-0 transition-transform duration-150"
          style={{ transform: keyboardOffset > 0 ? `translateY(-${keyboardOffset}px)` : undefined }}
        >
          <div className="max-w-2xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-full px-4 py-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you want to organize..."
                disabled={isLoading}
                rows={1}
                readOnly={!inputActivated}
                onFocus={(e) => {
                  if (!inputActivated) {
                    e.target.blur();
                    setInputActivated(true);
                    setTimeout(() => inputRef.current?.focus(), 50);
                    return;
                  }
                  kbOnFocus();
                }}
                onBlur={kbOnBlur}
                className="flex-1 resize-none bg-transparent text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none py-1"
              />
              <VoiceMicButton
                onTranscription={(text) => setInputValue((prev) => prev ? prev + ' ' + text : text)}
                size="sm"
              />
              <button
                onClick={handleInputSubmit}
                disabled={!inputValue.trim() || isLoading}
                className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
                  inputValue.trim() && !isLoading
                    ? 'text-violet-400 hover:text-violet-300 hover:bg-violet-900/30'
                    : 'text-neutral-600 cursor-not-allowed'
                }`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
