'use client';

import { useState } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { Check, Loader2 } from 'lucide-react';

interface Props {
  token: string;
  title: string;
  headline: string;
  pitch: string;
  priceLabel: string;
  bullets: string[];
  /** The app's directory image, when one has been made. */
  thumbnailUrl: string | null;
}

/**
 * A test page: an app that doesn't exist yet, and a way to say "I'd want that".
 *
 * Built on the paywall's door so it looks like the rest of Kanthink's public pages.
 * The only promise it makes is the true one: nobody is charged, and you'll hear when
 * it's ready.
 */
export function AppReserve({ token, title, headline, pitch, priceLabel, bullets, thumbnailUrl }: Props) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/play/${token}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, website }),
      });
      const data = await res.json();
      if (res.ok) setDone(true);
      else setError(data?.error || 'Something went wrong. Try again.');
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
          <div className={`relative flex items-center justify-center bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 ${thumbnailUrl ? 'aspect-[5/3]' : 'aspect-[5/2]'}`}>
            {thumbnailUrl ? (
              // Same treatment as the paywall's image, so a test page and the app it
              // becomes look like the same thing.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <KanthinkIcon size={32} className="text-violet-400" />
            )}
            {priceLabel && (
              <span className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-neutral-900/85 text-white text-xs font-semibold backdrop-blur-sm">
                {priceLabel}
              </span>
            )}
            <span className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-white/80 dark:bg-neutral-900/70 text-neutral-700 dark:text-neutral-200 text-[11px] font-medium backdrop-blur-sm">
              Coming soon
            </span>
          </div>

          <div className="p-5">
            <p className="text-xs font-medium text-violet-600 dark:text-violet-400">{title}</p>
            <h1 className="mt-1 text-lg font-semibold leading-snug text-neutral-900 dark:text-white">{headline}</h1>
            {pitch && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{pitch}</p>}
            {bullets.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />{b}
                  </li>
                ))}
              </ul>
            )}

            {done ? (
              <div className="mt-5 rounded-2xl bg-violet-500/10 px-4 py-4">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">You’re on the list.</p>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">You’ll get one email when {title} is ready{priceLabel ? `, at ${priceLabel}` : ''}. Nothing was charged.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-5 space-y-2.5">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400"
                />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First name (optional)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400"
                />
                {/* Hidden from people; bots fill it in. */}
                <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden="true" />
                <button
                  type="submit"
                  disabled={busy || !email.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Reserve it
                </button>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <p className="text-[11px] leading-relaxed text-neutral-400">
                  Nobody is charged. Reserving saves your email so you hear the moment it’s ready{priceLabel ? `, at the price above` : ''}. One email, and you can stop them any time.
                </p>
              </form>
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-neutral-400">Made with Kanthink</p>
      </div>
    </div>
  );
}
