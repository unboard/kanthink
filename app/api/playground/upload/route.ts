import { NextResponse } from 'next/server';
import { uploadImageToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB — matches Vercel body limit
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Image upload endpoint used by playground apps running inside the sandboxed iframe.
 * Unlike /api/upload-image, this route allows cross-origin requests (so the iframe's
 * opaque origin can call it) and does not require an authenticated session — the
 * iframe has no cookies. Files are uploaded to a separate Cloudinary folder so we
 * can monitor / clean up if abuse appears.
 */
export async function POST(request: Request) {
  if (!isCloudinaryConfigured()) {
    return cors(NextResponse.json(
      { error: 'Image upload is not configured.' },
      { status: 500 }
    ));
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return cors(NextResponse.json({ error: 'No file provided' }, { status: 400 }));
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return cors(NextResponse.json(
      { error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' },
      { status: 400 }
    ));
  }
  if (file.size > MAX_FILE_SIZE) {
    return cors(NextResponse.json(
      { error: `File too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
      { status: 413 }
    ));
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    // Use a dedicated folder so playground uploads are auditable / scrubbable.
    // We pass a synthetic "cardId" to make the folder; the helper keys off that.
    const result = await uploadImageToCloudinary(buffer, { cardId: 'playground-public' });
    return cors(NextResponse.json({
      url: result.url,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return cors(NextResponse.json({ error: msg }, { status: 500 }));
  }
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

/** Tag a response with permissive CORS so the sandboxed playground iframe can call us. */
function cors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  res.headers.set('Access-Control-Max-Age', '86400');
  return res;
}
