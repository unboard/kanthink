'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, ImagePlus, RotateCcw, Ruler, Sparkles, X } from 'lucide-react';
import { useImageUpload } from '@/lib/hooks/useImageUpload';
import { getProduct, type ProductSpec } from '@/lib/design/products';
import type { AssetRole, DesignAsset } from '@/lib/design/brief';
import {
  clearSession,
  emptySession,
  loadSession,
  markOthersStale,
  saveSession,
  type ChatMessage,
  type DesignSession,
} from '@/lib/design/session';
import { ProofSheet } from './ProofSheet';

const ROLE_CYCLE: AssetRole[] = ['logo', 'photo', 'inspiration'];

const ROLE_LABEL: Record<AssetRole, string> = {
  logo: 'Logo',
  photo: 'Photo',
  inspiration: 'Style ref',
};

/** Concrete enough to be worth tapping. A vague starter teaches nothing. */
const STARTERS = [
  'Spring tune-up offer for an HVAC company',
  'Grand opening for a neighbourhood coffee shop',
  'New patient special for a dental practice',
  'Fall cleanup for a lawn care business',
];

interface DesignStudioProps {
  productId: string;
}

export function DesignStudio({ productId }: DesignStudioProps) {
  const spec = useMemo(() => getProduct(productId) as ProductSpec, [productId]);

  const [session, setSession] = useState<DesignSession>(emptySession);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Guides default on for a side that reserves space and off for one that
  // doesn't — keylines over a design you just made are noise unless they are
  // telling you something you can get wrong.
  const [guides, setGuides] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(spec.sides.map((s) => [s.id, s.reservations.length > 0]))
  );

  const { uploadFiles, isUploading, error: uploadError, clearError } = useImageUpload();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // localStorage is only readable after mount, so the first paint is the empty
  // session and the stored one swaps in immediately after.
  useEffect(() => {
    setSession(loadSession());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveSession(session);
  }, [session, hydrated]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [input]);

  const activeSide = spec.sides.find((s) => s.id === session.activeSide) ?? spec.sides[0];
  const otherSide = spec.sides.find((s) => s.id !== activeSide.id) ?? null;
  const activeState = session.sides[activeSide.id];
  const otherState = otherSide ? session.sides[otherSide.id] : null;

  const lastReply = [...session.messages].reverse().find((m) => m.role === 'assistant');

  const starters = useMemo(() => {
    if (activeSide.id !== spec.sides[0].id && otherState?.url) {
      return [
        'Design the back to match',
        'Put the offer details and hours on it',
        'Add contact info and a map',
      ];
    }
    return STARTERS;
  }, [activeSide.id, spec.sides, otherState?.url]);

  // ------------------------------------------------------------- generate

  const generate = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;

      const userMessage: ChatMessage = { role: 'user', content, sideId: activeSide.id };
      const messages = [...session.messages, userMessage];

      setSession((s) => ({ ...s, messages, chips: [] }));
      setInput('');
      setError(null);
      setBusy(true);

      try {
        const res = await fetch('/api/design/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: spec.id,
            sideId: activeSide.id,
            messages: messages.map((m) => ({ role: m.role, content: m.content, sideId: m.sideId })),
            brief: session.brief,
            assets: session.assets,
            currentUrl: activeState?.url ?? null,
            otherUrl: otherState?.url ?? null,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generation failed.');

        setSession((s) => {
          const sides = data.rendered
            ? markOthersStale(
                {
                  ...s.sides,
                  [activeSide.id]: {
                    url: data.url,
                    imagePrompt: data.imagePrompt ?? null,
                    stale: false,
                  },
                },
                activeSide.id
              )
            : s.sides;

          return {
            ...s,
            sides,
            brief: data.brief ?? s.brief,
            assets: Array.isArray(data.assets) ? data.assets : s.assets,
            chips: Array.isArray(data.chips) ? data.chips : [],
            messages: [
              ...messages,
              { role: 'assistant', content: data.reply, sideId: activeSide.id },
            ],
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed.');
        // Drop the user turn that never produced anything, so retrying doesn't
        // send the same instruction to the planner twice.
        setSession((s) => ({ ...s, messages: s.messages.slice(0, -1) }));
        setInput(content);
      } finally {
        setBusy(false);
      }
    },
    [busy, session.messages, session.brief, session.assets, spec.id, activeSide.id, activeState?.url, otherState?.url]
  );

  // --------------------------------------------------------------- assets

  const addFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (images.length === 0) return;
      clearError();
      const results = await uploadFiles(images);
      if (results.length === 0) return;
      setSession((s) => ({
        ...s,
        assets: [
          ...s.assets,
          // Role is a placeholder until the planner sees the image and says what
          // it actually is; the user can override afterwards.
          ...results.map((r): DesignAsset => ({ id: r.publicId || r.url, url: r.url, role: 'photo' })),
        ].slice(0, 6),
      }));
    },
    [uploadFiles, clearError]
  );

  const cycleRole = (id: string) => {
    setSession((s) => ({
      ...s,
      assets: s.assets.map((a) =>
        a.id === id
          ? { ...a, role: ROLE_CYCLE[(ROLE_CYCLE.indexOf(a.role) + 1) % ROLE_CYCLE.length], pinned: true }
          : a
      ),
    }));
  };

  const removeAsset = (id: string) => {
    setSession((s) => ({ ...s, assets: s.assets.filter((a) => a.id !== id) }));
  };

  const reset = () => {
    clearSession();
    setSession(emptySession());
    setInput('');
    setError(null);
    setShowHistory(false);
  };

  const canGenerate = !!input.trim() && !busy && !isUploading;
  const shownError = error ?? uploadError;

  return (
    <div className="design-studio">
      {/* --------------------------------------------------------- rail */}
      <div className="ds-rail">
        <div className="ds-rail-spec ds-mono">
          <strong>{spec.label}</strong>
          <span>Print &amp; mail</span>
        </div>

        <div className="ds-tabs" role="tablist" aria-label="Postcard side">
          {spec.sides.map((s) => {
            const state = session.sides[s.id];
            const dot = state?.stale ? 'stale' : state?.url ? 'filled' : 'empty';
            return (
              <button
                key={s.id}
                role="tab"
                type="button"
                aria-selected={s.id === activeSide.id}
                className="ds-tab"
                onClick={() => setSession((prev) => ({ ...prev, activeSide: s.id }))}
              >
                <span className="ds-tab-dot" data-state={dot} />
                {s.label}
                {state?.stale && <span className="ds-sr">— out of date with the other side</span>}
              </button>
            );
          })}
        </div>

        <div className="ds-rail-right">
          <button
            type="button"
            className="ds-ghost-btn ds-mono"
            aria-pressed={!!guides[activeSide.id]}
            onClick={() => setGuides((g) => ({ ...g, [activeSide.id]: !g[activeSide.id] }))}
          >
            <Ruler size={12} />
            Guides
          </button>

          {activeState?.url && (
            <a
              className="ds-ghost-btn ds-mono"
              href={attachmentUrl(activeState.url)}
              download={`${spec.id}-${activeSide.id}.png`}
              aria-label={`Download the ${activeSide.label.toLowerCase()}`}
            >
              <Download size={12} />
              Download
            </a>
          )}

          {(session.messages.length > 0 || session.assets.length > 0) && (
            <button
              type="button"
              className="ds-ghost-btn"
              onClick={reset}
              aria-label="Start a new design"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------- field */}
      <div className="ds-field">
        <ProofSheet
          spec={spec}
          side={activeSide}
          url={activeState?.url ?? null}
          working={busy}
          showGuides={!!guides[activeSide.id]}
          starters={starters}
          onStarter={(text) => generate(text)}
        />
      </div>

      {/* ------------------------------------------------------ console */}
      <div className="ds-console">
        {(shownError || lastReply) && (
          <div className="ds-reply">
            <span className="ds-reply-who ds-mono">{shownError ? 'Error' : 'Kan'}</span>
            <p className={`ds-reply-text${shownError ? ' ds-error' : ''}`}>
              {shownError ?? lastReply?.content}
            </p>
          </div>
        )}

        {!busy && session.chips.length > 0 && (
          <div className="ds-chips">
            {session.chips.map((chip) => (
              <button key={chip} type="button" className="ds-chip" onClick={() => generate(chip)}>
                {chip}
              </button>
            ))}
          </div>
        )}

        {session.messages.length > 2 && (
          <button
            type="button"
            className="ds-history-toggle ds-mono"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? 'Hide' : 'Show'} conversation ({session.messages.length})
          </button>
        )}

        {showHistory && (
          <div className="ds-history">
            {session.messages.map((m, i) => (
              <div key={i} className="ds-history-turn" data-role={m.role}>
                <span className="ds-history-who ds-mono">{m.role === 'user' ? 'You' : 'Kan'}</span>
                <span className="ds-history-text">{m.content}</span>
              </div>
            ))}
          </div>
        )}

        {/* --------------------------------------------------- composer */}
        <div className="ds-composer">
          <div
            className="ds-box"
            data-dragging={dragging}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(Array.from(e.dataTransfer.files));
            }}
          >
            {session.assets.length > 0 && (
              <div className="ds-assets">
                {session.assets.map((asset) => (
                  <div key={asset.id} className="ds-asset">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="ds-asset-img" src={asset.url} alt="" />
                    <button
                      type="button"
                      className="ds-asset-role ds-mono"
                      data-pinned={!!asset.pinned}
                      onClick={() => cycleRole(asset.id)}
                      title={asset.note || 'Change how this image is used'}
                    >
                      {ROLE_LABEL[asset.role]}
                    </button>
                    <button
                      type="button"
                      className="ds-asset-remove"
                      onClick={() => removeAsset(asset.id)}
                      aria-label="Remove this image"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="ds-input-row">
              <textarea
                ref={textareaRef}
                className="ds-textarea"
                rows={1}
                value={input}
                placeholder={
                  activeState?.url
                    ? `Tell me what to change about the ${activeSide.label.toLowerCase()}…`
                    : `Describe the ${activeSide.label.toLowerCase()}, or drop in a logo…`
                }
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    generate(input);
                  }
                }}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.files);
                  if (files.length) {
                    e.preventDefault();
                    addFiles(files);
                  }
                }}
              />

              <button
                type="button"
                className="ds-attach"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Add a logo or photo"
              >
                <ImagePlus size={17} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />

              <button
                type="button"
                className="ds-generate"
                disabled={!canGenerate}
                onClick={() => generate(input)}
              >
                <Sparkles size={14} />
                {busy ? 'Working' : isUploading ? 'Uploading' : 'Generate'}
              </button>
            </div>
          </div>

          <p className="ds-hint">
            {isUploading
              ? 'Uploading your images…'
              : session.assets.length > 0
                ? 'Tap a label under an image to change how it gets used.'
                : `Drop in a logo, a photo, or a design you like. ${
                    otherState?.url && !activeState?.url
                      ? `Whatever you make here will match the ${otherSide?.label.toLowerCase()}.`
                      : 'Both sides stay in step with each other.'
                  }`}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Cloudinary ignores the download attribute cross-origin; fl_attachment doesn't. */
function attachmentUrl(url: string): string {
  return url.includes('/upload/') ? url.replace('/upload/', '/upload/fl_attachment/') : url;
}
