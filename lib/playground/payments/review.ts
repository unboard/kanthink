import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { playgroundApps } from '@/lib/db/schema'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { runStructured } from '../generateClient'
import { getPlaygroundModel, type PlaygroundProvider } from '../models'
import { checkPayments } from './check'
import { codeHash, paymentSettings, settingsKey } from './settings'
import type { PaymentFinding, PaymentReview } from './types'

/**
 * Kan reads the app against its payment settings.
 *
 * The deterministic check (check.ts) sees calls and strings. This sees intent: that
 * the app is a shop selling rocks for local pickup, that its "Order" button is the
 * thing that should cost money, that the owner hasn't said where pickup happens.
 * It runs after a price is saved and after builds of apps that charge or look like
 * they sell. It's a small call on a cheap model, and stored with the code it read so
 * a stale one is recognizable.
 */

const MODEL: Record<PlaygroundProvider, { id: string; maxTokens: number }> = {
  google: { id: 'gemini-3.1-flash-lite', maxTokens: 1500 },
  openai: { id: 'gpt-5.6-luna', maxTokens: 5000 },
  anthropic: { id: 'claude-haiku-4-5', maxTokens: 1500 },
}

const SYSTEM = `You oversee how a small web app takes payment. You are given the app's code, what its owner asked for, and its payment settings. Judge whether the app takes money the way the settings say, and whether the settings fit what the app does.

The payment kinds:
- free: charges nobody.
- app: pay once (or subscribe) at the door to open the app at all.
- action: free to open; one feature inside costs money and stays unlocked after paying (kanthinkPay.unlock()). For tools and premium features.
- order: a shop. Each purchase is its own order for an item, paid separately (kanthinkPay.order({ item })); checkout collects the buyer's name, email, and phone/address if asked. For selling physical or made-to-order things, bookings or anything bought more than once.

Return:
- sells: one plain sentence on what the app sells, or "Nothing; it's a free tool."
- suggestedMode: the kind that fits what the app actually does.
- why: one sentence for the owner.
- suggestedFulfilment: for a shop, how buyers most likely get their order (pickup, shipping, digital, contact), else null.
- questions: up to 3 short questions the owner should answer that the settings don't (where pickup happens, whether to collect a phone number, what exactly costs money). None if the settings already cover it.
- issues: real problems in the code's payment flow that matter to a buyer or the owner and that the listed automatic findings don't already cover. Each with a short title, a plain detail for the owner, a fix instruction for the builder, and severity. Don't repeat the automatic findings. Don't invent problems; an empty list is a good answer.`

const SCHEMA = {
  type: 'object',
  properties: {
    sells: { type: 'string' },
    suggestedMode: { type: 'string', enum: ['free', 'app', 'action', 'order'] },
    why: { type: 'string' },
    suggestedFulfilment: { type: 'string', enum: ['pickup', 'shipping', 'digital', 'contact', 'none'] },
    questions: { type: 'array', items: { type: 'string' } },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          fix: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'detail', 'fix', 'severity'],
      },
    },
  },
  required: ['sells', 'suggestedMode', 'why', 'suggestedFulfilment', 'questions', 'issues'],
}

export async function reviewPayments(appId: string, userId: string): Promise<PaymentReview | null> {
  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
  if (!app?.code) return null

  const settings = paymentSettings(app)
  const hash = codeHash(app.code)
  const key = settingsKey(settings)
  // Already reviewed exactly this code against exactly these settings.
  if (app.paymentReview && app.paymentReview.codeHash === hash && app.paymentReview.settingsKey === key) return app.paymentReview

  const { keys } = await resolveProviderKeys(userId)
  const provider = (['google', 'openai', 'anthropic'] as const).find((p) => keys[p])
  if (!provider) return null

  const automatic = checkPayments(app.code, settings)
  const pick = MODEL[provider]
  const userText = [
    `APP: ${app.title}${app.summary ? ` (${app.summary})` : ''}`,
    `PAYMENT SETTINGS: ${settings.mode}${settings.price ? ` at ${settings.price}` : ''}${settings.setup ? `; owner's answers: ${JSON.stringify(settings.setup)}` : ''}`,
    app.requirements ? `WHAT THE OWNER ASKED FOR:\n${app.requirements.slice(0, 3000)}` : '',
    `AUTOMATIC FINDINGS ALREADY SHOWN (don't repeat):\n${automatic.map((f) => `- ${f.title}`).join('\n') || '(none)'}`,
    `CODE:\n${app.code.slice(0, 60_000)}`,
  ].filter(Boolean).join('\n\n')

  try {
    const res = await runStructured({
      model: getPlaygroundModel(pick.id),
      apiKey: keys[provider]!.apiKey,
      systemInstruction: SYSTEM,
      userText,
      images: [],
      schema: SCHEMA,
      schemaName: 'payment_review',
      maxOutputTokens: pick.maxTokens,
      signal: AbortSignal.timeout(45_000),
    })
    const parsed = JSON.parse(res.text || '{}') as {
      sells?: string; suggestedMode?: string; why?: string; suggestedFulfilment?: string
      questions?: string[]; issues?: Array<{ title?: string; detail?: string; fix?: string; severity?: string }>
    }
    const modes = ['free', 'app', 'action', 'order'] as const
    const fulfilments = ['pickup', 'shipping', 'digital', 'contact'] as const
    const review: PaymentReview = {
      sells: String(parsed.sells || '').slice(0, 300),
      suggestedMode: (modes as readonly string[]).includes(parsed.suggestedMode || '') ? parsed.suggestedMode as PaymentReview['suggestedMode'] : settings.mode,
      why: String(parsed.why || '').slice(0, 300),
      suggestedFulfilment: (fulfilments as readonly string[]).includes(parsed.suggestedFulfilment || '') ? parsed.suggestedFulfilment as PaymentReview['suggestedFulfilment'] : null,
      questions: (parsed.questions || []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 3).map((q) => q.slice(0, 200)),
      issues: (parsed.issues || []).filter((i) => i?.title && i?.fix).slice(0, 4).map((i, n): PaymentFinding => ({
        id: `kan-${n}`,
        severity: i.severity === 'high' || i.severity === 'medium' ? i.severity : 'low',
        title: String(i.title).slice(0, 120),
        detail: String(i.detail || '').slice(0, 300),
        fix: String(i.fix).slice(0, 500),
      })),
      codeHash: hash,
      settingsKey: key,
      reviewedAt: new Date().toISOString(),
    }
    await db.update(playgroundApps).set({ paymentReview: review }).where(eq(playgroundApps.id, app.id))
    return review
  } catch (error) {
    console.warn('[payments] review failed:', error instanceof Error ? error.message : error)
    return null
  }
}
