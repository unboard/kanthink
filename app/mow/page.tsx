import type { Metadata, Viewport } from 'next';
import { Anton, Inter } from 'next/font/google';
import dynamic from 'next/dynamic';

const Mow = dynamic(() => import('./Mow'));

const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--font-anton' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Clean Cut — a lawn care game',
  description: 'Ride the mower, lay down perfect stripes, trim every edge, and make as much money as you can before sundown.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function MowPage() {
  return (
    <div className={`${anton.variable} ${inter.variable}`}>
      <Mow />
    </div>
  );
}
