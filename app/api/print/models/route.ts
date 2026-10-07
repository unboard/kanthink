import { NextResponse } from 'next/server'
import { printProviderKeys } from '@/lib/print/server/meter'
import { PRINT_MODELS } from '@/lib/print/models'
import { printUser } from '@/lib/print/server/store'

/** GET → the print models, and which ones this account can call. */

export async function GET() {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { keys } = await printProviderKeys(userId)
  return NextResponse.json({
    models: PRINT_MODELS.map((m) => ({ id: m.id, label: m.label, blurb: m.blurb, provider: m.provider, available: !!keys[m.provider] })),
  })
}
