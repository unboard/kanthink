import type { EmailContentConfig, EmailSection } from './dynamicRenderer'

const VALID_TYPES = new Set(['heading', 'paragraph', 'table', 'cta', 'divider', 'stats', 'list'])

function isValidSection(s: Record<string, unknown>): boolean {
  if (!s.type || !VALID_TYPES.has(s.type as string)) return false

  switch (s.type) {
    case 'heading':
    case 'paragraph':
      return typeof s.text === 'string' && s.text.length > 0
    case 'table':
      return Array.isArray(s.headers) && Array.isArray(s.rows)
    case 'cta':
      return typeof s.text === 'string' && typeof s.url === 'string'
    case 'divider':
      return true
    case 'stats':
      return Array.isArray(s.items) && s.items.length > 0
    case 'list':
      return Array.isArray(s.items) && s.items.length > 0
    default:
      return false
  }
}

/**
 * Extract an [EMAIL_TEMPLATE]...[/EMAIL_TEMPLATE] block from AI response text.
 * Returns null if no valid config found.
 */
export function extractEmailConfig(response: string): EmailContentConfig | null {
  const match = response.match(/\[EMAIL_TEMPLATE\]([\s\S]*?)\[\/EMAIL_TEMPLATE\]/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1].trim())

    if (!parsed.subject || !parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      return null
    }

    const sections: EmailSection[] = parsed.sections
      .filter((s: Record<string, unknown>) => isValidSection(s))
      .map((s: Record<string, unknown>) => s as EmailSection)

    if (sections.length === 0) return null

    return {
      previewText: parsed.previewText || parsed.subject,
      subject: parsed.subject,
      sections,
    }
  } catch {
    return null
  }
}

/**
 * Strip the [EMAIL_TEMPLATE] block from response text for display.
 */
export function cleanDisplayResponse(rawText: string): string {
  const cleaned = rawText
    .replace(/\[EMAIL_TEMPLATE\][\s\S]*?\[\/EMAIL_TEMPLATE\]/, '')
    .trim()
  return cleaned || "Here's the email template I've put together:"
}
