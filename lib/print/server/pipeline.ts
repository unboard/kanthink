import sharp from 'sharp'
import { nanoid } from 'nanoid'
import { resolveProviderKeys, type ProviderKeys } from '@/lib/ai/keys'
import { recordUsage } from '@/lib/usage'
import { DEFAULT_PRINT_MODEL, PRINT_MODELS, findPrintModel, type PrintModel } from '../models'
import { checkPlacement, checkSpelling, detectFrame, detectWhiteBorders, distanceField, rasterSampler, samplerFor } from '../preflight'
import {
  buildAreaPrompt,
  buildCopyPrompt,
  buildCreatePrompt,
  buildEditPrompt,
  buildFixPrompt,
  buildRetextPrompt,
  buildUpscalePrompt,
  printedWords,
  type RefImage,
} from '../prompts'
import { centerCrop, effectiveDpi, planFrame, sheetRatio, type Frame } from '../spec'
import type {
  BrandKit,
  PageCopy,
  PreflightIssue,
  PreflightResult,
  PrintBrand,
  PrintDesign,
  PrintSpec,
  PrintVersion,
  RenderQuality,
  VersionMode,
} from '../types'
import { DrawError, draw, prepareEdit, restoreEdit, type InputImage } from './draw'
import {
  compositeArea,
  cropToSheet,
  dimensions,
  fetchOwnImage,
  guideMask,
  markedImage,
  maskChannel,
  maskInRawFrame,
  pagePixels,
  printJpeg,
  renderCanvas,
  storeImage,
} from './images'
import { locateElements, writeCopy } from './understand'

/**
 * The print studio's render pipeline.
 *
 *   create   brief → (copy) → canvas + references → model → crop to print geometry
 *   edit     whole page, "keep everything else"
 *   area     painted mask; the result is composited so only that area changes
 *   retext   new words, same design
 *   fix      the preflight's issues, as instructions
 *   upscale  same design, redrawn at print resolution
 *
 * Every mode returns a new version; nothing is overwritten. The caller (the studio)
 * owns the design's page list and decides which version is current.
 */

export interface RenderRequest {
  userId: string
  design: PrintDesign
  brand: PrintBrand | null
  pageIndex: number
  mode: VersionMode
  prompt?: string
  modelId?: string
  quality?: RenderQuality
  /** The version an edit starts from. Required for every mode but `create`. */
  source?: PrintVersion
  /** `area` only: the painted mask in page coordinates, white/opaque where to change. */
  mask?: Buffer
  /** `create`: skip the copywriter and use these words. `retext`: the new words. */
  copy?: PageCopy
  /** `fix` only. */
  issues?: PreflightIssue[]
}

export interface RenderResult {
  version: PrintVersion
  cents: number
}

export class RenderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

/** The model to use: the one asked for if its provider has a key, else the best that does. */
export function pickModel(modelId: string | undefined, keys: ProviderKeys): PrintModel | null {
  const wanted = findPrintModel(modelId) ?? findPrintModel(DEFAULT_PRINT_MODEL)
  if (wanted && keys[wanted.provider]) return wanted
  return PRINT_MODELS.find((m) => keys[m.provider]) ?? null
}

async function keysFor(userId: string): Promise<ProviderKeys> {
  const { keys, error, quotaExhausted, quotaMessage } = await resolveProviderKeys(userId)
  if (error) throw new RenderError(error, 400)
  if (!keys.google && !keys.openai) {
    throw new RenderError(
      quotaExhausted ? quotaMessage ?? 'This account is out of AI quota.' : 'Add a Google or OpenAI key in Settings → AI to design with images.',
      quotaExhausted ? 403 : 400,
    )
  }
  return keys
}

function selectedImages(kit: BrandKit | null, ids: string[], pool: 'assets' | 'inspiration', max: number) {
  if (!kit) return []
  const want = new Set(ids)
  return kit[pool].filter((a) => want.has(a.id)).slice(0, max)
}

