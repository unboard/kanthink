import { describe, expect, it } from 'vitest'
import { composePrompt, parseStyleCard, stageOf, templateOf } from '@/lib/styles/library'

const CARD = `## Reusable prompt template

> Hand-painted watercolor illustration of **{primary subject}** in **{setting}**. Use a restrained palette of **{palette}**; **{aspect ratio}**.

## Visual outcome

An airy, tactile illustration with softened contours.

## Example reference

- **Source page:** [Google Cloud Vertex AI](https://cloud.google.com/vertex-ai/docs/image)

## Useful variables

- **Subject:** boat, storefront, landmark
- **Palette:** muted blue/rust, sage/ochre

## Product and print uses

- Destination postcards
- Tourism brochures

## Tags

\`watercolor\` \`illustration\` \`postcard\``

describe('Style library: prompt cards read as styles', () => {
  it('reads the template, outcome, slots, uses, tags and source from a card', () => {
    const s = parseStyleCard({ id: 'c1', title: 'Muted Watercolor', columnName: 'To Test', messages: [{ content: CARD }] })!
    expect(s.template).toBe('Hand-painted watercolor illustration of {primary subject} in {setting}. Use a restrained palette of {palette}; {aspect ratio}.')
    expect(s.outcome).toMatch(/^An airy/)
    expect(s.variables).toEqual([{ name: 'Subject', examples: 'boat, storefront, landmark' }, { name: 'Palette', examples: 'muted blue/rust, sage/ochre' }])
    expect(s.uses).toEqual(['Destination postcards', 'Tourism brochures'])
    expect(s.tags).toEqual(['watercolor', 'illustration', 'postcard'])
    expect(s.sourceUrl).toBe('https://cloud.google.com/vertex-ai/docs/image')
    expect(s.stage).toBe('testing')
    expect(s.imageUrl).toBeNull()
  })

  it('uses the latest image on the thread when the card has no cover', () => {
    const s = parseStyleCard({ id: 'c1', title: 'x', columnName: 'Newly Found', messages: [{ content: CARD }, { content: 'tried', imageUrls: ['https://img/a.png'] }] })!
    expect(s.imageUrl).toBe('https://img/a.png')
  })

  it('skips cards that are not prompt cards', () => {
    expect(templateOf('Just a note about something')).toBeNull()
    expect(parseStyleCard({ id: 'c', title: 't', columnName: 'Inbox', messages: [{ content: 'hello' }] })).toBeNull()
  })

  it('maps the channel columns to testing stages', () => {
    expect(['Newly Found', 'To Test', 'Tested', 'Curated Library', 'Set Aside'].map(stageOf)).toEqual(['new', 'testing', 'tested', 'curated', 'aside'])
  })

  it('keeps the style words intact and adds the print brief after them', () => {
    const p = composePrompt({ name: 'Watercolor', template: 'Paint {subject} softly.' }, { format: 'postcard', subject: 'A harbor town', message: 'Wish you were here', audience: '', constraints: 'no people' })
    expect(p).toContain('Paint {subject} softly.')
    expect(p).toMatch(/front of a landscape postcard/)
    expect(p).toMatch(/Subject: A harbor town/)
    expect(p).toMatch(/Must: no people/)
    expect(p).not.toMatch(/Who it's for/)
    expect(p).toMatch(/Aspect ratio: 4:3/)
  })
})
