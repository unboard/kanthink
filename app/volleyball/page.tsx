import type { Metadata, Viewport } from 'next';
import dynamic from 'next/dynamic';

const Volleyball = dynamic(() => import('./Volleyball'));

export const metadata: Metadata = {
  title: 'Volleyball',
  description: 'Arcade volleyball for the family: bump, set and super spike as yourself, at the beach, the park, an arena or a city rooftop, on one screen or online with a room code.',
};

// a game, not a document: no pinch zoom, and draw under the notch
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#0d1a2e' };

export default function VolleyballPage() {
  return <Volleyball />;
}
