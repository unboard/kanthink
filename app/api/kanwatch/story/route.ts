import { NextResponse } from 'next/server';
import { kanwatchUser } from '@/lib/kanwatch/access';
import { storyFor } from '@/lib/kanwatch/story';

// One LLM call over the day; give it room.
export const maxDuration = 60;

/**
 * GET /api/kanwatch/story?date=YYYY-MM-DD&from=<ms>&to=<ms>[&refresh=1]
 *
 * Kan's read on the day. Fetched separately from the day itself, so the page never
 * waits on an LLM to show you your numbers.
 */
export async function GET(request: Request) {
  const userId = await kanwatchUser();
  if (!userId) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? '';
  const from = Number(url.searchParams.get('from'));
  const to = Number(url.searchParams.get('to'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return NextResponse.json({ error: 'Bad range' }, { status: 400 });
  }
  const story = await storyFor(userId, date, from, to, { refresh: url.searchParams.get('refresh') === '1' });
  return NextResponse.json({ story });
}
