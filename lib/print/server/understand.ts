import { GoogleGenAI, Type, type Schema } from '@google/genai'
import { getLLMClientForUser } from '@/lib/ai/llm'
import type { ProviderKeys } from '@/lib/ai/keys'
import type { PageCopy, PreflightElement } from '../types'

/**
 * The two language-model jobs in the print pipeline: writing a page's words before it
 * is drawn, and finding the words, logos and faces on a page after it is drawn.
 *
 * Both prefer Gemini with a response schema — structured output means no JSON
 * scraping, and Gemini's boxes (`box_2d`, 0–1000) are the most reliable available.
 * Without a Google key they fall back to whatever model the account uses.
 */

const GEMINI_TEXT_MODELS = ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash']

async function geminiJson<T>(
  apiKey: string,
  parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[],
  schema: Schema,
): Promise<T> {
  const client = new GoogleGenAI({ apiKey })
  let lastError: unknown
  for (const model of GEMINI_TEXT_MODELS) {
    try {
      const res = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.4 },
      })
      const text = res.text ?? ''
      return JSON.parse(text) as T
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      if (!/NOT_FOUND|404|not found|not supported/i.test(msg)) throw err
    }
  }
  throw lastError
}

function parseLooseJson<T>(text: string): T | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

// Descriptions matter: without them the model tends to pour every line into `subhead`.
const COPY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, description: 'The one dominant line. At most 8 words.' },
    subhead: { type: Type.STRING, description: 'One short supporting line under the headline. Optional. At most 14 words.' },
    body: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Short paragraphs or bullet lines, each its own item. Optional.' },
    cta: { type: Type.STRING, description: 'The call to action: what to do next. At most 8 words.' },
    details: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Contact lines and small print, one per item: address, phone, website, hours.' },
    imagery: { type: Type.STRING, description: 'Not printed. The photo or illustration to show.' },
    layout: { type: Type.STRING, description: 'Not printed. One sentence on composition.' },
  },
  propertyOrdering: ['headline', 'subhead', 'body', 'cta', 'details', 'imagery', 'layout'],
  required: ['headline', 'imagery', 'layout'],
}

export function cleanCopy(raw: unknown): PageCopy {
  const c = (raw ?? {}) as Record<string, unknown>
  const str = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  const list = (v: unknown, n: number) =>
    Array.isArray(v) ? v.map((x) => str(x, 400)).filter((x): x is string => !!x).slice(0, n) : undefined
  const copy: PageCopy = {
    headline: str(c.headline, 160),
    subhead: str(c.subhead, 240),
    body: list(c.body, 12),
    cta: str(c.cta, 160),
    details: list(c.details, 10),
    imagery: str(c.imagery, 500),
    layout: str(c.layout, 500),
  }
  for (const k of Object.keys(copy) as (keyof PageCopy)[]) {
    const v = copy[k]
    if (v === undefined || (Array.isArray(v) && v.length === 0)) delete copy[k]
  }
  return copy
}

export async function writeCopy(userId: string, keys: ProviderKeys, prompt: string): Promise<PageCopy | null> {
  try {
    if (keys.google) {
      const raw = await geminiJson<unknown>(keys.google.apiKey, [{ text: prompt }], COPY_SCHEMA)
      return cleanCopy(raw)
    }
    const { client } = await getLLMClientForUser(userId, undefined, 'apps')
    if (!client) return null
    const res = await client.complete([{ role: 'user', content: prompt }], { maxTokens: 1200 })
    const parsed = parseLooseJson<unknown>(res.content)
    return parsed ? cleanCopy(parsed) : null
  } catch (err) {
    // Copy is an aid, not a gate: without it the image model writes its own words.
    console.error('[print] copy failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Finding things on a page
// ---------------------------------------------------------------------------

const LOCATE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    elements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, enum: ['text', 'logo', 'qr', 'face'] },
          text: { type: Type.STRING },
          box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        },
        required: ['kind', 'box_2d'],
      },
    },
  },
  required: ['elements'],
}

const LOCATE_PROMPT = [
  'This is a print design. Find every block of text, every logo, every QR code or barcode, and every human face on it.',
  'Return one element per line of text (group words on the same line together), each logo, each QR code, each face.',
  'For text, transcribe it exactly as it appears, including any misspellings — do not correct anything.',
  'box_2d is [ymin, xmin, ymax, xmax] scaled to 0–1000, tight around the element.',
  'Ignore background photos, textures and decorative shapes.',
].join('\n')

type RawElement = { kind?: string; text?: string; box_2d?: number[] }

function toElements(raw: { elements?: RawElement[] } | null): PreflightElement[] {
  const out: PreflightElement[] = []
  for (const e of raw?.elements ?? []) {
    const b = e.box_2d
    if (!Array.isArray(b) || b.length !== 4 || !b.every((v) => Number.isFinite(v))) continue
    const [ymin, xmin, ymax, xmax] = b.map((v) => Math.min(1000, Math.max(0, v)) / 1000)
    if (xmax <= xmin || ymax <= ymin) continue
    const kind = (['text', 'logo', 'qr', 'face'] as const).find((k) => k === e.kind) ?? 'other'
    out.push({ kind, text: e.text?.slice(0, 200), box: [xmin, ymin, xmax, ymax] })
  }
  return out.slice(0, 80)
}

export async function locateElements(userId: string, keys: ProviderKeys, jpeg: Buffer): Promise<PreflightElement[] | null> {
  try {
    if (keys.google) {
      const raw = await geminiJson<{ elements?: RawElement[] }>(
        keys.google.apiKey,
        [{ inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } }, { text: LOCATE_PROMPT }],
        LOCATE_SCHEMA,
      )
      return toElements(raw)
    }
    const { client } = await getLLMClientForUser(userId, undefined, 'apps')
    if (!client) return null
    const res = await client.complete(
      [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` } },
            { type: 'text', text: `${LOCATE_PROMPT}\nReply with JSON only: {"elements":[{"kind":"text|logo|qr|face","text":"...","box_2d":[ymin,xmin,ymax,xmax]}]}` },
          ],
        },
      ],
      { maxTokens: 3000 },
    )
    return toElements(parseLooseJson(res.content))
  } catch (err) {
    console.error('[print] locate failed:', err instanceof Error ? err.message : err)
    return null
  }
}
