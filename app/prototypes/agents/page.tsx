import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import { Studio } from './studio';

/**
 * Studio — agents find, test, build and sell small apps; you make a few calls
 * each morning. Built as a daily tool, not a pitch: one decision per screen,
 * large type, and nothing you have to read before you can act.
 */

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-studio',
});

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
