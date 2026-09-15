'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, Mail, ArrowLeft } from 'lucide-react';

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
 *
 * ## The layout
 *
 * Whatever the person has to do next is the loudest thing on the card. The first
 * version got this backwards: on the code step it kept the address in a disabled
 * input, which rendered as a heavy grey slab sitting above a nearly invisible code
 * field — the one control they actually needed. The address is now a line of text
 * with a way back, and the code box is the only thing competing for attention.
 */
export function AppSignIn({ token, appTitle, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const send = useCallback(async (payload: { email: string; code?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/play/${token}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
        // A rejected code is worth clearing — retyping over six wrong digits is
        // fiddlier than starting again, and there are only five attempts.
        if (!res.ok) setCode('');
        return;
      }
      setError(data.error || 'Something went wrong. Try again.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  // Six digits is the whole form. Waiting for a button press after the last one is
  // a step that exists only because the markup has a button in it.
  useEffect(() => {
    if (stage === 'code' && code.length === 6 && !busy) void send({ email, code });
    // send is stable; re-running on busy would double-submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, stage]);

  useEffect(() => {
    if (stage === 'code') codeRef.current?.focus();
  }, [stage]);

  // Escape closes, because a dialog that traps you is worse than no dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(stage === 'code' ? { email, code } : { email });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neutral-950/70 backdrop-blur-[3px] p-0 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Sign in to ${appTitle}`}
        className="w-full sm:max-w-[22rem] bg-white rounded-t-2xl sm:rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)] ring-1 ring-black/5"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-neutral-900">
            {stage === 'code' ? (
              <button
                type="button"
                onClick={() => { setStage('email'); setCode(''); setError(null); }}
                aria-label="Back"
                className="-ml-1 p-1 rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <Mail className="w-4 h-4 text-violet-500" />
            )}
            {stage === 'email' ? `Sign in to ${appTitle}` : 'Check your email'}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 p-1 rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 pb-5 pt-2">
          {stage === 'email' ? (
            <>
              <p className="text-[13px] text-neutral-500 leading-relaxed mb-3">
                Your saved work is kept against your email address, so it follows you to any
                device you sign in on.
              </p>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15 transition-shadow"
              />
            </>
          ) : (
            <>
              <p className="text-[13px] text-neutral-500 leading-relaxed mb-3">
                {notice} Sent to{' '}
                <span className="text-neutral-900 font-medium break-all">{email}</span>.
              </p>
              <input
                ref={codeRef}
                inputMode="numeric"
                // Lets a phone offer the code straight from the notification.
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="······"
                aria-label="Six-digit code"
                className="w-full px-3 py-3 rounded-lg border border-neutral-300 text-[26px] font-semibold tracking-[0.4em] indent-[0.4em] text-center tabular-nums text-neutral-900 placeholder:text-neutral-300 placeholder:font-normal outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15 transition-shadow"
              />
            </>
          )}

          {error && (
            <p role="alert" className="mt-2.5 text-[13px] text-red-600 leading-snug">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy || (stage === 'code' && code.length < 6)}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-violet-600 text-white text-[15px] font-medium hover:bg-violet-700 active:bg-violet-800 disabled:bg-neutral-200 disabled:text-neutral-400 transition-colors"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Just a moment…' : stage === 'email' ? 'Send me a code' : 'Sign in'}
          </button>

          {stage === 'code' && (
            <button
              type="button"
              onClick={() => { setStage('email'); setCode(''); setError(null); }}
              className="mt-2.5 w-full text-[13px] text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              Use a different address
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
