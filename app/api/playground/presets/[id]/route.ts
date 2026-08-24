import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { playgroundPresets } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { resolveDeps, MAX_RUNTIME_DEPS } from '@/lib/playground/runtime';
import { isBuiltinPresetId } from '@/lib/playground/builtinPresets';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Load a preset the caller is allowed to MODIFY.
 *
 * Deliberately stricter than the read path: global presets are readable by everyone
 * but editable only by their owner, so this matches on userId alone.
 */
async function loadOwned(id: string, userId: string) {
  return db.query.playgroundPresets.findFirst({
    where: and(eq(playgroundPresets.id, id), eq(playgroundPresets.userId, userId)),
  });
}

/** Built-ins ship in code and belong to nobody, so they can't be edited or deleted. */
function builtinGuard(id: string) {
  return isBuiltinPresetId(id)
    ? NextResponse.json(
        { error: 'Built-in presets can\'t be changed. Create your own to customise it.' },
        { status: 403 }
      )
    : null;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await ensureSchema();

  const { id } = await params;
  const blocked = builtinGuard(id);
  if (blocked) return blocked;

  const existing = await loadOwned(id, session.user.id);
  if (!existing) return NextResponse.json({ error: 'Preset not found' }, { status: 404 });

  const body = await request.json();

  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (body.recipe && body.recipe.length > 8000) {
    return NextResponse.json({ error: 'Recipe is too long (8000 characters max)' }, { status: 400 });
  }
  if (body.designProfile && body.designProfile.length > 8000) {
    return NextResponse.json({ error: 'Design profile is too long (8000 characters max)' }, { status: 400 });
  }
  if (body.deps !== undefined) {
    if (!Array.isArray(body.deps)) {
      return NextResponse.json({ error: 'Dependencies must be a list' }, { status: 400 });
    }
    if (body.deps.length > MAX_RUNTIME_DEPS) {
      return NextResponse.json({ error: `Too many dependencies (${MAX_RUNTIME_DEPS} max)` }, { status: 400 });
    }
    const { rejected } = resolveDeps(body.deps);
    if (rejected.length > 0) {
      return NextResponse.json(
        { error: `Invalid dependency "${rejected[0].raw}": ${rejected[0].reason}` },
        { status: 400 }
      );
    }
  }

  // Only touch fields the caller actually sent, so a partial update can't blank a slot.
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.icon !== undefined) updates.icon = body.icon?.trim() || null;
  if (body.designProfile !== undefined) updates.designProfile = body.designProfile?.trim() || null;
  if (body.recipe !== undefined) updates.recipe = body.recipe?.trim() || null;
  if (body.deps !== undefined) updates.runtime = body.deps.length ? { deps: body.deps } : null;
  if (typeof body.sortOrder === 'number') updates.sortOrder = body.sortOrder;

  const [updated] = await db
    .update(playgroundPresets)
    .set(updates)
    .where(eq(playgroundPresets.id, id))
    .returning();

  return NextResponse.json({ preset: updated });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await ensureSchema();

  const { id } = await params;
  const blocked = builtinGuard(id);
  if (blocked) return blocked;

  const existing = await loadOwned(id, session.user.id);
  if (!existing) return NextResponse.json({ error: 'Preset not found' }, { status: 404 });

  await db.delete(playgroundPresets).where(eq(playgroundPresets.id, id));

  // Playgrounds keep their own copy of the declarations in typeData, so deleting a
  // preset never breaks an app that was already generated with it.
  return NextResponse.json({ success: true });
}
