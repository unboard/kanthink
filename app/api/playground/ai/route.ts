import { NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import OpenAI, { toFile } from 'openai';
import { db } from '@/lib/db';
import { playgroundApps, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptIfNeeded } from '@/lib/crypto';
import { verifyAppToken } from '@/lib/playground/appToken';
import {
  assumeCharged,
  denialMessage,
  release,
  reserve,
  settle,
} from '@/lib/playground/aiBudget';
import { identifyVisitor } from '@/lib/playground/visitor';
import { PLAYGROUND_MODELS, FALLBACK_GENERATION_MODEL_ID, getPlaygroundModel } from '@/lib/playground/models';
import {
  DEFAULT_IMAGE_MODEL_ID,
  GOOGLE_IMAGE_FALLBACK_ID,
  findImageModel,
  isImageBackground,
  resolveImageModel,
  type ImageBackground,
  type ImageProvider,
} from '@/lib/ai/imageModels';
import { getModelPreferences } from '@/lib/ai/modelPreferences';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_OUTPUT_TOKENS = 4000;
const MAX_PROMPT_LENGTH = 16000;
// The system instruction counts toward the reservation too, so it needs a ceiling of
// its own. Without one there is no largest possible request, and nothing to check a
// reservation against.
const MAX_SYSTEM_LENGTH = 8000;
// Image models live in lib/ai/imageModels rather than PLAYGROUND_MODELS, because
// they are not code-gen options for users — they are reachable only from inside a
// generated app via window.kanthinkAI.generateImage(), and from the composer.
//
// Which one runs is the app's own request first, then the owner's account default
// from Settings → AI, then the catalogue default. A transparent request narrows the
// field to models that actually have the parameter, which is what makes a sticker
// app possible: Gemini cannot cut a background out, and quietly handing back an
// opaque PNG would leave the app's author debugging their prompt for an hour.
const IMAGE_FALLBACK_MODEL = findImageModel(GOOGLE_IMAGE_FALLBACK_ID)!.model;

/** Aspect ratios an app can ask for, mapped to the sizes OpenAI accepts. */
const OPENAI_SIZE_MAP: Record<string, '1024x1024' | '1536x1024' | '1024x1536'> = {
  '1:1': '1024x1024',
  '4:3': '1536x1024',
  '16:9': '1536x1024',
  '3:4': '1024x1536',
  '9:16': '1024x1536',
};

interface AIRequest {
  appToken: string;
  prompt: string;
  system?: string;
  model?: string;
  mode?: 'text' | 'image';  // 'image' routes to an image model for gen / edit
  imageModel?: string;     // image-mode only: which image model, qualified or bare
  background?: string;     // image-mode only: 'auto' | 'transparent' | 'opaque'
  size?: string;           // image-mode only: '1:1' | '4:3' | '16:9' | '3:4' | '9:16'
  imageUrl?: string;       // public URL we'll fetch and inline
  imageData?: string;      // data:image/...;base64,... — passed through
  jsonSchema?: object;     // when provided, asks for JSON output
  maxOutputTokens?: number;
}

/** AI proxy used by playground apps via window.kanthinkAI.generate(...).
 *
 *  Authenticates with a per-app HMAC token (no cookies — the iframe runs
 *  with an opaque origin). Resolves the owning channel's BYOK Gemini key (or
 *  falls back to the owner-set env key) and proxies the call.
 */
export async function POST(request: Request) {
  let body: AIRequest;
  try {
    body = await request.json();
  } catch {
    return cors(NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }));
  }

  const claims = verifyAppToken(body.appToken);
  const appId = claims?.appId ?? null;
  if (!appId) {
    return cors(NextResponse.json({ error: 'Invalid or missing appToken' }, { status: 401 }));
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
  if ((body.system?.length ?? 0) > MAX_SYSTEM_LENGTH) {
    return cors(NextResponse.json(
      { error: `system instruction too long (${body.system!.length} > ${MAX_SYSTEM_LENGTH})` },
      { status: 400 }
    ));
  }

  // Find the app and resolve the owner.
  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) });
  if (!app) {
    return cors(NextResponse.json({ error: 'App not found' }, { status: 404 }));
  }

  // Calls arrive from a sandboxed iframe with no session, so the key is the app
  // owner's rather than the caller's — resolved from the channel that owns the app.
  const { channels } = await import('@/lib/db/schema');
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, app.channelId),
    columns: { ownerId: true },
  });
  if (!channel?.ownerId) {
    return cors(NextResponse.json({ error: 'App has no owner' }, { status: 500 }));
  }
  const owner = await db.query.users.findFirst({
    where: eq(users.id, channel.ownerId),
  });

  // Text generation here is Gemini-only and stays that way; image generation is
  // not, so both keys are resolved. The per-provider column first, then the
  // single-key column for an owner who has not re-saved since, then the
  // deployment's own key.
  const resolveKey = (
    stored: string | null | undefined,
    ...envVars: Array<string | undefined>
  ): string | null => {
    if (stored) {
      try {
        return decryptIfNeeded(stored);
      } catch {
        // A key we cannot read is the same as a key we do not have.
      }
    }
    return envVars.find((v) => !!v) ?? null;
  };

  const apiKey = resolveKey(
    owner?.googleApiKey ?? (owner?.byokProvider === 'google' ? owner.byokApiKey : null),
    process.env.OWNER_GOOGLE_API_KEY,
    process.env.GOOGLE_API_KEY,
  );
  const openaiKey = resolveKey(
    owner?.openaiApiKey ?? (owner?.byokProvider === 'openai' ? owner.byokApiKey : null),
    process.env.OWNER_OPENAI_API_KEY,
    process.env.OPENAI_API_KEY,
  );

  const isImageMode = body.mode === 'image';

  if (!isImageMode && !apiKey) {
    return cors(NextResponse.json(
      { error: 'AI is not configured for this playground (owner needs a Gemini BYOK key).' },
      { status: 503 }
    ));
  }

  // ── Which image model ───────────────────────────────────────────────────
  const imageProviders: ImageProvider[] = [
    ...(apiKey ? (['google'] as const) : []),
    ...(openaiKey ? (['openai'] as const) : []),
  ];
  const background: ImageBackground = isImageBackground(body.background) ? body.background : 'auto';
  const imageResolution = isImageMode
    ? resolveImageModel({
        requested: body.imageModel,
        accountDefault:
          (await getModelPreferences(channel.ownerId)).imageDefault ?? DEFAULT_IMAGE_MODEL_ID,
        available: imageProviders,
        needsTransparency: background === 'transparent',
      })
    : null;

  if (isImageMode && !imageResolution) {
    return cors(NextResponse.json({
      error: background === 'transparent'
        ? 'Transparent backgrounds need an OpenAI key. The owner can add one in Settings → AI.'
        : 'AI image generation is not configured for this playground.',
      status: 503,
    }, { status: 503 }));
  }

  // Fall back to the frontier model if caller didn't specify (or specified 'auto',
  // which is a virtual id only meaningful for the code-gen route's edit-type routing).
  // Image mode is handled in its own branch below and uses dedicated image-gen models.
  const resolvedModelId = isImageMode
    ? imageResolution!.model.model
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

  // ── Budget ──────────────────────────────────────────────────────────────
  //
  // Reserved BEFORE any provider call, and refused here rather than after the
  // money is gone. Draft previews count too: an owner testing an AI feature is
  // spending the same key as a customer using it.
  //
  // Identity is best-effort by design. A visitor of a free app has no session, and
  // the per-customer limit is the part that needs one — the app and owner ceilings
  // do not, and they are what actually bound the bill.
  const visitorKey = identifyVisitor(request);
  const reservation = await reserve({
    appId: app.id,
    ownerId: channel.ownerId,
    kind: isImageMode ? 'image' : 'text',
    modelId: resolvedModelId,
    isDraft: claims?.isDraft ?? false,
    visitorKey,
    promptChars: (body.prompt?.length ?? 0) + (body.system?.length ?? 0),
    attachedImages: (body.imageUrl ? 1 : 0) + (body.imageData ? 1 : 0),
    maxOutputTokens: Math.min(body.maxOutputTokens || MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
    imagesOut: isImageMode ? 1 : 0,
  });

  if (!reservation.ok) {
    console.warn('[playground/ai] refused by budget:', reservation.denial.scope, app.id);
    return cors(NextResponse.json({
      error: denialMessage(reservation.denial, reservation.resetsAt),
      limitReached: true,
      scope: reservation.denial.scope,
      resetsAt: reservation.resetsAt.toISOString(),
    }, { status: 429 }));
  }

  const client = new GoogleGenAI({ apiKey: apiKey ?? '' });
  try {
    if (isImageMode && imageResolution!.model.provider === 'openai') {
      // OpenAI's images endpoint. `background: 'transparent'` needs a lossless
      // output_format alongside it or the encoder flattens the alpha onto white,
      // so the two are set together rather than left to disagree.
      const transparent = background === 'transparent';
      const openai = new OpenAI({ apiKey: openaiKey! });
      const modelUsed = imageResolution!.model.model;

      // A described backdrop beats the parameter, so a transparent request says
      // plainly that there is no scene to paint.
      const prompt = transparent
        ? `${body.prompt}

Isolated subject on a fully transparent background. No backdrop, scene, shadow, or ground plane.`
        : body.prompt;
      const shared = {
        model: modelUsed,
        prompt,
        n: 1,
        size: OPENAI_SIZE_MAP[body.size ?? '1:1'] ?? '1024x1024',
        quality: 'medium' as const,
        ...(background !== 'auto' ? { background } : {}),
        ...(transparent ? { output_format: 'png' as const } : {}),
      };

      // An input image means this is an edit, not a generation, and the two are
      // different endpoints on OpenAI. Sending it to /generations would drop the
      // image without saying so — the app author would see their style-transfer
      // feature quietly become a text-to-image one.
      const inputImage = await openAIInputImage(body);
      const response = inputImage
        ? await openai.images.edit({ ...shared, image: inputImage })
        : await openai.images.generate(shared);

      const first = response.data?.[0];
      const b64 = first?.b64_json
        ?? (first?.url
          ? Buffer.from(await (await fetch(first.url)).arrayBuffer()).toString('base64')
          : null);

      if (!b64) {
        // The model ran and produced nothing usable. It was still a call, and
        // almost certainly a billed one, so the reservation stands.
        await assumeCharged(reservation.id, 'image model returned no image');
        return cors(NextResponse.json(
          { error: 'Image model returned no image. Try a different prompt or be more specific.' },
          { status: 502 }
        ));
      }

      const usage = response.usage
        ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
        : null;
      await settle(reservation.id, 'image', modelUsed, usage);
      return cors(NextResponse.json({
        dataUrl: `data:image/png;base64,${b64}`,
        mimeType: 'image/png',
        model: modelUsed,
        background,
        usage,
      }));
    }

    if (isImageMode) {
      // Image gen / edit via a Gemini image model. Returns inline image bytes in
      // the candidate parts; we surface the first image as a data URL.
      const callImageModel = async (modelId: string) => {
        return client.models.generateContent({
          model: modelId,
          contents: [{ role: 'user', parts }],
          config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        });
      };

      let modelUsed = imageResolution!.model.model;
      let response;
      try {
        response = await callImageModel(modelUsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        // Preview models come and go per key; the GA one is the safety net, so an
        // account without preview access still gets a picture.
        if (modelUsed !== IMAGE_FALLBACK_MODEL && /NOT_FOUND|404|is not found|not supported/i.test(msg)) {
          modelUsed = IMAGE_FALLBACK_MODEL;
          response = await callImageModel(IMAGE_FALLBACK_MODEL);
        } else {
          throw err;
        }
      }

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
        // The model ran and produced nothing usable. It was still a call, and
        // almost certainly a billed one, so the reservation stands.
        await assumeCharged(reservation.id, 'image model returned no image');
        return cors(NextResponse.json(
          { error: 'Image model returned no image. Try a different prompt or be more specific.' },
          { status: 502 }
        ));
      }

      await settle(reservation.id, 'image', modelUsed, response.usageMetadata
        ? { inputTokens: response.usageMetadata.promptTokenCount, outputTokens: response.usageMetadata.candidatesTokenCount }
        : null);
      return cors(NextResponse.json({
        dataUrl,
        mimeType,
        text: text || undefined,
        model: modelUsed,
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
    await settle(reservation.id, 'text', resolvedModelId, response.usageMetadata
      ? { inputTokens: response.usageMetadata.promptTokenCount, outputTokens: response.usageMetadata.candidatesTokenCount }
      : null);

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
    const raw = err instanceof Error ? err.message : 'AI call failed';

    // Conservative on purpose. A request refused before any work — a bad schema, a
    // rejected argument, a model that does not exist — cost nothing and the
    // reservation goes back. Anything else, including a timeout or a dropped
    // connection, may well have been completed and billed on the provider's side,
    // and calling that free is how a ceiling quietly stops being one.
    const certainlyFree = /INVALID_ARGUMENT|400|NOT_FOUND|404|PERMISSION_DENIED|403|is not found|unsupported/i.test(raw);
    if (certainlyFree) {
      await release(reservation.id, raw.slice(0, 200));
    } else {
      await assumeCharged(reservation.id, raw.slice(0, 200));
    }
    // Google's SDK throws with .message set to the raw JSON error envelope —
    // e.g. '{"error":{"code":404,"message":"models/X is not found...","status":"NOT_FOUND"}}'.
    // Generated apps tend to render err.message verbatim, which leaks ugly JSON
    // into the UI. Extract the human "message" field when present.
    let msg = raw;
    const m = raw.match(/"message"\s*:\s*"((?:\\.|[^"\\])+)"/);
    if (m) {
      try { msg = JSON.parse('"' + m[1] + '"'); } catch { msg = m[1]; }
    }
    return cors(NextResponse.json({ error: msg }, { status: 502 }));
  }
}

/**
 * The input image for an OpenAI edit, as a file the SDK can upload.
 *
 * Returns null when the request carries no image, which is the ordinary case — the
 * caller uses that to decide between /edits and /generations.
 */
async function openAIInputImage(body: AIRequest) {
  if (body.imageData && typeof body.imageData === 'string') {
    const match = body.imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (match) {
      return toFile(Buffer.from(match[2], 'base64'), 'input.png', { type: match[1] });
    }
  }
  if (body.imageUrl && typeof body.imageUrl === 'string') {
    try {
      const res = await fetch(body.imageUrl);
      if (res.ok) {
        const type = res.headers.get('content-type') || 'image/png';
        return toFile(Buffer.from(await res.arrayBuffer()), 'input.png', { type });
      }
    } catch {
      // Silently skip a bad URL — generation continues with the prompt only.
    }
  }
  return null;
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
