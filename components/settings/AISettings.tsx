'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAIStatus } from '@/lib/settingsStore';
import {
  formatModelChoice,
  parseModelChoice,
  type ModelProvider,
  type ProviderGroup,
} from '@/lib/ai/modelCatalog';
import type { AiSurface, SurfaceDefinition } from '@/lib/ai/modelPreferences';
import { Check, ChevronDown, ExternalLink, Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react';

interface Preferences {
  default: string | null;
  overrides: Partial<Record<AiSurface, string>>;
}

interface Resolved {
  choice: string;
  fellBack: boolean;
}

interface Config {
  ownedProviders: ModelProvider[];
  availableProviders: ModelProvider[];
  preferences: Preferences;
  resolved: Partial<Record<AiSurface, Resolved | null>>;
  catalog: ProviderGroup[];
  surfaces: SurfaceDefinition[];
}

/**
 * Settings → AI.
 *
 * Three things, in the order they matter:
 *
 *   1. **Keys.** One per provider, both at once. This is what stopped a model
 *      choice from being constrained by which single key you happened to save.
 *   2. **The default model.** One control, and for most accounts the only one that
 *      is ever touched. It governs everything.
 *   3. **Exceptions**, folded away. Three areas may opt out of the default, and the
 *      screen says what each currently resolves to so the setting is legible.
 *
 * The shape is lopsided on purpose. Giving every area its own picker would turn a
 * decision into an administration task, which is the thing to avoid.
 */
export function AISettings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const apply = useCallback((next: Config) => {
    setConfig(next);
    setAdvancedOpen((open) => open || Object.keys(next.preferences.overrides).length > 0);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-config', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Could not load your AI settings'); return; }
      apply(data as Config);
      setError(null);
    } catch {
      setError('Could not load your AI settings');
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => { void load(); }, [load]);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Could not save'); return false; }
      apply(data as Config);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      // The store drives voice availability and the model shown elsewhere.
      void fetchAIStatus();
      return true;
    } catch {
      setError('Could not save');
      return false;
    } finally {
      setBusy(false);
    }
  }, [apply]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">AI</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-24 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-10 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </div>
    );
  }

  if (!config) {
    return <p className="text-sm text-red-500">{error || 'Could not load your AI settings'}</p>;
  }

  const hasAnyKey = config.availableProviders.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">AI</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Connect a key for each provider you want to use, then pick what Kan runs on.
        </p>
      </div>

      {/* 1. Keys */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Provider keys
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {config.catalog.map((group) => (
            <ProviderCard
              key={group.provider}
              group={group}
              connected={config.ownedProviders.includes(group.provider)}
              sharedAvailable={config.availableProviders.includes(group.provider)}
              busy={busy}
              onSave={(apiKey) => patch({ action: 'saveKey', provider: group.provider, apiKey })}
              onClear={() => patch({ action: 'clearKey', provider: group.provider })}
            />
          ))}
        </div>
        <p className="text-xs text-neutral-500">
          Keys are encrypted before they are stored, and never held in your browser. You can
          connect both — each model runs on its own provider&apos;s key.
        </p>
      </section>

      {/* 2. The default */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Default model
        </h3>
        <ModelSelect
          catalog={config.catalog}
          available={config.availableProviders}
          value={config.preferences.default}
          allowInherit={false}
          disabled={!hasAnyKey || busy}
          onChange={(value) => patch({ action: 'savePreferences', default: value, overrides: config.preferences.overrides })}
        />
        <p className="text-xs text-neutral-500">
          {hasAnyKey
            ? 'Runs everything unless an area below says otherwise.'
            : 'Connect a key first — there is nothing to run on yet.'}
        </p>
      </section>

      {/* 3. Exceptions */}
      <section>
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          <ChevronDown
            className={`h-4 w-4 text-neutral-400 transition-transform ${advancedOpen ? '' : '-rotate-90'}`}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Use something different for…
          </span>
          {Object.keys(config.preferences.overrides).length > 0 && (
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-300">
              {Object.keys(config.preferences.overrides).length} set
            </span>
          )}
        </button>

        {advancedOpen && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-neutral-500">
              Optional. Most accounts never need one of these — the default above is the setting.
            </p>
            {config.surfaces.map((surface) => {
              const resolved = config.resolved[surface.key];
              return (
                <div key={surface.key} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <label className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {surface.label}
                    </label>
                    {resolved && (
                      <span className={`flex items-center gap-1 text-[11px] ${
                        resolved.fellBack ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400'
                      }`}>
                        {resolved.fellBack && <TriangleAlert className="h-3 w-3" />}
                        {resolved.fellBack ? 'no key — running ' : 'runs '}
                        {labelFor(config.catalog, resolved.choice)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">{surface.blurb}</p>
                  <ModelSelect
                    catalog={config.catalog}
                    available={config.availableProviders}
                    value={config.preferences.overrides[surface.key] ?? ''}
                    allowInherit
                    disabled={!hasAnyKey || busy}
                    onChange={(value) => {
                      const overrides = { ...config.preferences.overrides };
                      if (value) overrides[surface.key] = value;
                      else delete overrides[surface.key];
                      return patch({
                        action: 'savePreferences',
                        default: config.preferences.default,
                        overrides,
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="h-5 text-xs">
        {error ? (
          <span className="text-red-500">{error}</span>
        ) : busy ? (
          <span className="flex items-center gap-1.5 text-neutral-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </span>
        ) : saved ? (
          <span className="flex items-center gap-1.5 text-emerald-500">
            <Check className="h-3 w-3" /> Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** One provider's key: connect it, replace it, or take it away. */
function ProviderCard({
  group, connected, sharedAvailable, busy, onSave, onClear,
}: {
  group: ProviderGroup;
  connected: boolean;
  /** Callable even without a personal key, because this deployment has one. */
  sharedAvailable: boolean;
  busy: boolean;
  onSave: (apiKey: string) => Promise<boolean>;
  onClear: () => void;
}) {
  const [entering, setEntering] = useState(false);
  const [apiKey, setApiKey] = useState('');

  const submit = async () => {
    const ok = await onSave(apiKey.trim());
    if (ok) { setApiKey(''); setEntering(false); }
  };

  return (
    <div className={`rounded-xl border p-4 ${
      connected
        ? 'border-emerald-500/40 bg-emerald-500/5'
        : 'border-neutral-200 dark:border-neutral-800'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 dark:text-white">{group.label}</p>
          <p className="text-xs text-neutral-500">
            {connected
              ? 'Your key is connected'
              : sharedAvailable
                ? 'Using this deployment’s shared key'
                : group.blurb}
          </p>
        </div>
        {connected && <Check className="h-4 w-4 flex-shrink-0 text-emerald-500" />}
      </div>

      {entering ? (
        <div className="mt-3 space-y-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            autoFocus
            placeholder={`${group.label} API key`}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-violet-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={busy || !apiKey.trim()}
              className="flex-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
            >
              {busy ? 'Checking…' : 'Connect'}
            </button>
            <button
              onClick={() => { setEntering(false); setApiKey(''); }}
              className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
          <a
            href={group.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-violet-600 hover:underline dark:text-violet-400"
          >
            Get a key <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setEntering(true)}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:border-violet-400 dark:border-neutral-700 dark:text-neutral-300"
          >
            <Plus className="h-3 w-3" />
            {connected ? 'Replace key' : 'Add key'}
          </button>
          {connected && (
            <button
              onClick={onClear}
              disabled={busy}
              title="Remove this key"
              className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:text-red-500 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A model picker grouped by provider.
 *
 * Models whose provider has no key are shown but disabled rather than hidden —
 * "GPT-6 Astra (add an OpenAI key)" tells you why you cannot have it, and an option
 * that silently is not in the list does not.
 */
function ModelSelect({
  catalog, available, value, allowInherit, disabled, onChange,
}: {
  catalog: ProviderGroup[];
  available: ModelProvider[];
  value: string | null;
  /** Offer "same as default" as the empty choice. */
  allowInherit: boolean;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-violet-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
    >
      <option value="">{allowInherit ? 'Same as default' : 'Pick a model'}</option>
      {catalog.map((group) => {
        const usable = available.includes(group.provider);
        return (
          <optgroup
            key={group.provider}
            label={usable ? group.label : `${group.label} — add a key to use these`}
          >
            {group.models.map((model) => (
              <option
                key={model.model}
                value={formatModelChoice(group.provider, model.model)}
                disabled={!usable}
              >
                {model.label}
                {model.isPreview ? ' (preview)' : ''}
                {model.pricing ? ` · $${model.pricing.input}/$${model.pricing.output} per 1M` : ''}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

/** The friendly name for a stored choice, from the catalogue the server sent. */
function labelFor(catalog: ProviderGroup[], choice: string): string {
  const parsed = parseModelChoice(choice);
  if (!parsed) return choice;
  const group = catalog.find((g) => g.provider === parsed.provider);
  return group?.models.find((m) => m.model === parsed.model)?.label ?? parsed.model;
}
