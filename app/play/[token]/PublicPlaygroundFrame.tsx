'use client';

import { useEffect, useRef, useState } from 'react';
import { AppFeedbackPanel } from './AppFeedbackPanel';
import { useAppStorage, isFromFrame } from '@/lib/playground/useAppStorage';
import { X, UserRound, LogOut, CreditCard } from 'lucide-react';
import { AppSignIn, type SignInPurpose } from './AppSignIn';
import type { HostChrome } from '@/lib/playground/hostChrome';

interface Props {
  srcDoc: string;
  title: string;
  /** The share token, so the footer can reach this app's feedback thread. */
  token: string;
  /** Shown once after a successful purchase, then never again. */
  justPurchased?: boolean;
  /** Only true for someone on a recurring plan — there is nothing else to manage. */
  canManageBilling?: boolean;
  /** Who is signed in, if anyone. Their saved work is already inside srcDoc. */
  customerEmail?: string | null;
  /**
   * Set for an app that charges for something inside itself. The app raises
   * `kpg_unlock` from whichever of its own buttons costs money, and this is what
   * the sheet needs to name the price when it opens.
   */
  unlockPrice?: string | null;
  unlockRecurring?: boolean;
  /** Open the conversation with the maker on load (from a reply email). */
  openMessages?: boolean;
  /** Colors from the app's own style, and who made it. See lib/playground/hostChrome. */
  chrome?: HostChrome;
}

/**
 * Full-viewport public playground render.
 *
 * The app gets the screen. Under it, one slim bar that belongs to the app rather
 * than to Kanthink: who you're signed in as, and Chat, the conversation with the
 * person who made it. The bar, the chat and the sign-in sheet all take their
 * colors from the app's style, so they fit a dark game and a paper puzzle alike.
 */
