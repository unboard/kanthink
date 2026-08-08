import type { Metadata } from 'next';
import { DeadEnd } from '@/components/ui/DeadEnd';

export const metadata: Metadata = {
  title: 'No thread here · Kanthink',
};

export default function NotFound() {
  return (
    <DeadEnd
      eyebrow="404 · no thread here"
      title="This one doesn't lead anywhere."
      body="The link may be old, or the card may have been archived. Your boards are where you left them."
      actions={[{ label: 'Go to your boards', href: '/', primary: true }]}
    />
  );
}
