import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/lib/auth';
import { checkUsageLimit, getUserByokConfigWithError, recordUsage } from '@/lib/usage';
import { renderImage, type ReferenceImage } from '@/lib/ai/nanoBanana';
import { uploadImageToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';
import { getProduct, getSide } from '@/lib/design/products';
import { buildPlannerPrompt, buildImagePrompt } from '@/lib/design/prompt';
import { parsePlannerReply } from '@/lib/design/parse';
import { mergeBrief, emptyBrief, type DesignAsset, type DesignBrief } from '@/lib/design/brief';

export const runtime = 'nodejs';
export const maxDuration = 180;

// Vision + JSON, called on every turn, so it wants to be fast. The preview
// model isn't on every key; 2.5-flash is the proven fallback (see the SnailBlast
// artwork review, which runs on it in production).
const PLANNER_MODEL_PRIMARY = 'gemini-3-flash-preview';
const PLANNER_MODEL_FALLBACK = 'gemini-2.5-flash';

const MAX_MESSAGES = 30;
const MAX_CHARS = 4000;
const MAX_ASSETS = 6;

interface GenerateRequest {
  productId: string;
  sideId: string;
  messages: { role: 'user' | 'assistant'; content: string; sideId?: string }[];
  brief?: DesignBrief;
  assets?: DesignAsset[];
  /** The design currently shown for this side, if any — the thing being revised. */
  currentUrl?: string | null;
  /** The other side's design, if it exists — the thing this side must match. */
  otherUrl?: string | null;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const spec = getProduct(body.productId);
  if (!spec) return NextResponse.json({ error: 'Unknown product' }, { status: 400 });
  const side = getSide(spec, body.sideId);
  if (!side) return NextResponse.json({ error: 'Unknown side' }, { status: 400 });

  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: 'Say something about the design first.' }, { status: 400 });
  }
  if (messages.some((m) => typeof m.content !== 'string' || m.content.length > MAX_CHARS)) {
    return NextResponse.json({ error: 'That message is too long.' }, { status: 400 });
  }

  const assets = (Array.isArray(body.assets) ? body.assets : [])
    .filter((a) => a && typeof a.url === 'string')
    .slice(0, MAX_ASSETS);

  const resolved = await resolveClient(userId);
  if (!resolved.client) {
    return NextResponse.json({ error: resolved.error }, { status: 503 });
  }
  const client = resolved.client;

  // ---- gather every image both models will see, in one pass --------------
  // Order matters: the prompts refer to these by position, so assets come
  // first, then the version being revised, then the opposite side.
  const assetImages = await Promise.all(assets.map((a) => fetchInline(a.url)));
  const usableAssets = assets.filter((_, i) => assetImages[i] !== null);
  const usableAssetImages = assetImages.filter((img): img is ReferenceImage => img !== null);

  const currentImage = body.currentUrl ? await fetchInline(body.currentUrl) : null;
  const otherImage = body.otherUrl ? await fetchInline(body.otherUrl) : null;

  const otherSideSpec = spec.sides.find((s) => s.id !== side.id);
  const otherSideLabel = otherSideSpec?.label ?? 'other side';

  // ---- plan --------------------------------------------------------------
  const plannerPrompt = buildPlannerPrompt({
    spec,
    side,
    brief: body.brief ?? emptyBrief(),
    assets: usableAssets,
    hasCurrent: !!currentImage,
    otherSide: { label: otherSideLabel, exists: !!otherImage },
  });

  // Turns are labelled with the side they were about. Without it, a request like
  // "make it bigger" made three turns ago against the front reads as if it were
  // about whichever side happens to be open now.
  const transcript = messages
    .map((m) => {
      const who = m.role === 'user' ? 'THEM' : 'YOU';
      const about = m.sideId ? getSide(spec, m.sideId)?.label : null;
      return `${who}${about ? ` (about the ${about.toLowerCase()})` : ''}: ${m.content}`;
    })
    .join('\n\n');

  const plannerParts: Array<{ text: string } | { inlineData: ReferenceImage }> = [
    { text: `${plannerPrompt}\n\n# Conversation so far\n${transcript}` },
    ...usableAssetImages.map((img) => ({ inlineData: img })),
  ];
  if (currentImage) plannerParts.push({ inlineData: currentImage });
  if (otherImage) plannerParts.push({ inlineData: otherImage });

  let plan;
  try {
    const raw = await callPlanner(client, plannerParts);
    plan = parsePlannerReply(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Planning failed';
    console.error('[design planner]', message);
    return NextResponse.json({ error: friendly(message) }, { status: 502 });
  }

  // Apply the planner's asset classifications, leaving pinned ones alone — the
  // user's own correction outranks the model on every subsequent turn.
  //
  // Two lists, because they answer different questions. The image model is only
  // told about images it can actually see, since the prompt refers to them by
  // position and a gap would misnumber every one after it. The client gets every
  // asset back, so a Cloudinary hiccup on one fetch doesn't make the user's logo
  // disappear out of the composer.
  const classify = (asset: DesignAsset, index: number) => {
    if (asset.pinned) return asset;
    const verdict = plan.assets.find((a) => a.index === index + 1);
    return verdict ? { ...asset, role: verdict.role, note: verdict.note } : asset;
  };

  const classifiedUsable = usableAssets.map(classify);
  const classifiedAll = assets.map((asset) => {
    const i = usableAssets.indexOf(asset);
    return i === -1 ? asset : classifiedUsable[i];
  });

  const brief = mergeBrief(body.brief ?? emptyBrief(), plan.updates);

  if (!plan.render || !plan.imagePrompt) {
    await recordUsage(userId, 'design-plan').catch(() => {});
    return NextResponse.json({
      reply: plan.reply || 'Tell me a bit more and I\'ll take a run at it.',
      rendered: false,
      brief,
      assets: classifiedAll,
      chips: plan.chips,
    });
  }

  // ---- render ------------------------------------------------------------
  const imageRefs: ReferenceImage[] = [...usableAssetImages];
  const notes: string[] = [];
  if (currentImage) {
    imageRefs.push(currentImage);
    notes.push(
      `Attached image ${imageRefs.length} is the CURRENT version of this side. Produce a revised version of it: keep the layout, palette, imagery and copy exactly as they are except for the changes described above.`
    );
  }
  if (otherImage) {
    imageRefs.push(otherImage);
    notes.push(
      `Attached image ${imageRefs.length} is the ${otherSideLabel.toUpperCase()} of this same piece. This side must look like it belongs with it — same palette, same type family, same logo treatment — while doing its own job. Do not copy its layout or repeat its headline.`
    );
  }

  const finalPrompt = buildImagePrompt(
    plan.imagePrompt,
    spec,
    side,
    classifiedUsable,
    notes.length ? notes.join('\n') : null
  );

  try {
    const image = await renderImage(client, {
      prompt: finalPrompt,
      images: imageRefs,
      aspectRatio: spec.aspectRatio,
      imageSize: '2K',
    });

    const buffer = Buffer.from(image.base64, 'base64');
    // Uploaded rather than returned inline: a 2K render is several megabytes of
    // base64, which would blow the client's localStorage session and make every
    // subsequent request that references it enormous.
    const url = isCloudinaryConfigured()
      ? (await uploadImageToCloudinary(buffer)).url
      : `data:${image.mimeType};base64,${image.base64}`;

    await recordUsage(userId, 'design-generate').catch(() => {});

    return NextResponse.json({
      reply: plan.reply || 'Here it is.',
      rendered: true,
      url,
      brief,
      assets: classifiedAll,
      chips: plan.chips,
      imagePrompt: plan.imagePrompt,
      model: image.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    console.error('[design render]', message);
    return NextResponse.json({ error: friendly(message) }, { status: 502 });
  }
}

// ---------------------------------------------------------------- helpers

async function callPlanner(
  client: GoogleGenAI,
  parts: Array<{ text: string } | { inlineData: ReferenceImage }>
): Promise<string> {
  const call = (model: string) =>
    client.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: { maxOutputTokens: 2000, responseMimeType: 'application/json' },
    });

  try {
    return (await call(PLANNER_MODEL_PRIMARY)).text || '';
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (!/NOT_FOUND|404|is not found|not supported/i.test(msg)) throw err;
    return (await call(PLANNER_MODEL_FALLBACK)).text || '';
  }
}

