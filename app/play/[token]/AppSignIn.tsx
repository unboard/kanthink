'use client';

import { useState } from 'react';
import { X, Loader2, Mail } from 'lucide-react';

interface Props {
  token: string;
  appTitle: string;
  onClose: () => void;
}

/**
 * Signing in to reach your own saved work.
 *
 * Two steps, and the split matters: an address gets a code, and only the code
 * grants. Typing somebody's email must not be the same as being them, which is
 * exactly what it was worth when a free app had nothing private behind it.
 *
 * On success the page reloads rather than patching state. The customer's saved data
 * is baked into the app document by the server, so the only honest way to hand it to
 * a running app is to rebuild the document.
 */
export function AppSignIn({ token, appTitle, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/play/${token}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stage === 'code' ? { email, code } : { email }),
      });
      const data = await res.json();

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data.granted) {
        // The document is built server-side with this person's data in it.
        window.location.reload();
        return;
      }
      if (data.needsCode) {
        setStage('code');
        setNotice(data.message || 'We sent a code to that address.');
        setError(res.ok ? null : data.error || null);
        return;
      }
      setError(data.error || 'Something went wrong. Try again.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neutral-900/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-neutral-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <Mail className="w-4 h-4 text-violet-500" />
            Sign in to {appTitle}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-4 space-y-3">
          <p className="text-xs text-neutral-500 leading-relaxed">
            {stage === 'email'
              ? 'Your saved work is kept against your email address, so it follows you to any device you sign in on.'
              : notice}
          </p>

          <input
            type="email"
            required
            value={email}
            disabled={stage === 'code'}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-neutral-50 disabled:text-neutral-500"
          />

          {stage === 'code' && (
            <input
              inputMode="numeric"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm tracking-[0.3em] text-center outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-60 transition-colors"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {stage === 'email' ? 'Send me a code' : 'Sign in'}
          </button>

          {stage === 'code' && (
            <button
              type="button"
              onClick={() => { setStage('email'); setCode(''); setError(null); }}
              className="w-full text-xs text-neutral-500 hover:text-neutral-800"
            >
              Use a different address
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
