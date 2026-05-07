'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import type { Card } from '@/lib/types';
import { buildPlaygroundDoc } from './buildPlaygroundDoc';
import {
  Sparkles,
  Maximize2,
  Minimize2,
  Globe,
  Lock,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ArrowUp,
  MessageSquareText,
  Eye,
  Wand2,
} from 'lucide-react';
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

interface IframeError {
  message: string;
  stack?: string;
}

const STARTER_PROMPTS = [
  { label: 'Flyer maker for restaurants', prompt: 'A flyer maker for restaurants with a template picker (3 styles: classic, modern, playful), an editor with text fields for restaurant name, tagline, hours, address, and a downloadable preview.' },
  { label: 'Pomodoro with calming gradient', prompt: 'A focus timer with a calming animated gradient background, big circular countdown, start/pause/reset, and a tally of completed sessions saved to localStorage.' },
  { label: 'Color palette generator', prompt: 'A color palette generator that produces 5 harmonious hex colors from a base color picker, with copy-to-clipboard on each swatch and a "lock" toggle to preserve favorites between regenerations.' },
  { label: 'Memory match game', prompt: 'A 4x4 memory match game with animal emoji tiles, flip animation, move counter, and a celebratory confetti burst on win.' },
];

export function PlaygroundView({ card }: PlaygroundViewProps) {
  const updateCard = useStore((s) => s.updateCard);
  const cardFromStore = useStore((s) => s.cards[card.id]) || card;

  const typeData = (cardFromStore.typeData as PlaygroundTypeData | undefined) || {};
  const code = typeData.code || '';
  const generationCount = typeData.generationCount || 0;
  const hasCode = Boolean(code);

  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState<IframeError | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
        setIframeError(null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    setIframeError(null);
  }, [code]);

  // Build share URL.
  useEffect(() => {
    if (cardFromStore.isPublic && cardFromStore.shareToken && typeof window !== 'undefined') {
      setShareLink(`${window.location.origin}/play/${cardFromStore.shareToken}`);
    } else {
      setShareLink(null);
    }
  }, [cardFromStore.isPublic, cardFromStore.shareToken]);

  // Auto-flip to preview tab after a fresh generation lands (mobile).
  useEffect(() => {
    if (hasCode) setMobileTab('preview');
  }, [generationCount, hasCode]);

  // Scroll chat to bottom on new messages.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [cardFromStore.messages?.length, isGenerating]);

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

  const togglePublic = useCallback(() => {
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
      window.prompt('Copy this link', shareLink);
    }
  }, [shareLink]);

  const recentMessages = (cardFromStore.messages || []).slice(-30);
  const titleDisplay = typeData.codeTitle || cardFromStore.title || 'New Playground';

  // ---------- Sub-components ---------- //

  const Header = (
    <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 border-b border-neutral-200/80 dark:border-neutral-800 bg-gradient-to-b from-white to-neutral-50/60 dark:from-neutral-950 dark:to-neutral-950">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-sm shadow-violet-500/30">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate leading-tight">{titleDisplay}</p>
          <p className="text-[10.5px] text-neutral-500 leading-tight">
            Playground{generationCount > 0 ? ` · v${generationCount}` : ''}{cardFromStore.isPublic ? ' · Public' : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {hasCode && (
          <button
            onClick={togglePublic}
            title={cardFromStore.isPublic ? 'Public — click to make private' : 'Make public'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              cardFromStore.isPublic
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
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
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Link'}</span>
          </button>
        )}
        <button
          onClick={() => setIsFullscreen((v) => !v)}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen play'}
          className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  const ChatPane = (
    <div className="flex flex-col min-h-0 h-full bg-white dark:bg-neutral-950">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
        {recentMessages.length === 0 && !hasCode ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-400 flex items-center justify-center shadow-lg shadow-violet-500/30 mb-4">
              <Wand2 className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1.5 tracking-tight">
              What do you want to build?
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed mb-6">
              Describe an app, a tool, a tiny game — Kan will build it and you can iterate together.
            </p>
            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STARTER_PROMPTS.map((sp) => (
                <button
                  key={sp.label}
                  onClick={() => generate(sp.prompt, false)}
                  disabled={isGenerating}
                  className="group flex items-start gap-2 text-left rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-violet-300 dark:hover:border-violet-700 bg-white dark:bg-neutral-900 hover:bg-violet-50/50 dark:hover:bg-violet-900/10 px-3 py-2.5 transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-400 group-hover:text-violet-600 mt-0.5 flex-shrink-0" />
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">{sp.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl mx-auto">
            {recentMessages.map((m) => (
              <div key={m.id} className={`flex ${m.type === 'question' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.type === 'question'
                    ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-sm shadow-violet-600/20'
                    : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 border border-neutral-200/60 dark:border-neutral-800'
                }`}>
                  {m.type !== 'question' && (
                    <div className="flex items-center gap-1.5 mb-1 opacity-60">
                      <Sparkles className="w-3 h-3 text-violet-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide">Kan</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800">
                  <div className="flex items-center gap-1.5 mb-1 opacity-60">
                    <Sparkles className="w-3 h-3 text-violet-500" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">Kan</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    <span className="italic">{generationCount === 0 ? 'Designing your app…' : 'Updating…'}</span>
                  </div>
                </div>
              </div>
            )}
            {iframeError && !isGenerating && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-3.5 py-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Runtime error in the preview</p>
                      <p className="text-xs text-red-600 dark:text-red-400 break-words mb-2 font-mono">{iframeError.message}</p>
                      <button
                        onClick={handleAutoFix}
                        disabled={isGenerating}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-200 hover:text-red-800 dark:hover:text-red-100 underline underline-offset-2 disabled:opacity-50"
                      >
                        <Wand2 className="w-3 h-3" />
                        Ask Kan to fix it
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {genError && (
              <div className="text-xs text-red-600 dark:text-red-400 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-900/60">
                {genError}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 sm:px-5 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="relative rounded-2xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-500/10 transition-all shadow-sm">
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
              placeholder={hasCode ? 'Describe a change…' : 'What do you want to build?'}
              rows={2}
              disabled={isGenerating}
              className="w-full resize-none rounded-2xl bg-transparent px-4 py-3 pr-12 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() || isGenerating}
              className="absolute bottom-2.5 right-2.5 h-8 w-8 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white flex items-center justify-center shadow-md shadow-violet-600/30 hover:shadow-lg hover:shadow-violet-600/40 hover:from-violet-700 hover:to-fuchsia-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:bg-none disabled:shadow-none disabled:cursor-not-allowed transition-all"
              aria-label="Send"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-neutral-400 dark:text-neutral-500 text-center">
            Each change runs Gemini 2.5 Pro · ~$0.02 each · Apps run in a sandbox · Data stored in your browser
          </p>
        </div>
      </div>
    </div>
  );

  const PreviewPane = (
    <div className="relative flex-1 min-h-0 bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
      {srcDoc ? (
        <iframe
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-modals allow-popups allow-forms"
          allow="autoplay; clipboard-write"
          className="w-full h-full border-0 bg-white"
          title="Playground preview"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
          <div className="relative mb-5">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 rounded-3xl blur-2xl" />
            <div className="relative w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-400 flex items-center justify-center shadow-xl shadow-violet-500/40">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
          </div>
          <p className="text-base font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Your app will live here</p>
          <p className="text-xs text-neutral-500 max-w-xs leading-relaxed">
            Start a build from the chat — try a starter prompt or describe your own idea.
          </p>
        </div>
      )}
      {isGenerating && hasCode && (
        <div className="absolute top-3 right-3 flex items-center gap-2 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-neutral-700 dark:text-neutral-200 shadow-lg ring-1 ring-violet-500/20">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
          Updating…
        </div>
      )}
    </div>
  );

  // ---------- Layouts ---------- //

  // Fullscreen — preview takes the whole screen, only a tiny exit affordance.
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-neutral-950/90 backdrop-blur border-b border-neutral-800">
          <div className="flex items-center gap-2 min-w-0 text-white">
            <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0" />
            <span className="text-sm font-medium truncate">{titleDisplay}</span>
          </div>
          <button
            onClick={() => setIsFullscreen(false)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            <Minimize2 className="w-4 h-4" />
            Exit
          </button>
        </div>
        <div className="flex-1 min-h-0">{PreviewPane}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-neutral-950">
      {Header}

      {/* Desktop: side-by-side. Mobile: tabbed. */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Mobile tab switcher (hidden on md+) */}
        <div className="md:hidden flex-shrink-0 flex border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 pt-2">
          <button
            onClick={() => setMobileTab('chat')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              mobileTab === 'chat'
                ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-600 -mb-px'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            Chat
          </button>
          <button
            onClick={() => setMobileTab('preview')}
            disabled={!hasCode}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              mobileTab === 'preview'
                ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-600 -mb-px'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 disabled:opacity-40'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
            {generationCount > 0 && <span className="ml-0.5 text-[9px] text-neutral-400">v{generationCount}</span>}
          </button>
          <div className="ml-auto self-center pb-1.5">
            {mobileTab === 'preview' && hasCode && (
              <button
                onClick={() => setIsFullscreen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <Maximize2 className="w-3 h-3" />
                Full
              </button>
            )}
          </div>
        </div>

        {/* Chat (desktop: left rail, mobile: full when active) */}
        <div className={`md:flex md:flex-col md:w-[42%] md:max-w-xl md:min-w-[340px] md:border-r md:border-neutral-200 md:dark:border-neutral-800 flex-1 min-h-0 ${
          mobileTab === 'chat' ? 'flex' : 'hidden md:flex'
        }`}>
          {ChatPane}
        </div>

        {/* Preview (desktop: right side, mobile: full when active) */}
        <div className={`flex-1 min-h-0 ${
          mobileTab === 'preview' ? 'flex flex-col' : 'hidden md:flex md:flex-col'
        }`}>
          {PreviewPane}
        </div>
      </div>
    </div>
  );
}