async function resolveClient(
  userId: string
): Promise<{ client: GoogleGenAI | null; error?: string }> {
  const byok = await getUserByokConfigWithError(userId);
  if (byok.error) return { client: null, error: byok.error };

  if (byok.config?.apiKey) {
    if (byok.config.provider !== 'google') {
      return {
        client: null,
        error:
          'Design generation runs on Google\'s image model. Add a Google API key in Settings, or remove your own key to use the shared one.',
      };
    }
    return { client: new GoogleGenAI({ apiKey: byok.config.apiKey }) };
  }

  const usage = await checkUsageLimit(userId);
  if (!usage.allowed) return { client: null, error: usage.message ?? 'Usage limit reached.' };

  const key = process.env.OWNER_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return { client: null, error: 'Image generation is not configured on this server.' };
  return { client: new GoogleGenAI({ apiKey: key }) };
}

/** Fetch an image into the inline form both models take. Null on any failure —
 *  a broken reference should cost that reference, not the whole generation. */
async function fetchInline(url: string): Promise<ReferenceImage | null> {
  try {
    if (url.startsWith('data:')) {
      const match = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      return match ? { mimeType: match[1], data: match[2] } : null;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get('content-type') || 'image/png';
    if (!mimeType.startsWith('image/')) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return { mimeType, data: buffer.toString('base64') };
  } catch {
    return null;
  }
}

/** Google's SDK puts a raw JSON error envelope in .message. Dig out the sentence. */
function friendly(raw: string): string {
  const m = raw.match(/"message"\s*:\s*"((?:\\.|[^"\\])+)"/);
  if (!m) return raw;
  try {
    return JSON.parse('"' + m[1] + '"');
  } catch {
    return m[1];
  }
}
