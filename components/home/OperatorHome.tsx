'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AudioLines } from 'lucide-react';
import { LiveVoiceMode } from '@/components/voice/LiveVoiceMode';
import { buildVoiceSystemPrompt } from '@/lib/ai/voicePrompt';

interface ActionResult {
  type: string;
  success: boolean;
  description: string;
  cardId?: string;
  channelId?: string;
  taskId?: string;
  cardPreview?: {
    id: string;
    title: string;
    summary?: string;
    channelName: string;
    channelId: string;
    columnName?: string;
    messages: { type: string; content: string }[];
    tasks: { id: string; title: string; status: string }[];
    tags?: string[];
    coverImageUrl?: string;
  };
  taskPreview?: {
    id: string;
    title: string;
    status: string;
    description?: string;
    cardId?: string | null;
    channelId?: string;
  };
  emailDraft?: {
    to: string;
    subject: string;
    body: string;
    style: string;
    recipientName?: string;
  };
  imageUrl?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actionResults?: ActionResult[];
  imageUrls?: string[];
  timestamp: Date;
}

interface ThreadSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const GREETING_PROMPTS = [
  'What should I work on today?',
  'Summarize my workspace',
  'Any cards that need attention?',
  'Help me think through an idea',
];

/** Parse a kanthink:// URL */
function parseKanthinkUrl(href: string | undefined): { type: 'card' | 'channel' | 'task'; id: string } | null {
  if (!href) return null;
  const match = href.match(/^kanthink:\/\/(card|channel|task)\/(.+)$/);
  if (!match) return null;
  return { type: match[1] as 'card' | 'channel' | 'task', id: match[2] };
}

function formatThreadDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function OperatorHome() {
  const router = useRouter();
  const { data: session } = useSession();
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);
  const folders = useStore((s) => s.folders);
  const folderOrder = useStore((s) => s.folderOrder);
  const channelOrder = useStore((s) => s.channelOrder);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [showVoiceMode, setShowVoiceMode] = useState(false);
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

  // Create a new thread on mount
  useEffect(() => {
    if (threadId) return;
    fetch('/api/operator-chat/threads', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => setThreadId(data.id))
      .catch(() => {});
  }, [threadId]);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/operator-chat/threads');
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
        setThreadsLoaded(true);
      }
    } catch {}
  }, []);

  const openHistory = useCallback(() => {
    setShowHistory(true);
    if (!threadsLoaded) loadThreads();
  }, [threadsLoaded, loadThreads]);

  const loadThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/operator-chat/threads/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs: ChatMessage[] = (data.messages || []).map((m: { id: string; type: string; content: string; createdAt: string }) => ({
        id: m.id,
        role: m.type === 'question' ? 'user' as const : 'assistant' as const,
        content: m.content,
        timestamp: new Date(m.createdAt),
      }));
      setMessages(msgs);
      setThreadId(id);
      setShowHistory(false);
    } catch {}
  }, []);

  const startNewThread = useCallback(async () => {
    try {
      const res = await fetch('/api/operator-chat/threads', { method: 'POST' });
      const data = await res.json();
      setThreadId(data.id);
      setMessages([]);
      setShowHistory(false);
    } catch {}
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
            assignedTo: c.assignedTo?.length ? c.assignedTo : undefined,
          })),
      })),
    }));
  }, [channelList, cards]);

  const buildTaskContext = useCallback(() => {
    return Object.values(tasks).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      channelId: t.channelId,
      cardId: t.cardId || undefined,
      assignedTo: t.assignedTo?.length ? t.assignedTo : undefined,
      dueDate: t.dueDate || undefined,
    }));
  }, [tasks]);

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
      // Fold past action outcomes into assistant history so Kan remembers what actually
      // happened (e.g. emails sent, cards archived) instead of treating every turn as
      // unacted-upon context. Keep the summary short — one line per successful action.
      const summarizeActionResults = (results?: ActionResult[]): string => {
        if (!results || results.length === 0) return '';
        const lines = results
          .filter(r => r.success)
          .map(r => {
            if (r.type === 'send_email') return `[action: send_email — sent to ${r.emailDraft?.to || 'recipient'}]`;
            if (r.type === 'create_card' && r.cardPreview) return `[action: create_card — "${r.cardPreview.title}"]`;
            if (r.type === 'create_task' && r.taskPreview) return `[action: create_task — "${r.taskPreview.title}"]`;
            if (r.type === 'archive_card' && r.cardPreview) return `[action: archive_card — "${r.cardPreview.title}"]`;
            if (r.type === 'unarchive_card' && r.cardPreview) return `[action: unarchive_card — "${r.cardPreview.title}"]`;
            if (r.type === 'move_card' && r.cardPreview) return `[action: move_card — "${r.cardPreview.title}" to ${r.cardPreview.columnName || 'column'}]`;
            if (r.type === 'complete_task' && r.taskPreview) return `[action: complete_task — "${r.taskPreview.title}"]`;
            return `[action: ${r.type} — ${r.description || 'succeeded'}]`;
          });
        return lines.length > 0 ? `\n\n${lines.join('\n')}` : '';
      };

      const history = messages.map((m) => ({
        role: m.role,
        content: m.role === 'assistant'
          ? m.content + summarizeActionResults(m.actionResults)
          : m.content,
      }));

      const res = await fetch('/api/operator-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          message: text.trim(),
          history,
          channels: buildChannelContext(),
          tasks: buildTaskContext(),
          user: session?.user ? { name: session.user.name, email: session.user.email } : undefined,
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
        actionResults: data.actionResults,
        imageUrls: data.imageUrls,
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
  }, [isLoading, messages, buildChannelContext, threadId]);

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
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          {children}
        </a>
      );
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

  // Build voice system prompt with full workspace context including IDs for tool calls
  const voiceSystemPrompt = useMemo(
    () => buildVoiceSystemPrompt({ channelList, cards, tasks, folders, folderOrder, channelOrder, session }),
    [channelList, cards, tasks, session, folders, folderOrder, channelOrder]
  );

  const hasConversation = messages.length > 0;

  return (
    <div className="flex h-full flex-col items-center relative">
      {/* Top bar — new chat + history */}
      <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
        {hasConversation && (
          <button
            onClick={startNewThread}
            title="New conversation"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
        <button
          onClick={openHistory}
          title="Chat history"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* Live voice mode overlay */}
      <LiveVoiceMode
        isOpen={showVoiceMode}
        onClose={() => setShowVoiceMode(false)}
        systemPrompt={voiceSystemPrompt}
      />

      {/* History drawer */}
      {showHistory && (
        <div className="absolute inset-0 z-20 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowHistory(false)} />
          <div className="relative w-full max-w-sm h-full bg-neutral-950 border-l border-neutral-800 overflow-y-auto animate-slide-in-right">
            <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-800 sticky top-0 bg-neutral-950 z-10">
              <h2 className="text-sm font-medium text-white">Chat History</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-2">
              <button
                onClick={startNewThread}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-violet-400 hover:bg-violet-500/10 transition-colors mb-1"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New conversation
              </button>
              {threads.filter(t => t.title !== 'New conversation' || t.id === threadId).map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadThread(t.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    t.id === threadId
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-300 hover:bg-neutral-800/60'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{t.title || 'New conversation'}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{formatThreadDate(t.updatedAt)}</p>
                  </div>
                </button>
              ))}
              {threadsLoaded && threads.length === 0 && (
                <p className="text-sm text-neutral-500 text-center py-8">No conversations yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`flex w-full max-w-2xl flex-col ${hasConversation ? 'h-full' : 'flex-1 justify-center'} px-4`}>

        {/* Welcome state */}
        {!hasConversation && (
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex">
              <KanthinkIcon size={48} className="text-white" />
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
                          components={{ a: renderLink }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {/* Generated images */}
                    {msg.imageUrls && msg.imageUrls.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.imageUrls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-neutral-700 hover:border-violet-500 transition-colors">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="Generated image" className="max-w-[280px] max-h-[280px] object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                    {/* Action results */}
                    {msg.actionResults && msg.actionResults.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-neutral-700/50 pt-3">
                        {msg.actionResults.map((ar, i) => (
                          <div key={i}>
                            {/* Card preview */}
                            {ar.cardPreview ? (
                              <button
                                onClick={() => router.push(`/channel/${ar.cardPreview!.channelId}/card/${ar.cardPreview!.id}`)}
                                className="w-full text-left rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 hover:border-violet-500/50 transition-colors"
                              >
                                <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 mb-1">
                                  <span>{ar.cardPreview.channelName}</span>
                                  {ar.cardPreview.columnName && <><span>›</span><span>{ar.cardPreview.columnName}</span></>}
                                </div>
                                <p className="text-sm font-medium text-white">{ar.cardPreview.title}</p>
                                {ar.cardPreview.summary && <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">{ar.cardPreview.summary}</p>}
                                {ar.cardPreview.tags && ar.cardPreview.tags.length > 0 && (
                                  <div className="flex gap-1 mt-1.5">{ar.cardPreview.tags.map(t => <span key={t} className="text-[10px] bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded">{t}</span>)}</div>
                                )}
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <svg className="h-3 w-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  <span className="text-[11px] text-green-300">{ar.description}</span>
                                  <span className="text-[11px] text-violet-400 ml-auto">View</span>
                                </div>
                              </button>
                            ) : ar.taskPreview ? (
                              /* Task preview */
                              <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                    ar.taskPreview.status === 'done' ? 'bg-green-400' :
                                    ar.taskPreview.status === 'in_progress' ? 'bg-blue-400' :
                                    ar.taskPreview.status === 'on_hold' ? 'bg-amber-400' : 'bg-neutral-500'
                                  }`} />
                                  <p className="text-sm font-medium text-white">{ar.taskPreview.title}</p>
                                </div>
                                {ar.taskPreview.description && <p className="text-xs text-neutral-400 mt-1 ml-[18px] line-clamp-2">{ar.taskPreview.description}</p>}
                                <div className="flex items-center gap-1.5 mt-1.5 ml-[18px]">
                                  <span className="text-[10px] bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded">{ar.taskPreview.status.replace('_', ' ')}</span>
                                  <svg className="h-3 w-3 text-green-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  <span className="text-[11px] text-green-300">{ar.description}</span>
                                </div>
                              </div>
                            ) : ar.emailDraft ? (
                              /* Email sent confirmation */
                              <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                  <span className="text-xs text-neutral-400">To: <span className="text-neutral-200">{ar.emailDraft.to}</span></span>
                                  <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded ml-auto">{ar.emailDraft.style}</span>
                                </div>
                                <p className="text-sm font-medium text-white mb-1">{ar.emailDraft.subject}</p>
                                <p className="text-xs text-neutral-400 line-clamp-2">{ar.emailDraft.body}</p>
                                <div className="flex items-center gap-1.5 mt-2">
                                  {ar.success ? (
                                    <><svg className="h-3 w-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="text-[11px] text-green-300">{ar.description}</span></>
                                  ) : (
                                    <><svg className="h-3 w-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg><span className="text-[11px] text-red-300">{ar.description}</span></>
                                  )}
                                </div>
                              </div>
                            ) : ar.imageUrl ? (
                              /* Generated image */
                              <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <a href={ar.imageUrl} target="_blank" rel="noopener noreferrer">
                                  <img src={ar.imageUrl} alt="Generated image" className="w-full max-h-[300px] object-cover" />
                                </a>
                                <div className="flex items-center gap-1.5 px-3 py-2">
                                  <svg className="h-3 w-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  <span className="text-[11px] text-green-300">{ar.description}</span>
                                </div>
                              </div>
                            ) : (
                              /* Default action result */
                              <div className="flex items-center gap-2 text-xs">
                                {ar.success ? (
                                  <svg className="h-3.5 w-3.5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                ) : (
                                  <svg className="h-3.5 w-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                )}
                                <span className={ar.success ? 'text-green-300' : 'text-red-300'}>{ar.description}</span>
                                {ar.success && ar.cardId && ar.channelId && (
                                  <button onClick={() => router.push(`/channel/${ar.channelId}/card/${ar.cardId}`)} className="text-violet-400 hover:underline ml-1">View</button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
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
            <div className="flex items-center gap-1 m-2">
              <button
                onClick={() => setShowVoiceMode(true)}
                title="Talk to Kan"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
              >
                <AudioLines className="w-4 h-4" />
              </button>
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
