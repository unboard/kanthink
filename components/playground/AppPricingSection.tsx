'use client';

import { useState } from 'react';
import { Check, CreditCard, Globe, Loader2, Lock } from 'lucide-react';
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
 * Charging for a published app — or deliberately not.
 *
 * This was a checkbox, and a checkbox could not say this. Its label changed with
 * its own state, so an unticked box sat next to the words "Free to open" and left
 * you working out whether free was the state or the thing the tick would cause.
 * Worse, ticking it tried to save a price nobody had typed yet, which is most of
 * why setting one appeared to be broken.
 *
 * Two buttons instead. Exactly one is lit, it names the state rather than the
 * action, and the price fields only exist under the one they belong to.
 *
 * Prices are entered in major units because that is how people think about money;
 * everything below this works in minor units, and the conversion happens once, here.
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
  /** Open the price fields without having committed to a price yet. */
  const [choosingPrice, setChoosingPrice] = useState(false);

  const charging = !!app.paywallEnabled;
  const hasCode = Boolean(app.code);
  const showPriceFields = charging || choosingPrice;

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
      if (!res.ok || !data?.app) { setError(data?.error || 'Could not save the price'); return false; }
      onUpdated(data.app as PlaygroundApp);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      return true;
    } catch {
      setError('Could not save the price');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const savePrice = async () => {
    const major = Number(amount);
    if (!amount.trim() || !Number.isFinite(major) || major <= 0) {
      setError('Enter a price first — for example 4.00');
      return;
    }
    const ok = await put({
      enabled: true,
      amount: Math.round(major * 100),
      currency,
      interval,
    });
    if (ok) setChoosingPrice(false);
  };

  const makeFree = async () => {
    setChoosingPrice(false);
    setError(null);
    if (charging) await put({ enabled: false });
  };

  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
        Access
      </h3>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {/* The state, named. Exactly one of these is true at any moment. */}
        <div className="grid grid-cols-2 gap-2 p-2">
          <StateButton
            active={!charging}
            disabled={saving}
            onClick={makeFree}
            icon={<Globe className="w-3.5 h-3.5" />}
            label="Free"
            blurb="Anyone with the link"
          />
          <StateButton
            active={charging}
            disabled={!hasCode || saving}
            onClick={() => { setChoosingPrice(true); setError(null); }}
            icon={<Lock className="w-3.5 h-3.5" />}
            label={charging
              ? formatAppPrice(app.priceAmount, app.priceCurrency, app.priceInterval)
              : 'Paid'}
            blurb={charging ? 'Behind a paywall' : 'Set a price'}
          />
        </div>

        <p className="px-3 pb-2 text-xs text-neutral-500 dark:text-neutral-400">
          {!hasCode
            ? 'Build it first — there is nothing to charge for yet.'
            : charging
              ? 'Visitors give an email, pay, and the link opens for them from then on.'
              : 'This app opens straight through. Nobody is asked for anything.'}
        </p>

        {showPriceFields && hasCode && (
          <div className="border-t border-neutral-200 dark:border-neutral-800 px-3 py-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="flex items-stretch flex-1 min-w-0 rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden focus-within:border-violet-400">
                <span className="flex items-center px-2.5 text-xs text-neutral-400 bg-neutral-50 dark:bg-neutral-800/60">
                  {currency.toUpperCase()}
                </span>
                <input
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void savePrice(); }}
                  inputMode="decimal"
                  autoFocus={choosingPrice && !charging}
                  placeholder="4.00"
                  className="flex-1 min-w-0 px-2.5 py-2 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none"
                />
              </div>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="px-2 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-700 dark:text-neutral-200 outline-none"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {INTERVALS.map((i) => (
                <button
                  key={i.key}
                  onClick={() => setInterval(i.key)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
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
              onClick={savePrice}
              disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                : saved
                  ? <><Check className="w-3.5 h-3.5" /> Saved</>
                  : <><CreditCard className="w-3.5 h-3.5" /> {charging ? 'Update the price' : 'Start charging'}</>}
            </button>

            {error && (
              <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-2">
                {error}
              </p>
            )}

            <p className="text-[10px] text-neutral-400 leading-relaxed">
              Changing a price archives the old one on Stripe rather than editing it, so
              anyone already subscribed keeps the terms they agreed to. Payments land in this
              instance&apos;s Stripe account.
            </p>
          </div>
        )}

        {/* An error from making something free has no price panel to live in. */}
        {error && !showPriceFields && (
          <p className="mx-3 mb-3 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-2">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function StateButton({
  active, disabled, onClick, icon, label, blurb,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  blurb: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`px-3 py-2.5 rounded-lg border text-left transition-colors disabled:opacity-40 ${
        active
          ? 'border-violet-400 bg-violet-500/10'
          : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
      }`}
    >
      <span className={`flex items-center gap-1.5 text-xs font-semibold ${
        active ? 'text-violet-700 dark:text-violet-300' : 'text-neutral-700 dark:text-neutral-200'
      }`}>
        {icon}
        {label}
        {active && <Check className="w-3 h-3 ml-auto" />}
      </span>
      <span className="block mt-0.5 text-[10.5px] text-neutral-500 dark:text-neutral-400">
        {blurb}
      </span>
    </button>
  );
}
