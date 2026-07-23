import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { marketingAssets } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { seedMcsAssets } from '@/lib/calendar/seed-mcs';
import { toAsset } from '@/lib/calendar/serialize';
import type { NewDbMarketingAsset } from '@/lib/db/schema';

export const runtime = 'nodejs';

function slug(v: string | null): string {
  return (v || '').trim().toLowerCase();
}

// GET /api/calendar/assets?business=mycreativeshop
export async function GET(req: Request) {
  await ensureSchema();
  const business = slug(new URL(req.url).searchParams.get('business'));
  if (!business) return NextResponse.json({ error: 'business is required' }, { status: 400 });

  await seedMcsAssets(business);

  const rows = await db
    .select()
    .from(marketingAssets)
    .where(eq(marketingAssets.business, business))
    .orderBy(asc(marketingAssets.kind), asc(marketingAssets.position));

  return NextResponse.json({ assets: rows.map(toAsset) });
}

// POST /api/calendar/assets — create or update one asset. Body: { business, asset }
export async function POST(req: Request) {
  await ensureSchema();
  const body = await req.json().catch(() => null);
  const business = slug(body?.business);
  const asset = body?.asset;
  if (!business || !asset || typeof asset !== 'object') {
    return NextResponse.json({ error: 'business and asset are required' }, { status: 400 });
  }

  const now = new Date();
  const patch: Partial<NewDbMarketingAsset> = {};
  if (typeof asset.kind === 'string') patch.kind = asset.kind;
  if (typeof asset.name === 'string') patch.name = asset.name;
  if (typeof asset.description === 'string') patch.description = asset.description;
  if (typeof asset.url === 'string') patch.url = asset.url;
  if (Array.isArray(asset.tags)) patch.tags = asset.tags.map(String);
  if (typeof asset.notes === 'string') patch.notes = asset.notes;
  if (typeof asset.position === 'number') patch.position = asset.position;

  if (asset.id) {
    await db
      .update(marketingAssets)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(marketingAssets.id, asset.id), eq(marketingAssets.business, business)));
    const [row] = await db
      .select()
      .from(marketingAssets)
      .where(and(eq(marketingAssets.id, asset.id), eq(marketingAssets.business, business)))
      .limit(1);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ asset: toAsset(row) });
  }

  if (!patch.name || !patch.kind) {
    return NextResponse.json({ error: 'name and kind are required' }, { status: 400 });
  }
  const [row] = await db
    .insert(marketingAssets)
    .values({ business, ...patch, createdAt: now, updatedAt: now } as NewDbMarketingAsset)
    .returning();
  return NextResponse.json({ asset: toAsset(row) });
}

// DELETE /api/calendar/assets?business=...&id=...
export async function DELETE(req: Request) {
  await ensureSchema();
  const params = new URL(req.url).searchParams;
  const business = slug(params.get('business'));
  const id = params.get('id');
  if (!business || !id) return NextResponse.json({ error: 'business and id are required' }, { status: 400 });
  await db
    .delete(marketingAssets)
    .where(and(eq(marketingAssets.id, id), eq(marketingAssets.business, business)));
  return NextResponse.json({ ok: true });
}
