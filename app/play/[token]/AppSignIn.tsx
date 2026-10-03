'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, Mail, ArrowLeft, Lock } from 'lucide-react';

/**
 * Why this sheet is open.
 *
 * 'signin' — they want their own saved work.
 * 'unlock' — they pressed something inside the app that costs money.
 *
 * One component for both because the steps really are identical: an address goes
 * to /access, which answers with a code to enter or a checkout to go to, and it
 * decides which from what it knows about the app and the address. Only the framing
 * differs, and a second copy of the flow would be a second place for the code path
 * to drift.
 */
export type SignInPurpose = 'signin' | 'unlock';

interface Props {
  token: string;
  appTitle: string;
  onClose: () => void;
  purpose?: SignInPurpose;
  /** Unlock only, already formatted: "$4.00", "$4.00/mo". */
  price?: string;
  /** Unlock only. True for a subscription. */
  recurring?: boolean;
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
export function AppSignIn({
  token,
  appTitle,
  onClose,
  purpose = 'signin',
  price = '',
  recurring = false,
}: Props) {
  const unlocking = purpose === 'unlock';
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={unlocking ? `Unlock ${appTitle}` : `Sign in to ${appTitle}`}
        className="w-full sm:max-w-[22rem] bg-[rgb(var(--kp-card,255_255_255))] text-[rgb(var(--kp-fg,24_24_27))] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[rgb(var(--kp-border,228_228_231))] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            {stage === 'code' ? (
              <button
                type="button"
                onClick={() => { setStage('email'); setCode(''); setError(null); }}
                aria-label="Back"
                className="-ml-1 p-1 rounded-md text-[rgb(var(--kp-muted-fg,113_113_122))] hover:bg-[rgb(var(--kp-muted,244_244_245))] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : unlocking ? (
              <Lock className="w-4 h-4 text-[rgb(var(--kp-primary,124_58_237))]" />
            ) : (
              <Mail className="w-4 h-4 text-[rgb(var(--kp-primary,124_58_237))]" />
            )}
            {stage === 'code'
              ? 'Check your email'
              : unlocking
                ? `Unlock ${appTitle}`
                : `Sign in to ${appTitle}`}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 p-1 rounded-md text-[rgb(var(--kp-muted-fg,113_113_122))] hover:bg-[rgb(var(--kp-muted,244_244_245))] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 pb-5 pt-2">
          {stage === 'email' ? (
            <>
              <p className="text-[13px] text-[rgb(var(--kp-muted-fg,113_113_122))] leading-relaxed mb-3">
                {unlocking ? (
                  <>
                    {price ? <span className="text-[rgb(var(--kp-fg,24_24_27))] font-medium">{price}</span> : null}
                    {price ? (recurring ? ' — ' : ' once — ') : null}
                    payment is handled by Stripe. Already bought it? Use the same address and
                    we&apos;ll send a code instead of charging you again.
                  </>
                ) : (
                  <>
                    Your saved work is kept against your email address, so it follows you to any
                    device you sign in on.
                  </>
                )}
              </p>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-lg border border-[rgb(var(--kp-border,212_212_216))] bg-[rgb(var(--kp-bg,255_255_255))] text-[15px] text-[rgb(var(--kp-fg,24_24_27))] placeholder:text-[rgb(var(--kp-muted-fg,161_161_170))] outline-none focus:border-[rgb(var(--kp-primary,124_58_237))] transition-colors"
              />
            </>
          ) : (
            <>
              <p className="text-[13px] text-[rgb(var(--kp-muted-fg,113_113_122))] leading-relaxed mb-3">
                {notice} Sent to{' '}
                <span className="text-[rgb(var(--kp-fg,24_24_27))] font-medium break-all">{email}</span>.
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
                className="w-full px-3 py-3 rounded-lg border border-[rgb(var(--kp-border,212_212_216))] bg-[rgb(var(--kp-bg,255_255_255))] text-[26px] font-semibold tracking-[0.4em] indent-[0.4em] text-center tabular-nums text-[rgb(var(--kp-fg,24_24_27))] placeholder:text-[rgb(var(--kp-muted-fg,161_161_170))] placeholder:font-normal outline-none focus:border-[rgb(var(--kp-primary,124_58_237))] transition-colors"
              />
            </>
          )}

          {error && (
            <p role="alert" className="mt-2.5 text-[13px] text-red-600 leading-snug">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy || (stage === 'code' && code.length < 6)}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[rgb(var(--kp-primary,124_58_237))] text-[rgb(var(--kp-primary-fg,255_255_255))] text-[15px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy
              ? 'Just a moment…'
              : stage === 'code'
                ? 'Sign in'
                : unlocking
                  ? price ? `Continue · ${price}` : 'Continue'
                  : 'Send me a code'}
          </button>

          {stage === 'code' && (
            <button
              type="button"
              onClick={() => { setStage('email'); setCode(''); setError(null); }}
              className="mt-2.5 w-full text-[13px] text-[rgb(var(--kp-muted-fg,113_113_122))] hover:text-[rgb(var(--kp-fg,24_24_27))] transition-colors"
            >
              Use a different address
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
