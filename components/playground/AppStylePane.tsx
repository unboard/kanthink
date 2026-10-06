'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImageUp, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import type { PlaygroundApp } from '@/lib/types';
import {
  DENSITIES,
  FONT_PAIRINGS,
  LOOKS,
  PALETTES,
  RADII,
  fontsById,
  lookById,
  paletteById,
  type Palette,
} from '@/lib/playground/style/catalog';
import {
  brandPalette,
  catalogueFontsHref,
  fontCss,
  resolveStyle,
  styleForLook,
  usesTokens,
  type AppStyle,
} from '@/lib/playground/style/tokens';
import { dominantColors } from '@/lib/playground/style/color';
import { checkDesign, type Severity } from '@/lib/playground/style/slopCheck';
import type { StylePass } from '@/lib/playground/style/passes';

/**
 * How an app looks, and the one-click passes that improve it.
 *
 * Nothing here is required. Kan picks a style on the first build and it is usually
 * right; this is for when the owner has a logo, a brand color, or an opinion.
 * Color, type and corner changes apply to the live preview at once, with no
 * rebuild, because a styled app reads them from tokens. A rebuild is only needed
 * to change the layout or to bring an older app onto the tokens.
 */

const SEVERITY_DOT: Record<Severity, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-neutral-400',
};

const PASSES: Array<{ pass: StylePass; label: string; hint: string }> = [
  { pass: 'polish', label: 'Polish', hint: 'Spacing, type scale, states and focus, tidied the way a designer would before launch.' },
  { pass: 'bolder', label: 'Bolder', hint: 'Bigger type contrast and more confident color. No gradients or glows.' },
  { pass: 'quieter', label: 'Quieter', hint: 'Less color and decoration, more space.' },
  { pass: 'restyle', label: 'Restyle', hint: 'Rebuild the whole look on this style: tokens, fonts and kit components. Behavior stays the same.' },
];

