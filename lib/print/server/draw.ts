import { GoogleGenAI, Modality } from '@google/genai'
import OpenAI, { toFile } from 'openai'
import sharp from 'sharp'
import { tokenCents, type PrintModel } from '../models'
import { nearestGeminiRatio, type Frame, type ImageTier } from '../spec'
import { forModel } from './images'

/**
 * One drawing call to an image model, whichever provider it is.
 *
 * Images go in labelled ("Image 1", "Image 2"…) so a prompt can refer to them by
 * position; the label sits immediately before each picture rather than in a list at
 * the end, which is what keeps Gemini from mixing up the logo and the inspiration.
 */

export interface InputImage {
  data: Buffer
}

export interface DrawRequest {
  model: PrintModel
  apiKey: string
  prompt: string
  images: InputImage[]
  /** Gemini: aspect + tier. OpenAI: exact width/height. */
  frame: Pick<Frame, 'aspect' | 'tier' | 'width' | 'height'>
  quality: 'print' | 'draft'
  /** OpenAI only: alpha-transparent where the first image may change. */
  openaiMask?: Buffer
}

export class DrawError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message)
  }
}

/** An image, and what drawing it actually cost per the provider's usage report. */
export interface Drawn {
  image: Buffer
  /** Null when the provider sent no usage; the estimate stands in. */
  cents: number | null
}

export async function draw(req: DrawRequest): Promise<Drawn> {
  return req.model.provider === 'google' ? drawGemini(req) : drawOpenAI(req)
}

async function drawGemini(req: DrawRequest): Promise<Drawn> {
  const client = new GoogleGenAI({ apiKey: req.apiKey })
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = []
  for (let i = 0; i < req.images.length; i++) {
    const img = await forModel(req.images[i].data, i === 0 ? 2048 : 1600)
    parts.push({ text: `Image ${i + 1}:` })
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data.toString('base64') } })
  }
  parts.push({ text: req.prompt })

  const call = (imageConfig: Record<string, string>) =>
    client.models.generateContent({
      model: req.model.model,
      contents: [{ role: 'user', parts }],
      config: { responseModalities: [Modality.IMAGE, Modality.TEXT], imageConfig },
    })

  const imageConfig: Record<string, string> = {}
  if (req.frame.aspect) imageConfig.aspectRatio = req.frame.aspect
  if (req.frame.tier) imageConfig.imageSize = req.frame.tier

  let response
  try {
    response = await call(imageConfig)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // A model that doesn't know imageSize still knows aspect ratio.
    if (imageConfig.imageSize && /imageSize|image_size|INVALID_ARGUMENT/i.test(msg)) {
      delete imageConfig.imageSize
      response = await call(imageConfig)
    } else {
      throw new DrawError(friendly(msg))
    }
  }

  const candidate = response.candidates?.[0]
  for (const part of candidate?.content?.parts ?? []) {
    if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/')) {
      const usage = response.usageMetadata
      const cents = usage
        ? tokenCents(req.model.rates, usage.promptTokenCount ?? 0, usage.candidatesTokenCount ?? 0) +
          // Thinking is billed as text output, a tenth of the image-output rate.
          ((usage.thoughtsTokenCount ?? 0) * req.model.rates.output) / 10 / 1e4
        : null
      return { image: Buffer.from(part.inlineData.data, 'base64'), cents }
    }
  }
  const said = (candidate?.content?.parts ?? []).map((p) => p.text).filter(Boolean).join(' ').trim()
  const reason = candidate?.finishReason
  if (reason && /SAFETY|PROHIBITED|BLOCK/i.test(String(reason))) {
    throw new DrawError('The image model declined this one. Try rewording the request.', 422)
  }
  throw new DrawError(said ? `The model didn’t draw anything: ${said.slice(0, 200)}` : 'The model returned no image. Try again.')
}

async function drawOpenAI(req: DrawRequest): Promise<Drawn> {
  const client = new OpenAI({ apiKey: req.apiKey })
  const size = `${req.frame.width}x${req.frame.height}` as '1024x1024'
  const quality = req.quality === 'print' ? 'high' : 'medium'
  try {
    let b64: string | undefined
    let usage: OpenAI.Images.ImagesResponse['usage'] | undefined
    if (req.images.length === 0) {
      const r = await client.images.generate({ model: req.model.model, prompt: req.prompt, size, quality, n: 1 })
      b64 = r.data?.[0]?.b64_json
      usage = r.usage
    } else {
      const files = await Promise.all(
        req.images.slice(0, 16).map(async (img, i) => {
          const prepared = await forModel(img.data, i === 0 ? 2048 : 1536)
          return toFile(prepared.data, `image-${i + 1}.${prepared.mimeType === 'image/png' ? 'png' : 'jpg'}`, { type: prepared.mimeType })
        }),
      )
      let mask
      if (req.openaiMask) {
        const first = await forModel(req.images[0].data, 2048)
        const meta = await sharp(first.data).metadata()
        const png = await sharp(req.openaiMask).resize(meta.width, meta.height, { fit: 'fill' }).png().toBuffer()
        mask = await toFile(png, 'mask.png', { type: 'image/png' })
      }
      const r = await client.images.edit({
        model: req.model.model,
        image: files,
        prompt: req.prompt,
        size,
        quality,
        ...(mask ? { mask } : {}),
      })
      b64 = r.data?.[0]?.b64_json
      usage = r.usage
    }
    if (!b64) throw new DrawError('The model returned no image. Try again.')
    // Text input is billed at $5/1M and image input at the model's input rate.
    const textIn = usage?.input_tokens_details?.text_tokens ?? 0
    const imageIn = usage ? (usage.input_tokens ?? 0) - textIn : 0
    const cents = usage
      ? (textIn * 5) / 1e4 + tokenCents(req.model.rates, imageIn, usage.output_tokens ?? 0)
      : null
    return { image: Buffer.from(b64, 'base64'), cents }
  } catch (err) {
    if (err instanceof DrawError) throw err
    throw new DrawError(friendly(err instanceof Error ? err.message : String(err)))
  }
}

