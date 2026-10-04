/**
 * The chat way of designing: what Kan can do, and the snapshot of a design it reads.
 *
 * Shared by the server (which asks the model for a reply and actions) and the client
 * (which runs those actions through the same pipeline the studio uses). Kept small on
 * purpose: Kan sees a compact summary of the design and the last few turns, never the
 * whole history or the images, so a long session stays cheap.
 */

import { CATALOG, formatSize } from './spec'
import type { BrandKit, PrintDesign } from './types'

export const CHAT_ACTIONS = [
  'create_design',
  'set_brief',
  'set_details',
  'set_colors',
  'read_website',
  'design_page',
  'change_page',
  'set_words',
  'fix_page',
  'sharpen_page',
  'open_export',
] as const

export type ChatActionType = (typeof CHAT_ACTIONS)[number]

export interface ChatAction {
  type: ChatActionType
  /** create_design: a catalog key, or "custom". */
  product?: string
  sides?: number
  widthIn?: number
  heightIn?: number
  name?: string
  /** set_brief / design_page: what the piece is for. */
  prompt?: string
  /** 1-based page number, as people count. */
  page?: number
  instruction?: string
  takes?: number
  headline?: string
  subhead?: string
  cta?: string
  body?: string[]
  details?: string[]
  business?: string
  tagline?: string
  phone?: string
  email?: string
  website?: string
  address?: string
  colors?: string[]
  url?: string
}

export interface ChatReply {
  reply: string
  actions: ChatAction[]
  suggestions: string[]
}

/** A turn as Kan sees it. `event` turns are what the studio reports back after acting. */
export interface ChatTurn {
  role: 'user' | 'kan' | 'event'
  text: string
}

export const KAN_GREETING = 'Hi, I’m Kan. What are we making today?'
export const KAN_GREETING_SUGGESTIONS = ['A flyer for my business', 'Postcards to mail out', 'Business cards', 'A yard sign']

/** The design, in a few lines. */
export function summarizeDesign(design: PrintDesign | null, kit: BrandKit | null, brandName: string | null): string {
  const lines: string[] = []
  if (!design) {
    lines.push('No design started yet.')
  } else {
    const s = design.spec
    lines.push(
      `Design: “${design.name}”, a ${s.name.toLowerCase()} (${formatSize({ ...s, unit: 'in' })}${s.guide ? ', die-cut' : ''}${s.folds ? `, folds into ${s.folds.at.length + 1} panels` : ''}), ${s.pages.length} page${s.pages.length === 1 ? '' : 's'}.`,
    )
    if (design.brief.prompt) lines.push(`What it’s for: ${design.brief.prompt}`)
    design.pages.forEach((p, i) => {
      const v = p.versions[p.current]
      if (!v) {
        lines.push(`Page ${i + 1} (${p.label}): not designed yet.`)
        return
      }
      const words = v.copy ? [v.copy.headline, v.copy.subhead, v.copy.cta].filter(Boolean).join(' / ') : ''
      const issues = v.check ? (v.check.issues.length ? v.check.issues.map((x) => `${x.severity}: ${x.message}`).join('; ') : 'print-ready') : 'not checked yet'
      lines.push(`Page ${i + 1} (${p.label}): designed, ${p.versions.length} version${p.versions.length === 1 ? '' : 's'}. Words: ${words || '(none recorded)'}. Print check: ${issues}. ${v.check?.dpi ?? ''}${v.check ? ' dpi.' : ''}`)
    })
  }
  if (kit) {
    const d = kit.details
    const facts = [
      d.business && `business ${d.business}`,
      d.tagline && `tagline ${d.tagline}`,
      d.phone && `phone ${d.phone}`,
      d.email && `email ${d.email}`,
      d.website && `website ${d.website}`,
      d.address && `address ${d.address}`,
    ].filter(Boolean)
    lines.push(
      `Brand kit${brandName ? ` “${brandName}”` : ''}: ${facts.length ? facts.join(', ') : 'no contact details'}; ${kit.logo ? 'has a logo' : 'no logo'}; colors ${kit.colors.map((c) => c.hex).join(' ') || 'none'}; ${kit.assets.length} photo${kit.assets.length === 1 ? '' : 's'}.`,
    )
  } else {
    lines.push('No brand kit yet (no logo, colors or contact details).')
  }
  return lines.join('\n')
}

