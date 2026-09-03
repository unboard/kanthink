'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { ChatMessage } from '@/components/board/ChatMessage';
import { buildPlaygroundDoc } from './buildPlaygroundDoc';
import { resolveDeps } from '@/lib/playground/runtime';
import { useAutoResizeTextarea } from '@/lib/hooks/useAutoResizeTextarea';
import type { Card, CardMessage, PlaygroundApp } from '@/lib/types';
import {
  PLAYGROUND_MODELS,
  DEFAULT_PLAYGROUND_MODEL_ID,
  getPlaygroundModel,
  formatCost,
} from '@/lib/playground/models';
import {
  AlertCircle,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  Globe,
  Hammer,
  Loader2,
  Lock,
  MessageSquareText,
  Trash2,
  Wand2,
} from 'lucide-react';
import { nanoid } from 'nanoid';

interface AppDrawerProps {
  app: PlaygroundApp;
  /** The card this app is an artifact of — pinned at the top of the thread. */
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  /** Hand a fresh server copy of the app back to the list that owns it. */
  onAppChanged: (app: PlaygroundApp) => void;
  onRename: (appId: string, title: string) => void;
  onTogglePublic: (appId: string, isPublic: boolean) => void;
  onSetModel: (appId: string, modelId: string) => void;
  onDelete: (appId: string) => void;
  /** Jump to the source card. Closes this drawer on the way. */
  onOpenSourceCard?: (cardId: string) => void;
}

interface IframeError {
  message: string;
  stack?: string;
}

const OPTIMISTIC_PREFIX = '__optimistic_';

