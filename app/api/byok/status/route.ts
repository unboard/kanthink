import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { userOwnedProviders } from '@/lib/ai/keys';
import { getModelPreferences } from '@/lib/ai/modelPreferences';
import { parseModelChoice } from '@/lib/ai/modelCatalog';
import { ensureSchema } from '@/lib/db/ensure-schema';

/**
 * Whether this account brings its own key, and which model it defaults to.
 *
 * Kept at its original path and shape because the settings store polls it on load
 * and several client hooks read what it sets. The answer now comes from the
 * per-provider keys rather than the single-key columns, so an account with two keys
 * reports the provider its *default model* belongs to — which is the one that
 * actually decides what runs.
 *
 * Writing keys lives at /api/ai-config. This is read-only.
 */
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSchema();
    const [owned, preferences] = await Promise.all([
      userOwnedProviders(userId),
      getModelPreferences(userId),
    ]);

    if (owned.length === 0) {
      return NextResponse.json({ configured: false });
    }

    const choice = parseModelChoice(preferences.default);
    // Fall back to whichever key they do hold, so the reported provider is always
    // one they can actually call.
    const provider = choice && owned.includes(choice.provider) ? choice.provider : owned[0];

    return NextResponse.json({
      configured: true,
      provider,
      model: choice?.provider === provider ? choice.model : null,
      /** Every provider with a key, for callers that care about more than one. */
      providers: owned,
    });
  } catch (error) {
    console.error('BYOK status error:', error);
    return NextResponse.json({ error: 'Failed to get BYOK status' }, { status: 500 });
  }
}