export function chatSystemPrompt(): string {
  const products = CATALOG.map((p) => `${p.key} (${p.name}, ${p.blurb}${p.pageOptions ? `, ${p.pageOptions.join(' or ')} sides` : `, ${p.spec.pages.length} side${p.spec.pages.length === 1 ? '' : 's'}`})`).join('; ')
  return [
    'You are Kan, a friendly print designer inside a design-to-print shop. You help small business owners get a finished, print-ready piece made through conversation — quickly. Getting them done is the goal; you are not an interviewer.',
    '',
    'How to talk:',
    '- Short and warm: one to three sentences. Plain words. American English. No emoji.',
    '- Ask at most one question at a time, and only when you truly need the answer.',
    '- As soon as you know what they are making and what it is for, start designing. Business details and style can be refined after they see something.',
    '- Never invent phone numbers, addresses, emails, websites, prices or dates. If they matter, ask, or leave them off.',
    '- After something is made, say in a sentence what you made and why, then offer the natural next step.',
    '- Don’t mention tools, actions, JSON, models or tokens.',
    '',
    'What you can do (put these in "actions"; they run in order, then you will be told the result in an [event] message):',
    `- create_design {product, sides?, name} — start a design. Products: ${products}. For any other size use product "custom" with widthIn and heightIn. Only when no design exists yet.`,
    '- set_brief {prompt} — record what the piece is for, in their words plus anything you learned (offer, event, date, audience, feel).',
    '- set_details {business?, tagline?, phone?, email?, website?, address?} — save contact details they gave you. Only what they said.',
    '- set_colors {colors: ["#RRGGBB", ...]} — brand colors they named.',
    '- read_website {url} — pick up their logo, colors and contact details from their site. Offer this when they mention a website.',
    '- design_page {page, prompt?, takes?} — design page N (1-based). prompt is extra direction for this page. takes 1–3 (use 2 when they seem unsure what they want).',
    '- change_page {page, instruction} — change a designed page; everything else stays.',
    '- set_words {page, headline?, subhead?, cta?, body?, details?} — set exact words on a designed page.',
    '- fix_page {page} — fix the print-check problems on a page.',
    '- sharpen_page {page} — redraw at higher resolution for print.',
    '- open_export {} — open the print download when they say they are done.',
    '',
    'Suggestions: give 2–4 short quick replies the person might tap next, written as the person (e.g. "Make the headline bigger", "Design the back", "Looks great, I’m done").',
    'When an [event] reports print-check errors, mention it simply and offer to fix it.',
    'Reply with JSON only: {"reply": string, "actions": [...], "suggestions": [string]}',
  ].join('\n')
}

export function chatUserPrompt(summary: string, turns: ChatTurn[]): string {
  const convo = turns
    .map((t) => `${t.role === 'user' ? 'Person' : t.role === 'kan' ? 'Kan' : '[event]'}: ${t.text}`)
    .join('\n')
  return `Current state:\n${summary}\n\nConversation so far (most recent last):\n${convo}\n\nRespond as Kan to the latest message.`
}

/** Clean a model's reply into something safe to act on. */
export function cleanChatReply(raw: unknown): ChatReply {
  const r = (raw ?? {}) as Partial<ChatReply>
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined)
  const strs = (v: unknown, n: number, max: number) =>
    Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, n) : undefined
  const num = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined

  const actions: ChatAction[] = []
  for (const a of Array.isArray(r.actions) ? r.actions : []) {
    if (!a || !(CHAT_ACTIONS as readonly string[]).includes(a.type)) continue
    const clean: ChatAction = { type: a.type }
    const assign = <K extends keyof ChatAction>(k: K, v: ChatAction[K] | undefined) => {
      if (v !== undefined && !(Array.isArray(v) && v.length === 0)) clean[k] = v
    }
    assign('product', str(a.product, 40))
    assign('sides', num(a.sides, 1, 12))
    assign('widthIn', num(a.widthIn, 0.5, 240))
    assign('heightIn', num(a.heightIn, 0.5, 240))
    assign('name', str(a.name, 120))
    assign('prompt', str(a.prompt, 1500))
    assign('page', num(a.page, 1, 12))
    assign('instruction', str(a.instruction, 1000))
    assign('takes', num(a.takes, 1, 3))
    assign('headline', str(a.headline, 160))
    assign('subhead', str(a.subhead, 240))
    assign('cta', str(a.cta, 160))
    assign('body', strs(a.body, 12, 400))
    assign('details', strs(a.details, 10, 300))
    assign('business', str(a.business, 120))
    assign('tagline', str(a.tagline, 200))
    assign('phone', str(a.phone, 60))
    assign('email', str(a.email, 120))
    assign('website', str(a.website, 200))
    assign('address', str(a.address, 300))
    assign('colors', strs(a.colors, 8, 9)?.filter((c) => /^#[0-9a-f]{6}$/i.test(c)))
    assign('url', str(a.url, 300))
    actions.push(clean)
  }
  return {
    reply: str(r.reply, 2000) ?? '',
    actions: actions.slice(0, 6),
    suggestions: strs(r.suggestions, 4, 80) ?? [],
  }
}
