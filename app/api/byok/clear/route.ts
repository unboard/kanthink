import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { setUserByokConfig } from '@/lib/usage';

export async function POST() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Clear the BYOK configuration
    await setUserByokConfig(userId, null);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('BYOK clear error:', error);
    return NextResponse.json(
      { error: 'Failed to clear API key' },
      { status: 500 }
    );
  }
}
