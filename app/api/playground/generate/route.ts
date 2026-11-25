import { NextResponse, after } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { playgroundApps } from '@/lib/db/schema';
import { setCardProcessingServerSide } from '@/lib/shrooms/cardProcessing';
import { generatePlaygroundApp, type GenerateRequest } from '@/lib/playground/generateApp';
import { requirePermission, PermissionError } from '@/lib/api/permissions';
import { isBuilding } from '@/lib/playground/buildProgress';

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

  const body: GenerateRequest & { background?: boolean } = await request.json();

  if (body.background) return startInBackground(body, session.user.id);

  try {
    // Only the server says a brief came from Kan or a bot.
    return await generatePlaygroundApp({ ...body, from: undefined }, { user: { id: session.user.id } });
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

/**
 * Start a build and answer at once; the build reports on the app row.
 *
 * A build takes minutes, and holding one request open for all of it is what failed
 * on phones: the screen locks or the network changes, the connection drops, and the
 * person sees "Failed to fetch" for a build that may still be running or may have
 * failed for a reason nobody hears. Here the request only starts the build. It runs
 * on after the response (bounded by maxDuration, same as before), writes each step
 * and its ending to the app's buildProgress, and the caller polls
 * /api/playground/status/{appId} for it, from any tab, as often as it likes.
 */
async function startInBackground(body: GenerateRequest, userId: string): Promise<NextResponse> {
  if (!body.appId || !body.prompt?.trim()) {
    return NextResponse.json({ error: 'appId and prompt are required' }, { status: 400 });
  }
  const app = await db.query.playgroundApps.findFirst({
    where: eq(playgroundApps.id, body.appId),
    columns: { id: true, channelId: true, generationCount: true, buildProgress: true },
  });
  if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 });
  // Checked here as well as in the generator: a build that fails on permission in
  // the background would otherwise be told only to a row the caller can't change.
  try {
    await requirePermission(app.channelId, userId, 'edit');
  } catch (error) {
    if (error instanceof PermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
  if (isBuilding(app.buildProgress)) {
    return NextResponse.json({ error: 'This app is already being changed. Wait for that to finish.' }, { status: 409 });
  }

  // Marked as started before answering, so the first poll can't read the previous
  // build's ending as this one's.
  const startedAt = Date.now();
  await db.update(playgroundApps)
    .set({ buildProgress: { startedAt, steps: [{ label: 'Starting', status: 'running', at: startedAt }] } })
    .where(eq(playgroundApps.id, app.id));

  after(async () => {
    try {
      await generatePlaygroundApp({ ...body, from: undefined }, { user: { id: userId } });
    } catch (error) {
      console.error('[playground/generate] background build threw:', error);
    } finally {
      await clearBuildingFlag(body.appId);
    }
  });

  return NextResponse.json({ started: true, since: app.generationCount ?? 0, startedAt }, { status: 202 });
}
