'use client';

import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { UpgradeButton } from '@/components/settings/UpgradeButton';

/**
 * Under your latest message when you didn't address it to Kan: one tap sends it to
 * him, as if you had. See lib/chat/askKan.ts for when it shows.
 */
export function AskKanChip({ onAsk, disabled }: { onAsk: () => void; disabled?: boolean }) {
  return (
    <div className="flex justify-end -mt-1">
      <button
        onClick={onAsk}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
      >
        <KanthinkIcon size={13} />
        Ask Kan
      </button>
    </div>
  );
}

/**
 * Where Kan's reply would have been, when this month's included requests are used up.
 * The one place an upgrade is offered in a thread: at the moment it would have helped.
 */
export function UsageLimitNotice({
  message,
  tier,
  onDismiss,
}: {
  message: string;
  tier?: 'free' | 'premium';
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-800/60 dark:bg-violet-950/30">
      <div className="flex items-start gap-2">
        <KanthinkIcon size={16} className="mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-violet-800 dark:text-violet-200">{message}</p>
          <div className="mt-2 flex items-center gap-3">
            {tier !== 'premium' && <UpgradeButton size="sm" />}
            <button onClick={onDismiss} className="text-xs text-violet-600 underline dark:text-violet-400">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
