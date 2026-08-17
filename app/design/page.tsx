import Link from 'next/link';
import { auth } from '@/lib/auth';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { DesignStudio } from '@/components/design/DesignStudio';
import { POSTCARD_9X6 } from '@/lib/design/products';

export default async function DesignPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#17171a] p-6 text-neutral-200">
        <div className="max-w-md space-y-4 text-center">
          <KanthinkIcon size={40} className="mx-auto text-emerald-400" />
          <h1 className="text-2xl font-semibold">Design</h1>
          <p className="text-neutral-400">
            Describe a postcard, drop in your logo, and get print-ready artwork back — front and
            back, designed to match. Sign in to start.
          </p>
          <Link
            href="/api/auth/signin?callbackUrl=/design"
            className="inline-block rounded-lg bg-emerald-500 px-5 py-2.5 font-medium text-black hover:bg-emerald-400"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return <DesignStudio productId={POSTCARD_9X6.id} />;
}
