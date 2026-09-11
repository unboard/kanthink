'use client';

import { useState } from 'react';
import { Check, CreditCard, Loader2 } from 'lucide-react';
import { formatAppPrice } from '@/lib/playground/appAccess';
import type { AppPriceInterval, PlaygroundApp } from '@/lib/types';

interface Props {
  app: PlaygroundApp;
  onUpdated: (app: PlaygroundApp) => void;
}

const CURRENCIES = ['usd', 'gbp', 'eur', 'cad', 'aud'];

const INTERVALS: { key: AppPriceInterval; label: string }[] = [
  { key: 'one_time', label: 'One-time' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
];

/**
 * Charging for a published app.
 *
 * The price is entered in major units because that is how people think about money;
 * everything below this component works in minor units, which is how Stripe thinks
 * about it, and the conversion happens exactly once, here.
 *
 * Turning the paywall off leaves the Stripe product alone. Anyone already
 * subscribed stays subscribed on the terms they agreed to, and switching it back on
 * does not mint a duplicate price.
 */
export function AppPricingSection({ app, onUpdated }: Props) {
  const [amount, setAmount] = useState(
    app.priceAmount ? (app.priceAmount / 100).toFixed(2) : '',
  );
  const [currency, setCurrency] = useState(app.priceCurrency || 'usd');
  const [interval, setInterval] = useState<AppPriceInterval>(app.priceInterval || 'one_time');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = !!app.paywallEnabled;
  const hasCode = Boolean(app.code);

  const put = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/playground/apps/${app.id}/pricing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.app) { setError(data?.error || 'Could not save the price'); return; }
      onUpdated(data.app as PlaygroundApp);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setError('Could not save the price');
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    const major = Number(amount);
    if (!Number.isFinite(major) || major <= 0) {
      setError('Enter a price, like 4.00');
      return;
    }
    void put({
      enabled: true,
      amount: Math.round(major * 100),
      currency,
      interval,
    });
  };

  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
        Charging for it
      </h3>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => (enabled ? void put({ enabled: false }) : save())}
            disabled={!hasCode || saving}
            className="w-4 h-4 rounded accent-violet-600 disabled:opacity-40"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-900 dark:text-white">
              {enabled
                ? `Costs ${formatAppPrice(app.priceAmount, app.priceCurrency, app.priceInterval)}`
                : 'Free to open'}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {!hasCode
                ? 'Build it first.'
                : enabled
                  ? 'Visitors give an email, pay, and the link opens for them from then on.'
                  : 'Set a price below to put it behind a paywall.'}
            </p>
          </div>
        </label>

        <div className="border-t border-neutral-200 dark:border-neutral-800 px-3 py-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="flex items-stretch flex-1 min-w-0 rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden focus-within:border-violet-400">
              <span className="flex items-center px-2.5 text-xs text-neutral-400 bg-neutral-50 dark:bg-neutral-800/60">
                {currency.toUpperCase()}
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="4.00"
                disabled={!hasCode}
                className="flex-1 min-w-0 px-2.5 py-2 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none disabled:opacity-50"
              />
            </div>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={!hasCode}
              className="px-2 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-700 dark:text-neutral-200 outline-none disabled:opacity-50"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {INTERVALS.map((i) => (
              <button
                key={i.key}
                onClick={() => setInterval(i.key)}
                disabled={!hasCode}
                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                  interval === i.key
                    ? 'border-violet-400 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                    : 'border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>

          <button
            onClick={save}
            disabled={!hasCode || saving}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              : saved
                ? <><Check className="w-3.5 h-3.5" /> Saved</>
                : <><CreditCard className="w-3.5 h-3.5" /> {enabled ? 'Update the price' : 'Set the price'}</>}
          </button>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <p className="text-[10px] text-neutral-400 leading-relaxed">
            Changing a price archives the old one on Stripe rather than editing it, so
            anyone already subscribed keeps the terms they agreed to. Payments land in this
            instance&apos;s Stripe account.
          </p>
        </div>
      </div>
    </section>
  );
}
