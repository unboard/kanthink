import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import {
  clearProviderKey,
  setProviderKey,
  userOwnedProviders,
  resolveProviderKeys,
} from '@/lib/ai/keys'
import {
  getModelPreferences,
  setModelPreferences,
  resolveSurfaceModel,
  AI_SURFACES,
} from '@/lib/ai/modelPreferences'
import {
  MODEL_CATALOG,
  formatModelChoice,
  providerGroup,
  type ModelProvider,
} from '@/lib/ai/modelCatalog'

export const runtime = 'nodejs'

function isProvider(value: unknown): value is ModelProvider {
  return value === 'openai' || value === 'google'
}

/**
 * Everything the AI settings screen needs, in one round trip: which providers have
 * a key, what the default model is, and what each area actually resolves to.
 *
 * The resolved-per-area part matters more than it looks. A preference you cannot
 * see the effect of is a preference you stop trusting, and with two providers and
 * a fallback chain, "what will Kan actually use for chat" is a genuine question.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    await ensureSchema()
    const [owned, preferences, { keys }] = await Promise.all([
      userOwnedProviders(session.user.id),
      getModelPreferences(session.user.id),
      resolveProviderKeys(session.user.id),
    ])

    const available = (Object.keys(keys) as ModelProvider[]).filter((p) => !!keys[p])

    // What each area will actually run, given the preferences and the keys held.
    const resolved = Object.fromEntries(
      AI_SURFACES.map((surface) => {
        const model = resolveSurfaceModel(preferences, surface.key, keys)
        return [
          surface.key,
          model
            ? { choice: formatModelChoice(model.provider, model.model), fellBack: model.fellBack }
            : null,
        ]
      }),
    )

    return NextResponse.json({
      /** Providers the user saved their own key for — the ones they can clear. */
      ownedProviders: owned,
      /** Providers callable at all, including this deployment's shared keys. */
      availableProviders: available,
      preferences,
      resolved,
      catalog: MODEL_CATALOG,
      surfaces: AI_SURFACES,
    })
  } catch (error) {
    console.error('[ai-config] GET failed:', error)
    return NextResponse.json({ error: 'Could not load your AI settings' }, { status: 500 })
  }
}

/**
 * Save a key, clear a key, or change the model preferences.
 *
 * A key is validated against the provider before it is stored. Saving one that does
 * not work is a failure you find out about hours later, in a shroom run, as a
 * sentence about quota — so it is worth one round trip now.
 */
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: {
    action?: 'saveKey' | 'clearKey' | 'savePreferences'
    provider?: string
    apiKey?: string
    default?: string | null
    overrides?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    await ensureSchema()

    if (body.action === 'clearKey') {
      if (!isProvider(body.provider)) {
        return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
      }
      await clearProviderKey(session.user.id, body.provider)
      return GET()
    }

    if (body.action === 'saveKey') {
      if (!isProvider(body.provider)) {
        return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
      }
      const apiKey = (body.apiKey || '').trim()
      if (!apiKey) {
        return NextResponse.json({ error: 'Enter an API key' }, { status: 400 })
      }

      const failure = await validateKey(body.provider, apiKey)
      if (failure) return NextResponse.json({ error: failure }, { status: 400 })

      await setProviderKey(session.user.id, body.provider, apiKey)

      // First key in: name a default, so "what is this account running" has an
      // answer from the start rather than resolving to whatever happens to be held.
      const preferences = await getModelPreferences(session.user.id)
      if (!preferences.default) {
        await setModelPreferences(session.user.id, {
          default: formatModelChoice(body.provider, providerGroup(body.provider).defaultModel),
        })
      }

      return GET()
    }

    if (body.action === 'savePreferences') {
      await setModelPreferences(session.user.id, {
        default: body.default ?? null,
        overrides: body.overrides ?? {},
      })
      return GET()
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('[ai-config] PATCH failed:', error)
    return NextResponse.json({ error: 'Could not save your AI settings' }, { status: 500 })
  }
}

/** Null when the key works; otherwise a sentence to show the person who typed it. */
async function validateKey(provider: ModelProvider, apiKey: string): Promise<string | null> {
  try {
    if (provider === 'openai') {
      const client = new OpenAI({ apiKey })
      // The cheapest model on the account, so validating costs essentially nothing.
      await client.chat.completions.create({
        model: 'gpt-5-nano',
        max_completion_tokens: 8,
        messages: [{ role: 'user', content: 'Hi' }],
      })
    } else {
      const client = new GoogleGenAI({ apiKey })
      await client.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        config: { maxOutputTokens: 8 },
      })
    }
    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('[ai-config] key validation failed:', message)
    if (/401|invalid_api_key|API key not valid|API_KEY_INVALID/i.test(message)) {
      return 'That key was rejected by the provider.'
    }
    if (/429|quota|rate/i.test(message)) {
      // A rate-limited key is a real key. Refusing to save it would be wrong.
      return null
    }
    if (/permission|403/i.test(message)) {
      return 'That key does not have permission to call this provider.'
    }
    return message || 'Could not verify that key.'
  }
}
