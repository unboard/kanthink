'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Drawer } from '@/components/ui/Drawer';
import { ChatMessage } from '@/components/board/ChatMessage';
import { ChatInput } from '@/components/board/ChatInput';
import { useChannelMembers } from '@/lib/hooks/useChannelMembers';
import { useStore } from '@/lib/store';
import { buildPlaygroundDoc } from './buildPlaygroundDoc';
import { resolveDeps } from '@/lib/playground/runtime';
import type { Card, CardMessage, CardMessageType, ID, PlaygroundApp, WhiteboardAttachment } from '@/lib/types';
import {
  PLAYGROUND_MODELS,
  DEFAULT_PLAYGROUND_MODEL_ID,
  getPlaygroundModel,
  formatCost,
} from '@/lib/playground/models';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Hammer,
  Loader2,
  MessageSquareText,
  Settings2,
  Trash2,
  Wand2,
} from 'lucide-react';
import { nanoid } from 'nanoid';

// Loaded on demand: the editor pulls in a canvas stack that nothing else in this
// drawer needs, and most sessions never open it.
const WhiteboardEditor = dynamic(
  () => import('@/components/board/WhiteboardEditor').then((mod) => ({ default: mod.WhiteboardEditor })),
  { ssr: false }
);

interface AppDrawerProps {
  /** The app to open. The full row — code, thread, settings — is fetched here. */
  appId: ID;
  /** The card this app is an artifact of, pinned at the top of the thread. */
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  /** Jump to the source card. */
  onOpenSourceCard?: (cardId: ID) => void;
}

interface IframeError {
  message: string;
  stack?: string;
}

type Pane = 'thread' | 'preview' | 'settings';

const OPTIMISTIC_PREFIX = '__optimistic_';

