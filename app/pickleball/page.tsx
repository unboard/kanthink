import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

const Pickleball = dynamic(() => import('./Pickleball'));

export const metadata: Metadata = {
  title: 'Pickleball',
  description: 'Arcade doubles pickleball for the family: play as yourself, catch fire, and play on one computer or online with a room code.',
};

export default function PickleballPage() {
  return <Pickleball />;
}
