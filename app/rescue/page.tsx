import type { Metadata } from 'next';
import { baloo, nunito } from '@/app/fonts';
import Rescue from './Rescue';

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
