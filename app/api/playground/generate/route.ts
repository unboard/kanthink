import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { playgroundApps } from '@/lib/db/schema';
import { setCardProcessingServerSide } from '@/lib/shrooms/cardProcessing';
import { generatePlaygroundApp, type GenerateRequest } from '@/lib/playground/generateApp';

export const runtime = 'nodejs';
// Long generations on Gemini 2.5 Pro / 3.x Pro with high thinking budgets can
// cleanly exceed 60s. 800s is the Vercel Pro ceiling (300s is only the default),
// so this buys the most headroom the plan allows before the gateway 504s.
export const maxDuration = 800;

/**
 * Interactive playground generation.
 *
 * The generator itself lives in lib/playground/generateApp so the shroom engine can
 * call it directly — a `build` shroom and this endpoint must produce identical apps,
 * which they can't if the logic is duplicated. This route is auth plus a call.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: GenerateRequest = await request.json();

  try {
    return await generatePlaygroundApp(body, { user: { id: session.user.id } });
  } finally {
    // Clearing the card's "Building the app…" shimmer belongs here rather than in
    // the browser.
    //
    // It used to be purely client-side: the caller set the flag, then a watcher in
    // the tab cleared it when the build landed. Every one of those clears needs the
    // tab to still be there. Close it, navigate away, or let the machine sleep, and
    // the build finishes perfectly well on the server while the flag stays true in
    // the row — so the card shimmers forever, on every device, for a build that
    // ended minutes ago.
    //
    // A finally covers every way out of the call, including the early returns for a
    // missing key and anything thrown, and it runs whether or not anyone is still
    // listening. The shroom path clears its own the same way.
    await clearBuildingFlag(body?.appId);
  }
}

/** Never throws: a finished build must not be reported as failed by its indicator. */
async function clearBuildingFlag(appId: string | undefined): Promise<void> {
  if (!appId) return;
  try {
    const app = await db.query.playgroundApps.findFirst({
      where: eq(playgroundApps.id, appId),
      columns: { cardId: true, channelId: true },
    });
    if (!app?.cardId) return;
    await setCardProcessingServerSide({
      cardId: app.cardId,
      channelId: app.channelId,
      status: null,
    });
  } catch (error) {
    console.warn('[playground/generate] could not clear the building flag:', error);
  }
}
