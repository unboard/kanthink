import { db } from '@/lib/db';
import { cards } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getChannelPermission } from '@/lib/api/permissions';
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc';
import { signCardToken } from '@/lib/playground/cardToken';
import { resolveDeps } from '@/lib/playground/runtime';
import { PreviewPlaygroundFrame } from './PreviewPlaygroundFrame';
import type { Metadata } from 'next';

/**
 * Owner-only full-viewport preview of a playground, published or not.
 *
 * This exists because the old in-page fullscreen toggle rendered `position: fixed`
 * inside the card drawer. Any transformed ancestor makes a fixed element resolve
 * against that ancestor instead of the viewport, so "fullscreen" was clipped to the
 * drawer and unusable. A real page in a new tab has no container to escape.
 *
 * Unlike /play/{token} this does NOT require the card to be public — it's gated on
 * channel permission instead, so you can try a playground before deciding to publish.
 */

interface PageProps {
  params: Promise<{ cardId: string }>;
}

interface PlaygroundTypeData {
  code?: string;
  codeTitle?: string;
  codeSummary?: string;
  cardToken?: string;
  dependencies?: string[];
}

export const dynamic = 'force-dynamic';

// A private preview should never be indexed or previewed by a link unfurler.
export const metadata: Metadata = {
  title: 'Playground preview',
  robots: { index: false, follow: false },
};

export default async function PlaygroundPreviewPage({ params }: PageProps) {
  const { cardId } = await params;

  const session = await auth();
  if (!session?.user?.id) notFound();

  const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
  if (!card || card.cardType !== 'playground') notFound();

  // Viewing the preview requires the same access as viewing the card it lives on.
  const permission = await getChannelPermission(
    card.channelId,
    session.user.id,
    session.user.email
  );
  if (!permission) notFound();

  const typeData = (card.typeData as PlaygroundTypeData | null) || {};
  if (!typeData.code) notFound();

  const title = typeData.codeTitle || card.title || 'Kanthink Playground';

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : '';

  const srcDoc = buildPlaygroundDoc(typeData.code, {
    title,
    uploadUrl: `${origin}/api/playground/upload`,
    aiUrl: `${origin}/api/playground/ai`,
    saveUrl: `${origin}/api/playground/save`,
    cardToken: typeData.cardToken || signCardToken(card.id),
    deps: resolveDeps(typeData.dependencies || []).deps,
  });

  return <PreviewPlaygroundFrame srcDoc={srcDoc} title={title} isPublished={!!card.isPublic} />;
}
