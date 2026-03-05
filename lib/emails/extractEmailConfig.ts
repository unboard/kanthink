import type { EmailConfig, EmailNode } from './dynamicRenderer'

function isValidNode(node: unknown): node is EmailNode {
  if (typeof node === 'string') return true
  if (Array.isArray(node)) return node.every(isValidNode)
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as Record<string, unknown>
    if (typeof el.type !== 'string' || el.type.length === 0) return false
    if (el.children !== undefined && !isValidNode(el.children)) return false
    return true
  }
  return false
}

/**
 * Extract an [EMAIL_TEMPLATE]...[/EMAIL_TEMPLATE] block from AI response text.
 * Returns null if no valid config found.
 */
export function extractEmailConfig(response: string): EmailConfig | null {
  const match = response.match(/\[EMAIL_TEMPLATE\]([\s\S]*?)\[\/EMAIL_TEMPLATE\]/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1].trim())

    if (!parsed.subject || !parsed.body || !Array.isArray(parsed.body) || parsed.body.length === 0) {
      return null
    }

    const body: EmailNode[] = parsed.body.filter((n: unknown) => isValidNode(n))
    if (body.length === 0) return null

    return {
      previewText: parsed.previewText || parsed.subject,
      subject: parsed.subject,
      body,
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
