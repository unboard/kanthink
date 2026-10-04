import * as cheerio from 'cheerio'
import { isBlockedUrl } from '@/lib/web/tools'
import { extractPalette, normalizeHex } from '../palette'
import { smallRgba } from './images'

/**
 * Read a small business's website for the pieces a print design needs: its name, logo,
 * colors, phone, email, address and a few photos. Everything found is a suggestion —
 * the studio shows it and the person keeps what is right.
 */

export interface CrawlResult {
  url: string
  name?: string
  description?: string
  logos: string[]
  colors: string[]
  phone?: string
  email?: string
  address?: string
  images: string[]
}

const UA = 'Mozilla/5.0 (compatible; KanthinkPrint/1.0; +https://kanthink.com)'

/** Fetch with every redirect hop checked against the SSRF rules. */
export async function safeFetch(url: string, opts: { maxBytes: number; accept: string; timeoutMs?: number }): Promise<{ body: Buffer; type: string; finalUrl: string }> {
  let current = url
  for (let hop = 0; hop < 5; hop++) {
    const check = isBlockedUrl(current)
    if (check.blocked) throw new Error(check.reason ?? 'Blocked address')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000)
    try {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': UA, Accept: opts.accept },
      })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location')!, current).toString()
        continue
      }
      if (!res.ok) throw new Error(`The site answered ${res.status}.`)
      const declared = Number(res.headers.get('content-length') ?? 0)
      if (declared > opts.maxBytes) throw new Error('That file is too large.')
      const reader = res.body?.getReader()
      const parts: Uint8Array[] = []
      let total = 0
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.length
          if (total > opts.maxBytes) {
            await reader.cancel()
            throw new Error('That file is too large.')
          }
          parts.push(value)
        }
      }
      return { body: Buffer.concat(parts), type: res.headers.get('content-type') ?? '', finalUrl: current }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error('Too many redirects.')
}

/** An image found on a site: a remote URL fetched safely, or an inline SVG we carried as data. */
export async function loadRemoteImage(url: string): Promise<Buffer> {
  if (url.startsWith('data:image/svg+xml;base64,')) return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
  const res = await safeFetch(url, { maxBytes: 12 * 1024 * 1024, accept: 'image/*' })
  if (res.type && !/^image\//i.test(res.type) && !/octet-stream/i.test(res.type)) throw new Error('That address isn’t an image.')
  return res.body
}

/** A US/Canada number as people write it; anything else as found. */
export function formatPhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const digits = raw.replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
  return raw.trim()
}

export function normalizeSiteUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(withScheme)
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

type JsonLd = Record<string, unknown>

function flattenLd(node: unknown, out: JsonLd[] = []): JsonLd[] {
  if (Array.isArray(node)) node.forEach((n) => flattenLd(n, out))
  else if (node && typeof node === 'object') {
    const obj = node as JsonLd
    out.push(obj)
    if (obj['@graph']) flattenLd(obj['@graph'], out)
  }
  return out
}

function ldString(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && typeof (v as JsonLd).url === 'string') return (v as JsonLd).url as string
  return undefined
}

function ldAddress(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (!v || typeof v !== 'object') return undefined
  const a = (Array.isArray(v) ? v[0] : v) as JsonLd
  const parts = [a.streetAddress, a.addressLocality, [a.addressRegion, a.postalCode].filter(Boolean).join(' ')]
    .filter((p): p is string => typeof p === 'string' && !!p.trim())
  return parts.length ? parts.join(', ') : undefined
}

