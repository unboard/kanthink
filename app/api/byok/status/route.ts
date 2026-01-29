import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasUserByokConfig, getUserByokConfigWithError } from '@/lib/usage';

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const hasByok = await hasUserByokConfig(userId);

    if (!hasByok) {
      return NextResponse.json({
        configured: false,
      });
    }

    // Get provider and model (not the key itself)
    const result = await getUserByokConfigWithError(userId);

    // If there was a decryption error, report it
    if (result.error) {
      return NextResponse.json({
        configured: true,
        error: result.error,
        provider: null,
        model: null,
      });
    }

    return NextResponse.json({
      configured: true,
      provider: result.config?.provider || null,
      model: result.config?.model || null,
    });
  } catch (error) {
    console.error('BYOK status error:', error);
    return NextResponse.json(
      { error: 'Failed to get BYOK status' },
      { status: 500 }
    );
  }
}
