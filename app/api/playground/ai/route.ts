import { NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { db } from '@/lib/db';
import { cards, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptIfNeeded } from '@/lib/crypto';
import { verifyCardToken } from '@/lib/playground/cardToken';
import { PLAYGROUND_MODELS, FALLBACK_GENERATION_MODEL_ID, getPlaygroundModel } from '@/lib/playground/models';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_OUTPUT_TOKENS = 4000;
const MAX_PROMPT_LENGTH = 16000;
// Gemini's image-gen model (Nano Banana). Used when mode === 'image'. Not in
// PLAYGROUND_MODELS because it's not a code-gen option for users — it's only
// reachable from inside generated apps via window.kanthinkAI.generateImage().
const IMAGE_MODEL_ID = 'gemini-2.5-flash-image-preview';

interface AIRequest {
  cardToken: string;
  prompt: string;
  system?: string;
  model?: string;
  mode?: 'text' | 'image';  // 'image' routes to Nano Banana for image gen / edit
  imageUrl?: string;       // public URL we'll fetch and inline
  imageData?: string;      // data:image/...;base64,... — passed through
  jsonSchema?: object;     // when provided, asks for JSON output
  maxOutputTokens?: number;
}

/** AI proxy used by playground apps via window.kanthinkAI.generate(...).
 *
 *  Authenticates with a per-card HMAC token (no cookies — the iframe runs
 *  with an opaque origin). Resolves the card owner's BYOK Gemini key (or
 *  falls back to the owner-set env key) and proxies the call.
 */
export async function POST(request: Request) {
  let body: AIRequest;
  try {
    body = await request.json();
  } catch {
    return cors(NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }));
  }

  const cardId = verifyCardToken(body.cardToken);
  if (!cardId) {
    return cors(NextResponse.json({ error: 'Invalid or missing cardToken' }, { status: 401 }));
  }
  if (!body.prompt || typeof body.prompt !== 'string') {
    return cors(NextResponse.json({ error: 'prompt is required' }, { status: 400 }));
  }
  if (body.prompt.length > MAX_PROMPT_LENGTH) {
    return cors(NextResponse.json(
      { error: `prompt too long (${body.prompt.length} > ${MAX_PROMPT_LENGTH})` },
      { status: 400 }
    ));
  }

  // Find the card and resolve the owner.
  const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
  if (!card || card.cardType !== 'playground') {
    return cors(NextResponse.json({ error: 'Card not found' }, { status: 404 }));
  }

  // Look up the channel owner's BYOK config. We can't import getUserByokConfig
  // (it relies on auth) — query directly.
  const { channels } = await import('@/lib/db/schema');
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, card.channelId),
    columns: { ownerId: true },
  });
  if (!channel?.ownerId) {
    return cors(NextResponse.json({ error: 'Card has no owner' }, { status: 500 }));
  }
  const owner = await db.query.users.findFirst({
    where: eq(users.id, channel.ownerId),
  });

  let apiKey: string | null = null;
  if (owner?.byokApiKey && owner.byokProvider === 'google') {
    try {
      apiKey = decryptIfNeeded(owner.byokApiKey);
    } catch {
      apiKey = null;
    }
  }
  if (!apiKey) apiKey = process.env.OWNER_GOOGLE_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
  if (!apiKey) {
    return cors(NextResponse.json(
      { error: 'AI is not configured for this playground (owner needs a Gemini BYOK key).' },
      { status: 503 }
    ));
  }

  const isImageMode = body.mode === 'image';

  // Fall back to the frontier model if caller didn't specify (or specified 'auto',
  // which is a virtual id only meaningful for the code-gen route's edit-type routing).
  // Image mode always uses the dedicated image-gen model regardless of body.model.
  const resolvedModelId = isImageMode
    ? IMAGE_MODEL_ID
    : (body.model && PLAYGROUND_MODELS.some(m => m.id === body.model && !m.isAuto)
        ? body.model
        : FALLBACK_GENERATION_MODEL_ID);
  const model = isImageMode ? null : getPlaygroundModel(resolvedModelId);

  // Build the parts. Text first, then any image.
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: body.prompt }];

  if (body.imageData && typeof body.imageData === 'string') {
    const match = body.imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (match) {
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
  }
  if (body.imageUrl && typeof body.imageUrl === 'string') {
    try {
      const res = await fetch(body.imageUrl);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || 'image/png';
        const buffer = await res.arrayBuffer();
        parts.push({ inlineData: { mimeType: contentType, data: Buffer.from(buffer).toString('base64') } });
      }
    } catch {
      // Silently skip a bad URL — generation continues with prompt only.
    }
  }

  const client = new GoogleGenAI({ apiKey });
  try {
    if (isImageMode) {
      // Image gen / edit via Nano Banana. Returns inline image bytes in the
      // candidate parts; we surface the first image as a data URL.
      const response = await client.models.generateContent({
        model: resolvedModelId,
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
      });
      const candidateParts = response.candidates?.[0]?.content?.parts ?? [];
      let dataUrl: string | null = null;
      let mimeType: string | null = null;
      let text = '';
      for (const p of candidateParts) {
        if (p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/')) {
          dataUrl = `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
          mimeType = p.inlineData.mimeType;
          break;
        }
      }
      for (const p of candidateParts) {
        if (typeof p.text === 'string') text += p.text;
      }
      if (!dataUrl) {
        return cors(NextResponse.json(
          { error: 'Image model returned no image. Try a different prompt or be more specific.' },
          { status: 502 }
        ));
      }
      return cors(NextResponse.json({
        dataUrl,
        mimeType,
        text: text || undefined,
        model: resolvedModelId,
        usage: response.usageMetadata
          ? {
              inputTokens: response.usageMetadata.promptTokenCount,
              outputTokens: response.usageMetadata.candidatesTokenCount,
            }
          : null,
      }));
    }

    const response = await client.models.generateContent({
      model: resolvedModelId,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: body.system,
        maxOutputTokens: Math.min(body.maxOutputTokens || MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
        responseMimeType: body.jsonSchema ? 'application/json' : undefined,
        // The schema type from the SDK isn't exported in a stable way, so we
        // accept any object and pass through; bad schemas will fail the call.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseSchema: body.jsonSchema as any,
        thinkingConfig: model && model.thinkingBudget > 0
          ? { thinkingBudget: Math.min(model.thinkingBudget, 4000) }
          : undefined,
      },
    });
    const text = response.text || '';
    let json: unknown = undefined;
    if (body.jsonSchema && text) {
      try { json = JSON.parse(text); } catch { /* leave json undefined */ }
    }
    return cors(NextResponse.json({
      text,
      json,
      model: resolvedModelId,
      usage: response.usageMetadata
        ? {
            inputTokens: response.usageMetadata.promptTokenCount,
            outputTokens: response.usageMetadata.candidatesTokenCount,
          }
        : null,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI call failed';
    return cors(NextResponse.json({ error: msg }, { status: 502 }));
  }
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

function cors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  res.headers.set('Access-Control-Max-Age', '86400');
  return res;
}
