import { Suspense } from 'react';
import { AppDirectory } from '@/components/playground/AppDirectory';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Apps · Kanthink',
  description: 'Every app you have built, across every board.',
};

/**
 * The app directory.
 *
 * Sits inside the ordinary app shell, so the rail and the panels are where they
 * always are — this is a place in Kanthink, not a separate tool.
 *
 * The Suspense boundary is required: the directory reads `?app=` to open one app
 * directly, and useSearchParams opts its subtree out of static rendering.
 */
export default function AppsPage() {
  return (
    <Suspense fallback={<div className="h-full" />}>
      <AppDirectory />
    </Suspense>
  );
}