/** References for a page: logo, chosen photos, inspiration, and the pages already designed. */
function referencesFor(design: PrintDesign, kit: BrandKit | null, pageIndex: number): RefImage[] {
  const refs: RefImage[] = []
  const brief = design.brief
  if (kit?.logo && brief.useLogo) refs.push({ role: 'logo', url: kit.logo.url })
  for (const a of selectedImages(kit, brief.assetIds, 'assets', 5)) refs.push({ role: 'asset', url: a.url, note: a.note })
  for (const a of selectedImages(kit, brief.inspirationIds, 'inspiration', 2)) refs.push({ role: 'inspiration', url: a.url, note: a.note })

  // The designed pages nearest this one set the family look. Two at most: more just
  // dilutes the instruction about which page is being drawn.
  const others = design.pages
    .map((p, i) => ({ p, i, v: p.versions[p.current] }))
    .filter((o) => o.i !== pageIndex && o.v)
    .sort((a, b) => Math.abs(a.i - pageIndex) - Math.abs(b.i - pageIndex))
    .slice(0, 2)
  for (const o of others) refs.push({ role: 'page', url: o.v!.url, label: design.spec.pages[o.i]?.label ?? `page ${o.i + 1}` })
  return refs
}

async function loadImages(refs: RefImage[], canvas?: Buffer): Promise<InputImage[]> {
  return Promise.all(
    refs.map(async (r) => ({ data: r.role === 'canvas' && canvas ? canvas : await fetchOwnImage(r.url) })),
  )
}

/** The color of a plain frame drawn around a page, or null when it bleeds properly. */
async function frameColor(spec: PrintSpec, page: Buffer): Promise<[number, number, number] | null> {
  if (spec.guide) return null
  const px = await pagePixels(page)
  return detectFrame(spec, px.data, px.width, px.height, 3).color
}

/**
 * The page with a drawn frame trimmed off and the art scaled back out to the sheet,
 * or null when trimming would eat the design (its ground really is that color).
 */
async function trimFrame(page: Buffer, color: [number, number, number]): Promise<Buffer | null> {
  const { width, height } = await dimensions(page)
  const { data, info } = await sharp(page)
    .trim({ background: { r: color[0], g: color[1], b: color[2] }, threshold: 34 })
    .toBuffer({ resolveWithObject: true })
  if (info.width < width * 0.82 || info.height < height * 0.82) return null
  if (info.width >= width - 2 && info.height >= height - 2) return null
  // A hair more than the frame, so anti-aliased frame edges and drawn trim marks go too.
  const inset = Math.round(Math.min(info.width, info.height) * 0.004)
  const inner = await sharp(data)
    .extract({ left: inset, top: inset, width: info.width - 2 * inset, height: info.height - 2 * inset })
    .toBuffer()
  return sharp(inner).resize(width, height, { fit: 'cover', position: 'centre' }).toBuffer()
}

/**
 * Store the model's frame and its print crop.
 *
 * Bleed is enforced here, not just checked: a page that comes back inside a plain
 * frame (Nano Banana Pro does this often on landscape sheets) is filled out to the
 * edges before it is ever shown. The filled page then stands as its own frame.
 */
async function keep(userId: string, design: PrintDesign, raw: Buffer, opts: { enforceBleed?: boolean } = {}): Promise<Omit<PrintVersion, 'id' | 'model' | 'mode' | 'at'>> {
  let rawJpeg = await printJpeg(raw)
  if (opts.enforceBleed !== false) {
    const sheet = await cropToSheet(rawJpeg, design.spec)
    const color = await frameColor(design.spec, sheet.buffer)
    if (color) {
      const filled = await trimFrame(sheet.buffer, color)
      if (filled) rawJpeg = await printJpeg(filled)
    }
  }
  const rawDims = await dimensions(rawJpeg)
  const crop = await cropToSheet(rawJpeg, design.spec)
  const [rawStored, pageStored] = await Promise.all([
    storeImage(rawJpeg, userId, 'pages'),
    crop.cropped ? printJpeg(crop.buffer).then((b) => storeImage(b, userId, 'pages')) : Promise.resolve(null),
  ])
  return {
    url: pageStored?.url ?? rawStored.url,
    width: pageStored?.width ?? rawDims.width,
    height: pageStored?.height ?? rawDims.height,
    rawUrl: rawStored.url,
    rawWidth: rawDims.width,
    rawHeight: rawDims.height,
  }
}

