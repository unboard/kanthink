import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import React from 'react';
import { render } from '@react-email/render';
import { VoiceComposed } from '@/lib/emails/VoiceComposed';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { subject, body, style, recipientName, cardTitle, cardId, ctaText, ctaUrl } = await request.json();
  const senderName = session.user.name || 'Kanthink User';
  const baseUrl = process.env.NEXTAUTH_URL || 'https://kanthink.com';
  const cardUrl = cardId ? `${baseUrl}/channel/unknown/card/${cardId}` : undefined;

  const html = await render(React.createElement(VoiceComposed, {
    style: (style || 'professional') as 'professional' | 'casual' | 'newsletter' | 'update',
    senderName,
    recipientName: recipientName || undefined,
    subject,
    body,
    cardTitle: cardTitle || undefined,
    cardUrl,
    ctaText: ctaText || undefined,
    ctaUrl: ctaUrl || undefined,
  }));

  return NextResponse.json({ html });
}
