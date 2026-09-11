'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { AppFeedbackPanel } from './AppFeedbackPanel';
import { X } from 'lucide-react';

interface Props {
  srcDoc: string;
  title: string;
  /** The share token, so the footer can reach this app's feedback thread. */
  token: string;
  /** Shown once after a successful purchase, then never again. */
  justPurchased?: boolean;
  /** Only true for someone on a recurring plan — there is nothing else to manage. */
  canManageBilling?: boolean;
}

/**
 * Full-viewport public playground render.
 *
 * The iframe gets the whole screen; a thin strip above it carries the Kanthink mark
 * and the one thing a published app has always been missing — a way to tell the
 * person who made it that something is wrong. The strip can be dismissed per visit,
 * which also hides the feedback button, so it is not dismissible by accident.
 */
export function PublicPlaygroundFrame({ srcDoc, title, token, justPurchased, canManageBilling }: Props) {
  const [hideFooter, setHideFooter] = useState(false);
  const [showPurchased, setShowPurchased] = useState(!!justPurchased);

  // Count the visit for whoever holds the access cookie. Best-effort and silent:
  // the app is already on screen, and a failed counter is not worth an error.
  useEffect(() => {
    void fetch(`/api/play/${token}/access`, { method: 'PATCH' }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!showPurchased) return;
    const timer = setTimeout(() => setShowPurchased(false), 6000);
    return () => clearTimeout(timer);
  }, [showPurchased]);

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      {showPurchased && (
        <div className="flex-shrink-0 px-3 py-2 bg-emerald-500 text-white text-xs font-medium text-center">
          You&apos;re in. This link will open straight into the app from now on.
        </div>
      )}

      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-modals allow-popups allow-forms"
        allow="autoplay; clipboard-write"
        className="flex-1 w-full border-0"
        title={title}
      />

      {!hideFooter && (
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-t border-neutral-200 bg-white text-xs">
          <Link href="/" className="flex items-center gap-1.5 text-neutral-600 hover:text-violet-600 transition-colors">
            <KanthinkIcon size={14} className="text-violet-500" />
            <span className="font-medium hidden sm:inline">Made with Kanthink</span>
          </Link>

          <div className="flex items-center gap-1">
            {canManageBilling && (
              <a
                href={`/api/play/${token}/billing`}
                className="px-2.5 py-1 rounded-lg text-neutral-500 hover:text-violet-600 hover:bg-violet-50 font-medium transition-colors"
              >
                Billing
              </a>
            )}
            <AppFeedbackPanel token={token} appTitle={title} />
            <button
              onClick={() => setHideFooter(true)}
              aria-label="Hide footer"
              className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
