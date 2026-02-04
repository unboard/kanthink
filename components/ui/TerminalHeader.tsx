'use client';

// Terminal theme disabled - these components are stubs that return null
// Will be re-enabled when terminal theme is added back

interface TerminalHeaderProps {
  title?: string;
  onClose?: () => void;
  className?: string;
}

/**
 * A terminal-style header with Mac traffic light buttons.
 * Currently disabled - terminal theme not available.
 */
export function TerminalHeader(_props: TerminalHeaderProps) {
  return null;
}

/**
 * Just the traffic light dots, no container.
 * Currently disabled - terminal theme not available.
 */
export function TrafficLights(_props: { className?: string }) {
  return null;
}