export function AppDrawer({
  app,
  card,
  isOpen,
  onClose,
  onAppChanged,
  onRename,
  onTogglePublic,
  onSetModel,
  onDelete,
  onOpenSourceCard,
}: AppDrawerProps) {
  const [input, setInput] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState<IframeError | null>(null);
  const [pane, setPane] = useState<'thread' | 'preview'>('thread');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Messages shown before the server confirms them. Never persisted — the server
  // owns the canonical thread and returns it whole.
  const [optimistic, setOptimistic] = useState<CardMessage[]>([]);

  const modelMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(textareaRef, input, 200, { minHeight: 44 });

  const modelId = app.modelId || DEFAULT_PLAYGROUND_MODEL_ID;
  const selectedModel = getPlaygroundModel(modelId);
  const hasCode = Boolean(app.code);
  const busy = isBuilding || isChatting;

  const messages = useMemo(
    () => [...(app.messages || []), ...optimistic],
    [app.messages, optimistic]
  );

  // --- Preview document -----------------------------------------------------
  // Declarations are an array, so compare by value: a new array with identical
  // contents must not rebuild the document, and a changed library must.
  const depsKey = (app.dependencies || []).join(',');
  const srcDoc = useMemo(() => {
    if (!app.code) return null;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return buildPlaygroundDoc(app.code, {
      title: app.title,
      uploadUrl: `${origin}/api/playground/upload`,
      aiUrl: `${origin}/api/playground/ai`,
      saveUrl: `${origin}/api/playground/save`,
      appToken: app.appToken || undefined,
      deps: resolveDeps(depsKey ? depsKey.split(',') : []).deps,
    });
  }, [app.code, app.title, app.appToken, depsKey]);

  // Runtime errors reported by the sandboxed iframe.
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'kpg_error') {
        setIframeError({ message: String(e.data.message || 'Unknown error'), stack: e.data.stack });
      } else if (e.data.type === 'kpg_ready') {
        setIframeError(null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => { setIframeError(null); }, [app.code]);

  // A finished build is worth looking at, so surface it.
  useEffect(() => {
    if (hasCode) setPane('preview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.generationCount]);

  useEffect(() => {
    if (pane === 'thread') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy, pane]);

  useEffect(() => {
    if (!showModelMenu) return;
    const onDown = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showModelMenu]);

  // --- Build watcher --------------------------------------------------------
  // A build runs for minutes. If the phone locks or the tab is suspended the
  // original fetch loses its socket, but the server function completes and writes
  // to the database regardless — so poll for the result rather than losing it.
  const buildStartCount = useRef<number | null>(null);
  useEffect(() => {
    if (!isBuilding) {
      buildStartCount.current = null;
      return;
    }
    if (buildStartCount.current === null) buildStartCount.current = app.generationCount;

    let stopped = false;
    const startTime = Date.now();
    const MAX_WATCH_MS = 10 * 60 * 1000;

    const poll = async () => {
      if (stopped) return;
      if (Date.now() - startTime > MAX_WATCH_MS) { stopped = true; return; }
      try {
        const res = await fetch(`/api/playground/status/${app.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const fresh = data.app as PlaygroundApp | undefined;
        if (fresh && fresh.generationCount > (buildStartCount.current ?? 0)) {
          onAppChanged(fresh);
          setOptimistic([]);
          setIsBuilding(false);
          setError(null);
          stopped = true;
        }
      } catch {
        // Silent — the next tick tries again.
      }
    };

    const interval = setInterval(poll, 4000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isBuilding, app.id, app.generationCount, onAppChanged]);

  // --- Actions --------------------------------------------------------------

  const pushOptimistic = (content: string) => {
    setOptimistic([{
      id: `${OPTIMISTIC_PREFIX}${nanoid()}`,
      type: 'question',
      content,
      createdAt: new Date().toISOString(),
    } as CardMessage]);
  };

  /** Send a message. Talks to Kan; does not touch the code. */
  const sendChat = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput('');
    setError(null);
    setIsChatting(true);
    pushOptimistic(trimmed);
    try {
      const res = await fetch(`/api/playground/apps/${app.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Message failed');
        setOptimistic([]);
        return;
      }
      onAppChanged({ ...app, messages: data.messages as CardMessage[] });
      setOptimistic([]);
    } catch {
      setError('Message failed — check your connection.');
      setOptimistic([]);
    } finally {
      setIsChatting(false);
    }
  }, [app, busy, onAppChanged]);

  /**
   * Build. Takes whatever is in the composer as this turn's request and the whole
   * thread as context — which is why a conversation that never mentioned building
   * still shapes what comes out.
   */
  const build = useCallback(async (promptText: string, includeError: boolean) => {
    if (busy) return;
    const trimmed = promptText.trim() || (hasCode
      ? 'Update the app based on everything discussed in this thread.'
      : 'Build the app described in this thread and on the source card.');
    setInput('');
    setError(null);
    setIsBuilding(true);
    pushOptimistic(trimmed);

    try {
      const res = await fetch('/api/playground/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: app.id,
          prompt: trimmed,
          lastError: includeError ? iframeError?.message : undefined,
          modelId,
        }),
      });

      // Read as text first: a gateway 502/504 returns HTML, and JSON.parse on HTML
      // throws something unreadable in place of the real explanation.
      const responseText = await res.text();
      let data: { error?: string; app?: PlaygroundApp; messages?: unknown } | null = null;
      try { data = responseText ? JSON.parse(responseText) : null; } catch { data = null; }

      if (!res.ok || !data) {
        let friendly: string;
        if (data?.error) {
          friendly = data.error;
        } else if (res.status === 504 || res.status === 502) {
          friendly = 'The build took too long and timed out. Try a smaller change, or switch to a faster model like Gemini 3.7 Flash.';
        } else if (!data) {
          friendly = `Server returned an unexpected response (${res.status}). Try again.`;
        } else {
          friendly = `Build failed (${res.status}).`;
        }
        setError(friendly);
        setOptimistic([]);
        setIsBuilding(false);
        return;
      }

      if (data.app) {
        onAppChanged(data.app);
      } else if (data.messages) {
        // Preflight asked a clarifying question instead of building.
        onAppChanged({ ...app, messages: data.messages as CardMessage[] });
      }
      setOptimistic([]);
      setIsBuilding(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      // A dropped socket usually means the tab was suspended, not that the build
      // failed — the server keeps going and the watcher above reconciles. Leave
      // the building state on so it can.
      const transient = ['Failed to fetch', 'NetworkError', 'aborted', 'network', 'connection']
        .some((needle) => msg.includes(needle));
      if (transient) return;
      setError(msg);
      setOptimistic([]);
      setIsBuilding(false);
    }
  }, [app, busy, hasCode, iframeError, modelId, onAppChanged]);

  const shareLink = app.isPublic && app.shareToken && typeof window !== 'undefined'
    ? `${window.location.origin}/play/${app.shareToken}`
    : null;

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this link', shareLink);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="lg" floating hideCloseButton>
      <div className="flex flex-col h-[100dvh] sm:h-full sm:max-h-[calc(100vh-2rem)]">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Back to card"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            value={app.title}
            onChange={(e) => onRename(app.id, e.target.value)}
            className="flex-1 min-w-0 font-medium text-neutral-900 dark:text-white bg-transparent border-none outline-none truncate"
            placeholder="App name"
          />
          {hasCode && (
            <a
              href={`/play/preview/${app.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              title="Open full screen"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => onTogglePublic(app.id, !app.isPublic)}
            disabled={!hasCode}
            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-40 ${
              app.isPublic
                ? 'text-emerald-500 hover:bg-emerald-500/10'
                : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
            title={app.isPublic ? 'Published — click to unpublish' : 'Publish'}
          >
            {app.isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </button>
          <button
            onClick={() => (confirmDelete ? onDelete(app.id) : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
            className={`flex-shrink-0 h-8 flex items-center justify-center rounded-full px-2 gap-1 text-xs ${
              confirmDelete
                ? 'bg-red-500/10 text-red-500'
                : 'w-8 text-neutral-400 hover:text-red-500 hover:bg-red-500/10'
            }`}
            title="Delete this app"
          >
            <Trash2 className="w-4 h-4" />
            {confirmDelete && <span>Sure?</span>}
          </button>
        </div>

        {shareLink && (
          <button
            onClick={copyShareLink}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 border-b border-emerald-500/20"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="truncate">{copied ? 'Link copied' : shareLink}</span>
          </button>
        )}

        {/* Thread / Preview switch */}
        <div className="flex-shrink-0 flex gap-2 px-3 py-2">
          {([
            { key: 'thread' as const, label: 'Thread', icon: <MessageSquareText className="w-3.5 h-3.5" /> },
            { key: 'preview' as const, label: hasCode ? `Preview v${app.generationCount}` : 'Preview', icon: <Eye className="w-3.5 h-3.5" /> },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPane(tab.key)}
              disabled={tab.key === 'preview' && !hasCode}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors disabled:opacity-40 ${
                pane === tab.key
                  ? 'bg-violet-500/15 border-violet-500/30 text-violet-600 dark:text-violet-300'
                  : 'bg-neutral-100 dark:bg-neutral-800/80 border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {pane === 'preview' ? (
            <div className="h-full flex flex-col">
              {iframeError && (
                <div className="flex-shrink-0 m-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-red-600 dark:text-red-400 break-words">{iframeError.message}</p>
                      <button
                        onClick={() => build(`Fix this runtime error from the previous version:\n${iframeError.message}`, true)}
                        disabled={busy}
                        className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        <Wand2 className="w-3 h-3" />
                        Fix it
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {srcDoc ? (
                <iframe
                  key={app.generationCount}
                  srcDoc={srcDoc}
                  title={app.title}
                  className="flex-1 w-full border-0 bg-white"
                  sandbox="allow-scripts allow-forms allow-popups allow-modals"
                />
              ) : (
                <EmptyPreview />
              )}
            </div>
          ) : (
            <div className="px-4 py-3">
              {/* The source card, pinned. This is where the app came from. */}
              <button
                onClick={() => onOpenSourceCard?.(card.id)}
                className="w-full text-left mb-4 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 hover:border-violet-400/50 transition-colors group"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                  Built from
                </p>
                <p className="text-sm font-medium text-neutral-900 dark:text-white truncate group-hover:text-violet-600 dark:group-hover:text-violet-400">
                  {card.title}
                </p>
                {card.summary && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
                    {card.summary}
                  </p>
                )}
              </button>

              {messages.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Describe what you want built.
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 max-w-xs mx-auto">
                    The card above goes in as context. Send to talk it through first, or hit Build
                    when you&apos;re ready.
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} cardId={card.id} />
              ))}

              {busy && (
                <div className="flex items-center gap-2 px-1 py-3 text-sm text-neutral-500 dark:text-neutral-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isBuilding
                    ? `Building with ${selectedModel.label.replace('Gemini ', '')}…`
                    : 'Kan is thinking…'}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="flex-shrink-0 border-t border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
          {error && (
            <div className="mb-2 flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 dark:text-red-400 flex-1">{error}</p>
            </div>
          )}

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendChat(input);
                }
              }}
              placeholder={hasCode ? 'Talk it through, or describe a change…' : 'What should this app do?'}
              rows={1}
              disabled={busy}
              className="w-full resize-none rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 pr-11 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 outline-none focus:border-violet-400 disabled:opacity-60"
            />
            <button
              onClick={() => void sendChat(input)}
              disabled={!input.trim() || busy}
              className="absolute bottom-2 right-2 h-7 w-7 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
              title="Send message (does not change the app)"
            >
              {isChatting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            {/* Model picker */}
            <div className="relative" ref={modelMenuRef}>
              <button
                type="button"
                onClick={() => setShowModelMenu((v) => !v)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                title="Choose the model this app builds with"
              >
                <Cpu className="w-3 h-3" />
                {selectedModel.label.replace('Gemini ', '')}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              {showModelMenu && (
                <div className="absolute bottom-full mb-1.5 left-0 w-72 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl z-30 overflow-hidden max-h-[60vh] overflow-y-auto">
                  {(['stable', 'preview'] as const).map((group) => {
                    const items = PLAYGROUND_MODELS.filter((m) =>
                      group === 'preview' ? m.isPreview : !m.isPreview
                    );
                    if (items.length === 0) return null;
                    return (
                      <div key={group}>
                        <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 sticky top-0 bg-white dark:bg-neutral-900">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            {group === 'stable' ? 'Stable' : 'Preview'}
                          </p>
                        </div>
                        {items.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setShowModelMenu(false);
                              onSetModel(app.id, m.id);
                            }}
                            className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                              m.id === modelId ? 'bg-violet-500/5' : ''
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <span className={`block text-xs font-semibold truncate ${
                                m.id === modelId
                                  ? 'text-violet-700 dark:text-violet-300'
                                  : 'text-neutral-800 dark:text-neutral-200'
                              }`}>
                                {m.label}
                              </span>
                              <span className="block text-[10.5px] text-neutral-500 dark:text-neutral-400 leading-snug">
                                {m.blurb}
                              </span>
                            </div>
                            {m.id === modelId && <Check className="w-3.5 h-3.5 text-violet-600 flex-shrink-0 mt-0.5" />}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {app.lastUsage && (
                <span className="text-[10.5px] text-neutral-400" title="Cost of the last build">
                  {formatCost(app.lastUsage.costUsd)}
                </span>
              )}
              {/* The build action. Always available, always explicit — the thread is
                  the brief, and this is the only thing that turns it into code. */}
              <button
                onClick={() => void build(input, false)}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-sm shadow-violet-600/30 hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isBuilding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hammer className="w-3.5 h-3.5" />}
                {hasCode ? 'Update app' : 'Build app'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function EmptyPreview() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
          <Hammer className="w-5 h-5 text-neutral-400" />
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Nothing built yet</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
          Say what you want in the thread, then hit Build app.
        </p>
      </div>
    </div>
  );
}
