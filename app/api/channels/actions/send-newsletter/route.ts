import { NextResponse } from 'next/server';
import { sendTransactionalEmail } from '@/lib/customerio';

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

    const sent = await sendTransactionalEmail({
      to,
      subject,
      html: emailHtml,
    });

    if (!sent) {
      return NextResponse.json(
        { error: 'Failed to send email — check Customer.IO configuration' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Actions/SendNewsletter] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Send failed' },
      { status: 500 }
    );
  }
}
