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
import { BaseLayout } from '@/lib/emails/components/BaseLayout'
import { emailRegistry } from '@/lib/emails/registry'
import { DynamicEmail, type EmailConfig } from '@/lib/emails/dynamicRenderer'

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
}

function BaseLayoutPreview() {
  const children = React.createElement(React.Fragment, null,
    React.createElement('h1', {
      style: { fontSize: '22px', fontWeight: '700', color: '#18181b', margin: '0 0 12px' }
    }, 'Heading goes here'),
    React.createElement('p', {
      style: { fontSize: '15px', color: '#3f3f46', lineHeight: '1.6', margin: '0 0 16px' }
    }, 'This is a preview of the base template that all Kanthink emails inherit. The violet accent bar, dark header with logo, content area, and footer with CTA button are all shared across every email.'),
    React.createElement('p', {
      style: { fontSize: '15px', color: '#3f3f46', lineHeight: '1.6', margin: '0 0 24px' }
    }, 'Use this view to evaluate the shared design system — colors, spacing, typography, and overall feel.'),
    React.createElement('table', {
      cellPadding: '0', cellSpacing: '0', style: { width: '100%' }
    },
      React.createElement('tr', null,
        React.createElement('td', { style: { textAlign: 'center' as const } },
          React.createElement('a', {
            href: '#',
            style: {
              backgroundColor: '#7c3aed',
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
  return React.createElement(BaseLayout, { previewText: 'Base template design preview', children })
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const template = request.nextUrl.searchParams.get('template')

  // Handle base-layout pseudo-template
  if (template === 'base-layout') {
    const html = await render(React.createElement(BaseLayoutPreview))
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // Validate against registry
  const validSlugs = emailRegistry.map((e) => e.slug)
  if (!template || !components[template]) {
    return NextResponse.json(
      { error: 'Invalid template', valid: [...validSlugs, 'base-layout'] },
      { status: 400 }
    )
  }

  const { component, previewProps } = components[template]
  const html = await render(React.createElement(component, previewProps))

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const config: EmailConfig = await request.json()

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
