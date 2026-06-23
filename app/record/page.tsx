import Link from 'next/link';
import { auth } from '@/lib/auth';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import RecordStudio from '@/components/record/RecordStudio';

export const metadata = {
  title: 'Record — Kanthink',
};

export default async function RecordPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0b0b0c] text-neutral-200 p-6">
        <div className="max-w-md text-center space-y-4">
          <KanthinkIcon size={40} className="mx-auto text-emerald-400" />
          <h1 className="text-2xl font-semibold">Kan Record</h1>
          <p className="text-neutral-400">
            Record screen + webcam product demos with styled bubbles, background blur, and
            shareable links. Sign in to start recording.
          </p>
          <Link
            href="/api/auth/signin?callbackUrl=/record"
            className="inline-block rounded-lg bg-emerald-500 px-5 py-2.5 font-medium text-black hover:bg-emerald-400"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return <RecordStudio cloudinaryReady={isCloudinaryConfigured()} />;
}