export function AppStylePane({
  app,
  srcDoc,
  busy,
  cardId,
  onChange,
  onPass,
}: {
  app: PlaygroundApp;
  srcDoc: string | null;
  busy: boolean;
  cardId: string;
  onChange: (style: AppStyle) => void;
  onPass: (pass: StylePass) => void;
}) {
  const style = app.style ?? null;
  const resolved = useMemo(() => (style ? resolveStyle(style) : null), [style]);
  const hasCode = Boolean(app.code);
  const tokenized = usesTokens(app.code);
  const check = useMemo(
    () => checkDesign(app.code, { hasStyle: !!style, look: style?.look }),
    [app.code, style]
  );

  // Every choice is shown in its own type, so the faces have to be loaded here too.
  useEffect(() => {
    if (document.getElementById('kt-style-fonts')) return;
    const link = document.createElement('link');
    link.id = 'kt-style-fonts';
    link.rel = 'stylesheet';
    link.href = catalogueFontsHref();
    document.head.appendChild(link);
  }, []);

  const set = (patch: Partial<AppStyle>) => {
    onChange({ ...(style ?? styleForLook(LOOKS[0].id, 'owner')), ...patch, chosenBy: 'owner', why: null });
  };

  const pickLook = (id: string) => {
    const look = lookById(id)!;
    // A look brings its palette, type, corners and density. The logo, the owner's
    // own words and the kit setting are theirs, and survive the change.
    onChange({
      ...styleForLook(look.id, 'owner'),
      kit: style?.kit ?? true,
      logoUrl: style?.logoUrl ?? null,
      direction: style?.direction ?? null,
      brand: style?.brand ?? null,
    });
  };

  return (
    <div className="pb-6">
      {/* The app itself, restyled live as choices change. */}
      <div className="sticky top-0 z-10 bg-white px-3 pb-3 pt-2 dark:bg-neutral-900">
        {srcDoc ? (
          <iframe
            srcDoc={srcDoc}
            title={`${app.title} preview`}
            className="h-[36vh] min-h-[220px] w-full rounded-xl border border-neutral-200 bg-white dark:border-neutral-800"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
          />
        ) : resolved ? (
          <SampleCard palette={resolved.palette} headingFont={fontCss(resolved.fonts.heading)} bodyFont={fontCss(resolved.fonts.body)} radius={resolved.radiusPx} title={app.title} />
        ) : null}
        {resolved && (
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            {style?.chosenBy === 'kan' && style.why ? (
              <><span className="font-medium text-neutral-700 dark:text-neutral-200">Kan picked {resolved.look.name}.</span> {style.why}</>
            ) : (
              <><span className="font-medium text-neutral-700 dark:text-neutral-200">{resolved.look.name}</span> · {resolved.palette.name} · {resolved.fonts.name}</>
            )}
          </p>
        )}
      </div>

      <div className="space-y-6 px-4 pt-2">
        {!style && (
          <p className="rounded-xl border border-neutral-200 px-3 py-2.5 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
            {hasCode
              ? 'This app was built before styles existed. Pick a look, then Restyle to rebuild its look on it.'
              : 'Kan picks a look on the first build. Choose one now if you already know what you want.'}
          </p>
        )}
        {style && hasCode && !tokenized && (
          <div className="flex items-start gap-3 rounded-xl border border-violet-500/30 bg-violet-500/5 px-3 py-2.5">
            <Wand2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-500" />
            <div className="min-w-0 flex-1 text-xs text-neutral-700 dark:text-neutral-300">
              Most of this app&apos;s colors are written into its code, so changes here only reach its background and fonts.
              Restyle rebuilds the look on this style, and after that color changes apply instantly.
              <button
                onClick={() => onPass('restyle')}
                disabled={busy}
                className="mt-2 flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                Restyle the app
              </button>
            </div>
          </div>
        )}

        <Section title="Look">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {LOOKS.map((look) => {
              const palette = paletteById(look.palette)!;
              const fonts = fontsById(look.fonts)!;
              const radius = RADII.find((r) => r.id === look.radius)!.px;
              const on = style?.look === look.id;
              return (
                <button
                  key={look.id}
                  onClick={() => pickLook(look.id)}
                  aria-pressed={on}
                  className={`overflow-hidden rounded-xl border text-left transition-colors ${on ? 'border-violet-500 ring-1 ring-violet-500' : 'border-neutral-200 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600'}`}
                >
                  <div className="flex h-16 flex-col justify-between p-2.5" style={{ background: palette.colors.background, color: palette.colors.foreground }}>
                    <span className="text-[15px] font-semibold leading-none" style={{ fontFamily: fontCss(fonts.heading) }}>Aa</span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3.5 w-9" style={{ background: palette.colors.primary, borderRadius: Math.min(radius, 7) }} />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: palette.colors.highlight }} />
                    </span>
                  </div>
                  <div className="px-2.5 py-2">
                    <span className="flex items-center gap-1 text-xs font-medium text-neutral-900 dark:text-white">
                      {look.name}
                      {on && <Check className="h-3 w-3 text-violet-500" />}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-neutral-500 line-clamp-2">{look.fits}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {style && resolved && (
          <>
            <Section title="Colors">
              <div className="flex flex-wrap gap-2">
                {PALETTES.map((p) => (
                  <PaletteChip key={p.id} palette={p} on={style.palette === p.id} onClick={() => set({ palette: p.id })} />
                ))}
              </div>
              <BrandColors style={style} onChange={set} />
            </Section>

            <Section title="Type">
              <div className="space-y-1">
                {FONT_PAIRINGS.map((f) => {
                  const on = style.fonts === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => set({ fonts: f.id })}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${on ? 'bg-violet-500/10' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/60'}`}
                    >
                      <span className="w-10 flex-shrink-0 text-xl leading-none text-neutral-900 dark:text-white" style={{ fontFamily: fontCss(f.heading) }}>Aa</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-neutral-900 dark:text-white" style={{ fontFamily: fontCss(f.heading) }}>{f.name}</span>
                        <span className="block truncate text-xs text-neutral-500" style={{ fontFamily: fontCss(f.body) }}>{f.note}</span>
                      </span>
                      {on && <Check className="h-3.5 w-3.5 flex-shrink-0 text-violet-500" />}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Shape">
              <div className="space-y-3">
                <Choice
                  label="Corners"
                  value={style.radius}
                  options={RADII.map((r) => ({
                    value: r.id,
                    label: r.name,
                    icon: <span className="h-3.5 w-3.5 border-[1.5px] border-current" style={{ borderRadius: Math.min(r.px, 7) }} />,
                  }))}
                  onChange={(radius) => set({ radius })}
                />
                <Choice
                  label="Spacing"
                  value={style.density}
                  options={DENSITIES.map((d) => ({ value: d.id, label: d.name }))}
                  onChange={(density) => set({ density })}
                />
              </div>
            </Section>

            <Section title="Logo">
              <LogoPicker style={style} cardId={cardId} onChange={set} />
            </Section>

            <Section title="Direction">
              <Direction value={style.direction ?? ''} onSave={(direction) => set({ direction: direction || null })} />
            </Section>

            <Section title="Components">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
                <input
                  type="checkbox"
                  checked={style.kit}
                  onChange={() => set({ kit: !style.kit })}
                  className="mt-0.5 h-4 w-4 rounded accent-violet-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-neutral-900 dark:text-white">Build with the component kit</span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                    Buttons, fields, tabs, dialogs, tables and toasts modeled on shadcn/ui, styled by this look. Applies from the next build.
                  </span>
                </span>
              </label>
            </Section>
          </>
        )}

        {hasCode && (
          <Section title="Design check">
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${check.score >= 90 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : check.score >= 70 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'}`}>
                  {check.score}
                </span>
                <span className="min-w-0 flex-1 text-xs text-neutral-600 dark:text-neutral-300">
                  {check.findings.length === 0
                    ? 'Nothing that looks machine-made. Checked against the patterns that give generated apps away.'
                    : `${check.findings.length} ${check.findings.length === 1 ? 'thing makes' : 'things make'} this look machine-made.`}
                </span>
              </div>
              {check.findings.length > 0 && (
                <ul className="divide-y divide-neutral-100 border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                  {check.findings.map((f) => (
                    <li key={f.id} className="flex items-start gap-2.5 px-3 py-2" title={f.fix}>
                      <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`} />
                      <span className="min-w-0 flex-1 text-xs text-neutral-700 dark:text-neutral-300">{f.title}</span>
                      <span className="text-[11px] tabular-nums text-neutral-400">{f.count}×</span>
                    </li>
                  ))}
                </ul>
              )}
              {check.findings.length > 0 && (
                <div className="border-t border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
                  <button
                    onClick={() => onPass('fix')}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    <Wand2 className="h-3 w-3" />
                    Fix these
                  </button>
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {PASSES.map((p) => (
                <button
                  key={p.pass}
                  onClick={() => onPass(p.pass)}
                  disabled={busy || !style}
                  title={style ? p.hint : 'Pick a look first'}
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-left transition-colors hover:border-violet-400/60 disabled:opacity-50 dark:border-neutral-800"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-900 dark:text-white">
                    <Sparkles className="h-3 w-3 text-violet-500" />
                    {p.label}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-neutral-500">{p.hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] text-neutral-400">
              Each pass is one build, shows in the thread, and can be undone like any other.
            </p>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{title}</h3>
      {children}
    </section>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string; icon?: React.ReactNode }>; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 flex-shrink-0 text-xs text-neutral-500">{label}</span>
      <div className="flex flex-1 flex-wrap gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800/80">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${value === o.value ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PaletteChip({ palette, on, onClick }: { palette: Palette; on: boolean; onClick: () => void }) {
  const c = palette.colors;
  return (
    <button onClick={onClick} aria-pressed={on} title={`${palette.name} (${palette.mode})`} className="flex w-14 flex-col items-center gap-1">
      <span className={`flex h-10 w-10 overflow-hidden rounded-full border-2 ${on ? 'border-violet-500' : 'border-neutral-200 dark:border-neutral-700'}`}>
        <span className="h-full w-1/2" style={{ background: c.background }} />
        <span className="flex h-full w-1/2 flex-col">
          <span className="flex-[2]" style={{ background: c.primary }} />
          <span className="flex-1" style={{ background: c.highlight }} />
        </span>
      </span>
      <span className={`w-full truncate text-center text-[10px] ${on ? 'text-violet-600 dark:text-violet-300' : 'text-neutral-500'}`}>{palette.name}</span>
    </button>
  );
}

/** Your own colors: pick one, or take them from the logo. */
function BrandColors({ style, onChange }: { style: AppStyle; onChange: (patch: Partial<AppStyle>) => void }) {
  const brand = style.brand ?? { primary: resolveStyle(style).palette.colors.primary, highlight: null, mode: 'light' as const };
  const [draft, setDraft] = useState(brand);
  // Colors chosen elsewhere (from the logo) replace the draft; our own commits
  // come back equal to it and leave it alone.
  const [seen, setSeen] = useState(style.brand);
  if (style.brand !== seen) {
    setSeen(style.brand);
    if (style.brand && JSON.stringify(style.brand) !== JSON.stringify(draft)) setDraft(style.brand);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = style.palette === 'brand';

  // A color input fires on every step of a drag, so changes are committed once it settles.
  const commit = (next: typeof brand) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange({ palette: 'brand', brand: next }), 350);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const preview = brandPalette(draft.primary, draft.highlight, draft.mode);
  return (
    <div className={`mt-3 rounded-xl border px-3 py-2.5 ${active ? 'border-violet-500/60' : 'border-neutral-200 dark:border-neutral-800'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-neutral-900 dark:text-white">Your colors</span>
        <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          <input type="color" value={draft.primary} onChange={(e) => commit({ ...draft, primary: e.target.value.toUpperCase() })} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
          Main
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          <input type="color" value={draft.highlight || preview.colors.highlight} onChange={(e) => commit({ ...draft, highlight: e.target.value.toUpperCase() })} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
          Highlight
        </label>
        <div className="ml-auto flex rounded-md bg-neutral-100 p-0.5 dark:bg-neutral-800">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              onClick={() => commit({ ...draft, mode: m })}
              className={`rounded px-2 py-0.5 text-[11px] capitalize ${(draft.mode ?? 'light') === m ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white' : 'text-neutral-500'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {!active && (
        <button onClick={() => onChange({ palette: 'brand', brand: draft })} className="mt-2 text-[11px] font-medium text-violet-600 hover:underline dark:text-violet-400">
          Use these colors
        </button>
      )}
      {active && (
        <p className="mt-1.5 text-[10.5px] text-neutral-400">
          Neutrals are tinted to match, and colors are adjusted only as far as text on them needs to stay readable.
        </p>
      )}
    </div>
  );
}

function LogoPicker({ style, cardId, onChange }: { style: AppStyle; cardId: string; onChange: (patch: Partial<AppStyle>) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const readColors = (url: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 64, 64);
        setColors(dominantColors(ctx.getImageData(0, 0, 64, 64).data, 2));
      } catch {
        // A logo whose host forbids reading pixels just doesn't offer its colors.
      }
    };
    img.src = url;
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('cardId', cardId);
      const res = await fetch('/api/upload-image', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error || 'Upload failed.');
        return;
      }
      onChange({ logoUrl: data.url });
      readColors(data.url);
    } catch {
      setError('Upload failed. Check your connection.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }}
      />
      <div className="flex items-center gap-3">
        {style.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={style.logoUrl} alt="" className="h-10 w-auto max-w-[96px] flex-shrink-0 rounded object-contain" />
        ) : (
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
            <ImageUp className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 flex-1 text-xs text-neutral-500 dark:text-neutral-400">
          {style.logoUrl ? 'Shown in the app header and as its icon.' : 'Without one, the app shows a monogram in its main color.'}
        </span>
        <button
          onClick={() => input.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {style.logoUrl ? 'Replace' : 'Upload'}
        </button>
        {style.logoUrl && (
          <button onClick={() => { onChange({ logoUrl: null }); setColors([]); }} aria-label="Remove logo" className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {style.logoUrl && colors.length === 0 && (
        <button onClick={() => readColors(style.logoUrl!)} className="mt-2 text-[11px] font-medium text-violet-600 hover:underline dark:text-violet-400">
          Take colors from the logo
        </button>
      )}
      {colors.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          {colors.map((c) => <span key={c} className="h-5 w-5 rounded-full border border-neutral-200 dark:border-neutral-700" style={{ background: c }} />)}
          <button
            onClick={() => { onChange({ palette: 'brand', brand: { primary: colors[0], highlight: colors[1] ?? null, mode: style.brand?.mode ?? 'light' } }); setColors([]); }}
            className="text-[11px] font-medium text-violet-600 hover:underline dark:text-violet-400"
          >
            Use the logo&apos;s colors
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}

function Direction({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim() !== value) onSave(draft.trim()); }}
        rows={2}
        maxLength={400}
        placeholder="How should it feel? For example: like a 1970s puzzle magazine, or calm enough for a waiting room."
        className="w-full resize-none rounded-xl border border-neutral-200 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-violet-400 dark:border-neutral-800 dark:text-white"
      />
      <p className="mt-1 text-[10.5px] text-neutral-400">Kan reads this on every build.</p>
    </div>
  );
}

/** Before the first build there is no app to preview, so show the style on a sample. */
function SampleCard({ palette, headingFont, bodyFont, radius, title }: { palette: Palette; headingFont: string; bodyFont: string; radius: number; title: string }) {
  const c = palette.colors;
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800" style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
      <div className="p-4" style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: radius }}>
        <p className="text-lg font-semibold" style={{ fontFamily: headingFont }}>{title || 'Your app'}</p>
        <p className="mt-1 text-sm" style={{ color: c.mutedForeground }}>This is how text, surfaces and actions will look.</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="px-3 py-1.5 text-sm font-medium" style={{ background: c.primary, color: c.primaryForeground, borderRadius: radius * 0.75 }}>Main action</span>
          <span className="px-3 py-1.5 text-sm" style={{ border: `1px solid ${c.border}`, borderRadius: radius * 0.75 }}>Secondary</span>
          <span className="ml-auto rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: c.highlight, color: c.highlightForeground }}>New</span>
        </div>
      </div>
    </div>
  );
}
