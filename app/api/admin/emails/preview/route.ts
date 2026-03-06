import { NextRequest, NextResponse } from 'next/server'
import { auth, isAdmin } from '@/lib/auth'
import { render } from '@react-email/render'
import React from 'react'

import { Welcome } from '@/lib/emails/Welcome'
import { ChannelInvite } from '@/lib/emails/ChannelInvite'
import { TaskAssigned } from '@/lib/emails/TaskAssigned'
import { CardAssigned } from '@/lib/emails/CardAssigned'
import { PaymentFailed } from '@/lib/emails/PaymentFailed'
import { SubscriptionConfirmed } from '@/lib/emails/SubscriptionConfirmed'
import { SubscriptionCanceled } from '@/lib/emails/SubscriptionCanceled'
import { UsageLimitWarning } from '@/lib/emails/UsageLimitWarning'
import { UsageLimitReached } from '@/lib/emails/UsageLimitReached'
import { ChannelDigest } from '@/lib/emails/ChannelDigest'
import { BaseLayout, type DesignTokens } from '@/lib/emails/components/BaseLayout'
import { emailRegistry } from '@/lib/emails/registry'
import { DynamicEmail, type EmailConfig } from '@/lib/emails/dynamicRenderer'
import { db } from '@/lib/db'
import { emailTemplates } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'

const components: Record<string, { component: React.FC<any>; previewProps: Record<string, any> }> = {
  'welcome': { component: Welcome, previewProps: Welcome.PreviewProps },
  'channel-invite': { component: ChannelInvite, previewProps: ChannelInvite.PreviewProps },
  'task-assigned': { component: TaskAssigned, previewProps: TaskAssigned.PreviewProps },
  'card-assigned': { component: CardAssigned, previewProps: CardAssigned.PreviewProps },
  'payment-failed': { component: PaymentFailed, previewProps: PaymentFailed.PreviewProps },
  'subscription-confirmed': { component: SubscriptionConfirmed, previewProps: SubscriptionConfirmed.PreviewProps },
  'subscription-canceled': { component: SubscriptionCanceled, previewProps: SubscriptionCanceled.PreviewProps },
  'usage-limit-warning': { component: UsageLimitWarning, previewProps: UsageLimitWarning.PreviewProps },
  'usage-limit-reached': { component: UsageLimitReached, previewProps: UsageLimitReached.PreviewProps },
  'channel-digest': { component: ChannelDigest, previewProps: ChannelDigest.PreviewProps },
}