export async function render(req: RenderRequest): Promise<RenderResult> {
  const { userId, design, brand, pageIndex, mode } = req
  const spec = design.spec
  if (pageIndex < 0 || pageIndex >= spec.pages.length) throw new RenderError('No such page.')
  if (mode === 'fill') return fillToEdges(req)
  const keys = await keysFor(userId)
  const model = pickModel(req.modelId ?? design.brief.modelId, keys)
  if (!model) throw new RenderError('No image model is available with the keys on this account.')
  const apiKey = keys[model.provider]!.apiKey
  const quality: RenderQuality = req.quality ?? design.brief.quality ?? 'print'
  const kit = brand?.data ?? null

  try {
    const result = mode === 'create'
      ? await create(req, keys, model, apiKey, quality, kit)
      : await edit(req, model, apiKey, quality, kit)
    await recordUsage(userId, 'print-image').catch(() => {})
    return result
  } catch (err) {
    if (err instanceof RenderError) throw err
    if (err instanceof DrawError) throw new RenderError(err.message, err.status)
    console.error('[print] render failed:', err)
    throw new RenderError(err instanceof Error ? err.message : 'Rendering failed.', 502)
  }
}

async function create(
  req: RenderRequest,
  keys: ProviderKeys,
  model: PrintModel,
  apiKey: string,
  quality: RenderQuality,
  kit: BrandKit | null,
): Promise<RenderResult> {
  const { design, pageIndex, userId } = req
  const spec = design.spec
  const frame = planFrame(spec, model.provider, quality)
  const userPrompt = (req.prompt ?? design.brief.prompt ?? '').trim()

  // The canvas shows the sheet's shape; see PrintModel.canvas for who gets one.
  const useCanvas = model.canvas || !!spec.guide
  const canvas = useCanvas ? await renderCanvas(spec, frame) : undefined
  const refs: RefImage[] = [...(useCanvas ? [{ role: 'canvas' as const, url: '' }] : []), ...referencesFor(design, kit, pageIndex)]

  let copy = req.copy
  if (!copy) {
    const otherCopy = design.pages
      .map((p, i) => ({ label: spec.pages[i]?.label ?? `Page ${i + 1}`, copy: p.versions[p.current]?.copy, i }))
      .filter((o): o is { label: string; copy: PageCopy; i: number } => o.i !== pageIndex && !!o.copy)
    const assetNotes = refs.filter((r) => r.role === 'asset').map((r, i) => r.note || `photo ${i + 1}`)
    copy = (await writeCopy(userId, keys, buildCopyPrompt({ spec, pageIndex, userPrompt, kit, brief: design.brief, otherCopy, assetNotes }))) ?? undefined
  }

  const prompt = buildCreatePrompt({ spec, pageIndex, frame, refs, kit, brief: design.brief, userPrompt, copy })
  const images = await loadImages(refs, canvas)
  const drawn = await draw({ model, apiKey, prompt, images, frame, quality })
  const stored = await keep(userId, design, drawn.image)
  const cents = drawn.cents ?? model.cents(frame, quality)
  return {
    cents,
    version: { id: nanoid(10), ...stored, model: model.id, mode: 'create', prompt: userPrompt || undefined, copy, costCents: cents, at: Math.floor(Date.now() / 1000) },
  }
}

