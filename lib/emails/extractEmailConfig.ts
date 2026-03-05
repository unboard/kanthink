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
 * Handles truncated responses where the closing tag may be missing.
 * Returns null if no valid config found.
 */
export function extractEmailConfig(response: string): EmailConfig | null {
  // Try complete match first
  let match = response.match(/\[EMAIL_TEMPLATE\]([\s\S]*?)\[\/EMAIL_TEMPLATE\]/)

  // Fallback: opening tag exists but no closing tag (truncated response)
  if (!match) {
    const openIdx = response.indexOf('[EMAIL_TEMPLATE]')
    if (openIdx === -1) return null
    const jsonContent = response.slice(openIdx + '[EMAIL_TEMPLATE]'.length).trim()
    if (!jsonContent) return null
    match = [response, jsonContent] as unknown as RegExpMatchArray
  }

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
 * Handles both complete and truncated (missing closing tag) blocks.
 */
export function cleanDisplayResponse(rawText: string): string {
  // First try complete block
  let cleaned = rawText.replace(/\[EMAIL_TEMPLATE\][\s\S]*?\[\/EMAIL_TEMPLATE\]/, '').trim()

  // If opening tag still present (no closing tag — truncated), strip to end of string
  if (cleaned.includes('[EMAIL_TEMPLATE]')) {
    cleaned = cleaned.replace(/\[EMAIL_TEMPLATE\][\s\S]*$/, '').trim()
  }

  return cleaned || "Here's the email template I've put together:"
}

/**
 * Check if a response string contains an [EMAIL_TEMPLATE] block.
 * Used by the UI to show a "template updated" indicator on messages.
 */
export function containsEmailTemplate(text: string): boolean {
  return text.includes('[EMAIL_TEMPLATE]')
}
