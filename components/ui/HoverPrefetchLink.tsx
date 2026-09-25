'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';

/**
 * A Link that prefetches when you point at it, not when it scrolls into view.
 *
 * Next prefetches every visible link by default. The channel sidebar shows every
 * channel and folder at once, so opening Kanthink fired a server render for each of
 * them in parallel — ~19 at once for a real account, a burst heavy enough to make a
 * video in another tab stutter and buffer. Prefetching on hover keeps clicks fast:
 * the pointer reaches a link a moment before the click does.
 */
export function HoverPrefetchLink({ href, onMouseEnter, onFocus, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  const prefetch = () => router.prefetch(href);
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e) => { prefetch(); onMouseEnter?.(e); }}
      onFocus={(e) => { prefetch(); onFocus?.(e); }}
      {...props}
    />
  );
}