export function PublicPlaygroundFrame({
  srcDoc,
  title,
  token,
  justPurchased,
  canManageBilling,
  customerEmail,
  unlockPrice,
  unlockRecurring,
  openMessages,
  chrome,
}: Props) {
  // The app's own saved data, held by this page because the sandboxed iframe has
  // no storage of its own. Without it a saved score lasts until the next refresh.
  const { withSeed, frameRef } = useAppStorage(token);
  const [accountOpen, setAccountOpen] = useState(false);
  const [showPurchased, setShowPurchased] = useState(!!justPurchased);
  const [showSignIn, setShowSignIn] = useState(false);
  // Which sheet the last request asked for. Same component, same steps — an
  // unlock is a sign-in that ends at checkout instead of at somebody's saved work.
  const [purpose, setPurpose] = useState<SignInPurpose>('signin');

  // A shop's buy button. Straight to Stripe checkout, which collects who is buying,
  // and back to this same page once they have paid. No sheet of ours in between.
  const [ordering, setOrdering] = useState<'idle' | 'opening' | string>('idle');
  const startOrder = async (order: unknown) => {
    setOrdering('opening');
    try {
      const res = await fetch(`/api/play/${token}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(order && typeof order === 'object' ? order : {}), returnPath: window.location.pathname }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setOrdering(data?.error || 'Could not start checkout. Try again.');
    } catch {
      setOrdering('Could not reach the server. Check your connection and try again.');
    }
  };

  // Count the visit for whoever holds the access cookie. Best-effort and silent:
  // the app is already on screen, and a failed counter is not worth an error.
  useEffect(() => {
    void fetch(`/api/play/${token}/access`, { method: 'PATCH' }).catch(() => {});
  }, [token]);

  // Apps call kanthinkData.signIn() when someone tries to save and nobody is
  // signed in, and kanthinkPay.unlock() when someone presses something that costs
  // money. The iframe cannot open a dialog on this page, so it asks.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isFromFrame(event, frameRef.current)) return;
      const type = (event.data as { type?: string })?.type;
      if (type === 'kpg_signin') { setPurpose('signin'); setShowSignIn(true); }
      if (type === 'kpg_unlock') { setPurpose('unlock'); setShowSignIn(true); }
      if (type === 'kpg_order') void startOrder((event.data as { order?: unknown }).order);
      if (type === 'kpg_order_dismiss') {
        const url = new URL(window.location.href);
        url.searchParams.delete('order');
        url.searchParams.delete('order_status');
        // Reload without the order, so the app starts fresh on the shop. Relying on
        // the app to re-render itself is how "Back to store" first did nothing: its
        // view was already the shop, so React had nothing to change.
        window.location.replace(url.toString());
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!showPurchased) return;
    const timer = setTimeout(() => setShowPurchased(false), 6000);
    return () => clearTimeout(timer);
  }, [showPurchased]);

  return (
    <div
      className="fixed inset-0 flex flex-col bg-[rgb(var(--kp-bg))]"
      style={{ ...(chrome?.theme.vars ?? {}), colorScheme: chrome?.theme.mode ?? 'light' } as React.CSSProperties}
    >
      {showPurchased && (
        <div className="flex-shrink-0 px-3 py-2 bg-[rgb(var(--kp-primary))] text-[rgb(var(--kp-primary-fg))] text-xs font-medium text-center">
          You&apos;re in. This link will open straight into the app from now on.
        </div>
      )}

      <iframe
        ref={frameRef}
        srcDoc={withSeed(srcDoc)}
        sandbox="allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads"
        allow="autoplay; clipboard-write"
        className="flex-1 w-full border-0"
        title={title}
      />

      <footer className="relative flex h-14 flex-shrink-0 items-center gap-2 border-t border-[rgb(var(--kp-border))] bg-[rgb(var(--kp-bar))] px-3 pb-[env(safe-area-inset-bottom)] text-[rgb(var(--kp-fg))]">
        <AccountButton
          token={token}
          email={customerEmail ?? null}
          canManageBilling={!!canManageBilling}
          open={accountOpen}
          onToggle={() => setAccountOpen((v) => !v)}
          onClose={() => setAccountOpen(false)}
          onSignIn={() => { setPurpose('signin'); setShowSignIn(true); }}
        />
        <div className="ml-auto">
          <AppFeedbackPanel
            token={token}
            appTitle={title}
            maker={chrome?.maker}
            initiallyOpen={openMessages}
            onRequestSignIn={() => { setPurpose('signin'); setShowSignIn(true); }}
          />
        </div>
      </footer>

      {ordering !== 'idle' && (
        <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg">
            {ordering === 'opening' ? (
              <span>Opening checkout…</span>
            ) : (
              <>
                <span>{ordering}</span>
                <button onClick={() => setOrdering('idle')} aria-label="Dismiss" className="text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showSignIn && (
        <AppSignIn
          token={token}
          appTitle={title}
          purpose={purpose}
          price={unlockPrice ?? ''}
          recurring={!!unlockRecurring}
          onClose={() => setShowSignIn(false)}
        />
      )}
    </div>
  );
}

/** Who's signed in, with sign-out and billing behind it; or Sign in. */
function AccountButton({ token, email, canManageBilling, open, onToggle, onClose, onSignIn }: {
  token: string;
  email: string | null;
  canManageBilling: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSignIn: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open, onClose]);

  if (!email) {
    return (
      <button
        onClick={onSignIn}
        className="flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-[rgb(var(--kp-fg))] transition-colors hover:bg-[rgb(var(--kp-muted))]"
      >
        <UserRound className="h-4 w-4 text-[rgb(var(--kp-muted-fg))]" />
        Sign in
      </button>
    );
  }

  const initial = email.charAt(0).toUpperCase();
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-9 min-w-0 max-w-[60vw] items-center gap-2 rounded-full pl-1 pr-3 text-[13px] transition-colors hover:bg-[rgb(var(--kp-muted))]"
      >
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[rgb(var(--kp-muted))] text-[12px] font-semibold text-[rgb(var(--kp-fg))]">{initial}</span>
        <span className="truncate text-[rgb(var(--kp-muted-fg))]">{email}</span>
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-64 overflow-hidden rounded-xl border border-[rgb(var(--kp-border))] bg-[rgb(var(--kp-card))] py-1 text-[rgb(var(--kp-fg))] shadow-xl">
          <p className="truncate px-3 py-2 text-xs text-[rgb(var(--kp-muted-fg))]">Signed in as {email}</p>
          {canManageBilling && (
            <a href={`/api/play/${token}/billing`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[rgb(var(--kp-muted))]">
              <CreditCard className="h-4 w-4 text-[rgb(var(--kp-muted-fg))]" /> Billing
            </a>
          )}
          <button
            onClick={async () => {
              await fetch(`/api/play/${token}/access`, { method: 'DELETE' }).catch(() => {});
              window.location.reload();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[rgb(var(--kp-muted))]"
          >
            <LogOut className="h-4 w-4 text-[rgb(var(--kp-muted-fg))]" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
