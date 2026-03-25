import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// GET /api/auth/mixpanel?channelId=xxx — initiate Mixpanel OAuth flow
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channelId');
  if (!channelId) {
    return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });
  }

  // Generate PKCE code verifier + challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // State includes channelId so we know where to store the token on callback
  const state = JSON.stringify({ channelId, userId: session.user.id });
  const stateEncoded = Buffer.from(state).toString('base64url');

  const region = process.env.MIXPANEL_REGION || 'us';
  const regionPrefix = region === 'eu' ? 'eu.' : region === 'in' ? 'in.' : '';
  const registerUrl = `https://${regionPrefix}mixpanel.com/oauth/mcp/register/`;

  // Mixpanel OAuth authorization URL
  const scopes = 'projects analysis events insights segmentation retention data:read funnels flows data_definitions';
  const redirectUri = `${process.env.NEXTAUTH_URL || 'https://www.kanthink.com'}/api/auth/mixpanel/callback`;

  const authUrl = new URL(registerUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', stateEncoded);

  // Store code_verifier in a cookie for the callback to use
  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('mixpanel_pkce_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return response;
}
