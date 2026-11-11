import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

const Pickleball = dynamic(() => import('./Pickleball'));

export const metadata: Metadata = {
  title: 'Pickleball — singles',
  description: 'Two-player singles pickleball in the browser. Practice against a bot or play a friend with a room code.',
};

export default function PickleballPage() {
  return <Pickleball />;
}
