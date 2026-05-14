import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cards } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { verifyCardToken } from '@/lib/playground/cardToken';
import {
  newRecordSlug,
  MAX_RECORD_BYTES,
  MAX_RECORDS_PER_CARD,
  type SavedRecord,
} from '@/lib/playground/savedRecord';

export const runtime = 'nodejs';

interface SaveRequest {
  cardToken: string;
  data: unknown;
  label?: string;
}

interface PlaygroundTypeData {
  savedRecords?: SavedRecord[];
  [key: string]: unknown;
}

/**
 * POST /api/playground/save
 *
 * Iframe-callable endpoint. Authenticated by the cardToken HMAC baked into
 * the playground srcdoc (same pattern as /ai and /upload). Persists an
 * arbitrary JSON record under the card and returns a shareable per-record URL.
 *
 * Auto-publishes the card on first save so the returned URL works immediately.
 * If the card already has a shareToken we reuse it; otherwise we mint one.
 */
export async function POST(request: Request) {
  let body: SaveRequest;
  try {
    body = await request.json();
  } catch {
    return cors(NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }));
  }

  const cardId = verifyCardToken(body.cardToken);
  if (!cardId) {
    return cors(NextResponse.json({ error: 'Invalid or missing cardToken' }, { status: 401 }));
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

  const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
  if (!card || card.cardType !== 'playground') {
    return cors(NextResponse.json({ error: 'Card not found' }, { status: 404 }));
  }

  const typeData = (card.typeData as PlaygroundTypeData | null) || {};
  const existing = Array.isArray(typeData.savedRecords) ? typeData.savedRecords : [];

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
  while (updated.length > MAX_RECORDS_PER_CARD) updated.shift();

  // Auto-publish: a saved record without a public URL is useless. If the card
  // wasn't shared yet, share it now and mint a token. This is the moment of
  // intent — the user (via the generated app) is explicitly creating a thing
  // to share.
  const updates: Record<string, unknown> = {
    typeData: { ...typeData, savedRecords: updated },
    updatedAt: new Date(),
  };
  let shareToken = card.shareToken;
  if (!card.isPublic) updates.isPublic = true;
  if (!shareToken) {
    shareToken = nanoid(16);
    updates.shareToken = shareToken;
  }

  await db.update(cards).set(updates).where(eq(cards.id, cardId));

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
