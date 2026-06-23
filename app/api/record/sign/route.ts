import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isCloudinaryConfigured, signVideoUpload } from '@/lib/cloudinary';

export const runtime = 'nodejs';

/**
 * Returns a short-lived signature so the browser can upload a recording
 * directly to Cloudinary (videos are too large to proxy through a serverless
 * function). Requires an authenticated user — recordings are owned.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'Recording storage is not configured.' }, { status: 500 });
  }

  const sig = signVideoUpload({ folder: `kanthink/recordings/${session.user.id}` });
  return NextResponse.json(sig);
}