async function edit(
  req: RenderRequest,
  model: PrintModel,
  apiKey: string,
  quality: RenderQuality,
  kit: BrandKit | null,
): Promise<RenderResult> {
  const { design, userId, mode, source } = req
  const spec = design.spec
  if (!source) throw new RenderError('Pick a version to edit.')
  const instruction = (req.prompt ?? '').trim()
  if ((mode === 'edit' || mode === 'area') && !instruction) throw new RenderError('Say what to change.')
  if (mode === 'area' && !req.mask) throw new RenderError('Paint the area to change first.')
  if (mode === 'retext' && !req.copy) throw new RenderError('No new words to set.')
  if (mode === 'fix' && !req.issues?.length) throw new RenderError('Nothing to fix.')

  const raw = await fetchOwnImage(source.rawUrl)
  const rawDims = await dimensions(raw)
  const prep = await prepareEdit(raw, model.provider, mode === 'upscale' ? 'print' : quality, mode === 'upscale')

  // The geometry the prompt states must describe the frame the model sees: the sheet
  // is the raw frame's own centered crop, offset by any padding added for the edit.
  const inner = centerCrop(rawDims.width / rawDims.height, sheetRatio(spec))
  const frame: Frame = {
    provider: model.provider,
    ratio: prep.frame.width / prep.frame.height,
    aspect: prep.frame.aspect,
    tier: prep.frame.tier,
    width: prep.frame.width,
    height: prep.frame.height,
    sheet: {
      x: prep.region.x + inner.x * prep.region.w,
      y: prep.region.y + inner.y * prep.region.h,
      w: inner.w * prep.region.w,
      h: inner.h * prep.region.h,
    },
    dpi: 0,
  }

  const extras: RefImage[] = []
  if ((mode === 'edit' || mode === 'area') && kit?.logo && design.brief.useLogo) extras.push({ role: 'logo', url: kit.logo.url })
  if (mode === 'edit' || mode === 'area') {
    for (const a of selectedImages(kit, design.brief.assetIds, 'assets', 3)) extras.push({ role: 'asset', url: a.url, note: a.note })
  }

  let images: InputImage[] = [{ data: prep.input }]
  let prompt: string
  let maskRaw: Buffer | undefined
  let openaiMask: Buffer | undefined

  if (mode === 'area') {
    maskRaw = await maskInRawFrame(req.mask!, rawDims, spec)
    // Same padding as the input, in black, so the highlight lands where the model looks.
    const padded = await padMaskLike(maskRaw, prep)
    images.push({ data: await markedImage(prep.input, padded) })
    if (model.provider === 'openai') openaiMask = await transparentWhere(padded)
    const refs: RefImage[] = [{ role: 'current', url: '' }, { role: 'marked', url: '' }, ...extras]
    prompt = buildAreaPrompt(spec, instruction, refs)
  } else if (mode === 'edit') {
    prompt = buildEditPrompt(spec, frame, instruction, [{ role: 'current', url: '' }, ...extras])
  } else if (mode === 'retext') {
    prompt = buildRetextPrompt(spec, frame, source.copy, req.copy!)
  } else if (mode === 'fix') {
    prompt = buildFixPrompt(spec, frame, req.issues!)
  } else {
    prompt = buildUpscalePrompt(spec)
  }
  if (extras.length) images = images.concat(await loadImages(extras))

  const drawQuality: RenderQuality = mode === 'upscale' ? 'print' : quality
  const drawn = await draw({ model, apiKey, prompt, images, frame: prep.frame, quality: drawQuality, openaiMask })
  const out = drawn.image
  // An upscale is kept at the size the model drew; everything else goes back to the
  // original's exact frame so versions stay interchangeable.
  let restored = await restoreEdit(out, prep, mode === 'upscale' ? await upscaledDims(out, prep) : rawDims)
  if (mode === 'area' && maskRaw) restored = await compositeArea(raw, restored, maskRaw)

  const stored = await keep(userId, design, restored, { enforceBleed: mode !== 'area' })
  const cents = drawn.cents ?? model.cents(prep.frame, drawQuality)
  const copy = mode === 'retext' ? req.copy : source.copy
  return {
    cents,
    version: {
      id: nanoid(10),
      ...stored,
      model: model.id,
      mode,
      prompt: instruction || undefined,
      copy,
      costCents: cents,
      at: Math.floor(Date.now() / 1000),
    },
  }
}

/**
 * Remove a white frame the model drew around the art, without a model.
 *
 * Models sometimes inset a design with a white margin despite being told to bleed. The
 * art itself is usually fine, so trimming the uniform frame and scaling the art back
 * out to the sheet (a centered cover fit) fixes it instantly and for nothing. The art
 * grows by the frame's width, so the preflight runs again afterwards as usual.
 */
