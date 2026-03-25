import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelDataSources } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { cookies } from 'next/headers';

// GET /api/auth/mixpanel/callback — handle OAuth callback from Mixpanel
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateEncoded = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.error('[Mixpanel OAuth] Error:', error);
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL || 'https://www.kanthink.com'}/?error=mixpanel_auth_failed`);
  }

  if (!code || !stateEncoded) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL || 'https://www.kanthink.com'}/?error=mixpanel_missing_params`);
  }

  // Decode state
  let channelId: string;
  let clientId: string;
  try {
    const state = JSON.parse(Buffer.from(stateEncoded, 'base64url').toString());
    channelId = state.channelId;
    clientId = state.clientId;
  } catch {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL || 'https://www.kanthink.com'}/?error=mixpanel_invalid_state`);
  }

  // Get PKCE verifier from cookie
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get('mixpanel_pkce_verifier')?.value;

  if (!codeVerifier) {
    console.error('[Mixpanel OAuth] No PKCE verifier cookie found');
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL || 'https://www.kanthink.com'}/channel/${channelId}?error=mixpanel_session_expired`);
  }

  // Exchange code for tokens
  const region = process.env.MIXPANEL_REGION || 'us';
  const regionPrefix = region === 'eu' ? 'eu.' : region === 'in' ? 'in.' : '';
  const tokenUrl = `https://${regionPrefix}mixpanel.com/oauth/token/`;
  const redirectUri = `${process.env.NEXTAUTH_URL || 'https://www.kanthink.com'}/api/auth/mixpanel/callback`;

  try {
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Mixpanel OAuth] Token exchange failed:', errText);
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL || 'https://www.kanthink.com'}/channel/${channelId}?error=mixpanel_token_failed`);
    }

    const tokens = await tokenRes.json();
    const nowEpoch = Math.floor(Date.now() / 1000);
    const expiresAt = tokens.expires_in ? nowEpoch + tokens.expires_in : null;

    await ensureSchema();

    // Upsert: delete existing connection for this channel+provider, then insert
    await db.delete(channelDataSources).where(
      and(eq(channelDataSources.channelId, channelId), eq(channelDataSources.provider, 'mixpanel'))
    );

    await db.insert(channelDataSources).values({
      id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId,
      provider: 'mixpanel',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenExpiresAt: expiresAt,
      metadata: { region, scope: tokens.scope },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Clear the PKCE cookie
    const response = NextResponse.redirect(
      `${process.env.NEXTAUTH_URL || 'https://www.kanthink.com'}/channel/${channelId}?mixpanel=connected`
    );
    response.cookies.delete('mixpanel_pkce_verifier');
    return response;
  } catch (err) {
    console.error('[Mixpanel OAuth] Error:', err);
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL || 'https://www.kanthink.com'}/channel/${channelId}?error=mixpanel_connection_failed`);
  }
}
