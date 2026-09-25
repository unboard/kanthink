/**
 * Kanwatch privacy rules (extensions/kanwatch/privacy.js).
 *
 * The one promise Kanwatch makes: nothing it records could help anyone get into
 * your accounts or steal your identity. These run against the exact file the
 * extension ships and the server re-applies, so a regression here is a leak.
 */
import { describe, it, expect } from 'vitest'
import {
  isPrivateUrl, isPrivateTitle, scrubText, scrubUrl, searchQueryOf, sanitizeVisit,
  readablePageKind, publicUrlOf, scrubPageText,
} from '@/extensions/kanwatch/privacy.js'

describe('which pages may have their text read', () => {
  it.each([
    ['https://x.com/emmanuel_2m/status/2103097017073361137', '', 'post'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', '', 'video'],
    ['https://news.ycombinator.com/item?id=41234567', '', 'discussion'],
    ['https://www.reddit.com/r/webdev/comments/abc123/some_thread/', '', 'discussion'],
    ['https://someone.substack.com/p/on-building', '', 'article'],
    ['https://docs.stripe.com/webhooks', '', 'docs'],
    ['https://blog.example.com/why-kanban', 'article', 'article'],
  ])('public reading: %s', (url, ogType, kind) => {
    expect(readablePageKind(url, ogType)).toBe(kind)
  })

  it.each([
    'https://x.com/home',
    'https://x.com/messages/123-456',
    'https://x.com/i/bookmarks',
    'https://x.com/notifications',
    'https://docs.google.com/document/d/abc/edit',
    'https://github.com/unboard/kanthink/pull/12',
    'https://app.slack.com/client/T123/C456',
    'https://www.notion.so/My-private-page-abc',
    'https://www.facebook.com/some.person',
    'https://kanthink.com/channel/abc',
    'https://www.youtube.com/feed/subscriptions',
    'https://example.com/random-page',
  ])('never read — feeds, messages, your own tools, or not clearly public: %s', (url) => {
    expect(readablePageKind(url, '')).toBeNull()
  })

  it('never reads a private page, whatever it claims to be', () => {
    expect(readablePageKind('https://secure.chase.com/news', 'article')).toBeNull()
    expect(readablePageKind('https://example.com/login', 'article')).toBeNull()
    expect(readablePageKind('https://news.ycombinator.com/item?id=1', '', ['ycombinator.com'])).toBeNull()
  })

  it('keeps a working link to public pages, without query strings', () => {
    expect(publicUrlOf('https://x.com/emmanuel_2m/status/2103097017073361137?s=20&t=abc'))
      .toBe('https://x.com/emmanuel_2m/status/2103097017073361137')
    expect(publicUrlOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42'))
      .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(publicUrlOf('https://news.ycombinator.com/item?id=41234567&p=2'))
      .toBe('https://news.ycombinator.com/item?id=41234567')
  })

  it('scrubs page text like every other field', () => {
    expect(scrubPageText('DM me at jane@example.com or 555-123-4567')).toBe('DM me at [email] or [phone]')
  })
})

describe('private sites keep nothing but time', () => {
  it.each([
    'https://secure.chase.com/web/auth/dashboard',
    'https://www.bankofamerica.com/',
    'https://firstbankohio.com/accounts',
    'https://mail.google.com/mail/u/0/#inbox',
    'https://www.irs.gov/refunds',
    'https://my.ssa.gov/',
    'https://mychart.clevelandclinic.org/',
    'https://www.paypal.com/myaccount/summary',
    'https://dashboard.stripe.com/payments',
    'https://1password.com/',
    'https://accounts.google.com/v3/signin',
    'https://www.coinbase.com/home',
  ])('%s', (url) => {
    expect(isPrivateUrl(url)).toBe(true)
    expect(sanitizeVisit({ url, title: 'Anything at all' })).toEqual({ private: true })
  })

  it.each([
    'https://github.com/login',
    'https://example.com/account/security',
    'https://shop.example.com/checkout/step-2',
    'https://app.example.com/password/reset',
    'https://kanthink.com/settings/billing',
    'https://app.example.com/oauth/authorize',
  ])('sensitive pages on ordinary sites: %s', (url) => {
    expect(isPrivateUrl(url)).toBe(true)
  })

  it.each([
    'https://www.google.com/maps/dir/123+Main+St,+Springfield/Work',
    'https://maps.google.com/?q=742+Evergreen+Terrace',
    'https://maps.apple.com/place?address=1+Infinite+Loop',
    'https://www.waze.com/live-map/directions',
  ])('maps, which put home addresses in the URL: %s', (url) => {
    expect(isPrivateUrl(url)).toBe(true)
  })

  it.each([
    'https://app.example.com/reset-password/some-token',
    'https://example.com/forgot-password',
    'https://login.example.com/',
    'https://accounts.spotify.com/en/status',
    'https://sso.company.com/start',
    'https://acme.okta.com/app/home',
    'https://id.atlassian.com/manage-profile',
  ])('sign-in systems and hyphenated account pages: %s', (url) => {
    expect(isPrivateUrl(url)).toBe(true)
  })

  it.each([
    'Passport scan - Google Docs',
    'W-2 2025.pdf',
    "Driver's license front",
    '1099-NEC forms',
    'Credit report - Experian',
    'Birth certificate copy',
    'Taxes 2025 - Google Sheets',
  ])('identity-document titles on any site: %s', (title) => {
    expect(sanitizeVisit({ url: 'https://docs.google.com/document/d/abc/edit', title })).toEqual({ private: true })
  })

  it('treats a page whose title gives it away as private', () => {
    expect(isPrivateTitle('Enter your verification code')).toBe(true)
    expect(sanitizeVisit({ url: 'https://example.com/step', title: 'Sign in to continue' })).toEqual({ private: true })
  })

  it('honours domains the user blocked themselves', () => {
    expect(isPrivateUrl('https://news.ycombinator.com/', ['ycombinator.com'])).toBe(true)
  })

  it('never records non-web pages', () => {
    expect(isPrivateUrl('chrome://settings')).toBe(true)
    expect(isPrivateUrl('file:///C:/Users/me/taxes.pdf')).toBe(true)
  })

  it('leaves ordinary work sites alone', () => {
    expect(isPrivateUrl('https://docs.stripe.com/webhooks')).toBe(false)
    expect(isPrivateUrl('https://github.com/unboard/kanthink/pull/12')).toBe(false)
    expect(isPrivateUrl('http://localhost:3000/channel/abc')).toBe(false)
  })

  it('records Help Scout as a work app: subjects masked, message text never read', () => {
    const url = 'https://secure.helpscout.net/conversation/2987654321/48213?folderId=123'
    expect(isPrivateUrl(url)).toBe(false)
    expect(readablePageKind(url, 'article')).toBe(null)
    const v = sanitizeVisit({ url, title: 'Reprint for order 88812345 - jane@acme.com - Help Scout' })
    expect(v.path).toBe('/conversation/:id/:id')
    expect(v.title).not.toMatch(/88812345|jane@acme\.com/)
    // The exemption is for that one host; the sign-in rule still holds elsewhere.
    expect(isPrivateUrl('https://secure.helpscout.net/members/login/')).toBe(true)
    expect(isPrivateUrl('https://secure.example.com/dashboard')).toBe(true)
  })
})

describe('scrubText masks anything identifying', () => {
  it.each([
    ['Invoice for jane.doe@example.com', 'Invoice for [email]'],
    ['SSN 123-45-6789 on file', 'SSN [number] on file'],
    ['Card 4111 1111 1111 1111 declined', 'Card [number] declined'],
    ['Call (555) 123-4567 today', 'Call [phone] today'],
    ['Order 98765432 shipped', 'Order [number] shipped'],
    ['key sk_live_51H8abcDEF123ghiJKL456', 'key [token]'],
  ])('%s', (input, expected) => {
    expect(scrubText(input)).toBe(expected)
  })

  it('keeps ordinary titles readable', () => {
    expect(scrubText('Webhooks | Stripe Documentation')).toBe('Webhooks | Stripe Documentation')
    expect(scrubText('Issue #1234 · dnd-kit touch sensor')).toBe('Issue #1234 · dnd-kit touch sensor')
  })
})

describe('scrubUrl keeps where, not what', () => {
  it('drops the query string and fragment', () => {
    expect(scrubUrl('https://example.com/reset?token=abc123secret#step2')).toEqual({ domain: 'example.com', path: '/reset' })
  })

  it('masks ids, emails and tokens in the path', () => {
    expect(scrubUrl('https://app.example.com/users/jane@example.com/orders/88812345')?.path).toBe('/users/:id/orders/:id')
    expect(scrubUrl('https://x.com/a/3f2b1c9e-1d2a-4b5c-8d7e-9f0a1b2c3d4e')?.path).toBe('/a/:id')
  })

  it('keeps at most four path segments', () => {
    expect(scrubUrl('https://example.com/a/b/c/d/e/f')?.path).toBe('/a/b/c/d')
  })

  it('keeps the port for local dev servers', () => {
    expect(scrubUrl('http://localhost:3000/channel/x')?.domain).toBe('localhost:3000')
  })
})

describe('search queries', () => {
  it('keeps what you searched for, scrubbed', () => {
    expect(searchQueryOf('https://www.google.com/search?q=dnd-kit+touch+sensor')).toBe('dnd-kit touch sensor')
    expect(searchQueryOf('https://www.google.com/search?q=is+jane%40example.com+real')).toBe('is [email] real')
  })

  it('ignores query strings on sites that are not search engines', () => {
    expect(searchQueryOf('https://example.com/page?q=secret')).toBe('')
  })

  it('can be switched off', () => {
    const v = sanitizeVisit({ url: 'https://www.google.com/search?q=hello', includeSearch: false })
    expect(v.private).toBe(false)
    if (!v.private) expect(v.searchQuery).toBe('')
  })
})
