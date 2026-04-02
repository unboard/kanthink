'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const GREETING_PROMPTS = [
  'What should I work on today?',
  'Summarize my workspace',
  'Any cards that need attention?',
  'Help me think through an idea',
];

// Allow kanthink:// protocol in sanitized markdown links
const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'kanthink'],
  },
};

/** Parse a kanthink:// URL */
function parseKanthinkUrl(href: string | undefined): { type: 'card' | 'channel' | 'task'; id: string } | null {
  if (!href) return null;
  const match = href.match(/^kanthink:\/\/(card|channel|task)\/(.+)$/);
  if (!match) return null;
  return { type: match[1] as 'card' | 'channel' | 'task', id: match[2] };
}

export function OperatorHome() {
  const router = useRouter();
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const channelList = useMemo(() =>
    Object.values(channels).filter((c) => !c.isGlobalHelp),
    [channels]
  );

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
      isBookmarks: ch.isQuickSave || undefined,
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

  /** Handle kanthink:// and regular links in markdown */
  const renderLink = useCallback(({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const parsed = parseKanthinkUrl(href);

    if (!parsed) {
      // External links with valid URLs open in new tab
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
            {children}
          </a>
        );
      }
      // Invalid/empty links (AI hallucinated a link) — render as styled text, not a navigating link
      return <span className="text-neutral-200 font-medium">{children}</span>;
    }

    const handleClick = () => {
      if (parsed.type === 'channel') {
        router.push(`/channel/${parsed.id}`);
      } else if (parsed.type === 'card') {
        const card = cards[parsed.id];
        if (card) {
          router.push(`/channel/${card.channelId}/card/${parsed.id}`);
        }
      }
    };

    return (
      <button
        onClick={handleClick}
        className="text-violet-400 hover:underline font-medium cursor-pointer inline"
      >
        {children}
      </button>
    );
  }, [router, cards]);

  const hasConversation = messages.length > 0;

  return (
    <div className="flex h-full flex-col items-center">
      <div className={`flex w-full max-w-2xl flex-col ${hasConversation ? 'h-full' : 'flex-1 justify-center'} px-4`}>

        {/* Welcome state */}
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
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
                          components={{ a: renderLink }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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

        {/* Prompt chips */}
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
      </div>
    </div>
  );
}
