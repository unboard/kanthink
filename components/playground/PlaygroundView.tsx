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
  X,
  Cpu,
  ChevronDown,
  ImagePlus,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { useImageUpload } from '@/lib/hooks/useImageUpload';
import {
  PLAYGROUND_MODELS,
  DEFAULT_PLAYGROUND_MODEL_ID,
  getPlaygroundModel,
  formatCost,
} from '@/lib/playground/models';

interface PlaygroundViewProps {
  card: Card;
  onClose?: () => void;
}

interface PlaygroundUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const CHAT_WIDTH_KEY = 'kanthink_playground_chat_width';
const MODEL_PREF_KEY = 'kanthink_playground_model';
const CHAT_WIDTH_MIN = 22;
const CHAT_WIDTH_MAX = 70;
const CHAT_WIDTH_DEFAULT = 36;

interface PlaygroundTypeData {
  code?: string;
  codeTitle?: string;
  codeSummary?: string;
  generationCount?: number;
  lastNotes?: string;
  lastUsage?: PlaygroundUsage;
  lastModelId?: string;
  cardToken?: string;
}

interface IframeError {
  message: string;
  stack?: string;
}

interface StagedImage {
  id: string;
  url: string;       // Cloudinary URL once uploaded; tempId while uploading
  uploading: boolean;
}

const STARTER_PROMPTS = [
  { label: 'Flyer maker for restaurants', prompt: 'A flyer maker for restaurants with a template picker (3 styles: classic, modern, playful), an editor with text fields for restaurant name, tagline, hours, address, and a downloadable preview.' },
  { label: 'Pomodoro with calming gradient', prompt: 'A focus timer with a calming animated gradient background, big circular countdown, start/pause/reset, and a tally of completed sessions saved to localStorage.' },
  { label: 'Color palette generator', prompt: 'A color palette generator that produces 5 harmonious hex colors from a base color picker, with copy-to-clipboard on each swatch and a "lock" toggle to preserve favorites between regenerations.' },
  { label: 'Memory match game', prompt: 'A 4x4 memory match game with animal emoji tiles, flip animation, move counter, and a celebratory confetti burst on win.' },
];

