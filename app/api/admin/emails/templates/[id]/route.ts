import { NextRequest, NextResponse } from 'next/server'
import { auth, isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { emailTemplates } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureSchema()
  const { id } = await params

  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), eq(emailTemplates.userId, session.user.id!)))
    .limit(1)

  if (!template) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(template)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureSchema()
  const { id } = await params

  // Verify ownership
  const [existing] = await db
    .select({ id: emailTemplates.id })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), eq(emailTemplates.userId, session.user.id!)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json()
  const updates: Record<string, unknown> = { updatedAt: new Date() }

  if (body.name !== undefined) updates.name = body.name
  if (body.subject !== undefined) updates.subject = body.subject
  if (body.previewText !== undefined) updates.previewText = body.previewText
  if (body.body !== undefined) updates.body = body.body
  if (body.status !== undefined) updates.status = body.status
  if (body.conversationHistory !== undefined) updates.conversationHistory = body.conversationHistory

  await db.update(emailTemplates).set(updates).where(eq(emailTemplates.id, id))

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureSchema()
  const { id } = await params

  // Verify ownership before deleting
  const [existing] = await db
    .select({ id: emailTemplates.id })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), eq(emailTemplates.userId, session.user.id!)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.delete(emailTemplates).where(eq(emailTemplates.id, id))

  return NextResponse.json({ success: true })
}
