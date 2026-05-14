import { db } from '@/lib/db';
import { cards } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc';
import { signCardToken } from '@/lib/playground/cardToken';
import { PublicPlaygroundFrame } from '../../PublicPlaygroundFrame';
import type { Metadata } from 'next';
import type { SavedRecord } from '@/lib/playground/savedRecord';

interface PageProps {
  params: Promise<{ token: string; slug: string }>;
}

interface PlaygroundTypeData {
  code?: string;
  codeTitle?: string;
  codeSummary?: string;
  cardToken?: string;
  savedRecords?: SavedRecord[];
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token, slug } = await params;
  const card = await db.query.cards.findFirst({
    where: and(eq(cards.shareToken, token), eq(cards.isPublic, true)),
  });
  const typeData = (card?.typeData as PlaygroundTypeData | null) || {};
  const record = (typeData.savedRecords || []).find((r) => r.slug === slug);
  const appTitle = typeData.codeTitle || card?.title || 'Kanthink Playground';
  const summary = typeData.codeSummary || card?.summary || 'A mini app built on Kanthink.';
  const ogTitle = record?.label ? `${record.label} · ${appTitle}` : appTitle;
  return {
    title: `${ogTitle} · Kanthink`,
    description: summary,
    openGraph: { title: ogTitle, description: summary },
  };
}

/**
 * Public per-record render. Same playground app as `/play/{token}` but the
 * iframe is hydrated with `window.kanthinkInitial.record` set to the saved
 * record, so the app can mount in a specific saved state (e.g. an idea the
 * sender wants the recipient to see first).
 */
export default async function PlayRecordPage({ params }: PageProps) {
  const { token, slug } = await params;

  const card = await db.query.cards.findFirst({
    where: and(eq(cards.shareToken, token), eq(cards.isPublic, true)),
  });
  if (!card || card.cardType !== 'playground') notFound();

  const typeData = (card.typeData as PlaygroundTypeData | null) || {};
  if (!typeData.code) notFound();

  const record = (typeData.savedRecords || []).find((r) => r.slug === slug);
  if (!record) notFound();

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
    initialRecord: {
      slug: record.slug,
      data: record.data,
      label: record.label,
    },
  });

  return <PublicPlaygroundFrame srcDoc={srcDoc} title={title} />;
}
