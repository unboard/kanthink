import { NextResponse } from 'next/server'
import { auth, isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { emailTemplates } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'template'
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureSchema()

  const templates = await db
    .select({
      id: emailTemplates.id,
      name: emailTemplates.name,
      slug: emailTemplates.slug,
      subject: emailTemplates.subject,
      status: emailTemplates.status,
      createdAt: emailTemplates.createdAt,
      updatedAt: emailTemplates.updatedAt,
    })
    .from(emailTemplates)
    .where(eq(emailTemplates.userId, session.user.id!))
    .orderBy(emailTemplates.updatedAt)

  return NextResponse.json(templates)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureSchema()

  const body = await request.json()
  const { name, subject, previewText, body: emailBody, status, conversationHistory } = body

  if (!name || !subject || !emailBody) {
    return NextResponse.json({ error: 'Missing required fields: name, subject, body' }, { status: 400 })
  }

  // Generate unique slug
  const baseSlug = slugify(name)
  let slug = baseSlug
  let suffix = 2
  while (true) {
    const existing = await db
      .select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(eq(emailTemplates.slug, slug))
      .limit(1)
    if (existing.length === 0) break
    slug = `${baseSlug}-${suffix}`
    suffix++
  }

  const id = crypto.randomUUID()
  const now = new Date()

  await db.insert(emailTemplates).values({
    id,
    userId: session.user.id!,
    name,
    slug,
    subject,
    previewText: previewText || subject,
    body: emailBody,
    status: status || 'draft',
    conversationHistory: conversationHistory || null,
    createdAt: now,
    updatedAt: now,
  })

  return NextResponse.json({ id, slug }, { status: 201 })
}
