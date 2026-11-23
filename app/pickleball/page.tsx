import type { Metadata, Viewport } from 'next';
import dynamic from 'next/dynamic';

const Pickleball = dynamic(() => import('./Pickleball'));

export const metadata: Metadata = {
  title: 'Pickleball',
  description: 'Arcade doubles pickleball for the family: play as yourself, catch fire, pick a venue, and play on one screen or online with a room code.',
};

// a game, not a document: no pinch zoom, and draw under the notch
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#0d1a2e' };

export default function PickleballPage() {
  return <Pickleball />;
}
