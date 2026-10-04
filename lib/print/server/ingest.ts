import { extractPalette } from '../palette'
import { dimensions, normalizeGuide, normalizeUpload, smallRgba, storeImage } from './images'

/**
 * One way in for every image a person brings: an upload, or something picked off
 * their website. Logos keep their transparency and get a palette; guides are
 * thresholded to clean black and white; photos are capped at a size a model can use.
 */

export type IngestKind = 'logo' | 'asset' | 'inspiration' | 'guide'

export const INGEST_KINDS: IngestKind[] = ['logo', 'asset', 'inspiration', 'guide']

export interface Ingested {
  url: string
  width: number
  height: number
  palette?: string[]
}

export async function ingestImage(userId: string, input: Buffer, kind: IngestKind): Promise<Ingested> {
  let buffer: Buffer
  if (kind === 'guide') buffer = await normalizeGuide(input)
  else buffer = await normalizeUpload(input, { keepAlpha: kind === 'logo', maxEdge: kind === 'logo' ? 2000 : 3000 })

  const { width, height } = await dimensions(buffer)
  if (!width || !height) throw new Error('That file isn’t an image we can read.')
  const stored = await storeImage(buffer, userId, kind === 'guide' ? 'guides' : 'assets')
  const palette = kind === 'logo' ? extractPalette(await smallRgba(buffer), 4, 5) : undefined
  return { url: stored.url, width, height, palette }
}