export function PlaygroundView({ card, onClose }: PlaygroundViewProps) {
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
  const [chatWidth, setChatWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return CHAT_WIDTH_DEFAULT;
    const saved = window.localStorage.getItem(CHAT_WIDTH_KEY);
    const parsed = saved ? parseFloat(saved) : NaN;
    return Number.isFinite(parsed) && parsed >= CHAT_WIDTH_MIN && parsed <= CHAT_WIDTH_MAX ? parsed : CHAT_WIDTH_DEFAULT;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [modelId, setModelId] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_PLAYGROUND_MODEL_ID;
    const saved = window.localStorage.getItem(MODEL_PREF_KEY);
    if (saved && PLAYGROUND_MODELS.some(m => m.id === saved)) return saved;
    return DEFAULT_PLAYGROUND_MODEL_ID;
  });
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const splitRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useImageUpload({ cardId: card.id });

  const selectedModel = getPlaygroundModel(modelId);
  const lastUsage = typeData.lastUsage;

  // Keep the latest chatWidth in a ref so the mouseup persistence reads the
  // current value without forcing the drag effect to re-attach listeners on
  // every frame. Re-attaching mid-drag was causing dropped move/up events.
  const chatWidthRef = useRef(chatWidth);
  useEffect(() => { chatWidthRef.current = chatWidth; }, [chatWidth]);

  // Drag handle: attach window listeners ONCE per drag (deps: only isResizing).
  // While held, the iframe gets pointer-events:none via `isResizing` so the
  // browser doesn't hand the cursor to the iframe and steal our mousemove/up.
  useEffect(() => {
    if (!isResizing) return;
    const container = splitRef.current;
    const onMove = (e: MouseEvent) => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(CHAT_WIDTH_MIN, Math.min(CHAT_WIDTH_MAX, pct));
      setChatWidth(clamped);
    };
    const onUp = () => {
      setIsResizing(false);
      try {
        window.localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidthRef.current));
      } catch { /* noop */ }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    // Window blur guards against losing the mouseup if the cursor leaves the
    // viewport (drag onto another monitor / native dialog) — release the drag.
    window.addEventListener('blur', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Persist final width once the drag ends (also handled in onUp above for safety).
  useEffect(() => {
    if (isResizing) return;
    try {
      window.localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth));
    } catch { /* noop */ }
  }, [chatWidth, isResizing]);

  // Persist model preference whenever it changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(MODEL_PREF_KEY, modelId);
    } catch { /* noop */ }
  }, [modelId]);

  // Close the model picker when the user taps outside it.
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

  // Generation watcher — handles the case where the user's phone locks or the
  // tab gets suspended mid-generation and the original fetch loses its socket.
  // The server-side function keeps running and writes to the DB regardless;
  // we just need to poll to pick up the result when the client comes back.
  // Polls every 4s while generating, and immediately on tab visibility regain.
  // Hard cap at 5 minutes to avoid runaway pollers.
  const generationStartGenCount = useRef<number | null>(null);
  useEffect(() => {
    if (!isGenerating) {
      generationStartGenCount.current = null;
      return;
    }
    // Snapshot the gen count when we entered the generating state so we know
    // when the server has actually completed a NEW generation.
    if (generationStartGenCount.current === null) {
      generationStartGenCount.current = generationCount;
    }

    let stopped = false;
    const startTime = Date.now();
    const MAX_WATCH_MS = 5 * 60 * 1000;

    const poll = async () => {
      if (stopped) return;
      if (Date.now() - startTime > MAX_WATCH_MS) {
        stopped = true;
        return;
      }
      try {
        const res = await fetch(`/api/playground/status/${card.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const newTypeData = data.typeData as PlaygroundTypeData | null;
        const newGenCount = newTypeData?.generationCount ?? 0;
        if (newGenCount > (generationStartGenCount.current ?? 0)) {
          // Server completed a new generation while we were polling — apply it.
          updateCard(card.id, {
            cardType: 'playground',
            typeData: newTypeData as Card['typeData'],
            messages: data.messages as Card['messages'],
            ...(data.title ? { title: data.title } : {}),
            ...(data.summary ? { summary: data.summary } : {}),
          });
          setIsGenerating(false);
          setGenError(null);
          stopped = true;
        }
      } catch {
        // Polling failures are silent — we'll try again next tick.
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
  }, [isGenerating, generationCount, card.id, updateCard]);

  const srcDoc = useMemo(() => {
    if (!code) return null;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return buildPlaygroundDoc(code, {
      title: typeData.codeTitle || cardFromStore.title,
      uploadUrl: `${origin}/api/playground/upload`,
      aiUrl: `${origin}/api/playground/ai`,
      cardToken: typeData.cardToken,
    });
  }, [code, typeData.codeTitle, typeData.cardToken, cardFromStore.title]);

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

  const handleUploadFile = useCallback(async (file: File) => {
    const tempId = nanoid();
    const objectUrl = URL.createObjectURL(file);
    setStagedImages((prev) => [...prev, { id: tempId, url: objectUrl, uploading: true }]);
    try {
      const result = await uploadFile(file);
      setStagedImages((prev) =>
        prev.map((img) => (img.id === tempId ? { id: tempId, url: result.url, uploading: false } : img))
      );
      // Keep the temporary blob URL alive until React swaps to the real URL.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Image upload failed');
      setStagedImages((prev) => prev.filter((img) => img.id !== tempId));
      URL.revokeObjectURL(objectUrl);
    }
  }, [uploadFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleUploadFile(file);
      }
    }
  }, [handleUploadFile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 5).forEach(handleUploadFile);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeStagedImage = (id: string) => {
    setStagedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const generate = useCallback(async (userPrompt: string, includeError: boolean) => {
    if ((!userPrompt.trim() && stagedImages.length === 0) || isGenerating) return;
    // Don't fire while images are still uploading.
    if (stagedImages.some((img) => img.uploading)) return;

    // Snapshot what we're about to send, then clear the input immediately so the
    // user gets instant feedback. Their message is also pushed into the thread
    // optimistically below — we don't want them staring at their own text in the
    // textarea for 15 seconds while Gemini thinks.
    const imageUrls = stagedImages.filter((img) => !img.uploading).map((img) => img.url);
    const trimmedPrompt = userPrompt.trim();

    setPrompt('');
    setStagedImages([]);
    setIsGenerating(true);
    setGenError(null);

    // Optimistic user message — gets replaced when the server response lands
    // with the canonical thread (which includes this same message + Kan's reply).
    const optimisticId = `__optimistic_${nanoid()}`;
    const optimisticMessage = {
      id: optimisticId,
      type: 'question' as const,
      content: trimmedPrompt,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      createdAt: new Date().toISOString(),
    };
    const messagesBeforeSend = cardFromStore.messages || [];
    updateCard(card.id, {
      messages: [...messagesBeforeSend, optimisticMessage],
    });

    try {
      const res = await fetch('/api/playground/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          prompt: trimmedPrompt,
          lastError: includeError ? iframeError?.message : undefined,
          modelId,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        }),
      });

      // Read as text first so we can give a friendly error when the gateway
      // returns HTML (504/502) or any non-JSON body — JSON.parse on HTML throws
      // a cryptic "Unexpected token A, 'An error o...'" that's useless to users.
      const responseText = await res.text();
      let data: { error?: string; typeData?: unknown; messages?: unknown; snapshot?: { title?: string; summary?: string } } | null = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = null;
      }

      if (!res.ok || !data) {
        let friendly: string;
        if (res.status === 504 || res.status === 502) {
          friendly = 'Generation took too long and timed out. Try a smaller change, or switch to a faster model like Gemini 3 Flash.';
        } else if (res.status === 408) {
          friendly = 'Request timed out. Try again, or switch to a faster model.';
        } else if (data?.error) {
          friendly = data.error;
        } else if (!data) {
          friendly = `Server returned an unexpected response (${res.status}). Try again.`;
        } else {
          friendly = `Generation failed (${res.status}).`;
        }
        setGenError(friendly);
        updateCard(card.id, { messages: messagesBeforeSend });
        setIsGenerating(false);
        return;
      }

      const dataMessages = data.messages as unknown[] | undefined;
      updateCard(card.id, {
        cardType: 'playground',
        typeData: data.typeData as Card['typeData'],
        ...(dataMessages ? { messages: dataMessages as Card['messages'] } : {}),
        ...(data.snapshot?.title && generationCount === 0 ? { title: data.snapshot.title } : {}),
        ...(data.snapshot?.summary ? { summary: data.snapshot.summary } : {}),
      });
      setIsGenerating(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      // A "Failed to fetch" / "NetworkError" with the page in flight typically
      // means the tab got suspended (mobile screen-off) or briefly disconnected.
      // The server-side Gemini call keeps running and the DB write completes
      // independently — the watcher above will reconcile when the tab returns.
      // So we DON'T roll back the optimistic message and we DON'T flip isGenerating
      // off — the watcher polls every 4s and on visibility regain.
      const isLikelyTransient = msg.includes('Failed to fetch')
        || msg.includes('NetworkError')
        || msg.includes('aborted')
        || msg.includes('network')
        || msg.includes('connection');
      if (isLikelyTransient) {
        return; // watcher takes over
      }
      // Real failure (e.g. immediate auth/quota error) — roll back, surface error.
      setGenError(msg);
      updateCard(card.id, { messages: messagesBeforeSend });
      setIsGenerating(false);
    }
  }, [card.id, cardFromStore.messages, isGenerating, iframeError, updateCard, generationCount, modelId, stagedImages]);

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
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
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
                  {m.imageUrls && m.imageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {m.imageUrls.map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={url}
                          src={url}
                          alt="Attached"
                          className="w-24 h-24 object-cover rounded-lg border border-white/20"
                        />
                      ))}
                    </div>
                  )}
                  {m.content && <div className="whitespace-pre-wrap break-words">{m.content}</div>}
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
          {stagedImages.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {stagedImages.map((img) => (
                <div key={img.id} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt="Attached"
                    className="w-16 h-16 object-cover rounded-lg border border-neutral-200 dark:border-neutral-700"
                  />
                  {img.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeStagedImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-neutral-900 dark:bg-neutral-700 text-white flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative rounded-2xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-500/10 transition-all shadow-sm">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={hasCode ? 'Describe a change…' : 'What do you want to build?'}
              rows={2}
              disabled={isGenerating}
              className="w-full resize-none rounded-2xl bg-transparent px-4 py-3 pr-20 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none disabled:opacity-50"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating}
              title="Attach images (or paste from clipboard)"
              className="absolute bottom-2.5 right-12 h-8 w-8 rounded-full text-neutral-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 flex items-center justify-center transition-colors disabled:opacity-40"
              aria-label="Attach image"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={(!prompt.trim() && stagedImages.length === 0) || isGenerating || stagedImages.some((img) => img.uploading)}
              className="absolute bottom-2.5 right-2.5 h-8 w-8 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white flex items-center justify-center shadow-md shadow-violet-600/30 hover:shadow-lg hover:shadow-violet-600/40 hover:from-violet-700 hover:to-fuchsia-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:bg-none disabled:shadow-none disabled:cursor-not-allowed transition-all"
              aria-label="Send"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
            </button>
          </div>
          {/* Footer: model picker chip on the left, last-cost on the right. */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="relative" ref={modelMenuRef}>
              <button
                type="button"
                onClick={() => setShowModelMenu((v) => !v)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                title="Choose the model"
              >
                <Cpu className="w-3 h-3" />
                {selectedModel.label.replace('Gemini ', '')}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              {showModelMenu && (
                <div className="absolute bottom-full mb-1.5 left-0 w-72 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl z-30 overflow-hidden max-h-[70vh] overflow-y-auto">
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
                            type="button"
                            onClick={() => { setModelId(m.id); setShowModelMenu(false); }}
                            className={`w-full text-left px-3 py-2 transition-colors ${
                              m.id === modelId
                                ? 'bg-violet-50 dark:bg-violet-900/20'
                                : 'hover:bg-neutral-50 dark:hover:bg-neutral-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`text-xs font-semibold truncate ${m.id === modelId ? 'text-violet-700 dark:text-violet-300' : 'text-neutral-800 dark:text-neutral-200'}`}>
                                  {m.label}
                                </span>
                                {m.isDefault && (
                                  <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                                    Default
                                  </span>
                                )}
                                {m.isPreview && (
                                  <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                                    Preview
                                  </span>
                                )}
                              </div>
                              {m.id === modelId && <Check className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />}
                            </div>
                            <p className="text-[10.5px] text-neutral-500 mt-0.5">{m.blurb}</p>
                            <p className="text-[10px] text-neutral-400 mt-0.5 font-mono">
                              ${m.pricing.input.toFixed(2)}/M in · ${m.pricing.output.toFixed(2)}/M out
                            </p>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 text-right leading-tight">
              {lastUsage ? (
                <>
                  Last change <span className="font-semibold text-neutral-600 dark:text-neutral-300">{formatCost(lastUsage.costUsd)}</span>
                  <span className="opacity-70"> · {lastUsage.inputTokens.toLocaleString()} in / {lastUsage.outputTokens.toLocaleString()} out</span>
                </>
              ) : (
                <>Sandboxed iframe · localStorage only</>
              )}
            </div>
          </div>
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
          // pointerEvents:none while resizing prevents the iframe from
          // capturing mouse events and breaking the parent's drag listeners.
          style={isResizing ? { pointerEvents: 'none' } : undefined}
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

      {/* Desktop: side-by-side with draggable divider. Mobile: tabbed (chat OR preview). */}
      <div ref={splitRef} className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Chat (desktop: resizable left rail, mobile: full when active).
            CSS var lets us drive the desktop width inline while keeping mobile full-bleed. */}
        <div
          className={`flex-col min-h-0 md:flex md:flex-shrink-0 md:flex-grow-0 md:border-r md:border-neutral-200 md:dark:border-neutral-800 w-full md:w-[var(--kpg-chat-w)] ${
            mobileTab === 'chat' ? 'flex flex-1' : 'hidden md:flex'
          }`}
          style={{ '--kpg-chat-w': `${chatWidth}%` } as React.CSSProperties}
        >
          {ChatPane}
        </div>

        {/* Drag handle (desktop only). Sits on top of the split with a wider hit zone for easier grabbing. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat panel"
          tabIndex={0}
          onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
          onDoubleClick={() => setChatWidth(CHAT_WIDTH_DEFAULT)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setChatWidth((w) => Math.max(CHAT_WIDTH_MIN, w - 2));
            if (e.key === 'ArrowRight') setChatWidth((w) => Math.min(CHAT_WIDTH_MAX, w + 2));
          }}
          className={`hidden md:flex flex-shrink-0 w-1.5 -mx-0.5 cursor-col-resize group items-center justify-center ${
            isResizing ? 'bg-violet-500/40' : 'hover:bg-violet-500/15'
          } transition-colors`}
          title="Drag to resize · Double-click to reset"
        >
          <div className={`h-10 w-0.5 rounded-full ${isResizing ? 'bg-violet-500' : 'bg-neutral-300 dark:bg-neutral-700 group-hover:bg-violet-400'}`} />
        </div>

        {/* Preview (desktop: right side flex-1, mobile: full when active) */}
        <div className={`flex-1 min-h-0 ${mobileTab === 'preview' ? 'flex flex-col' : 'hidden md:flex md:flex-col'}`}>
          {PreviewPane}
        </div>
      </div>
    </div>
  );
}
