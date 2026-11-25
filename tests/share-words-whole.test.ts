/**
 * A share's own words reach whoever builds from it, whole.
 *
 * Reported as "how could we take the feedback I provided in the shared link and
 * create a doodle board". The note described an infinite vertical canvas of picture
 * frames placed freely, with a person at the bottom watching along whom you could tap
 * to ask about what they see. Every reader got it clipped: the share line was cut at
 * 400 characters with a long post title first, the bot prompt cut that to 220 and
 * Made for you to 260. All that survived was "an infinite vertical canvas that is a
 * single zoom level", and the bot built a sketchpad from it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe("the owner's words about a share", () => {
  it('lead the share line and are not clipped with the title', () => {
    const src = read('lib/kan/attention/inputs.ts')
    expect(src).toMatch(/They said: "\$\{clip\(said, 1500\)\}"/)
    expect(src).not.toMatch(/they said: "\$\{said\}"` : ''\} · \$\{page\}`, 400\)/)
  })

  it('reach the bot whole, with the card to open', () => {
    const src = read('lib/kan/bots/prompt.ts')
    expect(src).toMatch(/i\.said \? 1700 : 220/)
    expect(src).toMatch(/their words are the spec/)
    expect(src).toMatch(/fromCardId/)
  })

  it('ride into the build brief as written', () => {
    const src = read('lib/kan/bots/approvals.ts')
    expect(src).toMatch(/fromCardId/)
    expect(src).toMatch(/await ownerWords\(str\(input\.fromCardId\)/)
  })

  it('reach Made for you whole', () => {
    const src = read('lib/kan/madeForYou.ts')
    expect(src).not.toMatch(/clip\(s\.text, 260\)/)
    expect(src).toMatch(/their words are the spec/)
  })
})
