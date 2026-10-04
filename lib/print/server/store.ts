import { and, desc, eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { printBrands, printDesigns, printPresets } from '@/lib/db/schema'
import {
  DEFAULT_BRIEF,
  EMPTY_BRAND_KIT,
  type BrandKit,
  type PrintBrand,
  type PrintBrief,
  type PrintDesign,
  type PrintPage,
  type PrintPreset,
  type PrintSpec,
} from '../types'

/** The signed-in user, with the print tables guaranteed to exist. */
export async function printUser(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  await ensureSchema()
  return session.user.id
}

export const now = () => Math.floor(Date.now() / 1000)

function parse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

type DesignRow = typeof printDesigns.$inferSelect

export function toDesign(row: DesignRow): PrintDesign {
  return {
    id: row.id,
    name: row.name,
    spec: parse<PrintSpec>(row.spec, null as unknown as PrintSpec),
    brandId: row.brandId ?? null,
    brief: { ...DEFAULT_BRIEF, ...parse<Partial<PrintBrief>>(row.brief, {}) },
    pages: parse<PrintPage[]>(row.pages, []),
    renders: row.renders ?? 0,
    spendCents: row.spendCents ?? 0,
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? 0,
  }
}

export async function getDesign(userId: string, id: string): Promise<PrintDesign | null> {
  const row = await db.query.printDesigns.findFirst({
    where: and(eq(printDesigns.id, id), eq(printDesigns.userId, userId)),
  })
  return row ? toDesign(row) : null
}

export async function listDesigns(userId: string): Promise<PrintDesign[]> {
  const rows = await db
    .select()
    .from(printDesigns)
    .where(eq(printDesigns.userId, userId))
    .orderBy(desc(printDesigns.updatedAt))
    .limit(200)
  return rows.map(toDesign)
}

/** Count a render against the design. Atomic, so parallel renders all land. */
export async function chargeRender(userId: string, designId: string, cents: number): Promise<void> {
  await db
    .update(printDesigns)
    .set({
      renders: sql`coalesce(${printDesigns.renders}, 0) + 1`,
      spendCents: sql`coalesce(${printDesigns.spendCents}, 0) + ${Math.round(cents * 100) / 100}`,
      updatedAt: now(),
    })
    .where(and(eq(printDesigns.id, designId), eq(printDesigns.userId, userId)))
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

type BrandRow = typeof printBrands.$inferSelect

export function toBrand(row: BrandRow): PrintBrand {
  const data = parse<Partial<BrandKit>>(row.data, {})
  return {
    id: row.id,
    name: row.name,
    data: {
      ...EMPTY_BRAND_KIT,
      ...data,
      details: { ...(data.details ?? {}) },
      colors: data.colors ?? [],
      assets: data.assets ?? [],
      inspiration: data.inspiration ?? [],
    },
    updatedAt: row.updatedAt ?? 0,
  }
}

export async function getBrand(userId: string, id: string | null | undefined): Promise<PrintBrand | null> {
  if (!id) return null
  const row = await db.query.printBrands.findFirst({
    where: and(eq(printBrands.id, id), eq(printBrands.userId, userId)),
  })
  return row ? toBrand(row) : null
}

export async function listBrands(userId: string): Promise<PrintBrand[]> {
  const rows = await db
    .select()
    .from(printBrands)
    .where(eq(printBrands.userId, userId))
    .orderBy(desc(printBrands.updatedAt))
  return rows.map(toBrand)
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export async function listPresets(userId: string): Promise<PrintPreset[]> {
  const rows = await db
    .select()
    .from(printPresets)
    .where(eq(printPresets.userId, userId))
    .orderBy(desc(printPresets.createdAt))
  return rows.map((r) => ({ id: r.id, name: r.name, spec: parse<PrintSpec>(r.spec, null as unknown as PrintSpec) })).filter((p) => !!p.spec)
}

/** Sanitize a brand kit from a client: only our own image URLs, bounded sizes. */
export function cleanBrandKit(input: unknown, isOwnUrl: (url: string) => boolean): BrandKit {
  const k = (input ?? {}) as Partial<BrandKit>
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined)
  const image = (v: unknown) => {
    const i = v as Partial<BrandKit['assets'][number]> | null
    if (!i || typeof i.url !== 'string' || !(isOwnUrl(i.url) || i.url.startsWith('data:image/'))) return null
    return {
      id: str(i.id, 40) || Math.random().toString(36).slice(2, 10),
      url: i.url,
      width: typeof i.width === 'number' ? i.width : undefined,
      height: typeof i.height === 'number' ? i.height : undefined,
      note: str(i.note, 200),
    }
  }
  const images = (v: unknown, max: number) =>
    Array.isArray(v) ? v.map(image).filter((x): x is NonNullable<typeof x> => !!x).slice(0, max) : []
  const d = (k.details ?? {}) as BrandKit['details']
  return {
    website: str(k.website, 300),
    logo: k.logo ? image(k.logo) : null,
    colors: Array.isArray(k.colors)
      ? k.colors
          .filter((c) => c && typeof c.hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.hex))
          .slice(0, 8)
          .map((c) => ({ hex: c.hex.toUpperCase(), name: str(c.name, 40) }))
      : [],
    details: {
      business: str(d.business, 120),
      tagline: str(d.tagline, 200),
      phone: str(d.phone, 60),
      email: str(d.email, 120),
      website: str(d.website, 200),
      address: str(d.address, 300),
      other: str(d.other, 1000),
    },
    assets: images(k.assets, 24),
    inspiration: images(k.inspiration, 8),
    voice: str(k.voice, 600),
  }
}
