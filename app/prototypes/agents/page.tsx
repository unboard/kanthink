import type { Metadata } from 'next';
import { bricolageStudio as bricolage } from '@/app/fonts';
import { Studio } from './studio';

/**
 * Studio — agents find, test, build and sell small apps; you make a few calls
 * each morning. Built as a daily tool, not a pitch: one decision per screen,
 * large type, and nothing you have to read before you can act.
 */

export const metadata: Metadata = {
  title: 'Studio',
  description: 'A few calls each morning; agents do the rest.',
};

export default function StudioPage() {
  return (
    <div className={bricolage.variable} style={{ fontFamily: 'var(--font-studio), system-ui, sans-serif' }}>
      <Studio />
    </div>
  );
}
