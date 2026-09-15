'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Info, Loader2, Sparkles } from 'lucide-react';
import type { ID } from '@/lib/types';

interface Spend {
  periodKey: string;
  resetsAt: string;
  app: { spentCents: number; limitCents: number; remainingCents: number };
  owner: { spentCents: number; limitCents: number; remainingCents: number };
  customerLimitCents: number;
  calls: { text: number; image: number };
  appLimitSetting: number | null;
  customerLimitSetting: number | null;
  defaults: { app: number; owner: number; customer: number };
}

const money = (cents: number) =>
  cents >= 100 ? `$${(cents / 100).toFixed(2)}` : `${cents}¢`;

/**
 * What this app has spent on AI, and the ceiling it is spending against.
 *
 * Shown to the creator because they are the one being billed: a published app's AI
 * calls run on their key, once per visitor, and until there was a ceiling there was
 * nothing between a busy link and a bill nobody agreed to.
 *
 * Every figure is an estimate until a call settles, and the panel says so. Claiming
 * precision about somebody's money that we do not have would be worse than the
 * rounding.
 */
export function AppSpendSection({ appId }: { appId: ID }) {
  const [spend, setSpend] = useState<Spend | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appLimit, setAppLimit] = useState('');
  const [customerLimit, setCustomerLimit] = useState('');

  const apply = useCallback((data: Spend) => {
    setSpend(data);
    setAppLimit(data.appLimitSetting !== null ? String(data.appLimitSetting) : '');
    setCustomerLimit(data.customerLimitSetting !== null ? String(data.customerLimitSetting) : '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/playground/apps/${appId}/spend`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data?.error || 'Could not load spending'); return; }
        apply(data as Spend);
      } catch {
        if (!cancelled) setError('Could not load spending');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appId, apply]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/playground/apps/${appId}/spend`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appLimitCents: appLimit.trim() === '' ? null : Number(appLimit),
          customerLimitCents: customerLimit.trim() === '' ? null : Number(customerLimit),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Could not save'); return; }
      apply(data as Spend);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setError('Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">AI spending</h3>
        <div className="h-20 rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
      </section>
    );
  }
  if (!spend) {
    return <p className="text-xs text-red-500">{error || 'Could not load spending'}</p>;
  }

  const used = spend.app.limitCents > 0
    ? Math.min(100, Math.round((spend.app.spentCents / spend.app.limitCents) * 100))
    : 0;
  const resets = new Date(spend.resetsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  const tight = used >= 80;

  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
        Estimated AI spending
      </h3>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="px-3 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">
              {money(spend.app.spentCents)} of {money(spend.app.limitCents)} this month
            </p>
            <p className={`text-xs ${tight ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
              {money(spend.app.remainingCents)} left
            </p>
          </div>

          <div className="mt-2 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${tight ? 'bg-amber-500' : 'bg-violet-500'}`}
              style={{ width: `${Math.max(used, spend.app.spentCents > 0 ? 2 : 0)}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            {spend.calls.text} text and {spend.calls.image} image {spend.calls.text + spend.calls.image === 1 ? 'call' : 'calls'} ·
            resets {resets}
          </p>

          {/*
            Say what this number is. It is each call's reported tokens priced at the
            provider's list rates, which is close but is not the invoice — and a call
            still in flight is counted at the most it could cost, so the figure can
            fall slightly once it settles. Limits are enforced against this estimate,
            which is why it is deliberately never optimistic.
          */}
          <p className="mt-1.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
            Estimated from reported tokens at list prices, and rounded up while a call is
            still running. Your provider&apos;s bill is the final word.
          </p>
        </div>

        <div className="px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400">
          Across all your apps: <span className="text-neutral-800 dark:text-neutral-200">
            {money(spend.owner.spentCents)} of {money(spend.owner.limitCents)}
          </span>
        </div>

        <div className="px-3 py-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2.5">
          <label className="block">
            <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
              This app&apos;s monthly limit, in cents
            </span>
            <input
              value={appLimit}
              onChange={(e) => setAppLimit(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder={`${spend.defaults.app} (default)`}
              className="w-full px-2.5 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
              Per person, per month, in cents
            </span>
            <input
              value={customerLimit}
              onChange={(e) => setCustomerLimit(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder={`${spend.defaults.customer} (default)`}
              className="w-full px-2.5 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400"
            />
          </label>

          <button
            onClick={save}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              : saved ? <><Check className="w-3.5 h-3.5" /> Saved</>
              : 'Save limits'}
          </button>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-start gap-2 pt-1">
            <Info className="w-3 h-3 text-neutral-400 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-neutral-400 leading-relaxed">
              Leave a box empty to use the default. There is no unlimited setting —
              a published app spends your AI key once per visitor.
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Sparkles className="w-3 h-3 text-neutral-400 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-neutral-400 leading-relaxed">
              <strong className="text-neutral-500 dark:text-neutral-300">Estimated.</strong> Covers
              text and image generation made by this app — both the published version and your own
              draft previews. Costs are reserved before each call and corrected once the provider
              reports what it used, so a figure here can move down as calls settle.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
