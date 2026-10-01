import { Suspense } from 'react';
import type { Metadata } from 'next';
import { People } from '@/components/people/People';

export const metadata: Metadata = { title: 'People · Kanthink' };

export default function PeoplePage() {
  return (
    <div className="h-full overflow-y-auto">
      <Suspense fallback={null}>
        <People />
      </Suspense>
    </div>
  );
}
