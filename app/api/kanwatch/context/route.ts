import { NextResponse } from 'next/server';
import { kanwatchUser } from '@/lib/kanwatch/access';
import { buildKanwatchContext } from '@/lib/kanwatch/context';

/**
 * GET /api/kanwatch/context?tz=<getTimezoneOffset()>
 *
 * The Kanwatch block for voice mode's system prompt, which is assembled in the
 * browser. Empty for anyone without Kanwatch, or with nothing recorded this week.
 */
export async function GET(request: Request) {
  const userId = await kanwatchUser();
  if (!userId) return NextResponse.json({ context: '' });
  const tz = Number(new URL(request.url).searchParams.get('tz'));
  const context = await buildKanwatchContext(userId, {
    tzOffsetMinutes: Number.isFinite(tz) ? tz : null,
    lookup: 'the kanwatch_lookup tool',
    build: 'the kanwatch_build_app tool',
  });
  return NextResponse.json({ context });
}