async function fillToEdges(req: RenderRequest): Promise<RenderResult> {
  const { userId, source } = req
  if (!source) throw new RenderError('Pick a version to fill.')
  const page = await fetchOwnImage(source.url)
  const { width, height } = await dimensions(page)
  const color = await frameColor(req.design.spec, page)
  const filled = color ? await trimFrame(page, color) : null
  if (!filled) throw new RenderError('There’s no frame to remove here — that color is part of the design. Use Fix instead.', 422)
  const jpeg = await printJpeg(filled)
  const stored = await storeImage(jpeg, userId, 'pages')
  return {
    cents: 0,
    version: {
      id: nanoid(10),
      url: stored.url,
      width,
      height,
      rawUrl: stored.url,
      rawWidth: width,
      rawHeight: height,
      model: source.model,
      mode: 'fill',
      copy: source.copy,
      costCents: 0,
      at: Math.floor(Date.now() / 1000),
    },
  }
}

async function upscaledDims(out: Buffer, prep: { region: { w: number; h: number } }): Promise<{ width: number; height: number }> {
  const { width, height } = await dimensions(out)
  return { width: Math.round(width * prep.region.w), height: Math.round(height * prep.region.h) }
}

async function padMaskLike(mask: Buffer, prep: { region: { x: number; y: number; w: number; h: number }; frame: { width: number; height: number } }): Promise<Buffer> {
  if (prep.region.w >= 0.999 && prep.region.h >= 0.999) return mask
  const { width, height } = await dimensions(mask)
  const fullW = Math.round(width / prep.region.w)
  const fullH = Math.round(height / prep.region.h)
  const left = Math.round(prep.region.x * fullW)
  const top = Math.round(prep.region.y * fullH)
  return sharp(mask)
    .extend({ left, right: Math.max(0, fullW - width - left), top, bottom: Math.max(0, fullH - height - top), background: { r: 0, g: 0, b: 0 } })
    .png()
    .toBuffer()
}

/** OpenAI's mask convention: fully transparent where the image may change. */
async function transparentWhere(mask: Buffer): Promise<Buffer> {
  const { width, height } = await dimensions(mask)
  const data = await maskChannel(mask, width, height)
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4 + 3] = data[i] > 24 ? 0 : 255
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

export async function preflight(userId: string, design: PrintDesign, version: PrintVersion, kit: BrandKit | null): Promise<PreflightResult> {
  const spec = design.spec
  const keys = await keysFor(userId)
  const page = await fetchOwnImage(version.url)
  const [visionJpeg, pixels] = await Promise.all([
    sharp(page).resize({ width: 1400, height: 1400, fit: 'inside' }).jpeg({ quality: 88 }).toBuffer(),
    pagePixels(page),
  ])

  let raster
  if (spec.guide?.kind === 'image') {
    const g = await guideMask(spec, 400)
    raster = rasterSampler(spec, distanceField(g.inside, g.width, g.height), g.width, g.height)
  }

  const elements = await locateElements(userId, keys, visionJpeg)
  const issues: PreflightIssue[] = []
  if (elements) {
    issues.push(...checkPlacement(spec, elements, samplerFor(spec, raster)))
    const planned = printedWords(version.copy, design.brief.useDetails ? kit : null)
    issues.push(...checkSpelling(elements.filter((e) => e.kind === 'text' && e.text).map((e) => e.text!), planned))
  } else {
    issues.push({ id: 'unread', kind: 'safe', severity: 'warn', message: 'Couldn’t read this page to check text placement. Check the safe area by eye.' })
  }
  issues.push(...detectWhiteBorders(spec, pixels.data, pixels.width, pixels.height, 3))

  const dpi = effectiveDpi(spec, version.width)
  if (dpi < 150) {
    issues.push({ id: 'dpi', kind: 'resolution', severity: 'error', message: `Only ${dpi} DPI at print size — it will print soft. Sharpen it for print.` })
  } else if (dpi < 240) {
    issues.push({ id: 'dpi', kind: 'resolution', severity: 'warn', message: `${dpi} DPI at print size. Fine for most uses; sharpen it for crisp small type.` })
  }

  return {
    at: Math.floor(Date.now() / 1000),
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    elements: elements ?? [],
    dpi,
  }
}
