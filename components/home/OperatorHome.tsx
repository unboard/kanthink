'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestedChannel?: string;
  timestamp: Date;
}

const GREETING_PROMPTS = [
  'What should I work on today?',
  'Summarize my workspace',
  'Any cards that need attention?',
  'Help me think through an idea',
];

export function OperatorHome() {
  const router = useRouter();
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const channelList = Object.values(channels).filter(
    (c) => !c.isGlobalHelp && !c.isQuickSave
  );

  // Recent cards across all channels (last 10 updated)
  const recentCards = Object.values(cards)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buildChannelContext = useCallback(() => {
    return channelList.map((ch) => ({
      id: ch.id,
      name: ch.name,
      description: ch.description || undefined,
      columns: ch.columns.map((col) => ({
        name: col.name,
        cards: col.cardIds
          .map((cid) => cards[cid])
          .filter(Boolean)
          .map((c) => ({
            id: c.id,
            title: c.title,
            summary: c.summary || undefined,
            tags: c.tags?.length ? c.tags : undefined,
          })),
      })),
    }));
  }, [channelList, cards]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/operator-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history,
          channels: buildChannelContext(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Failed to get response');
      }

      const data = await res.json();

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
        suggestedChannel: data.suggestedChannel,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I couldn't process that. ${err instanceof Error ? err.message : 'Please try again.'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, buildChannelContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const getChannelName = (channelId: string) => {
    return channels[channelId]?.name || 'Unknown';
  };

  const getCardChannelName = (card: typeof recentCards[0]) => {
    return channels[card.channelId]?.name || '';
  };

  const hasConversation = messages.length > 0;

  return (
    <div className="flex h-full flex-col items-center">
      {/* Main content area */}
      <div className={`flex w-full max-w-2xl flex-col ${hasConversation ? 'h-full' : 'flex-1 justify-center'} px-4`}>

        {/* Welcome state (before conversation starts) */}
        {!hasConversation && (
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex">
              <KanthinkIcon size={48} className="text-violet-400" />
            </div>
            <h1 className="mb-2 text-2xl font-semibold text-white">
              What&apos;s on your mind?
            </h1>
            <p className="text-sm text-neutral-500">
              Ask Kan anything about your workspace, ideas, or what to work on next.
            </p>
          </div>
        )}

        {/* Chat messages */}
        {hasConversation && (
          <div className="flex-1 overflow-y-auto pb-4 pt-6">
            <div className="space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="mt-1 flex-shrink-0">
                      <KanthinkIcon size={20} className="text-violet-400" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-violet-600 text-white'
                        : 'bg-neutral-900 border border-neutral-800 text-neutral-200'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.suggestedChannel && (
                      <button
                        onClick={() => router.push(`/channel/${msg.suggestedChannel}`)}
                        className="mt-2 flex items-center gap-1.5 rounded-lg bg-violet-500/20 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/30 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        Go to {getChannelName(msg.suggestedChannel)}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Thinking indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="mt-1 flex-shrink-0">
                    <KanthinkIcon size={20} className="text-violet-400" />
                  </div>
                  <div className="rounded-2xl bg-neutral-900 border border-neutral-800 px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Prompt chips (before conversation) */}
        {!hasConversation && (
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            {GREETING_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="rounded-xl border border-neutral-700 bg-neutral-900 px-3.5 py-2 text-sm text-neutral-300 transition-colors hover:border-violet-500 hover:text-violet-300 hover:bg-violet-500/10"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className={`${hasConversation ? 'pb-4' : ''}`}>
          <div className="relative flex items-end rounded-2xl border border-neutral-700 bg-neutral-900 focus-within:border-violet-500/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Kan anything..."
              rows={1}
              className="flex-1 resize-none bg-transparent px-4 py-3.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
              style={{ maxHeight: 120 }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="m-2 flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Below input: recent activity & channels (only in welcome state) */}
        {!hasConversation && (
          <div className="mt-8 grid gap-6 pb-8 sm:grid-cols-2">
            {/* Recent cards */}
            {recentCards.length > 0 && (
              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Recent cards
                </h3>
                <div className="space-y-1">
                  {recentCards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => router.push(`/channel/${card.channelId}/card/${card.id}`)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-300 transition-colors hover:bg-neutral-800/60"
                    >
                      <span className="flex-1 truncate">{card.title}</span>
                      <span className="flex-shrink-0 text-xs text-neutral-600">{getCardChannelName(card)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Channels */}
            {channelList.length > 0 && (
              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Channels
                </h3>
                <div className="space-y-1">
                  {channelList.slice(0, 8).map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => router.push(`/channel/${ch.id}`)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-300 transition-colors hover:bg-neutral-800/60"
                    >
                      <span className="h-2 w-2 rounded-full bg-violet-500/60 flex-shrink-0" />
                      <span className="flex-1 truncate">{ch.name}</span>
                      <span className="flex-shrink-0 text-xs text-neutral-600">
                        {ch.columns.reduce((s, col) => s + col.cardIds.length, 0)} cards
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
