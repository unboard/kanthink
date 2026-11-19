import type { Metadata, Viewport } from 'next';
import { fraunces, spectral } from '@/app/fonts';
import dynamic from 'next/dynamic';

const CatLife = dynamic(() => import('./CatLife'));

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
