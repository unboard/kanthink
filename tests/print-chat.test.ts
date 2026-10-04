import { describe, expect, it } from 'vitest'
import { chatSystemPrompt, cleanChatReply, summarizeDesign } from '../lib/print/chat'
import { catalogProduct } from '../lib/print/spec'
import { DEFAULT_BRIEF, type PrintDesign } from '../lib/print/types'

describe('print chat', () => {
  it('keeps only known actions and safe values', () => {
    const r = cleanChatReply({
      reply: 'On it.',
      actions: [
        { type: 'design_page', page: 99, takes: 7 },
        { type: 'delete_everything' },
        { type: 'set_colors', colors: ['#C2410C', 'red', '#12'] },
      ],
      suggestions: ['a', 'b', 'c', 'd', 'e'],
    })
    expect(r.actions.map((a) => a.type)).toEqual(['design_page', 'set_colors'])
    expect(r.actions[0].page).toBe(12)
    expect(r.actions[0].takes).toBe(3)
    expect(r.actions[1].colors).toEqual(['#C2410C'])
    expect(r.suggestions).toHaveLength(4)
  })

  it('survives garbage', () => {
    expect(cleanChatReply(null)).toEqual({ reply: '', actions: [], suggestions: [] })
  })

  it('summarizes a design compactly, with print status', () => {
    const spec = catalogProduct('postcard-6x4')!.spec
    const design: PrintDesign = {
      id: 'd', name: 'Spring mailer', spec, brandId: null, brief: { ...DEFAULT_BRIEF, prompt: 'Spring sale' },
      pages: [
        { id: 'a', label: 'Front', current: 0, versions: [{ id: 'v', url: 'u', rawUrl: 'u', width: 1, height: 1, rawWidth: 1, rawHeight: 1, model: 'm', mode: 'create', at: 0, copy: { headline: 'Spring Sale' }, check: { at: 0, ok: true, issues: [], elements: [], dpi: 400 } }] },
        { id: 'b', label: 'Back', current: 0, versions: [] },
      ],
      renders: 1, spendCents: 15, createdAt: 0, updatedAt: 0,
    }
    const s = summarizeDesign(design, null, null)
    expect(s).toContain('Page 1 (Front): designed')
    expect(s).toContain('Spring Sale')
    expect(s).toContain('print-ready')
    expect(s).toContain('Page 2 (Back): not designed yet')
    expect(s.length).toBeLessThan(800)
  })

  it('tells Kan never to invent contact details', () => {
    expect(chatSystemPrompt()).toMatch(/Never invent phone numbers/)
  })
})
