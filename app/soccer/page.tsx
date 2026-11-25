import type { Metadata, Viewport } from 'next';
import dynamic from 'next/dynamic';

const Soccer = dynamic(() => import('./Soccer'));

export const metadata: Metadata = {
  title: 'Soccer',
  description: 'Arcade soccer for the family: two goals, a walled pitch the ball bounces off, and your own players, on one screen or online with a room code.',
};

// a game, not a document: no pinch zoom, and draw under the notch
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#0d1a2e' };

export default function SoccerPage() {
  return <Soccer />;
}
