import { NextResponse } from 'next/server';
import { RegionUS, APIClient, SendEmailRequest } from 'customerio-node';

export async function POST(request: Request) {
  try {
    const { to, channelName, html } = await request.json();

    if (!to || !html) {
      return NextResponse.json(
        { error: 'Missing required fields: to, html' },
        { status: 400 }
      );
    }

    // Wrap the generated content in a clean email template
    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;margin-top:24px;margin-bottom:24px;">
    <div style="height:4px;background:#7c3aed;"></div>
    <div style="padding:32px 24px;">
      ${html}
    </div>
    <div style="background:#fafafa;border-top:1px solid #e4e4e7;padding:16px;text-align:center;">
      <p style="font-size:12px;color:#a1a1aa;margin:0;">Sent from Kanthink &mdash; AI-driven Kanban for clarity</p>
      <p style="font-size:12px;color:#a1a1aa;margin:4px 0 0;">Generated from the "${channelName || 'Untitled'}" channel</p>
    </div>
  </div>
</body>
</html>`;

    const subject = `${channelName || 'Kanthink'} Newsletter`;

    // Try all available CIO keys (same approach as bug report script)
    const apiKey = process.env.CUSTOMERIO_TRANSACTIONAL_API_KEY;
    const siteId = process.env.CUSTOMERIO_SITE_ID;
    const trackingKey = process.env.CUSTOMERIO_TRACKING_API_KEY || process.env.CUSTOMERIO_API_KEY;

    if (!apiKey) {
      console.error('[SendNewsletter] No CUSTOMERIO_TRANSACTIONAL_API_KEY found. Available CIO env vars:', {
        hasSiteId: !!siteId,
        hasTrackingKey: !!trackingKey,
        hasTransactionalKey: !!apiKey,
      });
      return NextResponse.json(
        { error: 'Email service not configured — CUSTOMERIO_TRANSACTIONAL_API_KEY is missing from environment.' },
        { status: 500 }
      );
    }

    const cioApi = new APIClient(apiKey, { region: RegionUS });
    const messageId = process.env.CUSTOMERIO_TRANSACTIONAL_MESSAGE_ID || 'kanthink_email';

    const emailRequest = new SendEmailRequest({
      transactional_message_id: messageId,
      to,
      from: process.env.CUSTOMERIO_FROM_EMAIL || 'kan@kanthink.com',
      subject,
      body: emailHtml,
      identifiers: { email: to },
      message_data: { subject, body: emailHtml },
      disable_message_retention: false,
    });

    await cioApi.sendEmail(emailRequest);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[SendNewsletter] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
