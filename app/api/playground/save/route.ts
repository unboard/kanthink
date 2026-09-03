import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playgroundApps } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { verifyAppToken } from '@/lib/playground/appToken';
import {
  newRecordSlug,
  MAX_RECORD_BYTES,
  MAX_RECORDS_PER_APP,
  type SavedRecord,
} from '@/lib/playground/savedRecord';

export const runtime = 'nodejs';

interface SaveRequest {
  appToken: string;
  data: unknown;
  label?: string;
}

/**
 * POST /api/playground/save
 *
 * Iframe-callable endpoint. Authenticated by the appToken HMAC baked into
 * the playground srcdoc (same pattern as /ai and /upload). Persists an
 * arbitrary JSON record under the app and returns a shareable per-record URL.
 *
 * Auto-publishes the app on first save so the returned URL works immediately.
 * If the app already has a shareToken we reuse it; otherwise we mint one.
 */
export async function POST(request: Request) {
  let body: SaveRequest;
  try {
    body = await request.json();
  } catch {
    return cors(NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }));
  }

  const appId = verifyAppToken(body.appToken);
  if (!appId) {
    return cors(NextResponse.json({ error: 'Invalid or missing appToken' }, { status: 401 }));
  }
  if (body.data === undefined || body.data === null) {
    return cors(NextResponse.json({ error: 'data is required' }, { status: 400 }));
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(body.data);
  } catch {
    return cors(NextResponse.json({ error: 'data must be JSON-serializable' }, { status: 400 }));
  }
  if (serialized.length > MAX_RECORD_BYTES) {
    return cors(NextResponse.json(
      {
        error: `Record too large: ${serialized.length} bytes (max ${MAX_RECORD_BYTES}). ` +
          `For large media, upload via window.kanthinkUpload and save the returned URL instead of inline bytes.`,
      },
      { status: 413 }
    ));
  }

  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) });
  if (!app) {
    return cors(NextResponse.json({ error: 'App not found' }, { status: 404 }));
  }

  const existing = Array.isArray(app.savedRecords) ? app.savedRecords : [];

  const record: SavedRecord = {
    slug: newRecordSlug(),
    data: body.data,
    label:
      typeof body.label === 'string' && body.label.trim().length > 0
        ? body.label.trim().slice(0, 200)
        : undefined,
    createdAt: Math.floor(Date.now() / 1000),
  };

  const updated = [...existing, record];
  while (updated.length > MAX_RECORDS_PER_APP) updated.shift();

  // Auto-publish: a saved record without a public URL is useless. If the app
  // wasn't shared yet, share it now and mint a token. This is the moment of
  // intent — the user (via the generated app) is explicitly creating a thing
  // to share.
  const updates: Record<string, unknown> = {
    savedRecords: updated,
    updatedAt: new Date(),
  };
  let shareToken = app.shareToken;
  if (!app.isPublic) updates.isPublic = true;
  if (!shareToken) {
    shareToken = nanoid(16);
    updates.shareToken = shareToken;
  }

  await db.update(playgroundApps).set(updates).where(eq(playgroundApps.id, appId));

  return cors(NextResponse.json({
    slug: record.slug,
    shareToken,
    url: `/play/${shareToken}/r/${record.slug}`,
  }));
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

function cors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  res.headers.set('Access-Control-Max-Age', '86400');
  return res;
}
