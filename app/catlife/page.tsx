import type { Metadata, Viewport } from 'next';
import { Fraunces, Spectral } from 'next/font/google';
import dynamic from 'next/dynamic';

const CatLife = dynamic(() => import('./CatLife'));

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-fraunces',
});

const spectral = Spectral({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-spectral',
});

export const metadata: Metadata = {
  title: 'Whisker Wilds — a cat clan adventure',
  description:
    'Explore a wild island as a cat: run, sneak, climb, swim, and dig for yarn. Win challenges, recruit cats, duel rival clans, and build your camp.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function CatLifePage() {
  return (
    <div className={`${fraunces.variable} ${spectral.variable}`}>
      <CatLife />
    </div>
  );
}
