import { NextResponse } from 'next/server';

export async function GET() {
  const hasOwnerKey = !!(
    process.env.OWNER_OPENAI_API_KEY ||
    process.env.OWNER_ANTHROPIC_API_KEY
  );

  return NextResponse.json({ hasOwnerKey });
}
