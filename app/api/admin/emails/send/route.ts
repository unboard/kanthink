import { NextRequest, NextResponse } from 'next/server'
import { sendDynamicEmail } from '@/lib/emails/send'
import { db } from '@/lib/db'
import { emailTemplates } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { render } from '@react-email/render'
import { DynamicEmail, type EmailConfig } from '@/lib/emails/dynamicRenderer'
import { sendTransactionalEmail } from '@/lib/customerio'
import React from 'react'

/**
 * POST /api/admin/emails/send
 * Send an email using a saved template. Auth via Bearer token (KANTHINK_INTERNAL_KEY).
 *
 * Body: { templateId: string, to: string, variables?: Record<string, string> }
 *  — OR —
 * Body: { slug: string, to: string, variables?: Record<string, string> }
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const internalKey = process.env.INTERNAL_API_SECRET

  if (!internalKey || authHeader !== `Bearer ${internalKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { to, variables } = body

  if (!to) {
    return NextResponse.json({ error: 'Missing "to" field' }, { status: 400 })
  }

  // Look up template by ID or slug
  await ensureSchema()

  let template
  if (body.templateId) {
    const [t] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, body.templateId))
      .limit(1)
    template = t
  } else if (body.slug) {
    const [t] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.slug, body.slug))
      .limit(1)
    template = t
  }

  if (!template || !template.body) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  let subject = template.subject
  let bodyJson = JSON.stringify(template.body)

  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      subject = subject.replace(pattern, value as string)
      bodyJson = bodyJson.replace(pattern, value as string)
    }
  }

  const config: EmailConfig = {
    subject,
    previewText: template.previewText || subject,
    body: JSON.parse(bodyJson),
  }

  try {
    const html = await render(React.createElement(DynamicEmail, { config }))
    const sent = await sendTransactionalEmail({ to, subject, html })

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ success: true, subject })
  } catch (error) {
    console.error('[Email Send] Error:', error)
    return NextResponse.json({ error: 'Failed to render/send email' }, { status: 500 })
  }
}
