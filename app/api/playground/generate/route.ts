import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
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
  return generatePlaygroundApp(body, { user: { id: session.user.id } });
}
