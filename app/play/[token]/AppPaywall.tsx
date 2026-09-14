'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { AlertCircle, ArrowLeft, Loader2, Lock, MailCheck } from 'lucide-react';

interface Props {
  token: string;
  title: string;
  tagline: string;
  thumbnailUrl: string | null;
  /** Already formatted — the server knows the currency and the interval. */
  price: string;
  recurring: boolean;
  /** Set when someone has just come back from an abandoned or unconfirmed checkout. */
  notice: 'canceled' | 'unconfirmed' | null;
}

/**
 * The door on a paid app.
 *
 * Two states, because there are two different people at this door: somebody who has
 * never bought it, and somebody who has and is back on a new device. The first goes
 * to Stripe. The second gets a code in their inbox.
 *
 * That second path is new. It used to be enough to type the address you bought
 * with — which meant knowing a customer's email was the same as being them. Paying
 * proves the account is entitled; the code proves the person is the account.
 */
export function AppPaywall({ token, title, tagline, thumbnailUrl, price, recurring, notice }: Props) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/play/${token}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { res, data: await res.json() };
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { res, data } = await post({ email: email.trim(), name: name.trim() || undefined });
      if (data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
      if (data.granted) { window.location.reload(); return; }
      if (data.needsCode) {
        // 429 here is the resend limit, which still means a code is expected.
        setStep('code');
        setMessage(data.message ?? null);
        setError(res.ok ? null : data.error);
        return;
      }
      setError(data?.error || 'Something went wrong.');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await post({ email: email.trim(), code: code.trim() });
      if (data.granted) { window.location.reload(); return; }
      if (data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
      setError(data?.error || 'That did not work.');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { res, data } = await post({ email: email.trim() });
      setMessage(res.ok ? 'A new code is on its way.' : null);
      if (!res.ok) setError(data?.error || 'Could not send another code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
          <div className="relative aspect-[5/3] bg-neutral-100 dark:bg-neutral-800">
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15">
                <KanthinkIcon size={32} className="text-violet-400" />
              </div>
            )}
            <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-900/85 text-white text-xs font-semibold backdrop-blur-sm">
              <Lock className="w-3 h-3" />
              {price}{recurring ? '' : ' once'}
            </span>
          </div>

          <div className="p-5">
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">{title}</h1>
            {tagline && (
              <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                {tagline}
              </p>
            )}

            {notice === 'canceled' && step === 'email' && (
              <p className="mt-4 px-3 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-600 dark:text-neutral-300">
                Checkout was cancelled — nothing was charged.
              </p>
            )}
            {notice === 'unconfirmed' && step === 'email' && (
              <p className="mt-4 flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                We could not confirm that payment yet. If you were charged, enter the same
                email below and we will send you a code to get straight in.
              </p>
            )}

            {step === 'email' ? (
              <form onSubmit={submitEmail} className="mt-5 space-y-2.5">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400"
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name (optional)"
                  className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400"
                />

                {error && <p className="text-xs text-red-500">{error}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  {busy ? 'One moment…' : `Get access · ${price}`}
                </button>

                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Payment is handled by Stripe. Already bought it? Use the same email and we
                  will send a code instead of charging you again.
                </p>
              </form>
            ) : (
              <form onSubmit={submitCode} className="mt-5 space-y-2.5">
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-400">
                  <MailCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{message || `We sent a code to ${email}.`}</span>
                </div>

                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="000000"
                  className="w-full px-3 py-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-center text-xl tracking-[0.35em] font-mono text-neutral-900 dark:text-white outline-none focus:border-violet-400"
                />

                {error && <p className="text-xs text-red-500">{error}</p>}

                <button
                  type="submit"
                  disabled={busy || code.length !== 6}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
                  {busy ? 'Checking…' : 'Let me in'}
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => { setStep('email'); setCode(''); setError(null); }}
                    className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Different email
                  </button>
                  <button
                    type="button"
                    onClick={resend}
                    disabled={busy}
                    className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-40"
                  >
                    Send another code
                  </button>
                </div>

                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  The code lasts 15 minutes. It is how we check the purchase is yours before
                  opening the app.
                </p>
              </form>
            )}
          </div>
        </div>

        <Link
          href="/"
          className="mt-5 flex items-center justify-center gap-1.5 text-xs text-neutral-400 hover:text-violet-500 transition-colors"
        >
          <KanthinkIcon size={13} className="text-violet-500" />
          <span className="font-medium">Made with Kanthink</span>
        </Link>
      </div>
    </div>
  );
}
