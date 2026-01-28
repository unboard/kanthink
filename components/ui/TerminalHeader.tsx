'use client';

import { useSettingsStore } from '@/lib/settingsStore';

interface TerminalHeaderProps {
  title?: string;
  onClose?: () => void;
  className?: string;
}

/**
 * A terminal-style header with Mac traffic light buttons.
 * Only renders decorative traffic lights when theme is "terminal".
 * When theme is "default", renders nothing (returns null).
 */
export function TerminalHeader({ title, onClose, className = '' }: TerminalHeaderProps) {
  const theme = useSettingsStore((s) => s.theme);

  if (theme !== 'terminal') {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 px-4 py-3 border-b border-neutral-800 ${className}`}>
      <div className="flex gap-1.5">
        {onClose ? (
          <button
            onClick={onClose}
            className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors"
            aria-label="Close"
          />
        ) : (
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
        )}
        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
        <div className="w-3 h-3 rounded-full bg-green-500/80" />
      </div>
      {title && (
        <span className="ml-2 text-xs text-neutral-500 font-mono">{title}</span>
      )}
    </div>
  );
}

/**
 * Just the traffic light dots, no container.
 * Useful for inline decorations.
 */
export function TrafficLights({ className = '' }: { className?: string }) {
  const theme = useSettingsStore((s) => s.theme);

  if (theme !== 'terminal') {
    return null;
  }

  return (
    <div className={`flex gap-1.5 ${className}`}>
      <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
      <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
    </div>
  );
}
