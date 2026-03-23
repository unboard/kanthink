import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { contentPages } from '@/lib/db/schema';
import { ensureSchema } from '@/lib/db/ensure-schema';

export async function POST(request: Request) {
  try {
    await ensureSchema();

    const { channelId, channelName, title, description, type, html } = await request.json();

    if (!html) {
      return NextResponse.json({ error: 'Missing html content' }, { status: 400 });
    }

    const token = nanoid(12);

    await db.insert(contentPages).values({
      channelId: channelId || null,
      token,
      title: title || 'Untitled',
      description: description || null,
      channelName: channelName || null,
      type: type || null,
      htmlContent: html,
    });

    const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.kanthink.com'}/p/${token}`;

    return NextResponse.json({ url, token });
  } catch (error: any) {
    console.error('[Actions/Publish] Error:', error);
    return NextResponse.json({ error: error.message || 'Publish failed' }, { status: 500 });
  }
}
