'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './concept-switcher.css';

/**
 * Floating switcher so the three landing page concepts can be compared without
 * hand-editing the URL. Review furniture, not part of any concept — it sits in
 * its own dark chip so it never reads as page chrome.
 */
const CONCEPTS = [
  { href: '/snailblast', label: 'Mailbox' },
  { href: '/snailblast/platform', label: 'Platform' },
  { href: '/snailblast/payback', label: 'Payback' },
];

export function ConceptSwitcher() {
  const pathname = usePathname();

  return (
    <nav className="mcs-switch" aria-label="Landing page concepts">
      <span className="mcs-switch-label">Concept</span>
      {CONCEPTS.map((c) => (
        <Link key={c.href} href={c.href} data-on={pathname === c.href}>
          {c.label}
        </Link>
      ))}
    </nav>
  );
}
