import { NextResponse } from 'next/server'
import { getPartner, savePartner } from '@/lib/print/orders/server'
import { printUser } from '@/lib/print/server/store'
import type { PartnerBrand } from '@/lib/print/orders/types'

/**
 * GET   /api/print/partner — the printer's order settings (brand, webhook, approval window)
 * PATCH /api/print/partner — { brand?, webhookUrl?, approvalHours?, rotateSecret? }
 * Signed-in only: these are never set with an API key.
 */

export async function GET() {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: { message: 'Sign in.' } }, { status: 401 })
  return NextResponse.json(await getPartner(userId))
}

export async function PATCH(req: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: { message: 'Sign in.' } }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { brand?: PartnerBrand; webhookUrl?: string | null; approvalHours?: number; rotateSecret?: boolean }
  if (b.webhookUrl && !/^https:\/\//i.test(b.webhookUrl)) return NextResponse.json({ error: { message: 'The webhook URL must start with https://', path: 'webhookUrl' } }, { status: 422 })
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : undefined)
  const brand = b.brand
    ? { name: str(b.brand.name, 80), logoUrl: str(b.brand.logoUrl, 500), color: str(b.brand.color, 9), email: str(b.brand.email, 120), phone: str(b.brand.phone, 40), website: str(b.brand.website, 200) }
    : undefined
  const hours = typeof b.approvalHours === 'number' && b.approvalHours >= 1 && b.approvalHours <= 24 * 30 ? Math.round(b.approvalHours) : undefined
  return NextResponse.json(await savePartner(userId, { brand, webhookUrl: b.webhookUrl === undefined ? undefined : b.webhookUrl, approvalHours: hours, rotateSecret: b.rotateSecret === true }))
}
