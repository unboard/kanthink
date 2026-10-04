/**
 * End-to-end check of the print studio pipeline against the real models.
 *
 *   npx tsx scripts/print-selftest.ts create [productKey] [modelId]   — brand + copy + first page + preflight
 *   npx tsx scripts/print-selftest.ts chain [productKey] [modelId] [print|draft] — front, back, retext, edit, fix, sharpen
 *   npx tsx scripts/print-selftest.ts area <pageUrl> <rawUrl> [productKey] — paint the lower third and change it
 *
 * Runs as the ADMIN_EMAIL account. Writes images to the directory in PRINT_OUT (or
 * the cwd) so they can be looked at. Nothing is saved to the database.
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, '')
}

const OUT = process.env.PRINT_OUT ?? process.cwd()

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  const { db } = await import('../lib/db')
  const schema = await import('../lib/db/schema')
  const { eq } = await import('drizzle-orm')
  const { catalogProduct } = await import('../lib/print/spec')
  const { render, preflight } = await import('../lib/print/server/pipeline')
  const { ingestImage } = await import('../lib/print/server/ingest')
  const sharp = (await import('sharp')).default
  const { DEFAULT_BRIEF } = await import('../lib/print/types')

  const admin = await db.query.users.findFirst({ where: eq(schema.users.email, process.env.ADMIN_EMAIL!) })
  if (!admin) throw new Error('No admin user')
  const userId = admin.id

  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="220" viewBox="0 0 600 220">
    <circle cx="110" cy="110" r="90" fill="#C2410C"/><path d="M60 120 q50 -80 100 0 q-50 40 -100 0z" fill="#FDE68A"/>
    <text x="220" y="105" font-family="Georgia" font-size="64" font-weight="700" fill="#7C2D12">Hearth</text>
    <text x="222" y="160" font-family="Georgia" font-size="34" letter-spacing="6" fill="#C2410C">BAKEHOUSE</text></svg>`
  const logo = await ingestImage(userId, Buffer.from(logoSvg), 'logo')
  console.log('logo', logo.url, logo.palette)

  const brand = {
    id: 'selftest',
    name: 'Hearth Bakehouse',
    data: {
      logo: { id: 'logo', url: logo.url, width: logo.width, height: logo.height },
      colors: [{ hex: '#C2410C', name: 'Ember' }, { hex: '#7C2D12', name: 'Crust' }, { hex: '#FDE68A', name: 'Butter' }],
      details: { business: 'Hearth Bakehouse', phone: '(614) 555-0148', website: 'hearthbakehouse.com', address: '412 Maple Ave, Columbus, OH' },
      assets: [],
      inspiration: [],
    },
  }

  const key = (cmd === 'area' ? args[2] : args[0]) ?? 'flyer-letter'
  const product = catalogProduct(key)!
  const design: import('../lib/print/types').PrintDesign = {
    id: 'selftest', name: 'Self test', spec: product.spec, brandId: 'selftest' as string | null,
    brief: { ...DEFAULT_BRIEF, prompt: 'Grand opening this Saturday — free cookie with any coffee, 7am to 2pm' },
    pages: product.spec.pages.map((p, i) => ({ id: `p${i}`, label: p.label, versions: [], current: 0 })),
    renders: 0, spendCents: 0, createdAt: 0, updatedAt: 0,
  }

  const save = async (url: string, name: string) => {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    const small = await sharp(buf).resize({ width: 900, height: 900, fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()
    const path = resolve(OUT, name)
    writeFileSync(path, small)
    return path
  }

  if (cmd === 'create') {
    const t = Date.now()
    const { version, cents } = await render({ userId, design, brand, pageIndex: 0, mode: 'create', modelId: args[1] })
    console.log('rendered in', Date.now() - t, 'ms', cents, '¢', version.width, 'x', version.height, 'raw', version.rawWidth, 'x', version.rawHeight)
    console.log('copy', JSON.stringify(version.copy))
    console.log('url', version.url)
    console.log('raw', version.rawUrl)
    console.log('saved', await save(version.url, `print-${key}.jpg`))
    const t2 = Date.now()
    const check = await preflight(userId, design, version, brand.data)
    console.log('preflight in', Date.now() - t2, 'ms', JSON.stringify({ ok: check.ok, dpi: check.dpi, issues: check.issues, n: check.elements.length }, null, 1))
    return
  }

  if (cmd === 'chain') {
    // Front, then the back from the front, then words, a whole-page change and a sharpen.
    const modelId = args[1]
    const quality = (args[2] as 'print' | 'draft') ?? 'print'
    const step = async (label: string, run: () => Promise<{ version: import('../lib/print/types').PrintVersion; cents: number }>) => {
      const t = Date.now()
      const { version, cents } = await run()
      const check = await preflight(userId, design, version, brand.data)
      console.log(`${label}: ${Date.now() - t}ms ${cents}¢ ${version.width}x${version.height} dpi=${check.dpi} ok=${check.ok}`, check.issues.map((i) => `[${i.severity}] ${i.message}`).join(' | '))
      console.log('  saved', await save(version.url, `chain-${key}-${label}.jpg`))
      return { ...version, check }
    }
    const front = await step('front', () => render({ userId, design, brand, pageIndex: 0, mode: 'create', modelId, quality }))
    design.pages[0].versions.push(front)
    if (design.spec.pages.length > 1) {
      const back = await step('back', () => render({ userId, design, brand, pageIndex: 1, mode: 'create', modelId, quality }))
      design.pages[1].versions.push(back)
    }
    if (front.copy?.headline) {
      await step('retext', () => render({ userId, design, brand, pageIndex: 0, mode: 'retext', modelId, quality, source: front, copy: { ...front.copy, headline: 'Now Open on Maple Avenue' } }))
    }
    await step('edit', () => render({ userId, design, brand, pageIndex: 0, mode: 'edit', modelId, quality, source: front, prompt: 'Make the background a deep forest green' }))
    if (front.check.issues.some((i) => i.kind !== 'resolution')) {
      await step('fix', () => render({ userId, design, brand, pageIndex: 0, mode: 'fix', modelId, quality, source: front, issues: front.check.issues.filter((i) => i.kind !== 'resolution') }))
    }
    if (quality === 'draft') await step('upscale', () => render({ userId, design, brand, pageIndex: 0, mode: 'upscale', modelId, source: front }))
    return
  }

  if (cmd === 'area') {
    const [url, rawUrl] = args
    const meta = await sharp(Buffer.from(await (await fetch(url)).arrayBuffer())).metadata()
    const w = 600
    const h = Math.round((w * meta.height!) / meta.width!)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${w * 0.08}" y="${h * 0.62}" width="${w * 0.4}" height="${h * 0.25}" fill="#fff"/></svg>`
    const mask = await sharp(Buffer.from(svg)).png().toBuffer()
    const rawMeta = await sharp(Buffer.from(await (await fetch(rawUrl)).arrayBuffer())).metadata()
    const source = { id: 'src', url, rawUrl, width: meta.width!, height: meta.height!, rawWidth: rawMeta.width!, rawHeight: rawMeta.height!, model: '', mode: 'create' as const, at: 0 }
    const t = Date.now()
    const { version } = await render({ userId, design, brand, pageIndex: 0, mode: 'area', source, mask, prompt: 'Replace this with a close-up photo of a basket of fresh croissants' })
    console.log('area edit in', Date.now() - t, 'ms', version.url)
    console.log('saved', await save(version.url, `print-${key}-area.jpg`))
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
