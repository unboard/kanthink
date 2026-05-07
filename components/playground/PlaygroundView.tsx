'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import type { Card } from '@/lib/types';
import { buildPlaygroundDoc } from './buildPlaygroundDoc';
import { Sparkles, Maximize2, Minimize2, Globe, Lock, Copy, Check, Loader2, AlertCircle, Send } from 'lucide-react';
import { nanoid } from 'nanoid';

interface PlaygroundViewProps {
  card: Card;
}

interface PlaygroundTypeData {
  code?: string;
  codeTitle?: string;
  codeSummary?: string;
  generationCount?: number;
  lastNotes?: string;
}

/** Local-only iframe error captured via postMessage. */
interface IframeError {
  message: string;
  stack?: string;
}

export function PlaygroundView({ card }: PlaygroundViewProps) {
  const updateCard = useStore((s) => s.updateCard);
  const cardFromStore = useStore((s) => s.cards[card.id]) || card;

  const typeData = (cardFromStore.typeData as PlaygroundTypeData | undefined) || {};
  const code = typeData.code || '';
  const generationCount = typeData.generationCount || 0;

  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState<IframeError | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const srcDoc = useMemo(() => {
    if (!code) return null;
    return buildPlaygroundDoc(code, { title: typeData.codeTitle || cardFromStore.title });
  }, [code, typeData.codeTitle, cardFromStore.title]);

  // Listen for runtime errors from inside the iframe.
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'kpg_error') {
        setIframeError({ message: String(e.data.message || 'Unknown error'), stack: e.data.stack });
      } else if (e.data.type === 'kpg_ready') {
        // Iframe loaded successfully; clear stale errors from the previous render.
        setIframeError(null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [code]);

  // Reset iframe error each time we get new code.
  useEffect(() => {
    setIframeError(null);
  }, [code]);

  // Build share URL once isPublic + token are set.
  useEffect(() => {
    if (cardFromStore.isPublic && cardFromStore.shareToken && typeof window !== 'undefined') {
      setShareLink(`${window.location.origin}/play/${cardFromStore.shareToken}`);
    } else {
      setShareLink(null);
    }
  }, [cardFromStore.isPublic, cardFromStore.shareToken]);

  const generate = useCallback(async (userPrompt: string, includeError: boolean) => {
    if (!userPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const res = await fetch('/api/playground/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          prompt: userPrompt,
          lastError: includeError ? iframeError?.message : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || 'Generation failed');
        return;
      }
      // Update local store so the UI reacts immediately.
      updateCard(card.id, {
        cardType: 'playground',
        typeData: data.typeData,
        messages: data.messages,
        ...(data.snapshot.title && generationCount === 0 ? { title: data.snapshot.title } : {}),
        ...(data.snapshot.summary ? { summary: data.snapshot.summary } : {}),
      });
      setPrompt('');
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsGenerating(false);
    }
  }, [card.id, isGenerating, iframeError, updateCard, generationCount]);

  const handleSubmit = () => generate(prompt, false);
  const handleAutoFix = () => {
    if (!iframeError) return;
    generate(`Fix this runtime error from the previous version:\n${iframeError.message}`, true);
  };

  const togglePublic = useCallback(async () => {
    const next = !cardFromStore.isPublic;
    const token = cardFromStore.shareToken || nanoid(12);
    updateCard(card.id, { isPublic: next, shareToken: token });
  }, [card.id, cardFromStore.isPublic, cardFromStore.shareToken, updateCard]);

  const copyShareLink = useCallback(async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail on some mobile browsers; show a fallback prompt.
      window.prompt('Copy this link', shareLink);
    }
  }, [shareLink]);

  // Recent conversation — last 10 messages from the thread (snapshot context above the input).
  const recentMessages = (cardFromStore.messages || []).slice(-10);

  const containerClasses = isFullscreen
    ? 'fixed inset-0 z-50 bg-white dark:bg-neutral-950 flex flex-col'
    : 'flex flex-1 flex-col min-h-0 bg-white dark:bg-neutral-950';

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0" />
          <span className="text-sm font-medium text-neutral-900 dark:text-white truncate">
            {typeData.codeTitle || cardFromStore.title || 'New Playground'}
          </span>
          {generationCount > 0 && (
            <span className="text-[10px] text-neutral-500 flex-shrink-0">v{generationCount}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {code && (
            <button
              onClick={togglePublic}
              title={cardFromStore.isPublic ? 'Public — click to make private' : 'Make public'}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                cardFromStore.isPublic
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              {cardFromStore.isPublic ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{cardFromStore.isPublic ? 'Public' : 'Private'}</span>
            </button>
          )}
          {shareLink && (
            <button
              onClick={copyShareLink}
              title="Copy share link"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Link'}</span>
            </button>
          )}
          <button
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen play'}
            className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Preview pane */}
      <div className={`relative flex-shrink-0 bg-neutral-100 dark:bg-neutral-900 ${isFullscreen ? 'flex-1' : 'h-[50vh] sm:h-[55vh]'}`}>
        {srcDoc ? (
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-modals allow-popups allow-forms"
            allow="autoplay; clipboard-write"
            className="w-full h-full border-0 bg-white"
            title="Playground preview"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-neutral-500 dark:text-neutral-400">
            <Sparkles className="w-8 h-8 mb-3 text-violet-400" />
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Describe what you want to build.</p>
            <p className="text-xs max-w-xs">For example: <span className="italic">&ldquo;Make me a flyer maker app for restaurants with a template picker and a download button.&rdquo;</span></p>
          </div>
        )}
        {isGenerating && (
          <div className="absolute top-3 right-3 flex items-center gap-2 bg-white/90 dark:bg-neutral-900/90 backdrop-blur px-3 py-1.5 rounded-full text-xs font-medium text-neutral-700 dark:text-neutral-200 shadow-md">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
            {generationCount === 0 ? 'Building…' : 'Updating…'}
          </div>
        )}
      </div>

      {/* Chat / iteration pane (hidden in fullscreen mode) */}
      {!isFullscreen && (
        <div className="flex-1 flex flex-col min-h-0 border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {recentMessages.length === 0 ? (
              <div className="text-xs text-neutral-400 italic text-center py-4">
                Your conversation with Kan will show here. Each change is a message.
              </div>
            ) : (
              recentMessages.map((m) => (
                <div
                  key={m.id}
                  className={`text-sm rounded-2xl px-3 py-2 max-w-[85%] ${
                    m.type === 'question'
                      ? 'ml-auto bg-violet-600 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100'
                  }`}
                >
                  {m.content}
                </div>
              ))
            )}
            {iframeError && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-red-700 dark:text-red-300">Runtime error in the preview</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 break-words">{iframeError.message}</p>
                  <button
                    onClick={handleAutoFix}
                    disabled={isGenerating}
                    className="mt-1.5 text-xs font-medium text-red-700 dark:text-red-300 underline disabled:opacity-50"
                  >
                    Ask Kan to fix it
                  </button>
                </div>
              </div>
            )}
            {genError && (
              <div className="text-xs text-red-600 dark:text-red-400 px-2">{genError}</div>
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-2 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={code ? 'Describe a change…' : 'What do you want to build?'}
                rows={2}
                className="flex-1 resize-none rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                disabled={isGenerating}
              />
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim() || isGenerating}
                className="flex-shrink-0 h-10 w-10 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-md hover:bg-violet-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:cursor-not-allowed transition-colors"
                aria-label="Send"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-neutral-400 text-center">
              Each change runs Gemini 2.5 Pro (~$0.02 per change). Apps run in a sandboxed iframe — data stored in your browser.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
