import type { Metadata } from 'next';
import { Baloo_2, Nunito } from 'next/font/google';
import Rescue from './Rescue';

const baloo = Baloo_2({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-baloo',
});

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-nunito',
});

export const metadata: Metadata = {
  title: 'Paws & Found — Animal Rescue Adventures',
  description:
    'Hear the story, follow the clues, and bring lost animals home. A cozy rescue adventure for two brave rescuers.',
};

export default function RescuePage() {
  return (
    <div className={`${baloo.variable} ${nunito.variable}`}>
      <Rescue />
    </div>
  );
}
