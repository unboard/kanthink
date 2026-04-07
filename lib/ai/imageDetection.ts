/**
 * Shared image generation detection and prompt extraction utilities.
 * Used by card-chat, task-chat, operator-chat routes and ChatInput component.
 */

const IMAGE_GEN_PATTERNS = [
  'generate an image', 'generate image', 'create an image', 'create image',
  'make an image', 'make image', 'draw me', 'draw a', 'draw an',
  'generate a picture', 'create a picture', 'make a picture',
  'generate art', 'create art', 'make art',
  'generate a photo', 'create a photo',
  'generate illustration', 'create illustration',
  'image of', 'picture of', 'illustration of',
  'dall-e', 'dalle', 'imagen',
]

/**
 * Detect if text contains an image generation request.
 */
export function detectImageGenerationIntent(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return IMAGE_GEN_PATTERNS.some(p => lower.includes(p))
}

/**
 * Extract the core image description from a user's message.
 */
export function extractImagePrompt(text: string): string {
  const prefixes = [
    /^(can you |please |could you |hey kan,? |kan,? )/i,
    /^(generate|create|make|draw) (an?|me an?|the) (image|picture|illustration|art|photo) (of |for |showing |that shows |with |depicting )/i,
    /^(generate|create|make|draw) (an?|me an?) (image|picture|illustration|art|photo)\s*/i,
  ]
  let prompt = text
  for (const prefix of prefixes) {
    prompt = prompt.replace(prefix, '')
  }
  return prompt.trim() || text
}

export type ImageSettings = {
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9'
  quality: 'standard' | 'hd'
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  aspectRatio: '1:1',
  quality: 'standard',
}

export const ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const
export const QUALITY_OPTIONS = ['standard', 'hd'] as const
