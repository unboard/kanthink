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

const templates: Record<string, { component: React.FC<any>; previewProps: Record<string, any> }> = {
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

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const template = request.nextUrl.searchParams.get('template')
  if (!template || !templates[template]) {
    return NextResponse.json(
      { error: 'Invalid template', valid: Object.keys(templates) },
      { status: 400 }
    )
  }

  const { component, previewProps } = templates[template]
  const html = await render(React.createElement(component, previewProps))

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
