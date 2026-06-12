import type { Metadata } from 'next';
import { Fraunces, Spectral } from 'next/font/google';
import Wildwood from './Wildwood';

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
  title: 'Wildwood — a valley of birdsong & still water',
  description:
    'An explorable nature valley: watch and listen for birds, identify their songs, find nests, attract new species, and fish the lake and river.',
};

export default function WildwoodPage() {
  return (
    <div className={`${fraunces.variable} ${spectral.variable}`}>
      <Wildwood />
    </div>
  );
}