function BaseLayoutPreview({ tokens }: { tokens?: Partial<DesignTokens> }) {
  const t = tokens
  const textColor = t?.textColor ?? '#3f3f46'
  const mutedColor = t?.mutedColor ?? '#71717a'
  const headingColor = t?.headerBg ?? '#18181b'
  const accentColor = t?.accentColor ?? '#7c3aed'
  const borderColor = t?.borderColor ?? '#e4e4e7'

  const children = React.createElement(React.Fragment, null,
    React.createElement('h2', {
      style: { fontSize: '22px', fontWeight: '700', color: headingColor, margin: '0 0 12px' }
    }, 'Sample Heading'),
    React.createElement('p', {
      style: { fontSize: '15px', color: textColor, lineHeight: '1.6', margin: '0 0 16px' }
    }, 'This is body text showing paragraph styling. The base template wraps all Kanthink emails with a consistent header, footer, and design tokens.'),
    // Stat cards row
    React.createElement('table', {
      cellPadding: '0', cellSpacing: '0', style: { width: '100%', margin: '0 0 16px' }
    },
      React.createElement('tr', null,
        React.createElement('td', {
          style: { backgroundColor: t?.footerBg ?? '#fafafa', borderRadius: '8px', padding: '16px', textAlign: 'center' as const, width: '48%' }
        },
          React.createElement('p', { style: { fontSize: '24px', fontWeight: '700', color: headingColor, margin: '0' } }, '42'),
          React.createElement('p', { style: { fontSize: '12px', color: mutedColor, margin: '4px 0 0' } }, 'Tasks Done')
        ),
        React.createElement('td', { style: { width: '4%' } }),
        React.createElement('td', {
          style: { backgroundColor: t?.footerBg ?? '#fafafa', borderRadius: '8px', padding: '16px', textAlign: 'center' as const, width: '48%' }
        },
          React.createElement('p', { style: { fontSize: '24px', fontWeight: '700', color: headingColor, margin: '0' } }, '5'),
          React.createElement('p', { style: { fontSize: '12px', color: mutedColor, margin: '4px 0 0' } }, 'Channels')
        )
      )
    ),
    // Divider
    React.createElement('hr', { style: { border: 'none', borderTop: `1px solid ${borderColor}`, margin: '16px 0' } }),
    // Sample table
    React.createElement('table', {
      cellPadding: '0', cellSpacing: '0', style: { width: '100%', borderCollapse: 'collapse' as const, margin: '0 0 16px' }
    },
      React.createElement('thead', null,
        React.createElement('tr', null,
          React.createElement('th', { style: { textAlign: 'left' as const, fontSize: '12px', fontWeight: '600', color: mutedColor, textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '8px 12px', borderBottom: `2px solid ${borderColor}` } }, 'Task'),
          React.createElement('th', { style: { textAlign: 'left' as const, fontSize: '12px', fontWeight: '600', color: mutedColor, textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '8px 12px', borderBottom: `2px solid ${borderColor}` } }, 'Status')
        )
      ),
      React.createElement('tbody', null,
        React.createElement('tr', null,
          React.createElement('td', { style: { fontSize: '14px', color: textColor, padding: '8px 12px', borderBottom: '1px solid #f4f4f5' } }, 'Review design tokens'),
          React.createElement('td', { style: { fontSize: '14px', color: textColor, padding: '8px 12px', borderBottom: '1px solid #f4f4f5' } }, 'In Progress')
        ),
        React.createElement('tr', null,
          React.createElement('td', { style: { fontSize: '14px', color: textColor, padding: '8px 12px', borderBottom: '1px solid #f4f4f5' } }, 'Ship email builder'),
          React.createElement('td', { style: { fontSize: '14px', color: textColor, padding: '8px 12px', borderBottom: '1px solid #f4f4f5' } }, 'Done')
        )
      )
    ),
    // CTA button
    React.createElement('table', {
      cellPadding: '0', cellSpacing: '0', style: { width: '100%' }
    },
      React.createElement('tr', null,
        React.createElement('td', { style: { textAlign: 'center' as const } },
          React.createElement('a', {
            href: '#',
            style: {
              backgroundColor: accentColor,
              borderRadius: '6px',
              color: '#ffffff',
              display: 'inline-block',
              fontSize: '14px',
              fontWeight: '600',
              padding: '10px 24px',
              textDecoration: 'none',
            }
          }, 'Sample CTA Button')
        )
      )
    )
  )
  return React.createElement(BaseLayout, { previewText: 'Base template design preview', tokens, children })
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const template = request.nextUrl.searchParams.get('template')

  // Handle base-layout pseudo-template
  if (template === 'base-layout') {
    const html = await render(React.createElement(BaseLayoutPreview, {}))
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // Check hardcoded templates
  if (template && components[template]) {
    const { component, previewProps } = components[template]
    const html = await render(React.createElement(component, previewProps))
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // Fall back to DB lookup by slug
  if (template) {
    await ensureSchema()
    const [saved] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.slug, template))
      .limit(1)

    if (saved && saved.body) {
      const config: EmailConfig = {
        subject: saved.subject,
        previewText: saved.previewText || saved.subject,
        body: saved.body as EmailConfig['body'],
      }
      const html = await render(React.createElement(DynamicEmail, { config }))
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }
  }

  const validSlugs = emailRegistry.map((e) => e.slug)
  return NextResponse.json(
    { error: 'Invalid template', valid: [...validSlugs, 'base-layout'] },
    { status: 400 }
  )
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()

    // Base-layout preview with design tokens
    if (body.template === 'base-layout' && body.designTokens) {
      const html = await render(React.createElement(BaseLayoutPreview, { tokens: body.designTokens }))
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // Dynamic email config preview
    const config: EmailConfig = body
    if (!config.body || !Array.isArray(config.body) || config.body.length === 0) {
      return NextResponse.json({ error: 'Invalid email config' }, { status: 400 })
    }

    const html = await render(React.createElement(DynamicEmail, { config }))

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    console.error('Dynamic email preview error:', error)
    return NextResponse.json({ error: 'Failed to render preview' }, { status: 500 })
  }
}
