/**
 * Build-sized image URLs
 *
 * Images persist across a thread and are re-sent on every build, so their size
 * compounds. This trims them at the CDN — but a mangled URL means no image at all,
 * which is worse than a large one, so the rewrite has to be exactly right and must
 * leave anything it doesn't understand alone.
 */
import { describe, it, expect } from 'vitest'
import { buildSizedImageUrl } from '../lib/playground/generateApp'

const CLOUDINARY = 'https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/photo.jpg'

describe('buildSizedImageUrl', () => {
  it('inserts a size limit into a plain Cloudinary URL', () => {
    const out = buildSizedImageUrl(CLOUDINARY)
    expect(out).toBe(
      'https://res.cloudinary.com/dcht3dytz/image/upload/c_limit,w_1024,q_auto,f_jpg/v1769532115/photo.jpg'
    )
  })

  it('keeps the rest of the path intact', () => {
    const out = buildSizedImageUrl(CLOUDINARY)
    expect(out).toContain('/v1769532115/photo.jpg')
    expect(out.startsWith('https://res.cloudinary.com/dcht3dytz/image/upload/')).toBe(true)
  })

  it('leaves a URL that already carries transformations alone', () => {
    const already = 'https://res.cloudinary.com/x/image/upload/f_png,w_128/v1/icon.svg'
    expect(buildSizedImageUrl(already)).toBe(already)
  })

  it('passes non-Cloudinary URLs through untouched', () => {
    for (const url of [
      'https://example.com/photo.png',
      'https://images.unsplash.com/photo-123',
      'data:image/png;base64,AAAA',
    ]) {
      expect(buildSizedImageUrl(url)).toBe(url)
    }
  })

  it('passes through a Cloudinary URL with no /upload/ segment', () => {
    const odd = 'https://res.cloudinary.com/x/image/fetch/http://a.com/b.png'
    expect(buildSizedImageUrl(odd)).toBe(odd)
  })

  it('never produces a doubled or malformed path', () => {
    const out = buildSizedImageUrl(CLOUDINARY)
    expect(out).not.toContain('//upload')
    expect(out).not.toContain('upload/upload')
    expect(out.match(/\/upload\//g)?.length).toBe(1)
  })
})
