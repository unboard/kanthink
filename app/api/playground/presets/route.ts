import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { playgroundPresets } from '@/lib/db/schema';
import { eq, or, asc, desc } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { resolveDeps, MAX_RUNTIME_DEPS } from '@/lib/playground/runtime';
import { BUILTIN_PRESETS } from '@/lib/playground/builtinPresets';

export const runtime = 'nodejs';

/** Shared validation for create + update. Returns an error string, or null when clean. */
function validatePreset(body: {
  name?: string;
  designProfile?: string;
  recipe?: string;
  deps?: string[];
}): string | null {
  if (body.name !== undefined && !body.name.trim()) return 'Name is required';
  if (body.name && body.name.length > 120) return 'Name is too long (120 characters max)';
  if (body.recipe && body.recipe.length > 8000) return 'Recipe is too long (8000 characters max)';
  if (body.designProfile && body.designProfile.length > 8000) {
    return 'Design profile is too long (8000 characters max)';
  }
  if (body.deps) {
    if (!Array.isArray(body.deps)) return 'Dependencies must be a list';
    if (body.deps.length > MAX_RUNTIME_DEPS) {
      return `Too many dependencies (${MAX_RUNTIME_DEPS} max)`;
    }
    // Reject at save time rather than silently dropping at generation time — a preset
    // that quietly loses a library is far more confusing than one that won't save.
    const { rejected } = resolveDeps(body.deps);
    if (rejected.length > 0) {
      return `Invalid dependency "${rejected[0].raw}": ${rejected[0].reason}`;
    }
  }
  return null;
}

/** List presets available to the caller: their own, plus global ones. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await ensureSchema();

  const saved = await db.query.playgroundPresets.findMany({
    where: or(
      eq(playgroundPresets.userId, session.user.id),
      eq(playgroundPresets.scope, 'global')
    ),
    orderBy: [asc(playgroundPresets.sortOrder), desc(playgroundPresets.createdAt)],
  });

  // Built-ins first — they're the ones that work with no setup, and a new user has
  // nothing else. A user's own presets sort below and can be reordered.
  const builtins = BUILTIN_PRESETS.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    icon: p.icon,
    recipe: p.recipe ?? null,
    designProfile: p.designProfile ?? null,
    runtime: p.runtime ?? null,
    scope: 'builtin' as const,
    readOnly: true,
  }));

  return NextResponse.json({ presets: [...builtins, ...saved] });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await ensureSchema();

  const body = await request.json();
  const error = validatePreset(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  // A preset with none of the three slots filled does nothing — reject it rather than
  // let someone create an empty row and wonder why running it changes nothing.
  if (!body.recipe?.trim() && !body.designProfile?.trim() && !body.deps?.length) {
    return NextResponse.json(
      { error: 'A preset needs at least one of: recipe, design profile, or dependencies' },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(playgroundPresets)
    .values({
      userId: session.user.id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      icon: body.icon?.trim() || null,
      designProfile: body.designProfile?.trim() || null,
      recipe: body.recipe?.trim() || null,
      runtime: body.deps?.length ? { deps: body.deps } : null,
      scope: 'user',
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
    })
    .returning();

  return NextResponse.json({ preset: created });
}
