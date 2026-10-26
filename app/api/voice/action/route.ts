import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runVoiceAction, type ActionRequest } from '@/lib/voice/runAction';

export const runtime = 'nodejs';
// Mixpanel exports normally take ~1s but can stall; the default ceiling cut those
// requests off mid-flight, leaving the caller hanging with no response at all.
// App builds (build_app, kanwatch_build_app) run for minutes — the latter after the
// response — and a function is frozen at this ceiling, so it matches the build route.
export const maxDuration = 800;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body: ActionRequest = await request.json();
  return runVoiceAction({ id: session.user.id, isAdmin: session.user.isAdmin, name: session.user.name }, body);
}
