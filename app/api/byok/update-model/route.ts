import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasUserByokConfig, updateUserByokModel } from '@/lib/usage';

export async function POST(request: Request) {
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
      return NextResponse.json(
        { error: 'No BYOK configuration found' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { model } = body;

    if (typeof model !== 'string') {
      return NextResponse.json(
        { error: 'Invalid model' },
        { status: 400 }
      );
    }

    await updateUserByokModel(userId, model);

    return NextResponse.json({ success: true, model: model || null });
  } catch (error) {
    console.error('BYOK update-model error:', error);
    return NextResponse.json(
      { error: 'Failed to update model' },
      { status: 500 }
    );
  }
}
