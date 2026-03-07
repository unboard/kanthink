import { NextResponse } from 'next/server';

export async function GET() {
  const hasOwnerKey = !!(
    process.env.OWNER_OPENAI_API_KEY ||
    process.env.OWNER_ANTHROPIC_API_KEY
  );

  const ownerProvider = process.env.OWNER_OPENAI_API_KEY
    ? 'openai'
    : process.env.OWNER_GOOGLE_API_KEY
    ? 'google'
    : null;

  return NextResponse.json({ hasOwnerKey, ownerProvider });
}
