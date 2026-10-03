'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CreditCard, DoorClosed, Globe, Loader2, Lock, MousePointerClick, ShoppingBag, Sparkles, Wand2 } from 'lucide-react';
import { formatAppPrice, paywallMode } from '@/lib/playground/appAccess';
import { FULFILMENTS, paymentStatus } from '@/lib/playground/payments/status';
import type { PaymentSetup } from '@/lib/playground/payments/types';
import type { AppPaywallMode, AppPriceInterval, PlaygroundApp } from '@/lib/types';

interface Props {
  app: PlaygroundApp;
  onUpdated: (app: PlaygroundApp) => void;
  /** Run the "fix how it takes payment" build. */
  onFixPayments?: () => void;
  busy?: boolean;
}

const CURRENCIES = ['usd', 'gbp', 'eur', 'cad', 'aud'];

const INTERVALS: { key: AppPriceInterval; label: string }[] = [
  { key: 'one_time', label: 'One-time' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
];

/**
 * What a buyer is paying for. Three different things, and mixing them up is how a
 * shop ended up selling access: one payment unlocked every rock after it.
 */
const MODES: { key: AppPaywallMode; label: string; blurb: string; icon: React.ReactNode }[] = [
  { key: 'app', label: 'The whole app', blurb: 'Pay at the door', icon: <DoorClosed className="w-3.5 h-3.5" /> },
  { key: 'action', label: 'A feature inside', blurb: 'Pay once to unlock it', icon: <MousePointerClick className="w-3.5 h-3.5" /> },
  { key: 'order', label: 'Items', blurb: 'A shop: each purchase is an order', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
];

const MODE_NAME: Record<string, string> = { free: 'Free', app: 'Paid at the door', action: 'A paid feature', order: 'Orders' };

const SEVERITY_DOT = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-neutral-400' } as const;

/**
 * Charging for a published app, and the overseer that keeps the app honest about it.
 *
 * Prices are entered in major units because that is how people think about money;
 * everything below this works in minor units, and the conversion happens once, here.
 * Below the price: the few questions that decide how the app should take money, and
 * a check that the app's code actually does it that way, with one click to fix it.
 */
export function AppPricingSection({ app, onUpdated, onFixPayments, busy }: Props) {
  const [amount, setAmount] = useState(app.priceAmount ? (app.priceAmount / 100).toFixed(2) : '');
  const [currency, setCurrency] = useState(app.priceCurrency || 'usd');
  const [interval, setInterval] = useState<AppPriceInterval>(app.priceInterval || 'one_time');
  const [mode, setMode] = useState<AppPaywallMode>(paywallMode(app));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choosingPrice, setChoosingPrice] = useState(false);
  const [checking, setChecking] = useState(false);
  /** True while answers the owner just gave are being saved and re-read. */
  const [savingSetup, setSavingSetup] = useState(false);

  const charging = !!app.paywallEnabled;
  const hasCode = Boolean(app.code);
  const showPriceFields = charging || choosingPrice;
  const status = useMemo(() => paymentStatus(app), [app]);

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

  const savePrice = async (nextMode = mode) => {
    const major = Number(amount);
    if (!amount.trim() || !Number.isFinite(major) || major <= 0) {
      setError('Enter a price first, for example 4.00');
      return;
    }
    const ok = await put({ enabled: true, amount: Math.round(major * 100), currency, interval: nextMode === 'order' ? 'one_time' : interval, mode: nextMode });
    if (ok) {
      setChoosingPrice(false);
      // Kan re-reads the app in the background after a price change; pick that up.
      setTimeout(() => void refresh(), 9000);
    }
  };

  const makeFree = async () => {
    setChoosingPrice(false);
    setError(null);
    if (charging) await put({ enabled: false });
  };

  const refresh = async () => {
    try {
      const res = await fetch(`/api/playground/apps/${app.id}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data?.app) onUpdated(data.app as PlaygroundApp);
    } catch { /* the next open reads it */ }
  };

  const askKan = async (setup?: PaymentSetup) => {
    setChecking(true);
    if (setup) setSavingSetup(true);
    try {
      const res = await fetch(`/api/playground/apps/${app.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setup ? { setup } : { review: true }),
      });
      const data = await res.json();
      if (res.ok && data?.app) onUpdated(data.app as PlaygroundApp);
    } catch { /* stays as it was */ } finally {
      setChecking(false);
      setSavingSetup(false);
    }
  };

  const suggestion = status.review && status.review.suggestedMode !== status.settings.mode ? status.review : null;

  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">Access and payments</h3>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="grid grid-cols-2 gap-2 p-2">
          <StateButton active={!charging} disabled={saving} onClick={makeFree} icon={<Globe className="w-3.5 h-3.5" />} label="Free" blurb="Anyone with the link" />
          <StateButton
            active={charging}
            disabled={!hasCode || saving}
            onClick={() => { setChoosingPrice(true); setError(null); }}
            icon={<Lock className="w-3.5 h-3.5" />}
            label={charging ? formatAppPrice(app.priceAmount, app.priceCurrency, paywallMode(app) === 'order' ? 'one_time' : app.priceInterval) + (paywallMode(app) === 'order' ? ' each' : '') : 'Paid'}
            blurb={charging ? MODE_NAME[status.settings.mode] : 'Set a price'}
          />
        </div>

        <p className="px-3 pb-2 text-xs text-neutral-500 dark:text-neutral-400">
          {!hasCode
            ? 'Build it first. There is nothing to charge for yet.'
            : !charging
              ? 'This app opens straight through. Nobody is asked for anything.'
              : status.settings.mode === 'order'
                ? 'Anyone can browse. Each Buy goes straight to checkout, which collects who they are, and the order lands below.'
                : status.settings.mode === 'action'
                  ? 'Anyone can open it. Paying once unlocks the paid feature for that person.'
                  : 'Visitors give an email, pay, and the link opens for them from then on.'}
        </p>

        {/* Kan's read, when it disagrees with the settings. */}
        {suggestion && hasCode && (
          <div className="mx-2 mb-2 flex items-start gap-2.5 rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2.5">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
            <div className="min-w-0 flex-1 text-xs text-neutral-700 dark:text-neutral-300">
              <span className="font-medium">Kan suggests {MODE_NAME[suggestion.suggestedMode]}.</span> {suggestion.why}
              {suggestion.suggestedMode !== 'free' && (
                <button
                  onClick={() => { setMode(suggestion.suggestedMode as AppPaywallMode); setChoosingPrice(true); }}
                  className="mt-1.5 block font-medium text-violet-600 hover:underline dark:text-violet-400"
                >
                  Switch to {MODE_NAME[suggestion.suggestedMode]}
                </button>
              )}
            </div>
          </div>
        )}

        {showPriceFields && hasCode && (
          <div className="border-t border-neutral-200 dark:border-neutral-800 px-3 py-3 space-y-2.5">
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">What they&apos;re paying for</span>
              <div className="grid grid-cols-3 gap-2">
                {MODES.map((m) => (
                  <StateButton key={m.key} active={mode === m.key} disabled={saving} onClick={() => { setMode(m.key); setError(null); }} icon={m.icon} label={m.label} blurb={m.blurb} />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-stretch flex-1 min-w-0 rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden focus-within:border-violet-400">
                <span className="flex items-center px-2.5 text-xs text-neutral-400 bg-neutral-50 dark:bg-neutral-800/60">{currency.toUpperCase()}</span>
                <input
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void savePrice(); }}
                  inputMode="decimal"
                  autoFocus={choosingPrice && !charging}
                  placeholder="4.00"
                  className="flex-1 min-w-0 px-2.5 py-2 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none"
                />
                {mode === 'order' && <span className="flex items-center px-2.5 text-xs text-neutral-400">per item</span>}
              </div>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="px-2 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-700 dark:text-neutral-200 outline-none">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </div>

            {mode !== 'order' && (
              <div className="grid grid-cols-3 gap-1.5">
                {INTERVALS.map((i) => (
                  <button
                    key={i.key}
                    onClick={() => setInterval(i.key)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${interval === i.key ? 'border-violet-400 bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400'}`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => void savePrice()}
              disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                : saved ? <><Check className="w-3.5 h-3.5" /> Saved</>
                : <><CreditCard className="w-3.5 h-3.5" /> {charging ? (mode !== paywallMode(app) ? `Switch to ${MODE_NAME[mode]}` : 'Update the price') : 'Start charging'}</>}
            </button>

            {error && <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-2">{error}</p>}

            <p className="text-[10px] text-neutral-400 leading-relaxed">
              Changing a price archives the old one on Stripe rather than editing it, so anyone already subscribed keeps the terms they agreed to. Payments land in this instance&apos;s Stripe account.
            </p>
          </div>
        )}

        {error && !showPriceFields && (
          <p className="mx-3 mb-3 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-2">{error}</p>
        )}

        {/* The questions that decide how the app should take money. */}
        {charging && hasCode && (status.settings.mode === 'order' || status.settings.mode === 'action') && (
          <SetupQuestions app={app} mode={status.settings.mode} onSave={(setup) => void askKan(setup)} saving={savingSetup} />
        )}

        {/* The overseer: does the app actually take money the way the settings say? */}
        {hasCode && (charging || status.findings.length > 0) && (
          <PaymentCheck
            status={status}
            checking={checking}
            busy={!!busy}
            onCheck={() => void askKan()}
            onFix={onFixPayments}
          />
        )}
      </div>
    </section>
  );
}

function SetupQuestions({ app, mode, onSave, saving }: { app: PlaygroundApp; mode: 'order' | 'action'; onSave: (setup: PaymentSetup) => void; saving: boolean }) {
  const setup = app.paymentSetup ?? {};
  const [note, setNote] = useState(setup.fulfilmentNote ?? '');
  const [noteLabel, setNoteLabel] = useState(setup.noteLabel ?? '');
  const [paidAction, setPaidAction] = useState(setup.paidAction ?? '');
  const save = (patch: PaymentSetup) => onSave({ ...setup, ...patch });

  if (mode === 'action') {
    return (
      <div className="border-t border-neutral-200 dark:border-neutral-800 px-3 py-3">
        <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200">What costs money?</label>
        <input
          value={paidAction}
          onChange={(e) => setPaidAction(e.target.value)}
          onBlur={() => { if (paidAction.trim() !== (setup.paidAction ?? '')) save({ paidAction: paidAction.trim() || null }); }}
          placeholder="Exporting a PDF · more than 3 generations a day"
          className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-transparent px-2.5 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-violet-400 dark:border-neutral-800 dark:text-white"
        />
        <p className="mt-1 text-[10.5px] text-neutral-400">Kan builds the paywall around exactly this. Everything else stays free.</p>
      </div>
    );
  }

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800 px-3 py-3 space-y-3">
      <div>
        <span className="block text-xs font-medium text-neutral-800 dark:text-neutral-200">How do buyers get their order?</span>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {FULFILMENTS.map((f) => (
            <button
              key={f.id}
              onClick={() => save({ fulfilment: f.id })}
              aria-pressed={setup.fulfilment === f.id}
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${setup.fulfilment === f.id ? 'border-violet-400 bg-violet-500/10' : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'}`}
            >
              <span className={`block text-xs font-medium ${setup.fulfilment === f.id ? 'text-violet-700 dark:text-violet-300' : 'text-neutral-700 dark:text-neutral-200'}`}>{f.label}</span>
              <span className="block text-[10.5px] text-neutral-500">{f.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {setup.fulfilment && (
        <div>
          <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200">
            {setup.fulfilment === 'pickup' ? 'Where and when is pickup?' : setup.fulfilment === 'shipping' ? 'Anything buyers should know about shipping?' : 'What happens after they order?'}
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => { if (note.trim() !== (setup.fulfilmentNote ?? '')) save({ fulfilmentNote: note.trim() || null }); }}
            placeholder={setup.fulfilment === 'pickup' ? 'Pickup in north Fargo, Saturdays 10–2. We\'ll text the address.' : setup.fulfilment === 'shipping' ? 'Ships within 3 days, US and Canada.' : 'We\'ll email you within a day to arrange it.'}
            className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-transparent px-2.5 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-violet-400 dark:border-neutral-800 dark:text-white"
          />
          <p className="mt-1 text-[10.5px] text-neutral-400">Shown at checkout and in the order confirmation.</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Toggle label="Ask for a phone number" hint={setup.fulfilment === 'pickup' ? 'Handy for arranging pickup' : 'Checkout always asks for name and email'} on={!!setup.collectPhone} onChange={(v) => save({ collectPhone: v })} />
        <Toggle label="Let buyers leave a note" hint="A name to paint, a size, a date" on={!!setup.collectNote} onChange={(v) => save({ collectNote: v })} />
        {setup.collectNote && (
          <input
            value={noteLabel}
            onChange={(e) => setNoteLabel(e.target.value)}
            onBlur={() => { if (noteLabel.trim() !== (setup.noteLabel ?? '')) save({ noteLabel: noteLabel.trim() || null }); }}
            maxLength={50}
            placeholder="What should the note ask? (e.g. Name to paint on the rock)"
            className="w-full rounded-lg border border-neutral-200 bg-transparent px-2.5 py-1.5 text-xs text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-violet-400 dark:border-neutral-800 dark:text-white"
          />
        )}
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="text-xs text-neutral-700 dark:text-neutral-200">Most of one item per order</span>
          <select
            value={setup.maxQuantity ?? 1}
            onChange={(e) => save({ maxQuantity: Number(e.target.value) })}
            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
          >
            {[1, 2, 3, 5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      {saving && <p className="flex items-center gap-1.5 text-[10.5px] text-neutral-400"><Loader2 className="h-3 w-3 animate-spin" /> Saved. Kan is re-reading the app…</p>}
    </div>
  );
}

function PaymentCheck({ status, checking, busy, onCheck, onFix }: {
  status: ReturnType<typeof paymentStatus>;
  checking: boolean;
  busy: boolean;
  onCheck: () => void;
  onFix?: () => void;
}) {
  const { findings, review, missing, stale } = status;
  const problems = findings.filter((f) => f.severity !== 'low').length;
  const asked = useRef(false);
  // A stale or missing review is refreshed once when the section opens, so the
  // check is current without the owner having to think about it.
  useEffect(() => {
    if (asked.current || checking || review) return;
    asked.current = true;
    onCheck();
  }, [checking, review, onCheck]);

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Payment check</span>
        <span className={`ml-auto text-[11px] font-medium ${findings.length === 0 ? 'text-emerald-600 dark:text-emerald-400' : problems ? 'text-red-500' : 'text-amber-600'}`}>
          {findings.length === 0 ? 'Takes payment the way it should' : `${findings.length} to fix`}
        </span>
      </div>

      {review?.sells && (
        <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">Kan&apos;s read:</span> {review.sells}
        </p>
      )}
      {(checking || (stale && !review)) && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-400"><Loader2 className="h-3 w-3 animate-spin" /> Kan is reading the app…</p>
      )}

      {findings.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {findings.map((f) => (
            <li key={f.id} className="flex items-start gap-2">
              <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-neutral-800 dark:text-neutral-200">{f.title}</span>
                <span className="block text-[10.5px] leading-snug text-neutral-500">{f.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {missing.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">Still to answer: {missing.join(' ')}</p>
      )}
      {review?.questions && review.questions.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {review.questions.map((q) => <li key={q} className="text-[11px] text-neutral-500">· {q}</li>)}
        </ul>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        {findings.length > 0 && onFix && (
          <button
            onClick={onFix}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <Wand2 className="h-3 w-3" />
            Fix how it takes payment
          </button>
        )}
        <button onClick={onCheck} disabled={checking} className="text-[11px] text-neutral-500 hover:text-neutral-800 disabled:opacity-50 dark:hover:text-neutral-200">
          Check again
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded accent-violet-600" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-neutral-700 dark:text-neutral-200">{label}</span>
        <span className="block text-[10.5px] text-neutral-500">{hint}</span>
      </span>
    </label>
  );
}

function StateButton({ active, disabled, onClick, icon, label, blurb }: {
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
      className={`px-3 py-2.5 rounded-lg border text-left transition-colors disabled:opacity-40 ${active ? 'border-violet-400 bg-violet-500/10' : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'}`}
    >
      <span className={`flex items-center gap-1.5 text-xs font-semibold ${active ? 'text-violet-700 dark:text-violet-300' : 'text-neutral-700 dark:text-neutral-200'}`}>
        {icon}
        {label}
        {active && <Check className="w-3 h-3 ml-auto flex-shrink-0" />}
      </span>
      <span className="block mt-0.5 text-[10.5px] text-neutral-500 dark:text-neutral-400">{blurb}</span>
    </button>
  );
}
