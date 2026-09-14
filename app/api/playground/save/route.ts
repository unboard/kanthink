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

  const claims = verifyAppToken(body.appToken);
  if (!claims) {
    return cors(NextResponse.json({ error: 'Invalid or missing appToken' }, { status: 401 }));
  }
  const { appId, isDraft } = claims;
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

  // A draft preview and the live app run the same generated code against the same
  // helper, so they must not share a place to write. Trying out a save while
  // iterating would otherwise land in — and eventually evict — what real customers
  // had stored.
  const liveRecords = Array.isArray(app.savedRecords) ? app.savedRecords : [];
  const draftRecords = Array.isArray(app.draftSavedRecords) ? app.draftSavedRecords : [];
  const existing = isDraft ? draftRecords : liveRecords;

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

  const updates: Record<string, unknown> = {
    [isDraft ? 'draftSavedRecords' : 'savedRecords']: updated,
    updatedAt: new Date(),
  };

  // Auto-publish: a saved record without a public URL is useless, so a live save
  // shares the app and mints a token. That is the moment of intent — someone using
  // the app deliberately made a thing to share.
  //
  // A draft save is not that moment. Somebody trying a feature in preview has not
  // decided to publish anything, and flipping the app public from a preview is
  // exactly the kind of live change a draft is supposed to be incapable of.
  let shareToken = app.shareToken;
  if (!isDraft) {
    if (!app.isPublic) updates.isPublic = true;
    if (!shareToken) {
      shareToken = nanoid(16);
      updates.shareToken = shareToken;
    }
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
