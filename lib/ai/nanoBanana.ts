import { GoogleGenAI, Modality } from '@google/genai';

/**
 * Gemini's image generation models, a.k.a. "Nano Banana".
 *
 * gemini-3.1-flash-image-preview = "Nano Banana 2", the frontier image model.
 * Preview models are not enabled on every API key, so anything calling it must
 * be able to fall back to the GA model — that is what renderImage() does, and
 * it is the reason these two IDs live together rather than being typed out at
 * each call site.
 */
export const IMAGE_MODEL_PRIMARY = 'gemini-3.1-flash-image-preview';
export const IMAGE_MODEL_FALLBACK = 'gemini-2.5-flash-image';

export interface ReferenceImage {
  mimeType: string;
  /** Raw base64, no data-URL prefix. */
  data: string;
}

export interface RenderImageOptions {
  prompt: string;
  /** Supplied in order; the prompt is expected to refer to them by position. */
  images?: ReferenceImage[];
  aspectRatio?: string;
  imageSize?: '1K' | '2K' | '4K';
}

export interface RenderedImage {
  base64: string;
  mimeType: string;
  /** Commentary the image model returned alongside the image, if any. */
  text: string;
  model: string;
}

/** A preview model that isn't on this key, or a config field it doesn't accept. */
function isUnsupported(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : '';
  return /NOT_FOUND|404|is not found|not supported|INVALID_ARGUMENT|Unknown name/i.test(msg);
}

/**
 * Render one image, with reference images supplied inline.
 *
 * Returns base64 rather than a data URL because callers almost always want to
 * put the bytes somewhere (Cloudinary) rather than inline a multi-megabyte
 * string into a response.
 */
export async function renderImage(
  client: GoogleGenAI,
  { prompt, images = [], aspectRatio, imageSize }: RenderImageOptions
): Promise<RenderedImage> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
    ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
  ];

  const call = (model: string, withSize: boolean) =>
    client.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        imageConfig: aspectRatio
          ? { aspectRatio, ...(withSize && imageSize ? { imageSize } : {}) }
          : undefined,
      },
    });

  let model = IMAGE_MODEL_PRIMARY;
  let response;
  try {
    response = await call(IMAGE_MODEL_PRIMARY, true);
  } catch (err) {
    if (!isUnsupported(err)) throw err;
    // The GA model is the safety net, and it does not take an image size — a
    // 2K request there is what would fail second, so it is dropped here.
    model = IMAGE_MODEL_FALLBACK;
    response = await call(IMAGE_MODEL_FALLBACK, false);
  }

  const candidateParts = response.candidates?.[0]?.content?.parts ?? [];
  let base64: string | null = null;
  let mimeType = 'image/png';
  let text = '';
  for (const p of candidateParts) {
    if (!base64 && p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/')) {
      base64 = p.inlineData.data;
      mimeType = p.inlineData.mimeType;
    }
    if (typeof p.text === 'string') text += p.text;
  }

  if (!base64) {
    // Usually a safety block or a prompt the model read as a refusal. Its own
    // text is the most useful thing we can give the user.
    throw new Error(
      text.trim()
        ? `The image model declined this one: ${text.trim().slice(0, 300)}`
        : 'The image model returned no image. Try describing the design differently.'
    );
  }

  return { base64, mimeType, text: text.trim(), model };
}
