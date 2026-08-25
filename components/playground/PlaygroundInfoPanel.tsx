'use client';

import { useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { nanoid } from 'nanoid';
import type { Card } from '@/lib/types';
import {
  Wand2, ExternalLink, Globe, Lock, Copy, Check, Loader2, RefreshCw,
} from 'lucide-react';
import { getPlaygroundModel, formatCost } from '@/lib/playground/models';

/**
 * Everything about a playground card's app, in one panel at the top of Info.
 *
 * A playground card has two tabs: Thread, where the app gets talked about and built,
 * and Info, which is the app's control panel. This is that panel — the state of the
 * build, where to see it, whether it's public, what it's made of, and what it cost.
 * There is no preview here; a preview opens in its own tab.
 */

interface PlaygroundUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface PlaygroundTypeData {
  code?: string;
  codeTitle?: string;
  codeSummary?: string;
  generationCount?: number;
  lastNotes?: string;
  lastUsage?: PlaygroundUsage;
  lastModelId?: string;
  dependencies?: string[];
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-24 flex-shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500 pt-0.5">{label}</span>
      <div className="min-w-0 flex-1 text-xs text-neutral-700 dark:text-neutral-300">{children}</div>
    </div>
  );
}

export function PlaygroundInfoPanel({ card }: { card: Card }) {
  const updateCard = useStore((s) => s.updateCard);
  const cardFromStore = useStore((s) => s.cards[card.id]) || card;
  const allTasks = useStore((s) => s.tasks);
  // Tasks on a playground card are requirements: every build feeds them to the
  // generator as the spec. The Tasks tab is gone from these cards, so this is
  // where they stay visible — otherwise they'd shape builds invisibly.
  const requirements = (cardFromStore.taskIds ?? [])
    .map((id) => allTasks[id])
    .filter((t) => t && !t.isArchived);
  const typeData = (cardFromStore.typeData as PlaygroundTypeData | undefined) || {};

  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const code = typeData.code;
  const version = typeData.generationCount || 0;
  const deps = typeData.dependencies || [];
  const lastUsage = typeData.lastUsage;

  const previewUrl = `/play/preview/${card.id}`;
  const shareLink =
    cardFromStore.isPublic && cardFromStore.shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/play/${cardFromStore.shareToken}`
      : null;

  const build = useCallback(async () => {
    if (isBuilding) return;
    setIsBuilding(true);
    setError(null);
    // isProcessing is a synced card field, so the board card shimmers with the
    // same card-processing treatment shroom runs use — one animation everywhere.
    updateCard(card.id, { isProcessing: true, processingStatus: 'Building the app…' });
    try {
      const res = await fetch('/api/playground/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          prompt: code
            ? 'Rebuild this app from the card and its thread, taking everything discussed since the last build into account.'
            : 'Build an app from this card and its thread.',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.error) {
        setError(data?.error || `Build failed (${res.status}).`);
        return;
      }
      updateCard(card.id, {
        cardType: 'playground',
        typeData: data.typeData,
        ...(data.messages ? { messages: data.messages } : {}),
        ...(data.snapshot?.summary ? { summary: data.snapshot.summary } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Build failed.');
    } finally {
      updateCard(card.id, { isProcessing: false, processingStatus: undefined });
      setIsBuilding(false);
    }
  }, [card.id, code, isBuilding, updateCard]);

  const togglePublic = useCallback(() => {
    updateCard(card.id, {
      isPublic: !cardFromStore.isPublic,
      shareToken: cardFromStore.shareToken || nanoid(12),
    });
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

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800">
        <Wand2 className="w-3.5 h-3.5 text-violet-500" />
        <span className="text-xs font-semibold text-neutral-900 dark:text-white">The app</span>
        {version > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
            v{version}
          </span>
        )}
        <span className="ml-auto">
          {cardFromStore.isPublic ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          ) : (
            <span className="text-[10px] text-neutral-400">{code ? 'Private' : 'Not built yet'}</span>
          )}
        </span>
      </div>

      <div className="px-4 py-3">
        {!code ? (
          <>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed mb-3">
              Kan reads this card&apos;s thread{requirements.length > 0 ? ` and its ${requirements.length === 1 ? 'requirement' : `${requirements.length} requirements`} below` : ''} and
              builds something you can use. Talk it through in the thread first — everything
              written there becomes the brief.
            </p>
            {requirements.length > 0 && (
              <ul className="mb-3 space-y-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                {requirements.map((t) => (
                  <li key={t.id} className="flex items-start gap-1.5">
                    <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.status === 'done' ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'}`} />
                    <span>{t.title}</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={build}
              disabled={isBuilding}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white text-xs font-semibold shadow-sm shadow-violet-600/30 hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isBuilding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              {isBuilding ? 'Building…' : 'Build it'}
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open preview
              </a>
              <button
                onClick={togglePublic}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  cardFromStore.isPublic
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {cardFromStore.isPublic ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {cardFromStore.isPublic ? 'Published' : 'Publish'}
              </button>
              <button
                onClick={build}
                disabled={isBuilding}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
              >
                {isBuilding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {isBuilding ? 'Rebuilding…' : 'Rebuild'}
              </button>
            </div>

            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {typeData.codeSummary && <Row label="What it is">{typeData.codeSummary}</Row>}

              {shareLink && (
                <Row label="Public link">
                  <button
                    onClick={copyShareLink}
                    className="inline-flex items-center gap-1.5 text-violet-600 dark:text-violet-400 hover:underline break-all text-left"
                  >
                    {copied ? <Check className="w-3 h-3 flex-shrink-0 text-emerald-500" /> : <Copy className="w-3 h-3 flex-shrink-0" />}
                    {copied ? 'Copied' : shareLink.replace(/^https?:\/\//, '')}
                  </button>
                </Row>
              )}

              {requirements.length > 0 && (
                <Row label="Requirements">
                  <ul className="space-y-0.5">
                    {requirements.map((t) => (
                      <li key={t.id} className="flex items-start gap-1.5">
                        <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.status === 'done' ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'}`} />
                        <span className={t.status === 'done' ? 'text-neutral-400 line-through' : ''}>{t.title}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[10px] text-neutral-400">Fed to every build as the spec.</p>
                </Row>
              )}

              <Row label="Built with">
                {deps.length === 0 ? (
                  <span className="text-neutral-400">React and icons only</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {deps.map((d) => (
                      <span
                        key={d}
                        className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/30 font-mono text-[10px] text-violet-700 dark:text-violet-300"
                      >
                        {d}
                      </span>
                    ))}
                  </span>
                )}
              </Row>

              {lastUsage && (
                <Row label="Last build">
                  {getPlaygroundModel(lastUsage.modelId).label} · {formatCost(lastUsage.costUsd)}
                  <span className="text-neutral-400">
                    {' '}· {lastUsage.inputTokens.toLocaleString()} in / {lastUsage.outputTokens.toLocaleString()} out
                  </span>
                </Row>
              )}

              <Row label="Builds">{version === 1 ? '1 build' : `${version} builds`}</Row>

              {typeData.lastNotes && <Row label="Last change">{typeData.lastNotes}</Row>}
            </div>
          </>
        )}

        {error && <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
