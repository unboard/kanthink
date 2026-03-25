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

  const baseUrl = process.env.NEXTAUTH_URL || 'https://www.kanthink.com';
  const redirectUri = `${baseUrl}/api/auth/mixpanel/callback`;

  const region = process.env.MIXPANEL_REGION || 'us';
  const regionPrefix = region === 'eu' ? 'eu.' : region === 'in' ? 'in.' : '';
  const mixpanelBase = `https://${regionPrefix}mixpanel.com`;

  // Step 1: Dynamic Client Registration (RFC 7591)
  const registerUrl = `${mixpanelBase}/oauth/mcp/register/`;

  let clientId: string;
  try {
    const regRes = await fetch(registerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Kanthink',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'projects analysis events insights segmentation retention data:read funnels flows data_definitions dashboard_reports bookmarks user_details',
      }),
    });

    if (!regRes.ok) {
      const errText = await regRes.text();
      console.error('[Mixpanel OAuth] Registration failed:', errText);
      return NextResponse.json({ error: 'Failed to register with Mixpanel', details: errText }, { status: 500 });
    }

    const regData = await regRes.json();
    clientId = regData.client_id;

    if (!clientId) {
      console.error('[Mixpanel OAuth] No client_id in registration response:', regData);
      return NextResponse.json({ error: 'Mixpanel registration did not return a client_id' }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[Mixpanel OAuth] Registration error:', err);
    return NextResponse.json({ error: 'Failed to connect to Mixpanel: ' + err.message }, { status: 500 });
  }

  // Step 2: Build authorization URL
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  const state = Buffer.from(JSON.stringify({
    channelId,
    userId: session.user.id,
    clientId,
  })).toString('base64url');

  const authUrl = new URL(`${mixpanelBase}/oauth/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'projects analysis events insights segmentation retention data:read funnels flows data_definitions');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  // Store PKCE verifier in cookie
  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('mixpanel_pkce_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return response;
}
