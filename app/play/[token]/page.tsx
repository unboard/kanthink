import { db } from '@/lib/db';
import { cards } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc';
import { PublicPlaygroundFrame } from './PublicPlaygroundFrame';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ token: string }>;
}

interface PlaygroundTypeData {
  code?: string;
  codeTitle?: string;
  codeSummary?: string;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const card = await db.query.cards.findFirst({
    where: and(eq(cards.shareToken, token), eq(cards.isPublic, true)),
  });
  const typeData = (card?.typeData as PlaygroundTypeData | null) || {};
  const title = typeData.codeTitle || card?.title || 'Kanthink Playground';
  const summary = typeData.codeSummary || card?.summary || 'A mini app built on Kanthink.';
  return {
    title: `${title} · Kanthink`,
    description: summary,
    openGraph: { title, description: summary },
  };
}

export default async function PlayPage({ params }: PageProps) {
  const { token } = await params;

  const card = await db.query.cards.findFirst({
    where: and(eq(cards.shareToken, token), eq(cards.isPublic, true)),
  });

  if (!card || card.cardType !== 'playground') {
    notFound();
  }
  const typeData = (card.typeData as PlaygroundTypeData | null) || {};
  if (!typeData.code) {
    notFound();
  }

  const title = typeData.codeTitle || card.title || 'Kanthink Playground';
  const srcDoc = buildPlaygroundDoc(typeData.code, { title });

  return <PublicPlaygroundFrame srcDoc={srcDoc} title={title} />;
}
