import type { Metadata, Viewport } from 'next';
import { Baloo_2 } from 'next/font/google';
import dynamic from 'next/dynamic';

const SnowPath = dynamic(() => import('./SnowPath'));

const baloo = Baloo_2({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Snowpath — clear the way',
  description:
    'A cozy snow-clearing game: drive the plow, push the snow blower, and get every family through the storm on time. Snowball fights encouraged.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function SnowPathPage() {
  return (
    <div className={baloo.className}>
      <SnowPath />
    </div>
  );
}