function parsePage(html: string, base: string): CrawlResult & { contactUrl?: string } {
  const $ = cheerio.load(html)
  const abs = (href: string | undefined) => {
    if (!href) return undefined
    if (href.startsWith('data:')) return href.startsWith('data:image/svg+xml') ? href : undefined
    try {
      return new URL(href, base).toString()
    } catch {
      return undefined
    }
  }

  const ld = $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((el) => {
      try {
        return flattenLd(JSON.parse($(el).text()))
      } catch {
        return []
      }
    })
  const org = ld.find((n) => /Organization|LocalBusiness|Store|Restaurant|Service|Corporation/i.test(String(n['@type'] ?? '')))

  const logos: string[] = []
  const addLogo = (u?: string) => {
    if (u && !logos.includes(u)) logos.push(u)
  }
  addLogo(abs(ldString(org?.logo)))
  $('header img, nav img, [class*="logo" i] img, img[class*="logo" i], img[id*="logo" i], img[alt*="logo" i], img[src*="logo" i]').each((_, el) => {
    addLogo(abs($(el).attr('src') ?? $(el).attr('data-src')))
  })
  // Inline SVG logos have no URL; carry them as a data URL and rasterize on import.
  const inlineSvg = $('[class*="logo" i] svg, a[href="/"] svg').first()
  if (inlineSvg.length) {
    const markup = $.html(inlineSvg)
    if (markup.length < 200_000) {
      const withNs = markup.includes('xmlns=') ? markup : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
      addLogo(`data:image/svg+xml;base64,${Buffer.from(withNs).toString('base64')}`)
    }
  }
  addLogo(abs($('link[rel~="apple-touch-icon"]').attr('href')))
  addLogo(abs($('link[rel~="icon"][href$=".svg"]').attr('href')))

  const images: string[] = []
  const addImage = (u?: string) => {
    if (!u || images.includes(u) || logos.includes(u)) return
    if (/\.(svg|gif)(\?|$)/i.test(u) || /(pixel|tracking|spacer|icon|sprite|avatar|badge)/i.test(u)) return
    images.push(u)
  }
  addImage(abs($('meta[property="og:image"]').attr('content')))
  $('main img, section img, article img, img').each((_, el) => {
    const $el = $(el)
    const w = Number($el.attr('width') ?? 0)
    if (w && w < 300) return
    const srcset = $el.attr('srcset')
    const best = srcset ? srcset.split(',').map((s) => s.trim().split(/\s+/)[0]).pop() : undefined
    addImage(abs(best ?? $el.attr('src') ?? $el.attr('data-src')))
  })

  const colors: string[] = []
  const theme = normalizeHex($('meta[name="theme-color"]').attr('content') ?? '')
  if (theme) colors.push(theme)
  const css = $('style').text() + ' ' + $('[style]').toArray().map((el) => $(el).attr('style')).join(' ')
  const counts = new Map<string, number>()
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = normalizeHex(m[0])
    if (!hex) continue
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const spread = Math.max(r, g, b) - Math.min(r, g, b)
    if (spread < 30) continue // grays, white, black — not brand colors
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  for (const [hex] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
    if (!colors.includes(hex)) colors.push(hex)
  }

  const tel = $('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/, '')
  const mail = $('a[href^="mailto:"]').first().attr('href')?.replace(/^mailto:/, '').split('?')[0]
  $('script, style, noscript').remove()
  const text = $('body').text().replace(/\s+/g, ' ')

  const title = $('title').first().text().trim()
  const name =
    (typeof org?.name === 'string' ? org.name : undefined) ??
    $('meta[property="og:site_name"]').attr('content') ??
    (title ? title.split(/\s[|–—-]\s/)[0].trim() : undefined)

  const contactHref = $('a')
    .toArray()
    .map((el) => $(el).attr('href'))
    .find((h) => !!h && /contact|location|visit|about/i.test(h))

  return {
    url: base,
    name: name?.slice(0, 120),
    description: ($('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content'))?.trim().slice(0, 300),
    logos: logos.slice(0, 6),
    colors: colors.slice(0, 5),
    phone: formatPhone((typeof org?.telephone === 'string' ? org.telephone : undefined) ?? (tel ? decodeURIComponent(tel) : undefined) ?? text.match(PHONE_RE)?.[0]),
    email: (typeof org?.email === 'string' ? org.email : undefined) ?? mail ?? text.match(EMAIL_RE)?.[0],
    address: ldAddress(org?.address) ?? ($('address').first().text().replace(/\s+/g, ' ').trim() || undefined),
    images: images.slice(0, 10),
    contactUrl: abs(contactHref),
  }
}

export async function crawlSite(input: string): Promise<CrawlResult> {
  const url = normalizeSiteUrl(input)
  if (!url) throw new Error('That doesn’t look like a website address.')
  const page = await safeFetch(url, { maxBytes: 3 * 1024 * 1024, accept: 'text/html,application/xhtml+xml' })
  if (!/html/i.test(page.type)) throw new Error('That address isn’t a web page.')
  const found = parsePage(page.body.toString('utf8'), page.finalUrl)

  // Contact details often live one click in.
  if ((!found.phone || !found.address || !found.email) && found.contactUrl && new URL(found.contactUrl).host === new URL(page.finalUrl).host) {
    try {
      const contact = await safeFetch(found.contactUrl, { maxBytes: 2 * 1024 * 1024, accept: 'text/html' })
      const more = parsePage(contact.body.toString('utf8'), contact.finalUrl)
      found.phone ??= more.phone
      found.email ??= more.email
      found.address ??= more.address
    } catch {
      // A missing contact page is not worth failing the whole read over.
    }
  }

  // The logo's own colors beat whatever the stylesheet happens to repeat most.
  for (const logo of found.logos.slice(0, 2)) {
    try {
      const palette = extractPalette(await smallRgba(await loadRemoteImage(logo)), 4, 4)
      if (palette.length) {
        found.colors = [...palette, ...found.colors.filter((c) => !palette.includes(c))].slice(0, 6)
        break
      }
    } catch {
      // Try the next candidate.
    }
  }

  const { contactUrl: _drop, ...result } = found
  void _drop
  return result
}
