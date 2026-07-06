import Link from 'next/link';
import { auth } from '@/lib/auth';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import RecordGallery from '@/components/record/RecordGallery';

export const metadata = {
  title: 'Recordings — Kanthink',
};

export default async function GalleryPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0b0b0c] text-neutral-200 p-6">
        <div className="max-w-md text-center space-y-4">
          <KanthinkIcon size={40} className="mx-auto text-emerald-400" />
          <h1 className="text-2xl font-semibold">Your recordings</h1>
          <p className="text-neutral-400">Sign in to view your recorded videos.</p>
          <Link
            href="/api/auth/signin?callbackUrl=/record/gallery"
            className="inline-block rounded-lg bg-emerald-500 px-5 py-2.5 font-medium text-black hover:bg-emerald-400"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return <RecordGallery />;
}