export function AppDrawer({ appId, card, isOpen, onClose, onOpenSourceCard }: AppDrawerProps) {
  const upsertPlaygroundApp = useStore((s) => s.upsertPlaygroundApp);
  const removePlaygroundApp = useStore((s) => s.removePlaygroundApp);

  // The full app row. The board only ever holds a summary, so the drawer is what
  // actually loads the code and thread — which is also what lets it be opened
  // straight from a column without the card drawer in between.
  const [app, setApp] = useState<PlaygroundApp | null>(null);
  const [loading, setLoading] = useState(true);

  const [isBuilding, setIsBuilding] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState<IframeError | null>(null);
  const [pane, setPane] = useState<Pane>('thread');
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
  // Shown before the server confirms. Never persisted — the server owns the thread.
  const [optimistic, setOptimistic] = useState<CardMessage[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { members } = useChannelMembers(card.channelId);

  const modelId = app?.modelId || DEFAULT_PLAYGROUND_MODEL_ID;
  const selectedModel = getPlaygroundModel(modelId);
  const hasCode = Boolean(app?.code);
  const busy = isBuilding || isChatting;

  /** Keep the board's summary in step with whatever the drawer just learned. */
  const syncSummary = useCallback((next: PlaygroundApp) => {
    upsertPlaygroundApp({
      id: next.id,
      cardId: next.cardId,
      channelId: next.channelId,
      title: next.title,
      summary: next.summary,
      generationCount: next.generationCount,
      isPublic: !!next.isPublic,
      position: next.position,
      isArchived: !!next.isArchived,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt,
    });
  }, [upsertPlaygroundApp]);

  const applyApp = useCallback((next: PlaygroundApp) => {
    setApp(next);
    syncSummary(next);
  }, [syncSummary]);

  // --- Load ----------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/playground/apps/${appId}`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data?.app) {
          setError(data?.error || 'Could not load this app');
          return;
        }
        setApp(data.app);
      } catch {
        if (!cancelled) setError('Could not load this app');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appId, isOpen]);

  const messages = useMemo(
    () => [...(app?.messages || []), ...optimistic],
    [app?.messages, optimistic]
  );

  // --- Preview document ----------------------------------------------------
  // Declarations are an array, so compare by value: a new array with identical
  // contents must not rebuild the document, and a changed library must.
  const depsKey = (app?.dependencies || []).join(',');
  const appCode = app?.code;
  const appTitle = app?.title;
  const appToken = app?.appToken;
  const srcDoc = useMemo(() => {
    if (!appCode) return null;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return buildPlaygroundDoc(appCode, {
      title: appTitle,
      uploadUrl: `${origin}/api/playground/upload`,
      aiUrl: `${origin}/api/playground/ai`,
      saveUrl: `${origin}/api/playground/save`,
      appToken: appToken || undefined,
      deps: resolveDeps(depsKey ? depsKey.split(',') : []).deps,
    });
  }, [appCode, appTitle, appToken, depsKey]);

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

  useEffect(() => { setIframeError(null); }, [appCode]);

  useEffect(() => {
    if (pane === 'thread') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy, pane]);

  // --- Build watcher -------------------------------------------------------
  // A build runs for minutes. If the phone locks or the tab is suspended the
  // original fetch loses its socket, but the server function completes and writes
  // to the database regardless — so poll for the result rather than losing it.
  const buildStartCount = useRef<number | null>(null);
  const generationCount = app?.generationCount ?? 0;
  useEffect(() => {
    if (!isBuilding) {
      buildStartCount.current = null;
      return;
    }
    if (buildStartCount.current === null) buildStartCount.current = generationCount;

    let stopped = false;
    const startTime = Date.now();
    const MAX_WATCH_MS = 10 * 60 * 1000;

    const poll = async () => {
      if (stopped) return;
      if (Date.now() - startTime > MAX_WATCH_MS) { stopped = true; return; }
      try {
        // `since` lets the server answer "not yet" without shipping the whole app.
        const res = await fetch(`/api/playground/status/${appId}?since=${buildStartCount.current ?? 0}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const fresh = data.app as PlaygroundApp | undefined;
        if (fresh && fresh.generationCount > (buildStartCount.current ?? 0)) {
          applyApp(fresh);
          setOptimistic([]);
          setIsBuilding(false);
          setError(null);
          setPane('preview');
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
  }, [isBuilding, generationCount, appId, applyApp]);

  // --- Persistence ---------------------------------------------------------

  const patch = useCallback(async (
    updates: Partial<Pick<PlaygroundApp, 'title' | 'isPublic' | 'modelId'>>
  ) => {
    if (!app) return;
    // Optimistic: renaming, publishing and switching model should feel instant.
    applyApp({ ...app, ...updates });
    try {
      const res = await fetch(`/api/playground/apps/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (res.ok && data?.app) applyApp(data.app);
    } catch {
      // The optimistic value stands; the next open reads the server's.
    }
  }, [app, applyApp]);

  const destroy = useCallback(async () => {
    if (!app) return;
    removePlaygroundApp(app.id);
    onClose();
    try {
      await fetch(`/api/playground/apps/${app.id}`, { method: 'DELETE' });
    } catch {
      // Restoring a row the server may well have deleted is worse than a stale
      // list that the next load corrects.
    }
  }, [app, onClose, removePlaygroundApp]);

  // --- Actions -------------------------------------------------------------

  const pushOptimistic = (
    content: string,
    type: CardMessageType = 'question',
    imageUrls?: string[],
    whiteboards?: WhiteboardAttachment[],
  ) => {
    setOptimistic([{
      id: `${OPTIMISTIC_PREFIX}${nanoid()}`,
      type,
      content,
      imageUrls,
      whiteboards,
      createdAt: new Date().toISOString(),
    } as CardMessage]);
  };

  /**
   * Post to the thread. A note is just recorded; a question is answered by Kan.
   * Neither touches the code — building is the Update button and nothing else.
   */
  const sendMessage = useCallback(async (
    text: string,
    type: CardMessageType,
    imageUrls?: string[],
    whiteboards?: WhiteboardAttachment[],
  ) => {
    const trimmed = text.trim();
    if ((!trimmed && !imageUrls?.length && !whiteboards?.length) || busy || !app) return;
    setError(null);
    // A note comes back immediately, so only a question shows the thinking state.
    const asks = type !== 'note';
    if (asks) setIsChatting(true);
    pushOptimistic(trimmed, type, imageUrls, whiteboards);
    try {
      const res = await fetch(`/api/playground/apps/${app.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, type, imageUrls, whiteboards }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Message failed');
        setOptimistic([]);
        return;
      }
      applyApp({ ...app, messages: data.messages as CardMessage[] });
      setOptimistic([]);
    } catch {
      setError('Message failed — check your connection.');
      setOptimistic([]);
    } finally {
      if (asks) setIsChatting(false);
    }
  }, [app, busy, applyApp]);

  /**
   * Build. Takes whatever is in the composer as this turn's request and the whole
   * thread as context — which is why a conversation that never mentioned building
   * still shapes what comes out.
   */
  const build = useCallback(async (promptText: string, includeError: boolean) => {
    if (busy || !app) return;
    const trimmed = promptText.trim() || (hasCode
      ? 'Update the app based on everything discussed in this thread.'
      : 'Build the app described in this thread and on the source card.');
    setError(null);
    setIsBuilding(true);
    setPane('thread');
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
          friendly = 'The build took too long and timed out. Try a smaller change, or switch to a faster model in Settings.';
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
        applyApp(data.app);
        setPane('preview');
      } else if (data.messages) {
        // Preflight asked a clarifying question instead of building.
        applyApp({ ...app, messages: data.messages as CardMessage[] });
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
  }, [app, busy, hasCode, iframeError, modelId, applyApp]);

  const shareLink = app?.isPublic && app.shareToken && typeof window !== 'undefined'
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
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2">
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            value={app?.title ?? ''}
            onChange={(e) => { if (app) applyApp({ ...app, title: e.target.value }); }}
            onBlur={(e) => { if (app && e.target.value.trim()) void patch({ title: e.target.value.trim() }); }}
            disabled={!app}
            className="flex-1 min-w-0 font-medium text-neutral-900 dark:text-white bg-transparent border-none outline-none truncate"
            placeholder="App name"
          />
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && !app ? (
            <div className="h-full flex items-center justify-center text-sm text-neutral-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading…
            </div>
          ) : pane === 'preview' ? (
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
                  key={generationCount}
                  srcDoc={srcDoc}
                  title={appTitle}
                  className="flex-1 w-full border-0 bg-white"
                  sandbox="allow-scripts allow-forms allow-popups allow-modals"
                />
              ) : (
                <EmptyPreview />
              )}
            </div>
          ) : pane === 'settings' && app ? (
            <SettingsPane
              app={app}
              modelId={modelId}
              shareLink={shareLink}
              copied={copied}
              confirmDelete={confirmDelete}
              onCopyLink={copyShareLink}
              onTogglePublic={() => void patch({ isPublic: !app.isPublic })}
              onSetModel={(id) => void patch({ modelId: id })}
              onConfirmDelete={setConfirmDelete}
              onDelete={destroy}
            />
          ) : (
            <div className="px-3 py-2">
              {/* The source card, pinned. This is where the app came from. */}
              <button
                onClick={() => onOpenSourceCard?.(card.id)}
                className="w-full flex items-center gap-2 text-left mb-3 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 hover:border-violet-400/50 transition-colors group"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 flex-shrink-0">
                  From
                </span>
                <span className="text-xs text-neutral-700 dark:text-neutral-300 truncate group-hover:text-violet-600 dark:group-hover:text-violet-400">
                  {card.title}
                </span>
              </button>

              {messages.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Describe what you want built.
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 max-w-xs mx-auto">
                    The card above goes in as context. Send to talk it through first, or press
                    Update when you&apos;re ready.
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

        {/* Bottom bar: nav tiles + Update, then the composer — same shape as a card. */}
        <div className="flex-shrink-0 bg-white dark:bg-neutral-900 pt-2">
          {error && (
            <div className="mx-3 mb-2 flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 dark:text-red-400 flex-1">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 pb-2">
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {([
                { key: 'thread' as const, label: 'Thread', icon: <MessageSquareText className="w-3.5 h-3.5" />, disabled: false },
                { key: 'preview' as const, label: hasCode ? `Preview v${generationCount}` : 'Preview', icon: <Eye className="w-3.5 h-3.5" />, disabled: !hasCode },
                { key: 'settings' as const, label: 'Settings', icon: <Settings2 className="w-3.5 h-3.5" />, disabled: !app },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setPane(tab.key)}
                  disabled={tab.disabled}
                  className={`flex flex-shrink-0 items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors disabled:opacity-40 ${
                    pane === tab.key
                      ? 'bg-violet-500/15 border-violet-500/30 text-violet-600 dark:text-violet-300'
                      : 'bg-neutral-100 dark:bg-neutral-800/80 border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* The build action. The thread is the brief; this is the only thing
                that turns it into code. */}
            <button
              onClick={() => void build('', false)}
              disabled={busy || !app}
              className="ml-auto flex flex-shrink-0 items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-sm shadow-violet-600/30 hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              title="Build the app from this thread"
            >
              {isBuilding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hammer className="w-3.5 h-3.5" />}
              Update
            </button>
          </div>

          {pane === 'thread' && (
            <ChatInput
              onSubmit={(content, type, imageUrls) => void sendMessage(content, type, imageUrls)}
              isLoading={isChatting}
              placeholder={hasCode ? 'Talk it through, or describe a change…' : 'What should this app do?'}
              // Uploads are filed against the source card, which is where this app's
              // images belong — the card is the thing that outlives any one build.
              cardId={card.id}
              channelId={card.channelId}
              members={members}
              onOpenWhiteboard={() => setIsWhiteboardOpen(true)}
            />
          )}
        </div>
      </div>
      {/* Whiteboard: sketch a screen and build from the sketch. Saved as a note, so
          it costs nothing and still lands in the thread the next build reads. */}
      {isWhiteboardOpen && (
        <WhiteboardEditor
          isOpen
          onSave={async (snapshotJson, snapshotDataUrl) => {
            setIsWhiteboardOpen(false);
            // The PNG is what the model actually looks at — the serialized JSON is
            // for re-editing. Upload is best-effort: a sketch that fails to upload
            // is still worth keeping in the thread, it just isn't visible to Kan.
            let snapshotImageUrl: string | undefined;
            if (snapshotDataUrl) {
              try {
                const blob = await (await fetch(snapshotDataUrl)).blob();
                const file = new File([blob], 'whiteboard.png', { type: 'image/png' });
                const form = new FormData();
                form.append('file', file);
                form.append('cardId', card.id);
                const res = await fetch('/api/upload-image', { method: 'POST', body: form });
                if (res.ok) snapshotImageUrl = (await res.json()).url;
              } catch { /* best-effort */ }
            }
            void sendMessage('', 'note', undefined, [
              { id: nanoid(), snapshot: snapshotJson, snapshotImageUrl },
            ]);
          }}
          onClose={() => setIsWhiteboardOpen(false)}
        />
      )}
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
          Say what you want in the thread, then press Update.
        </p>
      </div>
    </div>
  );
}

/** Everything that makes up the app, as opposed to the conversation about it. */
function SettingsPane({
  app,
  modelId,
  shareLink,
  copied,
  confirmDelete,
  onCopyLink,
  onTogglePublic,
  onSetModel,
  onConfirmDelete,
  onDelete,
}: {
  app: PlaygroundApp;
  modelId: string;
  shareLink: string | null;
  copied: boolean;
  confirmDelete: boolean;
  onCopyLink: () => void;
  onTogglePublic: () => void;
  onSetModel: (id: string) => void;
  onConfirmDelete: (v: boolean) => void;
  onDelete: () => void;
}) {
  const hasCode = Boolean(app.code);
  return (
    <div className="px-4 py-4 space-y-6">
      {/* Sharing */}
      <section>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
          Sharing
        </h3>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!app.isPublic}
              onChange={onTogglePublic}
              disabled={!hasCode}
              className="w-4 h-4 rounded accent-violet-600 disabled:opacity-40"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-900 dark:text-white">Published</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {hasCode
                  ? 'Anyone with the link can open this app.'
                  : 'Build it first — there is nothing to publish yet.'}
              </p>
            </div>
          </label>
          {shareLink && (
            <button
              onClick={onCopyLink}
              className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/5"
            >
              {copied ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <Copy className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate">{copied ? 'Link copied' : shareLink}</span>
            </button>
          )}
          {hasCode && (
            <a
              href={`/play/preview/${app.id}`}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              Open full screen
            </a>
          )}
        </div>
      </section>

      {/* Model */}
      <section>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
          Model
        </h3>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
          {PLAYGROUND_MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => onSetModel(m.id)}
              className={`w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${
                m.id === modelId ? 'bg-violet-500/5' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className={`block text-xs font-semibold ${
                  m.id === modelId
                    ? 'text-violet-700 dark:text-violet-300'
                    : 'text-neutral-800 dark:text-neutral-200'
                }`}>
                  {m.label}
                  {m.isPreview && (
                    <span className="ml-1.5 text-[9px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500">
                      preview
                    </span>
                  )}
                </span>
                <span className="block text-[10.5px] text-neutral-500 dark:text-neutral-400 leading-snug">
                  {m.blurb}
                </span>
              </div>
              {m.id === modelId && <Check className="w-3.5 h-3.5 text-violet-600 flex-shrink-0 mt-0.5" />}
            </button>
          ))}
        </div>
      </section>

      {/* Build */}
      <section>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
          Build
        </h3>
        <dl className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
          <Row label="Version" value={app.generationCount > 0 ? `v${app.generationCount}` : 'Not built yet'} />
          {app.lastModelId && <Row label="Last built with" value={getPlaygroundModel(app.lastModelId).label} />}
          {app.lastUsage && <Row label="Last build cost" value={formatCost(app.lastUsage.costUsd)} />}
          <Row
            label="Libraries"
            value={app.dependencies?.length ? app.dependencies.join(', ') : 'react, lucide-react'}
          />
          {(app.savedRecords?.length ?? 0) > 0 && (
            <Row label="Saved records" value={String(app.savedRecords!.length)} />
          )}
        </dl>
        {app.designNotes && (
          <details className="mt-2 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
            <summary className="text-xs font-medium text-neutral-600 dark:text-neutral-300 cursor-pointer">
              Design decisions Kan is carrying forward
            </summary>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap">
              {app.designNotes}
            </p>
          </details>
        )}
      </section>

      {/* Danger */}
      <section>
        <button
          onClick={() => (confirmDelete ? onDelete() : onConfirmDelete(true))}
          onBlur={() => onConfirmDelete(false)}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
            confirmDelete
              ? 'bg-red-500 text-white'
              : 'border border-neutral-200 dark:border-neutral-800 text-red-500 hover:bg-red-500/10'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {confirmDelete ? 'Delete this app permanently?' : 'Delete app'}
        </button>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <dt className="text-neutral-500 dark:text-neutral-400 flex-shrink-0">{label}</dt>
      <dd className="ml-auto text-right text-neutral-800 dark:text-neutral-200 break-words min-w-0">{value}</dd>
    </div>
  );
}