function friendly(message: string): string {
  if (/safety|moderation|content_policy|blocked/i.test(message)) return 'The image model declined this one. Try rewording the request.'
  if (/quota|rate|429|RESOURCE_EXHAUSTED/i.test(message)) return 'The image model is busy or out of quota right now. Try again in a minute.'
  if (/timeout|ETIMEDOUT|aborted/i.test(message)) return 'The image model took too long. Try again.'
  return message.slice(0, 240)
}

// ---------------------------------------------------------------------------
// Editing an existing frame
// ---------------------------------------------------------------------------

export interface EditFrame {
  input: Buffer
  frame: Pick<Frame, 'aspect' | 'tier' | 'width' | 'height'>
  /** Where the original sits inside `input`, as fractions — padding is cropped off after. */
  region: { x: number; y: number; w: number; h: number }
}

function tierFor(pixels: number): ImageTier {
  if (pixels >= 9e6) return '4K'
  if (pixels >= 2.2e6) return '2K'
  return '1K'
}

/**
 * Prepare a page's raw frame for an edit so the model returns the same framing.
 *
 * Gemini only draws at its fixed ratios. When the original isn't at one (a page first
 * drawn by OpenAI at the exact print shape), it is padded out to the nearest ratio by
 * mirroring its own edges, and the padding is cut away afterwards — so the edit comes
 * back pixel-aligned with the original and the masked composite lines up.
 */
export async function prepareEdit(raw: Buffer, provider: 'google' | 'openai', quality: 'print' | 'draft', grow = false): Promise<EditFrame> {
  const meta = await sharp(raw).metadata()
  const width = meta.width ?? 1024
  const height = meta.height ?? 1024
  const ratio = width / height

  if (provider === 'openai') {
    const pixels = grow ? 3840 * 2160 : Math.min(quality === 'draft' ? 1536 * 1024 : 3840 * 2160, width * height)
    let w = Math.sqrt(pixels * ratio)
    let h = w / ratio
    const over = Math.max(w, h) / 3840
    if (over > 1) {
      w /= over
      h /= over
    }
    const r16 = (v: number) => Math.max(16, Math.floor(v / 16) * 16)
    return { input: raw, frame: { width: r16(w), height: r16(h) }, region: { x: 0, y: 0, w: 1, h: 1 } }
  }

  const aspect = nearestGeminiRatio(ratio)
  const [aw, ah] = aspect.split(':').map(Number)
  const target = aw / ah
  const tier: ImageTier = grow ? '4K' : quality === 'draft' ? '1K' : tierFor(width * height)
  if (Math.abs(Math.log(target / ratio)) < 0.004) {
    return { input: raw, frame: { aspect, tier, width, height }, region: { x: 0, y: 0, w: 1, h: 1 } }
  }
  let padX = 0
  let padY = 0
  if (target > ratio) padX = Math.round((height * target - width) / 2)
  else padY = Math.round((width / target - height) / 2)
  const input = await sharp(raw)
    .extend({ left: padX, right: padX, top: padY, bottom: padY, extendWith: 'mirror' })
    .toBuffer()
  const fullW = width + 2 * padX
  const fullH = height + 2 * padY
  return {
    input,
    frame: { aspect, tier, width: fullW, height: fullH },
    region: { x: padX / fullW, y: padY / fullH, w: width / fullW, h: height / fullH },
  }
}

/** The model's output, back at the original frame's exact size and position. */
export async function restoreEdit(output: Buffer, prep: EditFrame, raw: { width: number; height: number }): Promise<Buffer> {
  const meta = await sharp(output).metadata()
  const ow = meta.width ?? raw.width
  const oh = meta.height ?? raw.height
  const r = prep.region
  const left = Math.round(r.x * ow)
  const top = Math.round(r.y * oh)
  const width = Math.max(1, Math.min(ow - left, Math.round(r.w * ow)))
  const height = Math.max(1, Math.min(oh - top, Math.round(r.h * oh)))
  return sharp(output)
    .extract({ left, top, width, height })
    .resize(raw.width, raw.height, { fit: 'fill' })
    .toBuffer()
}
