'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { AlertCircle, Loader2, Lock } from 'lucide-react';

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
 * Email first, then Stripe. The email is asked for before payment rather than taken
 * from the receipt afterwards because it is also how someone gets back in on another
 * device, and how the person who made this can answer them.
 *
 * Somebody who has already bought it and lost their cookie lands here too, types the
 * same email, and is let straight through — the server checks before it charges.
 */
export function AppPaywall({ token, title, tagline, thumbnailUrl, price, recurring, notice }: Props) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/play/${token}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Something went wrong.'); return; }
      if (data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
      if (data.granted) { window.location.reload(); return; }
      setError('Something went wrong.');
    } catch {
      setError('Something went wrong. Try again.');
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

            {notice === 'canceled' && (
              <p className="mt-4 px-3 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-600 dark:text-neutral-300">
                Checkout was cancelled — nothing was charged.
              </p>
            )}
            {notice === 'unconfirmed' && (
              <p className="mt-4 flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                We could not confirm that payment yet. If you were charged, enter the same
                email below and you will be let straight in.
              </p>
            )}

            <form onSubmit={submit} className="mt-5 space-y-2.5">
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
            </form>

            <p className="mt-3 text-[11px] text-neutral-400 leading-relaxed">
              Payment is handled by Stripe. Already bought it? Enter the same email and you
              will be let through without paying again.
            </p>
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
